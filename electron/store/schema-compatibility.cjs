const { DatabaseSync } = require('node:sqlite');

const expectedSchemas = new Map();

function schemaObjects(database, tables) {
  return database
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_schema
       WHERE tbl_name IN (SELECT value FROM json_each(?)) ORDER BY type, name`,
    )
    .all(JSON.stringify(tables))
    .map((row) => ({
      ...row,
      sql: row.sql?.replace(/\s+/g, ' ').trim() ?? null,
    }));
}

function expectedSchema(source) {
  if (expectedSchemas.has(source)) return expectedSchemas.get(source);
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(source);
    const tables = reference
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name <> 'sqlite_sequence'",
      )
      .all()
      .map(({ name }) => name);
    const expected = { tables, objects: schemaObjects(reference, tables) };
    expectedSchemas.set(source, expected);
    return expected;
  } finally {
    reference.close();
  }
}

function assertFeatureSchema(database, source, present) {
  const { tables, objects } = expectedSchema(source);
  const actual = schemaObjects(database, tables);
  if (JSON.stringify(actual) !== JSON.stringify(present ? objects : []))
    throw new Error(`Несумісна структура SQLite: ${tables.join(', ')}`);
}

module.exports = { assertFeatureSchema };

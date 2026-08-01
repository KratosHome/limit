const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { loadActiveWindowProvider, unpackedPath } = require('./active-app-provider.cjs');

test('maps executable paths from app.asar to app.asar.unpacked', () => {
  const source = path.join('/tmp', 'Limit.app', 'Contents', 'Resources', 'app.asar', 'node_modules', 'get-windows', 'main');
  const expected = path.join('/tmp', 'Limit.app', 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'get-windows', 'main');
  assert.equal(unpackedPath(source), expected);
});

test('rejects platforms without a foreground-window provider', async () => {
  await assert.rejects(() => loadActiveWindowProvider('unsupported-os'), /unavailable/);
});

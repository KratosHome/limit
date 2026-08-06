function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDay(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(value, amount) {
  const date = parseDay(value);
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

function enumerateDays(from, to) {
  const days = [];
  let cursor = from;
  while (cursor <= to && days.length < 370) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

module.exports = { addDays, enumerateDays, localDay };

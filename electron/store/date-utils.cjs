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

function limitPeriodRange(period, date = new Date()) {
  const day = localDay(date);
  if (period === 'week') {
    const mondayOffset = (date.getDay() + 6) % 7;
    const from = addDays(day, -mondayOffset);
    return { from, to: addDays(from, 6), key: from };
  }
  if (period === 'month') {
    const from = `${day.slice(0, 7)}-01`;
    const nextMonth = parseDay(from);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const to = addDays(localDay(nextMonth), -1);
    return { from, to, key: from };
  }
  return { from: day, to: day, key: day };
}

module.exports = { addDays, enumerateDays, limitPeriodRange, localDay };

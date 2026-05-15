const TODOS_KEY = 'sbe_todos';
const RECORDS_KEY = 'sbe_records';

export function getTodos() {
  try { return JSON.parse(localStorage.getItem(TODOS_KEY)) || []; }
  catch { return []; }
}

export function saveTodos(data) {
  localStorage.setItem(TODOS_KEY, JSON.stringify(data));
}

export function getRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []; }
  catch { return []; }
}

export function saveRecord(data) {
  const records = getRecords();
  const idx = records.findIndex(r => r.date === data.date);
  if (idx >= 0) records[idx] = data;
  else records.push(data);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function getRecordByDate(dateString) {
  return getRecords().find(r => r.date === dateString) || null;
}

export function getAllRecordDates() {
  return getRecords().map(r => r.date);
}

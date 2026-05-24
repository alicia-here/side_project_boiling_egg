import { getTodos, saveTodos, saveRecord, getRecordByDate, getAllRecordDates, getLastDate, saveLastDate } from './storage.js';

// ── State ──────────────────────────────────────────────────────────
let todos = getTodos();
let currentTask = null; // { todoId, taskName, startTime: ISO }
let elapsedTimer = null;
let completedTimeline = buildTimelineFromTodos(todos);
let calState = { year: new Date().getFullYear(), month: new Date().getMonth() };

const TONE_PROMPTS = {
  coach:     '오늘 가장 잘 된 부분은 무엇인가요?',
  partner:   '오늘 실제로 해낸 것 중 내일로 이어갈 게 있나요?',
  counselor: '오늘 가장 마음에 남는 감정은 무엇인가요?',
  friend:    '오늘 하루 어땠어? 편하게 얘기해봐.',
};

const TONE_LABELS = {
  coach: '현명한 코치',
  partner: '실전형 파트너',
  counselor: '심리상담가',
  friend: '따뜻한 친구',
};

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// ── DOM ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const clockEl              = $('clock');
const todoInput            = $('todo-input');
const todoAddBtn           = $('todo-add-btn');
const todoListEl           = $('todo-list');
const todoEmptyEl          = $('todo-empty');
const timelineListEl       = $('timeline-list');
const timelineEmptyEl      = $('timeline-empty');
const currentTaskInfoEl    = $('current-task-info');
const progressPercentEl    = $('progress-percent');
const progressBarFillEl    = $('progress-bar-fill');

const centerIdle           = $('center-idle');
const centerWorking        = $('center-working');
const centerReview1        = $('center-review-1');
const centerReview2        = $('center-review-2');
const centerReview3        = $('center-review-3');
const centerSaved          = $('center-saved');
const centerCalendar       = $('center-calendar');

const nextTodoListEl       = $('next-todo-list');
const nextTodoEmptyEl      = $('next-todo-empty');
const workingTaskNameEl    = $('working-task-name');
const workingStartTimeEl   = $('working-start-time');
const workingElapsedEl     = $('working-elapsed');
const completeBtnEl        = $('complete-btn');
const pauseBtnEl           = $('pause-btn');
const workingTimelineEl    = $('working-timeline-list');
const workingTimelineEmpty = $('working-timeline-empty');

const finishBtnEl          = $('finish-btn');
const eggRightEl           = $('egg-right');

const tabTodayBtn          = $('tab-today');
const tabCalendarBtn       = $('tab-calendar');
const todayContent         = $('today-content');
const calMonthLabel        = $('cal-month-label');
const calGrid              = $('cal-grid');
const calPrevBtn           = $('cal-prev');
const calNextBtn           = $('cal-next');

const rightDefault         = $('right-default');
const rightDateDetail      = $('right-date-detail');
const detailDateLabel      = $('detail-date-label');
const detailCloseBtn       = $('detail-close-btn');

// ── Helpers ────────────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function fmt(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function buildTimelineFromTodos(list) {
  const entries = [];
  list.forEach(todo => {
    (todo.timeline || []).forEach(t => {
      entries.push({ taskName: todo.text, start: t.start, end: t.end });
    });
  });
  return entries.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function getSelectedTone() {
  return document.querySelector('input[name="tone"]:checked')?.value || 'coach';
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isToday(year, month, day) {
  const now = new Date();
  return year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
}

function isFutureDay(year, month, day) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return new Date(year, month, day) > todayStart;
}

// timelineSummary 문자열 파싱 ("HH:MM~HH:MM 작업명" 배열로 변환)
function parseTimelineSummary(summary) {
  if (!summary) return [];
  return summary
    .split(/, (?=\d{2}:\d{2}~)/)
    .map(entry => {
      const m = entry.match(/^(\d{2}:\d{2})~(\d{2}:\d{2}) (.+)$/);
      return m ? { startTime: m[1], endTime: m[2], taskName: m[3] } : null;
    })
    .filter(Boolean);
}

// ── Clock ──────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const today = localDateStr(now);
  if (getLastDate() !== today) {
    checkDateRollover();
    if (currentTask) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
      currentTask = null;
    }
    renderAll();
    showCenter('idle');
  }
}
updateClock();
setInterval(updateClock, 60000);

// ── Center state machine ───────────────────────────────────────────
const CENTER_STATES = {
  idle: centerIdle, working: centerWorking,
  review1: centerReview1, review2: centerReview2,
  review3: centerReview3, saved: centerSaved,
  calendar: centerCalendar,
};

function showCenter(state) {
  Object.values(CENTER_STATES).forEach(el => el.classList.add('hidden'));
  CENTER_STATES[state]?.classList.remove('hidden');
}

// ── Tab switching ──────────────────────────────────────────────────
function switchTab(tab) {
  closeDetailView();

  if (tab === 'calendar') {
    tabTodayBtn.classList.remove('tab-btn--active');
    tabCalendarBtn.classList.add('tab-btn--active');
    todayContent.classList.add('hidden');
    calState = { year: new Date().getFullYear(), month: new Date().getMonth() };
    renderCalendar();
    showCenter('calendar');
  } else {
    tabCalendarBtn.classList.remove('tab-btn--active');
    tabTodayBtn.classList.add('tab-btn--active');
    todayContent.classList.remove('hidden');
    showCenter(currentTask ? 'working' : 'idle');
  }
}

// ── Render: Left panel ─────────────────────────────────────────────
function renderTodoList() {
  todoListEl.innerHTML = '';
  const sorted = [
    ...todos.filter(t => !t.done),
    ...todos.filter(t => t.done),
  ];

  sorted.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item';
    if (currentTask?.todoId === todo.id) li.classList.add('active');

    const cb = document.createElement('div');
    cb.className = 'todo-checkbox' + (todo.done ? ' checked' : '');

    const txt = document.createElement('span');
    txt.className = 'todo-text' + (todo.done ? ' done' : '');
    txt.textContent = todo.text;
    txt.addEventListener('dblclick', e => { e.stopPropagation(); startInlineEdit(todo, txt); });

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.textContent = '×';
    del.addEventListener('click', e => { e.stopPropagation(); deleteTodo(todo.id); });

    if (!todo.done && !currentTask) {
      li.addEventListener('click', () => startTask(todo.id));
    }

    li.append(cb, txt, del);
    todoListEl.appendChild(li);
  });

  todoEmptyEl.classList.toggle('hidden', todos.length > 0);
}

function startInlineEdit(todo, txtEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = todo.text;
  txtEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  function commit() {
    if (committed) return;
    committed = true;
    const newText = input.value.trim();
    if (newText && newText !== todo.text) {
      todo.text = newText;
      if (currentTask?.todoId === todo.id) {
        currentTask.taskName = newText;
        workingTaskNameEl.textContent = newText;
      }
      completedTimeline = buildTimelineFromTodos(todos);
      saveTodos(todos);
    }
    renderAll();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { committed = true; renderAll(); }
  });
}

function renderCurrentTaskInfo() {
  if (!currentTask) {
    currentTaskInfoEl.classList.add('hidden');
    return;
  }
  currentTaskInfoEl.classList.remove('hidden');
  currentTaskInfoEl.innerHTML = `<div class="label">진행 중</div>${currentTask.taskName}`;
}

function renderTimeline() {
  timelineListEl.innerHTML = '';
  timelineEmptyEl.classList.toggle('hidden', completedTimeline.length > 0);
  completedTimeline.forEach(e => {
    const li = document.createElement('li');
    li.className = 'timeline-item';
    li.textContent = `${fmt(e.start)} ~ ${fmt(e.end)}  ${e.taskName}`;
    timelineListEl.appendChild(li);
  });
}

function renderProgress() {
  const total = todos.length;
  const done  = todos.filter(t => t.done).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
  progressPercentEl.textContent = `${pct}%`;
  progressBarFillEl.style.width = `${pct}%`;
  progressBarFillEl.classList.toggle('complete', pct === 100);
}

function renderNextTodos() {
  nextTodoListEl.innerHTML = '';
  const pending = todos.filter(t => !t.done);
  nextTodoEmptyEl.classList.toggle('hidden', pending.length > 0);
  pending.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item';
    const cb  = document.createElement('div');
    cb.className = 'todo-checkbox';
    const txt = document.createElement('span');
    txt.className = 'todo-text';
    txt.textContent = todo.text;
    li.addEventListener('click', () => startTask(todo.id));
    li.append(cb, txt);
    nextTodoListEl.appendChild(li);
  });
}

function renderWorkingTimeline() {
  workingTimelineEl.innerHTML = '';
  workingTimelineEmpty.classList.toggle('hidden', completedTimeline.length > 0);
  completedTimeline.forEach(e => {
    const li = document.createElement('li');
    li.className = 'timeline-item';
    li.textContent = `${fmt(e.start)} ~ ${fmt(e.end)}  ${e.taskName}`;
    workingTimelineEl.appendChild(li);
  });
}

function renderFinishBtn() {
  finishBtnEl.disabled = !todos.some(t => t.done);
}

function renderAll() {
  renderTodoList();
  renderCurrentTaskInfo();
  renderTimeline();
  renderProgress();
  renderNextTodos();
  renderFinishBtn();
  if (currentTask) renderWorkingTimeline();
}

// ── Todo actions ───────────────────────────────────────────────────
function addTodo(text) {
  if (!text.trim()) return;
  todos.push({ id: genId(), text: text.trim(), done: false, timeline: [] });
  saveTodos(todos);
  renderAll();
}

function deleteTodo(id) {
  if (currentTask?.todoId === id) return;
  todos = todos.filter(t => t.id !== id);
  completedTimeline = buildTimelineFromTodos(todos);
  saveTodos(todos);
  renderAll();
}

// ── Task flow ──────────────────────────────────────────────────────
function startTask(todoId) {
  if (currentTask) return;
  const todo = todos.find(t => t.id === todoId && !t.done);
  if (!todo) return;

  currentTask = { todoId, taskName: todo.text, startTime: new Date().toISOString(), isPaused: false, pausedAt: null, totalPausedMs: 0 };
  workingTaskNameEl.textContent = todo.text;
  workingStartTimeEl.textContent = `시작: ${fmt(currentTask.startTime)}`;
  workingElapsedEl.textContent = '00:00';
  pauseBtnEl.textContent = '일시정지';

  elapsedTimer = setInterval(() => {
    const ms = Date.now() - new Date(currentTask.startTime).getTime() - currentTask.totalPausedMs;
    workingElapsedEl.textContent = fmtElapsed(ms);
  }, 1000);

  renderAll();
  renderWorkingTimeline();
  showCenter('working');
}

function pauseTask() {
  if (!currentTask || currentTask.isPaused) return;
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  currentTask.isPaused = true;
  currentTask.pausedAt = new Date().toISOString();
  pauseBtnEl.textContent = '재개';
}

function resumeTask() {
  if (!currentTask || !currentTask.isPaused) return;
  currentTask.totalPausedMs += Date.now() - new Date(currentTask.pausedAt).getTime();
  currentTask.isPaused = false;
  currentTask.pausedAt = null;
  pauseBtnEl.textContent = '일시정지';
  elapsedTimer = setInterval(() => {
    const ms = Date.now() - new Date(currentTask.startTime).getTime() - currentTask.totalPausedMs;
    workingElapsedEl.textContent = fmtElapsed(ms);
  }, 1000);
}

function completeTask() {
  if (!currentTask) return;
  clearInterval(elapsedTimer);
  elapsedTimer = null;

  const endTime = new Date().toISOString();
  const todo = todos.find(t => t.id === currentTask.todoId);
  if (todo) {
    todo.done = true;
    todo.timeline.push({ start: currentTask.startTime, end: endTime });
    saveTodos(todos);
  }

  completedTimeline.push({ taskName: currentTask.taskName, start: currentTask.startTime, end: endTime });
  currentTask = null;

  renderAll();
  showCenter('idle');
}

// ── Review flow ────────────────────────────────────────────────────
function startReview() {
  const completedList = $('review-completed-list');
  const timelineListR = $('review-timeline-list');

  completedList.innerHTML = '';
  todos.filter(t => t.done).forEach(t => {
    const li  = document.createElement('li');
    li.className = 'todo-item';
    const cb  = document.createElement('div');
    cb.className = 'todo-checkbox checked';
    const txt = document.createElement('span');
    txt.className = 'todo-text done';
    txt.textContent = t.text;
    li.append(cb, txt);
    completedList.appendChild(li);
  });

  timelineListR.innerHTML = '';
  completedTimeline.forEach(e => {
    const li = document.createElement('li');
    li.className = 'timeline-item';
    li.textContent = `${fmt(e.start)} ~ ${fmt(e.end)}  ${e.taskName}`;
    timelineListR.appendChild(li);
  });

  showCenter('review1');
}

function startReviewWrite() {
  $('review-prompt').textContent = TONE_PROMPTS[getSelectedTone()];
  $('review-textarea').value = '';
  showCenter('review2');
}

function showReviewSave() {
  const text = $('review-textarea').value.trim();
  $('review-final-text').value = text;
  eggRightEl.classList.add('egg-done');
  showCenter('review3');
}

function saveReview() {
  const reflectionText = $('review-final-text').value;
  const today = localDateStr();
  saveRecord({
    date: today,
    completedTasks: todos.filter(t => t.done).map(t => t.id),
    timelineSummary: completedTimeline
      .map(e => `${fmt(e.start)}~${fmt(e.end)} ${e.taskName}`)
      .join(', '),
    reflectionTone: getSelectedTone(),
    reflectionText,
    savedAt: new Date().toISOString(),
  });

  const timelineListEl = $('saved-timeline-list');
  timelineListEl.innerHTML = '';
  completedTimeline.forEach(e => {
    const li = document.createElement('li');
    li.textContent = `${fmt(e.start)} ~ ${fmt(e.end)}  ${e.taskName}`;
    timelineListEl.appendChild(li);
  });

  const reflectionEl = $('saved-reflection-text');
  reflectionEl.textContent = reflectionText;
  reflectionEl.style.display = reflectionText.trim() ? '' : 'none';

  showCenter('saved');
}

// ── Calendar ───────────────────────────────────────────────────────
function renderCalendar() {
  const { year, month } = calState;
  const recordDates = new Set(getAllRecordDates());

  calMonthLabel.textContent = `${year}년 ${month + 1}월`;
  calGrid.innerHTML = '';

  const firstDow = new Date(year, month, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 빈 셀 (월 시작 전)
  for (let i = 0; i < firstDow; i++) {
    calGrid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-cell' }));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr    = toDateStr(year, month, d);
    const today      = isToday(year, month, d);
    const future     = isFutureDay(year, month, d);
    const hasRecord  = recordDates.has(dateStr);

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (hasRecord) cell.classList.add('cal-cell--has-record');

    if (hasRecord) {
      const egg = document.createElement('span');
      egg.className = 'cal-egg';
      egg.textContent = '🥚';
      cell.appendChild(egg);
    }

    const num = document.createElement('span');
    num.className = 'cal-date-num';
    if (today) {
      num.classList.add('cal-date-num--today');
    } else if (future) {
      num.classList.add('cal-date-num--future');
    } else if (!hasRecord) {
      num.classList.add('cal-date-num--no-record');
    }
    num.textContent = d;
    cell.appendChild(num);

    if (hasRecord) {
      cell.addEventListener('click', () => showDateDetail(dateStr));
    }

    calGrid.appendChild(cell);
  }
}

// ── Date detail ────────────────────────────────────────────────────
function showDateDetail(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  detailDateLabel.textContent =
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`;

  rightDefault.classList.add('hidden');
  rightDateDetail.classList.remove('hidden');

  const record    = getRecordByDate(dateStr);
  const noRecordEl = $('detail-no-record');
  const contentEl  = $('detail-content');

  if (!record) {
    noRecordEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  noRecordEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  // 완료한 일 ─ 현재 todos에서 ID 조회, 없으면 타임라인에서 보완
  const allTodos = getTodos();
  const completedListEl = $('detail-completed-list');
  completedListEl.innerHTML = '';

  let completedItems = record.completedTasks
    .map(id => allTodos.find(t => t.id === id))
    .filter(Boolean);

  // todo가 삭제된 경우 timelineSummary에서 고유 작업명으로 보완
  if (completedItems.length === 0 && record.timelineSummary) {
    const uniqueNames = [...new Set(
      parseTimelineSummary(record.timelineSummary).map(e => e.taskName)
    )];
    uniqueNames.forEach(name => {
      const li = document.createElement('li');
      li.className = 'detail-completed-item';
      li.innerHTML = `<span class="detail-check">✓</span><span>${name}</span>`;
      completedListEl.appendChild(li);
    });
    $('detail-completed-empty').classList.toggle('hidden', uniqueNames.length > 0);
  } else {
    completedItems.forEach(todo => {
      const li = document.createElement('li');
      li.className = 'detail-completed-item';
      li.innerHTML = `<span class="detail-check">✓</span><span>${todo.text}</span>`;
      completedListEl.appendChild(li);
    });
    $('detail-completed-empty').classList.toggle('hidden', completedItems.length > 0);
  }

  // 타임라인
  const detailTimelineEl = $('detail-timeline-list');
  detailTimelineEl.innerHTML = '';
  const timelineEntries = parseTimelineSummary(record.timelineSummary);
  timelineEntries.forEach(e => {
    const li = document.createElement('li');
    li.className = 'timeline-item';
    li.textContent = `${e.startTime} ~ ${e.endTime}  ${e.taskName}`;
    detailTimelineEl.appendChild(li);
  });
  $('detail-timeline-empty').classList.toggle('hidden', timelineEntries.length > 0);

  // 회고
  const reflectionEl = $('detail-reflection');
  if (record.reflectionText) {
    $('detail-reflection-empty').classList.add('hidden');
    reflectionEl.classList.remove('hidden');
    const toneBadge = record.reflectionTone
      ? `<span class="detail-tone-badge">${TONE_LABELS[record.reflectionTone] || record.reflectionTone}</span>`
      : '';
    reflectionEl.innerHTML =
      `${toneBadge}<p class="detail-reflection-text">${record.reflectionText}</p>`;
  } else {
    $('detail-reflection-empty').classList.remove('hidden');
    reflectionEl.classList.add('hidden');
  }
}

function closeDetailView() {
  rightDefault.classList.remove('hidden');
  rightDateDetail.classList.add('hidden');
}

// ── Events ─────────────────────────────────────────────────────────
todoAddBtn.addEventListener('click', () => {
  addTodo(todoInput.value);
  todoInput.value = '';
  todoInput.focus();
});

todoInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addTodo(todoInput.value);
    todoInput.value = '';
  }
});

completeBtnEl.addEventListener('click', completeTask);
pauseBtnEl.addEventListener('click', () => currentTask?.isPaused ? resumeTask() : pauseTask());
finishBtnEl.addEventListener('click', startReview);
$('review-start-btn').addEventListener('click', startReviewWrite);
$('review-submit-btn').addEventListener('click', showReviewSave);
$('save-btn').addEventListener('click', saveReview);

$('back-review-1').addEventListener('click', () => showCenter('idle'));
$('back-review-2').addEventListener('click', () => showCenter('review1'));
$('back-review-3').addEventListener('click', () => showCenter('review2'));
$('back-saved').addEventListener('click', () => showCenter('review3'));

tabTodayBtn.addEventListener('click', () => switchTab('today'));
tabCalendarBtn.addEventListener('click', () => switchTab('calendar'));

calPrevBtn.addEventListener('click', () => {
  calState.month -= 1;
  if (calState.month < 0) { calState.month = 11; calState.year -= 1; }
  renderCalendar();
});

calNextBtn.addEventListener('click', () => {
  calState.month += 1;
  if (calState.month > 11) { calState.month = 0; calState.year += 1; }
  renderCalendar();
});

detailCloseBtn.addEventListener('click', closeDetailView);

// ── Date rollover ──────────────────────────────────────────────────
function checkDateRollover() {
  const today = localDateStr();
  const lastDate = getLastDate();

  if (lastDate && lastDate !== today) {
    if (!getRecordByDate(lastDate) && todos.some(t => t.done)) {
      const prevTimeline = buildTimelineFromTodos(todos);
      saveRecord({
        date: lastDate,
        completedTasks: todos.filter(t => t.done).map(t => t.id),
        timelineSummary: prevTimeline
          .map(e => `${fmt(e.start)}~${fmt(e.end)} ${e.taskName}`)
          .join(', '),
        reflectionTone: null,
        reflectionText: '',
        savedAt: new Date().toISOString(),
      });
    }
    todos = [];
    saveTodos([]);
    completedTimeline = [];
  }

  saveLastDate(today);
}

// ── Init ───────────────────────────────────────────────────────────
checkDateRollover();
renderAll();
showCenter('idle');

/* Climb Log v2.0 — UI, persistence, and offline update handling.
 * model.js owns migration, ordering, validation, and goal calculations.
 */
'use strict';

const M = ClimbLog;
const { WALLS, GRADES, COLORS } = M;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let state = { version: M.VERSION, entries: [], goals: {} };
let storageBlocked = false;
let editingEntryId = null;
let deferredInstallPrompt = null;
let waitingWorker = null;

// ── Storage: migrate once; write the complete state atomically ────────────────

function showNotice(message) {
  $('#appNotice').textContent = message;
  $('#appNotice').classList.remove('hidden');
}

function loadState() {
  try {
    const current = localStorage.getItem(M.STATE_KEY);
    if (current !== null) {
      state = M.normalizeState(JSON.parse(current));
      return;
    }
    const legacy = localStorage.getItem(M.LEGACY_KEY);
    state.entries = M.normalizeEntries(legacy === null ? [] : JSON.parse(legacy));
    // Keep the original v1 key untouched as a pre-upgrade recovery copy.
    localStorage.setItem(M.STATE_KEY, JSON.stringify(state));
    if (state.entries.length) showNotice('Your climbs are ready. Old sessions were numbered using their recorded times; edit climb numbers to correct the order. Old hangs/projects keep their unknown finish status.');
  } catch (error) {
    storageBlocked = true;
    showNotice(`Could not open saved data: ${error.message} Export a recovery copy from Backup before restoring a JSON backup.`);
  }
}

function commitState(next) {
  if (storageBlocked) throw new Error('Saved data could not be opened. Use Backup to export a recovery copy and restore a valid backup first.');
  const validated = M.normalizeState(next);
  // Update memory and UI only after the write succeeds (e.g. quota errors).
  localStorage.setItem(M.STATE_KEY, JSON.stringify(validated));
  state = validated;
  renderAll();
}

// ── Formatting and navigation ────────────────────────────────────────────────

function localDateTimeValue(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${M.localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function formatDay(day) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${day}T12:00:00`));
}

function getColorName(value) { return COLORS.find(color => color.value === value)?.name ?? 'Color'; }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function sessionEntries(day) { return state.entries.filter(entry => entry.sessionDate === day).sort((a, b) => a.climbNumber - b.climbNumber); }

function switchToTab(name) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${name}`));
  renderAll();
}

function setupTabs() {
  $$('.tab').forEach(tab => tab.addEventListener('click', () => switchToTab(tab.dataset.tab)));
}

// ── Wall, grade, and color controls ───────────────────────────────────────────

function setupPickers() {
  const wallPicker = $('#wallPicker');
  WALLS.forEach((wall) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-button';
    btn.textContent = wall;
    btn.dataset.wall = wall;
    btn.addEventListener('click', () => selectWall(String(wall)));
    wallPicker.appendChild(btn);
  });

  const gradeSelect = $('#gradeSelect');
  GRADES.forEach((grade) => {
    const option = document.createElement('option');
    option.value = grade;
    option.textContent = grade;
    gradeSelect.appendChild(option);
  });
  gradeSelect.value = '5.9';

  const colorPicker = $('#colorPicker');
  COLORS.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-choice';
    btn.style.setProperty('--swatch', color.value);
    btn.dataset.color = color.value;
    btn.setAttribute('aria-label', color.name);
    btn.title = color.name;
    btn.addEventListener('click', () => selectColor(color.value));
    colorPicker.appendChild(btn);
  });

  const filterWall = $('#filterWall');
  WALLS.forEach((wall) => filterWall.add(new Option(`Wall ${wall}`, wall)));
  const filterGrade = $('#filterGrade');
  GRADES.forEach((grade) => filterGrade.add(new Option(grade, grade)));

  selectWall('6');
  selectColor(COLORS[0].value);
  $('#resultValue').value = 'sent';
}

function selectWall(value) {
  $('#wallValue').value = value;
  $$('#wallPicker [data-wall]').forEach((btn) => btn.classList.toggle('selected', btn.dataset.wall === value));
}

function selectColor(value) {
  $('#colorValue').value = value;
  $$('#colorPicker [data-color]').forEach((btn) => btn.classList.toggle('selected', btn.dataset.color === value));
}

// ── Logging and editing ──────────────────────────────────────────────────────

function setResult(value) {
  $$('#resultValue option[data-legacy]').forEach(option => option.remove());
  if (value === 'hung' || value === 'project') {
    const option = new Option(M.RESULTS[value], value);
    option.dataset.legacy = 'true';
    $('#resultValue').add(option);
  }
  $('#resultValue').value = value;
}

function refreshTimeSummary() {
  $('#timeSummary').textContent = $('#climbDate').value ? formatDateTime(new Date($('#climbDate').value).toISOString()) : '';
}

function setTimeForSession() {
  const now = localDateTimeValue();
  $('#climbDate').value = `${$('#sessionDate').value || M.localDay()}${now.slice(10)}`;
  refreshTimeSummary();
}

function refreshNextNumber() {
  if (!editingEntryId) $('#climbNumber').value = M.nextNumber(state.entries, $('#sessionDate').value);
}

function refreshRatings() {
  ['difficulty', 'confidence'].forEach(id => { $(`#${id}Out`).value = `${$(`#${id}`).value} / 5`; });
}

function resetEntryForm() {
  editingEntryId = null;
  $('#notes').value = '';
  $('#isProject').checked = false;
  setResult('sent');
  $('#saveClimbBtn').textContent = 'Save climb';
  $('#cancelEditBtn').classList.add('hidden');
  refreshNextNumber();
  setTimeForSession();
  refreshRatings();
}

function editEntry(entry) {
  editingEntryId = entry.id;
  $('#sessionDate').value = entry.sessionDate;
  $('#climbNumber').value = entry.climbNumber;
  $('#climbDate').value = localDateTimeValue(new Date(entry.date));
  selectWall(String(entry.wall));
  $('#gradeSelect').value = entry.grade;
  selectColor(entry.color);
  setResult(entry.result);
  $('#isProject').checked = entry.isProject;
  $('#difficulty').value = entry.difficulty;
  $('#confidence').value = entry.confidence;
  $('#notes').value = entry.notes;
  refreshRatings();
  refreshTimeSummary();
  $('#saveClimbBtn').textContent = 'Update climb';
  $('#cancelEditBtn').classList.remove('hidden');
  $('#saveMessage').textContent = `Editing climb #${entry.climbNumber} · ${formatDay(entry.sessionDate)}`;
  switchToTab('log');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupForm() {
  $('#sessionDate').value = M.localDay();
  resetEntryForm();
  $('#sessionDate').addEventListener('change', () => {
    if (!M.validDay($('#sessionDate').value)) return;
    if (!editingEntryId) {
      refreshNextNumber();
      setTimeForSession();
    } else {
      const original = state.entries.find(entry => entry.id === editingEntryId);
      $('#climbNumber').value = original?.sessionDate === $('#sessionDate').value
        ? original.climbNumber : M.nextNumber(state.entries, $('#sessionDate').value);
    }
  });
  $('#resetTimeBtn').addEventListener('click', () => {
    $('#climbDate').value = localDateTimeValue();
    refreshTimeSummary();
  });
  $('#climbDate').addEventListener('change', () => {
    if (!$('#climbDate').value) setTimeForSession();
    refreshTimeSummary();
  });
  $('#climbForm').addEventListener('reset', event => { event.preventDefault(); resetEntryForm(); });
  $('#cancelEditBtn').addEventListener('click', () => { resetEntryForm(); $('#saveMessage').textContent = 'Edit canceled.'; });
  ['difficulty', 'confidence'].forEach(id => $(`#${id}`).addEventListener('input', refreshRatings));

  $('#climbForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const previous = state.entries.find(entry => entry.id === editingEntryId);
      if (editingEntryId && !previous) throw new Error('That climb no longer exists. Cancel this edit and try again.');
      const entry = {
        ...previous,
        id: previous?.id ?? makeId(),
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        // Preserve original seconds if the minute-level input was not changed.
        date: previous && localDateTimeValue(new Date(previous.date)) === $('#climbDate').value
          ? previous.date : new Date($('#climbDate').value).toISOString(),
        sessionDate: $('#sessionDate').value,
        climbNumber: Number($('#climbNumber').value),
        wall: Number($('#wallValue').value),
        grade: $('#gradeSelect').value,
        color: $('#colorValue').value,
        result: $('#resultValue').value,
        isProject: $('#isProject').checked,
        difficulty: Number($('#difficulty').value),
        confidence: Number($('#confidence').value),
        notes: $('#notes').value.trim()
      };
      commitState({ ...state, entries: M.putEntry(state.entries, entry) });
      $('#viewSessionDate').value = entry.sessionDate;
      renderAll();
      resetEntryForm();
      $('#saveMessage').textContent = `Climb #${entry.climbNumber} ${previous ? 'updated' : 'saved'}. Next: #${$('#climbNumber').value}.`;
      if (waitingWorker) showUpdateNotice();
    } catch (error) {
      $('#saveMessage').textContent = `Not saved: ${error.message}`;
    }
  });
}

// ── Entry cards and daily sessions ────────────────────────────────────────────

function createEntryElement(entry) {
  const fragment = $('#entryTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.entry-card');
  card.dataset.id = entry.id;
  card.style.setProperty('--route-color', entry.color);
  fragment.querySelector('.entry-grade').textContent = `#${entry.climbNumber} · ${entry.grade}`;
  const badge = fragment.querySelector('.entry-result');
  badge.textContent = M.RESULTS[entry.result];
  badge.classList.add(entry.result);
  fragment.querySelector('.entry-meta').textContent = `Wall ${entry.wall} · ${getColorName(entry.color)} · ${formatDateTime(entry.date)}${entry.isProject ? ' · Project' : ''}`;
  fragment.querySelector('.entry-ratings').textContent = `Difficulty ${entry.difficulty}/5 · Confidence ${entry.confidence}/5`;
  const notes = fragment.querySelector('.entry-notes');
  if (entry.notes) notes.textContent = entry.notes;
  else notes.remove();
  fragment.querySelector('.edit-entry').addEventListener('click', () => editEntry(entry));
  fragment.querySelector('.delete-entry').addEventListener('click', () => {
    if (!confirm(`Delete climb #${entry.climbNumber}, ${entry.grade} on wall ${entry.wall}? Other climb numbers will stay the same.`)) return;
    try {
      commitState({ ...state, entries: state.entries.filter(item => item.id !== entry.id) });
      if (editingEntryId === entry.id) resetEntryForm();
      refreshNextNumber();
    } catch (error) { showNotice(`Could not delete: ${error.message}`); }
  });
  return fragment;
}

function renderEntryList(container, entries, emptyText) {
  container.replaceChildren();
  container.classList.toggle('empty-state', entries.length === 0);
  if (!entries.length) container.textContent = emptyText;
  else entries.forEach(entry => container.appendChild(createEntryElement(entry)));
}

function addText(container, tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  container.appendChild(element);
  return element;
}

function renderGoalProgress(container, entries, goal) {
  container.replaceChildren();
  const progress = M.goalProgress(entries, goal);
  addText(container, 'h2', progress.met ? 'Session goal met ✓' : 'Session goal progress');
  addText(container, 'p', `${progress.total} / ${goal.total} ${goal.countMode === 'sent' ? 'clean sends' : 'finishes'}`, 'goal-total');
  const bar = document.createElement('progress');
  bar.max = goal.total;
  bar.value = Math.min(progress.total, goal.total);
  bar.setAttribute('aria-label', 'Session total progress');
  container.appendChild(bar);
  addText(container, 'p', `${progress.pink} pinks · maximum ${goal.maxPink}${progress.pink > goal.maxPink ? ' — over limit' : ''}`, 'body-copy');
  const alternatives = [];
  if (goal.grade10 > 0) alternatives.push(`${progress.grade10}/${goal.grade10} at 5.10 or harder`);
  if (goal.grade11 > 0) alternatives.push(`${progress.grade11}/${goal.grade11} at 5.11 or harder`);
  addText(container, 'p', alternatives.join(' OR ') || 'No harder-grade requirement', 'body-copy');
  addText(container, 'p', 'Repeats count. Grade groups include − and +.', 'muted field-help');
}

function renderSession() {
  const day = $('#viewSessionDate').value;
  if (!M.validDay(day)) return;
  const entries = sessionEntries(day);
  const sends = entries.filter(entry => entry.result === 'sent');
  $('#sessionTotal').textContent = entries.length;
  $('#sessionSends').textContent = sends.length;
  $('#sessionFinished').textContent = entries.filter(entry => entry.result === 'finished').length;
  $('#sessionHardest').textContent = sends.length ? [...sends].sort((a, b) => M.gradeRank(b.grade) - M.gradeRank(a.grade))[0].grade : '—';
  $('#sessionHeading').textContent = formatDay(day);
  const unknown = entries.filter(entry => ['hung', 'project'].includes(entry.result)).length;
  const dnf = entries.filter(entry => entry.result === 'dnf').length;
  $('#sessionOutcomes').textContent = `${dnf} did not finish${unknown ? ` · ${unknown} old records with finish unknown` : ''}`;
  renderEntryList($('#sessionEntries'), entries, 'No climbs logged for this session yet.');
  const goal = state.goals[day.slice(0, 7)];
  if (goal) renderGoalProgress($('#sessionGoal'), entries, goal);
  else {
    $('#sessionGoal').replaceChildren();
    addText($('#sessionGoal'), 'p', 'No goal set for this month.', 'body-copy');
    const button = addText($('#sessionGoal'), 'button', 'Set a monthly goal', 'secondary');
    button.type = 'button';
    button.addEventListener('click', () => { $('#goalMonth').value = day.slice(0, 7); loadGoalForm(); switchToTab('goals'); });
  }
  const days = [...new Set(state.entries.map(entry => entry.sessionDate))].sort();
  $('#previousSession').disabled = !days.some(value => value < day);
  $('#nextSession').disabled = !days.some(value => value > day);
}

function setupSessions() {
  $('#viewSessionDate').value = M.localDay();
  $('#viewSessionDate').addEventListener('change', renderSession);
  $('#todaySession').addEventListener('click', () => { $('#viewSessionDate').value = M.localDay(); renderSession(); });
  for (const [id, direction] of [['previousSession', -1], ['nextSession', 1]]) {
    $(`#${id}`).addEventListener('click', () => {
      const day = $('#viewSessionDate').value;
      const days = [...new Set(state.entries.map(entry => entry.sessionDate))].sort();
      const target = direction < 0 ? days.filter(value => value < day).at(-1) : days.find(value => value > day);
      if (target) { $('#viewSessionDate').value = target; renderSession(); }
    });
  }
  $('#logInSession').addEventListener('click', () => {
    if (editingEntryId && !confirm('Discard the current unsaved edit?')) return;
    $('#sessionDate').value = $('#viewSessionDate').value;
    resetEntryForm();
    $('#saveMessage').textContent = '';
    switchToTab('log');
  });
}

function renderHistory() {
  const entries = state.entries.filter(entry =>
    (!$('#filterWall').value || String(entry.wall) === $('#filterWall').value) &&
    (!$('#filterGrade').value || entry.grade === $('#filterGrade').value) &&
    (!$('#filterResult').value || entry.result === $('#filterResult').value))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || a.climbNumber - b.climbNumber);
  const container = $('#historyEntries');
  container.replaceChildren();
  if (!entries.length) { container.textContent = 'No climbs match these filters.'; return; }
  let previousDay = null;
  for (const entry of entries) {
    if (entry.sessionDate !== previousDay) {
      addText(container, 'h3', formatDay(entry.sessionDate), 'history-day');
      previousDay = entry.sessionDate;
    }
    container.appendChild(createEntryElement(entry));
  }
}

function setupFilters() {
  ['filterWall', 'filterGrade', 'filterResult'].forEach(id => $(`#${id}`).addEventListener('change', renderHistory));
  $('#clearFilters').addEventListener('click', () => {
    ['filterWall', 'filterGrade', 'filterResult'].forEach(id => { $(`#${id}`).value = ''; });
    renderHistory();
  });
}

// ── Monthly rules, applied independently to each session ──────────────────────

function loadGoalForm() {
  const saved = state.goals[$('#goalMonth').value];
  const goal = saved ?? M.defaultGoal();
  $('#goalTotal').value = goal.total;
  $('#goalPink').value = goal.maxPink;
  $('#goal10').value = goal.grade10;
  $('#goal11').value = goal.grade11;
  $('#goalCountMode').value = goal.countMode;
  $('#goalSavedStatus').textContent = saved ? 'Saved goal for this month. Changes apply when you save.' : 'Suggested target — save to activate for this month.';
  $('#removeGoal').disabled = !saved;
  $('#goalMessage').textContent = '';
  renderMonth();
}

function renderMonth() {
  const month = $('#goalMonth').value;
  const container = $('#monthProgress');
  container.replaceChildren();
  const goal = state.goals[month];
  if (!goal) { container.textContent = 'Save a goal to see session-by-session progress.'; return; }
  const days = [...new Set(state.entries.filter(entry => entry.sessionDate.startsWith(month)).map(entry => entry.sessionDate))].sort();
  const met = days.filter(day => M.goalProgress(sessionEntries(day), goal).met).length;
  addText(container, 'p', `${met} of ${days.length} logged sessions meet this goal.`, 'goal-total');
  if (!days.length) addText(container, 'p', 'No sessions logged in this month yet.', 'muted');
  for (const day of days) {
    const progress = M.goalProgress(sessionEntries(day), goal);
    const button = addText(container, 'button', `${formatDay(day)} · ${progress.total}/${goal.total} ${goal.countMode === 'sent' ? 'sends' : 'finishes'} · ${progress.met ? 'Goal met ✓' : 'In progress'}`, 'session-link secondary');
    button.type = 'button';
    button.addEventListener('click', () => { $('#viewSessionDate').value = day; switchToTab('session'); });
  }
}

function setupGoals() {
  // Start with the requested November goal. Nothing is activated until saved.
  $('#goalMonth').value = '2026-11';
  loadGoalForm();
  $('#goalMonth').addEventListener('change', loadGoalForm);
  $('#goalForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const month = $('#goalMonth').value;
      const goal = { total: Number($('#goalTotal').value), maxPink: Number($('#goalPink').value), grade10: Number($('#goal10').value), grade11: Number($('#goal11').value), countMode: $('#goalCountMode').value };
      commitState({ ...state, goals: { ...state.goals, [month]: goal } });
      loadGoalForm();
      $('#goalMessage').textContent = `Goal saved for ${month}.`;
    } catch (error) { $('#goalMessage').textContent = `Not saved: ${error.message}`; }
  });
  $('#removeGoal').addEventListener('click', () => {
    if (!confirm('Remove the goal for this month? Your climbs will stay.')) return;
    try {
      const goals = { ...state.goals };
      delete goals[$('#goalMonth').value];
      commitState({ ...state, goals });
      loadGoalForm();
    } catch (error) { $('#goalMessage').textContent = `Could not remove: ${error.message}`; }
  });
}

// ── Backups and recovery ──────────────────────────────────────────────────────

function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupBackup() {
  $('#exportBtn').addEventListener('click', () => {
    try {
      if (storageBlocked) {
        downloadJSON({ current: localStorage.getItem(M.STATE_KEY), legacy: localStorage.getItem(M.LEGACY_KEY) }, 'climb-log-recovery.json');
        $('#backupMessage').textContent = 'Raw recovery copy exported. Keep this file for recovery assistance; it is not a normal import backup.';
      } else {
        downloadJSON({ app: 'Climb Log', ...state, exportedAt: new Date().toISOString() }, `climb-log-backup-${M.localDay()}.json`);
        $('#backupMessage').textContent = 'Climbs, session order, and goals exported.';
      }
    } catch (error) { $('#backupMessage').textContent = `Export failed: ${error.message}`; }
  });
  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = M.parseBackup(JSON.parse(await file.text()), state.goals);
      if (!confirm(`Replace current climbs with ${next.entries.length} climbs from this backup? Version 2 backups also replace goals; version 1 backups keep existing goals.`)) return;
      localStorage.setItem(M.STATE_KEY, JSON.stringify(next));
      state = next;
      storageBlocked = false;
      $('#appNotice').classList.add('hidden');
      resetEntryForm();
      loadGoalForm();
      renderAll();
      $('#backupMessage').textContent = `Imported ${state.entries.length} climbs. Old unknown outcomes remain unchanged.`;
    } catch (error) { $('#backupMessage').textContent = `Import failed: ${error.message}`; }
    finally { event.target.value = ''; }
  });
  $('#deleteAllBtn').addEventListener('click', () => {
    if (!confirm('Delete all climbs and goals on this device, including the pre-upgrade recovery copy? Export a backup first if you want to keep them.')) return;
    try {
      localStorage.setItem(M.STATE_KEY, JSON.stringify({ version: M.VERSION, entries: [], goals: {} }));
      state = { version: M.VERSION, entries: [], goals: {} };
      localStorage.removeItem(M.LEGACY_KEY);
      storageBlocked = false;
      resetEntryForm();
      loadGoalForm();
      renderAll();
      $('#backupMessage').textContent = 'All local climbs and goals deleted.';
    } catch (error) { $('#backupMessage').textContent = `Could not finish deleting: ${error.message}`; }
  });
}

function renderAll() {
  renderSession();
  renderHistory();
  renderMonth();
  $('#storageSummary').textContent = `${state.entries.length} climbs and ${Object.keys(state.goals).length} monthly goals stored on this device.`;
}

// ── PWA installation and explicit, draft-safe updates ─────────────────────────

function showUpdateNotice() {
  const notice = $('#updateNotice');
  notice.classList.remove('hidden');
}

function setupPwa() {
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing && waitingWorker) { refreshing = true; window.location.reload(); }
    });
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        function offerUpdate() {
          if (registration.waiting) { waitingWorker = registration.waiting; showUpdateNotice(); }
        }
        offerUpdate();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
        });
      } catch (error) { console.error('Offline setup unavailable', error); }
    });
  }
  $('#updateAppBtn').addEventListener('click', () => {
    if (waitingWorker && confirm('Reload to apply the update? Save any unsaved climb or goal changes first.')) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredInstallPrompt = event; $('#installBtn').classList.remove('hidden');
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#installBtn').classList.add('hidden');
  });
}

// Initialize controls before rendering data into them.
loadState();
setupPickers();
setupTabs();
setupSessions();
setupForm();
setupFilters();
setupGoals();
setupBackup();
setupPwa();
renderAll();

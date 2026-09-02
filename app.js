const STORAGE_KEY = 'climbLog.entries.v1';
const BACKUP_VERSION = 1;

const WALLS = Array.from({ length: 14 }, (_, i) => i + 6);
const GRADES = (() => {
  const values = [];
  for (let grade = 5; grade <= 13; grade += 1) {
    values.push(`5.${grade}-`, `5.${grade}`, `5.${grade}+`);
  }
  return values;
})();

const COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'White', value: '#f8fafc' },
  { name: 'Black', value: '#111827' },
  { name: 'Gray', value: '#94a3b8' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Brown', value: '#92400e' }
];

const RESULT_LABELS = {
  sent: 'Sent',
  hung: 'Hung / Fell',
  project: 'Project'
};

let entries = loadEntries();
let deferredInstallPrompt = null;
let editingEntryId = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read local data', error);
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  renderAll();
}

function makeId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function gradeRank(grade) {
  const match = /^5\.(\d+)([-+]?)$/.exec(grade);
  if (!match) return -1;
  const base = Number(match[1]) * 3;
  const variation = match[2] === '-' ? 0 : match[2] === '+' ? 2 : 1;
  return base + variation;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 7);
  return d;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function getColorName(value) {
  return COLORS.find((color) => color.value === value)?.name ?? 'Color';
}

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
  selectResult('sent');
}

function selectWall(value) {
  $('#wallValue').value = value;
  $$('#wallPicker [data-wall]').forEach((btn) => btn.classList.toggle('selected', btn.dataset.wall === value));
}

function selectColor(value) {
  $('#colorValue').value = value;
  $$('#colorPicker [data-color]').forEach((btn) => btn.classList.toggle('selected', btn.dataset.color === value));
}

function selectResult(value) {
  $('#resultValue').value = value;
  $$('#resultPicker [data-result]').forEach((btn) => btn.classList.toggle('selected', btn.dataset.result === value));
}

function setDateTimeToNow() {
  $('#climbDate').value = localDateTimeValue();
}

function switchToTab(name) {
  $$('.tab').forEach((item) => item.classList.toggle('active', item.dataset.tab === name));
  $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${name}`));
}

function resetEntryForm({ keepSelections = true } = {}) {
  editingEntryId = null;
  setDateTimeToNow();
  $('#notes').value = '';
  $('#saveClimbBtn').textContent = 'Save climb';
  $('#cancelEditBtn').classList.add('hidden');
  if (!keepSelections) {
    selectWall('6');
    $('#gradeSelect').value = '5.9';
    selectColor(COLORS[0].value);
    selectResult('sent');
    $('#difficulty').value = '3';
    $('#confidence').value = '3';
  }
  $('#difficultyOut').value = `${$('#difficulty').value} / 5`;
  $('#confidenceOut').value = `${$('#confidence').value} / 5`;
}

function editEntry(entry) {
  editingEntryId = entry.id;
  $('#climbDate').value = localDateTimeValue(new Date(entry.date));
  selectWall(String(entry.wall));
  $('#gradeSelect').value = entry.grade;
  selectColor(entry.color);
  selectResult(entry.result);
  $('#difficulty').value = String(entry.difficulty);
  $('#confidence').value = String(entry.confidence);
  $('#difficultyOut').value = `${entry.difficulty} / 5`;
  $('#confidenceOut').value = `${entry.confidence} / 5`;
  $('#notes').value = entry.notes;
  $('#saveClimbBtn').textContent = 'Update climb';
  $('#cancelEditBtn').classList.remove('hidden');
  $('#saveMessage').textContent = `Editing ${entry.grade} on wall ${entry.wall}.`;
  switchToTab('log');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.remove('active'));
      $$('.panel').forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab !== 'log') renderAll();
    });
  });
}

function setupForm() {
  setDateTimeToNow();

  $('#resetTimeBtn').addEventListener('click', setDateTimeToNow);
  $('#climbDate').addEventListener('change', (event) => {
    if (!event.target.value) setDateTimeToNow();
  });
  $('#climbForm').addEventListener('reset', () => requestAnimationFrame(setDateTimeToNow));
  $('#cancelEditBtn').addEventListener('click', () => {
    resetEntryForm();
    $('#saveMessage').textContent = 'Edit canceled.';
  });

  $$('#resultPicker [data-result]').forEach((btn) => {
    btn.addEventListener('click', () => selectResult(btn.dataset.result));
  });

  ['difficulty', 'confidence'].forEach((id) => {
    const input = $(`#${id}`);
    const output = $(`#${id}Out`);
    input.addEventListener('input', () => { output.value = `${input.value} / 5`; });
  });

  $('#climbForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!$('#climbDate').value) setDateTimeToNow();
    const existingEntry = entries.find((item) => item.id === editingEntryId);
    const entry = {
      id: existingEntry?.id ?? makeId(),
      createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
      date: new Date($('#climbDate').value).toISOString(),
      wall: Number($('#wallValue').value),
      grade: $('#gradeSelect').value,
      color: $('#colorValue').value,
      result: $('#resultValue').value,
      difficulty: Number($('#difficulty').value),
      confidence: Number($('#confidence').value),
      notes: $('#notes').value.trim()
    };

    if (existingEntry) entries = entries.map((item) => item.id === entry.id ? entry : item);
    else entries.push(entry);
    saveEntries();

    const msg = $('#saveMessage');
    msg.textContent = `${entry.grade} on wall ${entry.wall} ${existingEntry ? 'updated' : 'saved'}.`;
    resetEntryForm();
    setTimeout(() => { msg.textContent = ''; }, 2200);
  });
}

function createEntryElement(entry) {
  const fragment = $('#entryTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.entry-card');
  card.dataset.id = entry.id;
  card.style.setProperty('--route-color', entry.color);
  fragment.querySelector('.entry-grade').textContent = entry.grade;

  const result = fragment.querySelector('.entry-result');
  result.textContent = RESULT_LABELS[entry.result] || entry.result;
  result.classList.add(entry.result);

  fragment.querySelector('.entry-meta').textContent = `Wall ${entry.wall} · ${getColorName(entry.color)} · ${formatDateTime(entry.date)}`;
  fragment.querySelector('.entry-ratings').textContent = `Difficulty ${entry.difficulty}/5 · Confidence ${entry.confidence}/5`;

  const notes = fragment.querySelector('.entry-notes');
  if (entry.notes) notes.textContent = entry.notes;
  else notes.remove();

  fragment.querySelector('.delete-entry').addEventListener('click', () => {
    if (!confirm(`Delete ${entry.grade} on wall ${entry.wall}?`)) return;
    entries = entries.filter((item) => item.id !== entry.id);
    saveEntries();
  });

  fragment.querySelector('.edit-entry').addEventListener('click', () => editEntry(entry));

  return fragment;
}

function renderEntryList(container, list, emptyText) {
  container.innerHTML = '';
  if (!list.length) {
    container.classList.add('empty-state');
    container.textContent = emptyText;
    return;
  }
  container.classList.remove('empty-state');
  list.forEach((entry) => container.appendChild(createEntryElement(entry)));
}

function renderWeek() {
  const now = new Date();
  const start = startOfWeek(now);
  const end = endOfWeek(now);
  const weekEntries = entries
    .filter((entry) => {
      const date = new Date(entry.date);
      return date >= start && date < end;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const sends = weekEntries.filter((entry) => entry.result === 'sent');
  $('#weekTotal').textContent = weekEntries.length;
  $('#weekSends').textContent = sends.length;
  $('#weekRate').textContent = weekEntries.length ? `${Math.round((sends.length / weekEntries.length) * 100)}%` : '—';
  $('#weekHardest').textContent = sends.length
    ? [...sends].sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade))[0].grade
    : '—';
  const sunday = new Date(end);
  sunday.setDate(sunday.getDate() - 1);
  $('#weekRange').textContent = `${formatDate(start)} – ${formatDate(sunday)}`;
  renderEntryList($('#weekEntries'), weekEntries, 'No climbs logged this week.');
}

function renderHistory() {
  const wall = $('#filterWall').value;
  const grade = $('#filterGrade').value;
  const result = $('#filterResult').value;

  const filtered = entries
    .filter((entry) => !wall || String(entry.wall) === wall)
    .filter((entry) => !grade || entry.grade === grade)
    .filter((entry) => !result || entry.result === result)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  renderEntryList($('#historyEntries'), filtered, 'No climbs match these filters.');
}

function renderStorageSummary() {
  const count = entries.length;
  $('#storageSummary').textContent = `${count} climb${count === 1 ? '' : 's'} stored on this device.`;
}

function renderAll() {
  renderWeek();
  renderHistory();
  renderStorageSummary();
}

function setupFilters() {
  ['filterWall', 'filterGrade', 'filterResult'].forEach((id) => {
    $(`#${id}`).addEventListener('change', renderHistory);
  });
  $('#clearFilters').addEventListener('click', () => {
    $('#filterWall').value = '';
    $('#filterGrade').value = '';
    $('#filterResult').value = '';
    renderHistory();
  });
}

function setupBackup() {
  $('#exportBtn').addEventListener('click', () => {
    const backup = {
      app: 'Climb Log',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      entries
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `climb-log-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    $('#backupMessage').textContent = 'JSON backup exported.';
  });

  $('#importFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== 'Climb Log' || !Array.isArray(parsed.entries)) {
        throw new Error('This does not look like a Climb Log backup.');
      }
      const valid = parsed.entries.every(validateEntry);
      if (!valid) throw new Error('The backup contains one or more invalid climb entries.');

      if (!confirm(`Replace local data with ${parsed.entries.length} climbs from this backup?`)) {
        event.target.value = '';
        return;
      }
      entries = parsed.entries;
      saveEntries();
      $('#backupMessage').textContent = `Imported ${entries.length} climbs.`;
    } catch (error) {
      $('#backupMessage').textContent = error.message || 'Could not import that backup.';
    } finally {
      event.target.value = '';
    }
  });

  $('#deleteAllBtn').addEventListener('click', () => {
    if (!entries.length) return;
    if (!confirm('Delete every locally stored climb? Export a backup first if you may want them later.')) return;
    entries = [];
    saveEntries();
    $('#backupMessage').textContent = 'All local climb data deleted.';
  });
}

function validateEntry(entry) {
  return entry &&
    typeof entry.id === 'string' &&
    !Number.isNaN(new Date(entry.date).getTime()) &&
    WALLS.includes(Number(entry.wall)) &&
    GRADES.includes(entry.grade) &&
    COLORS.some((color) => color.value === entry.color) &&
    Object.hasOwn(RESULT_LABELS, entry.result) &&
    Number.isInteger(entry.difficulty) && entry.difficulty >= 1 && entry.difficulty <= 5 &&
    Number.isInteger(entry.confidence) && entry.confidence >= 1 && entry.confidence <= 5 &&
    typeof entry.notes === 'string';
}

function setupPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('#installBtn').classList.remove('hidden');
  });

  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#installBtn').classList.add('hidden');
  });
}

setupPickers();
setupTabs();
setupForm();
setupFilters();
setupBackup();
setupPwa();
renderAll();

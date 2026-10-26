/* Climb Log v2: data rules shared by the UI and regression tests.
 * Existing outcomes and timestamps are preserved. Session dates and sequence
 * numbers are additive; a clean send is never inferred from an old hang/project.
 */
(function (root) {
  'use strict';

  const VERSION = 2;
  const LEGACY_KEY = 'climbLog.entries.v1';
  const STATE_KEY = 'climbLog.state.v2';
  const RESULTS = {
    sent: 'Clean send',
    finished: 'Finished with hangs/falls',
    dnf: 'Did not finish',
    hung: 'Hung / Fell — finish unknown',
    project: 'Project — finish unknown'
  };
  const WALLS = Array.from({ length: 14 }, (_, i) => i + 6);
  const GRADES = Array.from({ length: 9 }, (_, i) =>
    ['-', '', '+'].map(suffix => `5.${i + 5}${suffix}`)).flat();
  const COLORS = [
    ['Red', '#ef4444'], ['Orange', '#f97316'], ['Yellow', '#facc15'],
    ['Green', '#22c55e'], ['Blue', '#3b82f6'], ['Purple', '#a855f7'],
    ['Pink', '#ec4899'], ['White', '#f8fafc'], ['Black', '#111827'],
    ['Gray', '#94a3b8'], ['Teal', '#14b8a6'], ['Brown', '#92400e']
  ].map(([name, value]) => ({ name, value }));

  function localDay(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && localDay(date) === value;
  }

  function positiveInt(value) {
    return Number.isSafeInteger(value) && value > 0 && value < 1000000;
  }

  function validateEntry(entry) {
    return entry && typeof entry.id === 'string' && entry.id.length > 0 &&
      typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date)) &&
      WALLS.includes(Number(entry.wall)) && GRADES.includes(entry.grade) &&
      COLORS.some(color => color.value === entry.color) &&
      Object.hasOwn(RESULTS, entry.result) &&
      Number.isInteger(entry.difficulty) && entry.difficulty >= 1 && entry.difficulty <= 5 &&
      Number.isInteger(entry.confidence) && entry.confidence >= 1 && entry.confidence <= 5 &&
      typeof entry.notes === 'string' &&
      (entry.sessionDate === undefined || validDay(entry.sessionDate)) &&
      (entry.climbNumber === undefined || positiveInt(entry.climbNumber)) &&
      (entry.isProject === undefined || typeof entry.isProject === 'boolean');
  }

  // Timestamp order is the best available guess for legacy records. Ties keep
  // their original array order. Once assigned, numbers never follow the clock.
  function normalizeEntries(source) {
    if (!Array.isArray(source) || !source.every(validateEntry)) {
      throw new Error('One or more climb records are invalid. No data was replaced.');
    }
    if (new Set(source.map(entry => entry.id)).size !== source.length) {
      throw new Error('Duplicate climb IDs found. No data was replaced.');
    }
    const entries = source.map(entry => ({
      ...entry,
      sessionDate: entry.sessionDate ?? localDay(new Date(entry.date)),
      isProject: entry.isProject ?? entry.result === 'project'
    }));
    const sessions = new Map();
    for (const entry of entries) {
      if (!sessions.has(entry.sessionDate)) sessions.set(entry.sessionDate, []);
      sessions.get(entry.sessionDate).push(entry);
    }
    for (const list of sessions.values()) {
      const used = new Set();
      for (const entry of list) {
        if (entry.climbNumber === undefined) continue;
        if (used.has(entry.climbNumber)) throw new Error('Duplicate climb numbers in a session. No data was replaced.');
        used.add(entry.climbNumber);
      }
      let number = 1;
      for (const entry of [...list].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
        if (entry.climbNumber !== undefined) continue;
        while (used.has(number)) number += 1;
        entry.climbNumber = number;
        used.add(number);
      }
    }
    return entries;
  }

  function nextNumber(entries, day) {
    return Math.max(0, ...entries.filter(entry => entry.sessionDate === day).map(entry => entry.climbNumber)) + 1;
  }

  // Inserting into an occupied number shifts later climbs. Moving an existing
  // climb shifts only the intervening records; other sessions are untouched.
  function putEntry(entries, incoming) {
    if (!validateEntry(incoming) || !validDay(incoming.sessionDate) || !positiveInt(incoming.climbNumber)) {
      throw new Error('Check the session date, climb number, and climb details.');
    }
    const previous = entries.find(entry => entry.id === incoming.id);
    const sameSession = previous?.sessionDate === incoming.sessionDate;
    const updated = entries.filter(entry => entry.id !== incoming.id).map(entry => {
      if (entry.sessionDate !== incoming.sessionDate) return entry;
      let number = entry.climbNumber;
      if (sameSession) {
        if (incoming.climbNumber < previous.climbNumber && number >= incoming.climbNumber && number < previous.climbNumber) number += 1;
        if (incoming.climbNumber > previous.climbNumber && number > previous.climbNumber && number <= incoming.climbNumber) number -= 1;
      } else if (number >= incoming.climbNumber) {
        number += 1;
      }
      return { ...entry, climbNumber: number };
    });
    updated.push({ ...incoming });
    return normalizeEntries(updated);
  }

  function defaultGoal() {
    return { total: 21, maxPink: 3, grade10: 5, grade11: 3, countMode: 'sent' };
  }

  function validateGoal(goal) {
    return goal && positiveInt(goal.total) &&
      ['maxPink', 'grade10', 'grade11'].every(key => Number.isSafeInteger(goal[key]) && goal[key] >= 0 && goal[key] < 1000000) &&
      ['sent', 'completed'].includes(goal.countMode);
  }

  function validateGoals(goals) {
    return goals && typeof goals === 'object' && !Array.isArray(goals) &&
      Object.entries(goals).every(([month, goal]) => validDay(`${month}-01`) && validateGoal(goal));
  }

  function gradeBase(grade) { return Number(grade.slice(2).replace(/[+-]$/, '')); }
  function gradeRank(grade) { return gradeBase(grade) * 3 + (grade.endsWith('-') ? 0 : grade.endsWith('+') ? 2 : 1); }

  function goalProgress(entries, goal) {
    const qualified = entries.filter(entry => entry.result === 'sent' || (goal.countMode === 'completed' && entry.result === 'finished'));
    const total = qualified.length;
    const pink = qualified.filter(entry => entry.color === '#ec4899').length;
    const grade10 = qualified.filter(entry => gradeBase(entry.grade) >= 10).length;
    const grade11 = qualified.filter(entry => gradeBase(entry.grade) >= 11).length;
    // A zero target disables that alternative, rather than satisfying OR for free.
    const harderMet = (goal.grade10 === 0 && goal.grade11 === 0) ||
      (goal.grade10 > 0 && grade10 >= goal.grade10) || (goal.grade11 > 0 && grade11 >= goal.grade11);
    return { total, pink, grade10, grade11, met: total >= goal.total && pink <= goal.maxPink && harderMet };
  }

  function normalizeState(source) {
    if (!source || source.version !== VERSION || !validateGoals(source.goals)) {
      throw new Error('Unsupported or invalid app data. Your stored data has not been changed.');
    }
    return { version: VERSION, entries: normalizeEntries(source.entries), goals: { ...source.goals } };
  }

  function parseBackup(source, currentGoals = {}) {
    if (source?.app !== 'Climb Log' || ![1, VERSION].includes(source.version ?? 1)) {
      throw new Error('Choose a supported Climb Log JSON backup (version 1 or 2).');
    }
    // Old backups do not contain goals. Preserve any configured goals on import.
    return normalizeState({ version: VERSION, entries: source.entries,
      goals: source.version === VERSION ? source.goals : currentGoals });
  }

  const api = { VERSION, LEGACY_KEY, STATE_KEY, RESULTS, WALLS, GRADES, COLORS,
    localDay, validDay, validateEntry, normalizeEntries, nextNumber, putEntry,
    defaultGoal, validateGoal, normalizeState, parseBackup, goalProgress, gradeRank };
  root.ClimbLog = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

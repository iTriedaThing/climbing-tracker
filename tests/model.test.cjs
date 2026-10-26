// Run with: TZ=America/New_York node tests/model.test.cjs [path-to-v1-backup.json]
const assert = require('node:assert/strict');
const M = require('../model.js');
const fixture = (id, date = '2026-10-14T00:16:00.000Z') => ({
  id, date, createdAt: date, wall: 6, grade: '5.10+', color: '#22c55e',
  result: 'sent', difficulty: 3, confidence: 4, notes: ''
});
const raw = [fixture('second', '2026-10-14T01:00:00Z'), fixture('first'), fixture('tie')];
const entries = M.normalizeEntries(raw);
assert.equal(entries[0].climbNumber, 3);
assert.equal(entries[1].climbNumber, 1);
assert.equal(entries[2].climbNumber, 2);
assert.equal(entries[0].sessionDate, '2026-10-13');
assert.equal(raw[0].climbNumber, undefined); // Migration never edits the source.
assert.equal(M.nextNumber(entries, '2026-10-14'), 1);
let moved = M.putEntry(entries, { ...entries[0], climbNumber: 1 });
assert.equal(moved.find(e => e.id === 'first').climbNumber, 2);
assert.equal(moved.find(e => e.id === 'tie').climbNumber, 3);
moved = M.putEntry(moved, { ...moved.find(e => e.id === 'second'), climbNumber: 3 });
assert.equal(moved.find(e => e.id === 'first').climbNumber, 1);
moved = M.putEntry(moved, { ...fixture('insert'), sessionDate: '2026-10-13', climbNumber: 2 });
assert.deepEqual(moved.map(e => e.climbNumber).sort(), [1, 2, 3, 4]);
moved = M.putEntry(moved, { ...moved.find(e => e.id === 'insert'), sessionDate: '2026-10-14', climbNumber: 1 });
assert.equal(moved.filter(e => e.sessionDate === '2026-10-14').length, 1);
assert.equal(M.nextNumber(moved, '2026-10-13'), 5); // No silent renumbering after a move out.
assert.throws(() => M.normalizeEntries([fixture('dup'), fixture('dup')]));
assert.throws(() => M.putEntry(entries, { ...entries[0], climbNumber: 0 }));
assert.throws(() => M.parseBackup({ app: 'Climb Log', version: 99, entries: raw }));
assert.throws(() => M.normalizeEntries([{ ...fixture('bad'), sessionDate: '2026-02-30' }]));
const legacy = M.normalizeEntries([{ ...fixture('hang'), result: 'hung' }, { ...fixture('project'), result: 'project' }]);
assert.equal(legacy[0].result, 'hung');
assert.equal(legacy[1].result, 'project');
assert.equal(legacy[1].isProject, true);
const goal = M.defaultGoal();
const climbs = Array.from({ length: 21 }, (_, i) => ({ ...fixture(String(i)), grade: i < 5 ? '5.10-' : '5.8', color: i >= 18 ? '#ec4899' : '#22c55e' }));
assert.equal(M.goalProgress(climbs, goal).met, true);
climbs[0].result = 'finished';
assert.equal(M.goalProgress(climbs, goal).met, false);
assert.equal(M.goalProgress(climbs, { ...goal, countMode: 'completed' }).met, true);
climbs[0].result = 'hung';
assert.equal(M.goalProgress(climbs, { ...goal, countMode: 'completed' }).met, false);
climbs[0].result = 'sent';
climbs[0].color = '#ec4899';
assert.equal(M.goalProgress(climbs, goal).met, false);
climbs[0].color = '#22c55e';
climbs.forEach((e, i) => { e.grade = i < 3 ? '5.11-' : '5.8'; });
assert.equal(M.goalProgress(climbs, goal).met, true);
assert.equal(M.goalProgress([], { ...goal, grade10: 0 }).met, false);
const saved = { version: 2, entries, goals: { '2026-11': goal } };
assert.deepEqual(M.parseBackup({ app: 'Climb Log', ...saved }), saved);
assert.deepEqual(M.parseBackup({ app: 'Climb Log', version: 1, entries: raw }, saved.goals).goals, saved.goals);
if (process.argv[2]) {
  const original = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
  const migrated = M.parseBackup(original);
  assert.equal(migrated.entries.length, original.entries.length);
  for (let i = 0; i < original.entries.length; i++) {
    for (const key of Object.keys(original.entries[i])) assert.deepEqual(migrated.entries[i][key], original.entries[i][key]);
  }
  assert.equal(new Set(migrated.entries.map(e => e.id)).size, original.entries.length);
  assert.deepEqual(M.parseBackup({ app: 'Climb Log', ...migrated }), migrated);
  console.log(`Preserved all original fields in ${original.entries.length} real records; v2 backup round-trip passed.`);
}
console.log('Model tests passed: migration, ties, reordering, insertion, session moves, statuses, goals, and backups.');

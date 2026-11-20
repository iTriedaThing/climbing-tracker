// Exercise the actual HTML and event handlers, including the next ordinary save.
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const day = '2026-11-19';
const entries = Array.from({length:10}, (_, i) => ({
  id:`original-${i+1}`, date:`${day}T20:00:00Z`, sessionDate:day,
  climbNumber:i+1, wall:6, grade:'5.9', color:'#22c55e',
  result:'sent', difficulty:3, confidence:4, notes:'Original', isProject:false
}));
entries.push({...entries[0], id:'other', sessionDate:'2026-11-18', climbNumber:50});
const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {
  url:'https://example.test/climbing-tracker/', runScripts:'outside-only'
});
const w = dom.window;
w.confirm = () => true;
w.scrollTo = () => {};
w.localStorage.setItem('climbLog.state.v2', JSON.stringify({version:2,entries,goals:{}}));
for (const file of ['model.js','app.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
const $ = id => w.document.getElementById(id);
const setDay = value => { $('sessionDate').value=value; $('sessionDate').dispatchEvent(new w.Event('change')); };
const submit = () => $('climbForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const saved = () => JSON.parse(w.localStorage.getItem('climbLog.state.v2')).entries;
setDay(day);
assert.equal($('climbNumber').value,'11');
assert.equal($('climbNumber').readOnly,true);
$('insertClimbBtn').click();
assert.equal($('climbNumber').readOnly,false);
$('climbNumber').value='4'; submit();
assert.equal(saved().length,12);
assert.equal(saved().find(e=>e.id==='original-4').climbNumber,5);
assert.equal($('climbNumber').value,'12');
assert.equal($('climbNumber').readOnly,true);
assert.equal($('saveClimbBtn').textContent,'Save climb');
// Simulate a stale input left behind: ordinary saves must ignore it.
$('climbNumber').value='4'; submit();
assert.equal($('climbNumber').value,'13');
assert.equal(saved().find(e=>e.id==='original-4').climbNumber,5);
assert.equal(saved().filter(e=>e.sessionDate===day).length,12);
assert.equal(saved().find(e=>e.id==='other').climbNumber,50);
// The card insertion action always creates a fresh record, not an edit.
w.document.querySelector('#sessionEntries .insert-entry').click();
assert.equal($('climbNumber').value,'1');
submit(); assert.equal($('climbNumber').value,'14');
// Move an existing climb, then resume appending after the highest number.
w.document.querySelector('#sessionEntries .edit-entry').click();
$('climbNumber').value='3'; submit();
assert.equal(saved().filter(e=>e.sessionDate===day).length,13);
assert.equal($('climbNumber').value,'14');
$('insertClimbBtn').click();$('climbNumber').value='2';$('cancelInsertBtn').click();
assert.equal($('climbNumber').value,'14');
setDay('2026-11-18');assert.equal($('climbNumber').value,'51');
setDay('2026-11-20');assert.equal($('climbNumber').value,'1');
// Failed writes must not switch modes, shift records, or advance the counter.
setDay(day);$('insertClimbBtn').click();$('climbNumber').value='2';
const before = w.localStorage.getItem('climbLog.state.v2');
const originalSet = w.Storage.prototype.setItem;
w.Storage.prototype.setItem = () => {throw new Error('Storage full');};
submit();
assert.match($('saveMessage').textContent,/Not saved/);
assert.equal($('saveClimbBtn').textContent,'Insert climb');
assert.equal($('climbNumber').value,'2');
assert.equal(w.localStorage.getItem('climbLog.state.v2'),before);
w.Storage.prototype.setItem=originalSet;
submit();assert.equal($('climbNumber').value,'15');
console.log('UI regression passed: insert, append, stale counter, edit, cancel, other sessions, and failed-write retry.');
dom.window.close();

#!/usr/bin/env node
// Proves the 2026-11-19 conversion touches one entry and is safe to re-run.
const assert = require('assert');
const M = require('../scripts/migrate-2026-11-19-treadmill.js');

const BEFORE_ENTRY = {
  type: 'cardio',
  mode: 'ruck',
  workout: 'Steady Burn',
  slot: 'cardioB',
  slots: ['cardioB'],
  week: 4,
  blockId: 'forge-4-mwijdguv',
  duration: '30',
  distance: '1.77',
  weight: '0',
  hr: '130',
  rpe: '7',
  notes: 'Technogym — logged as ruck with an empty pack.',
  ts: 1763510400000,
};

function fixture() {
  return {
    startDate: '2026-10-24',
    currentBlockId: 'forge-4-mwijdguv',
    blocks: [{ id: 'forge-4-mwijdguv', name: 'FORGE 4', startDate: '2026-10-24' }],
    logs: {
      '2026-11-18': {
        type: 'strength',
        slot: 'strengthA',
        workout: 'Upper',
        exercises: { 'db-bench-press': { sets: { 0: { weight: '50', reps: '10' } } } },
      },
      '2026-11-19': JSON.parse(JSON.stringify(BEFORE_ENTRY)),
      '2026-11-20': {
        type: 'cardio',
        mode: 'row',
        slot: 'cardioA',
        duration: '24',
        distance: '5000',
        watts: '140',
        hr: '125',
        rpe: '6',
      },
    },
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

test('converts only the 11/19 ruck fields that define the session', () => {
  const doc = fixture();
  const result = M.migrateDoc(doc);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.after.mode, 'treadmill');
  assert.strictEqual(result.after.type, 'cardio');
  assert.strictEqual(result.after.weight, undefined);
  assert.strictEqual(result.after.duration, '30');
  assert.strictEqual(result.after.distance, '1.77');
  assert.strictEqual(result.after.hr, '130');
  assert.strictEqual(result.after.rpe, '7');
  assert.strictEqual(result.after.slot, 'cardioB');
  assert.strictEqual(result.after.blockId, 'forge-4-mwijdguv');
  assert.strictEqual(result.after.notes, BEFORE_ENTRY.notes);
  assert.strictEqual(result.after.ts, BEFORE_ENTRY.ts);
  assert.strictEqual(M.entryCount(doc), M.entryCount(result.doc));
  assert.strictEqual(M.hashExceptDay(doc, M.TARGET_DAY), M.hashExceptDay(result.doc, M.TARGET_DAY));
  assert.deepStrictEqual(result.doc.logs['2026-11-18'], doc.logs['2026-11-18']);
  assert.deepStrictEqual(result.doc.logs['2026-11-20'], doc.logs['2026-11-20']);
});

test('refuses a different 11/19 session', () => {
  const doc = fixture();
  doc.logs['2026-11-19'].distance = '2.0';
  const result = M.migrateDoc(doc);
  assert.ok(result.error);
  assert.strictEqual(result.doc, undefined);
});

test('second run is a no-op', () => {
  const once = M.migrateDoc(fixture());
  const twice = M.migrateDoc(once.doc);
  assert.strictEqual(twice.changed, false);
  assert.strictEqual(twice.after.mode, 'treadmill');
  assert.strictEqual(M.hashExceptDay(once.doc, M.TARGET_DAY), M.hashExceptDay(twice.doc, M.TARGET_DAY));
});

test('numeric 0 lb pack matches the same session', () => {
  const doc = fixture();
  doc.logs['2026-11-19'].weight = 0;
  doc.logs['2026-11-19'].duration = 30;
  doc.logs['2026-11-19'].distance = 1.77;
  doc.logs['2026-11-19'].hr = 130;
  doc.logs['2026-11-19'].rpe = 7;
  doc.logs['2026-11-19'].type = 'ruck';
  delete doc.logs['2026-11-19'].mode;
  const result = M.migrateDoc(doc);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.after.mode, 'treadmill');
  assert.strictEqual(result.after.type, 'cardio');
  assert.strictEqual(result.after.weight, undefined);
});

console.log('\n' + passed + ' tests passed');
console.log('\nBEFORE ' + M.TARGET_DAY);
console.log(JSON.stringify(BEFORE_ENTRY, null, 2));
console.log('\nAFTER ' + M.TARGET_DAY);
console.log(JSON.stringify(M.migrateDoc(fixture()).after, null, 2));

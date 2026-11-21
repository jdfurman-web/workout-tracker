#!/usr/bin/env node
const assert = require('assert');
const E = require('../forge-engine.js');
const M19 = require('../scripts/migrate-2026-11-19-treadmill.js');
const M20 = require('../scripts/migrate-2026-11-20-treadmill-extras.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

const CLOUD_1119 = {
  type: 'cardio',
  mode: 'treadmill',
  workout: 'Treadmill',
  slot: 'cardioA',
  duration: '30',
  distance: '1.77',
  hr: '130',
  rpe: '7',
  updatedAt: 2000,
};
const LOCAL_1119 = {
  type: 'cardio',
  mode: 'ruck',
  workout: 'Steady Burn',
  slot: 'cardioA',
  duration: '30',
  distance: '1.77',
  weight: '0',
  hr: '130',
  rpe: '7',
  ts: 1000,
};

test('newer cloud treadmill beats a stale ruck with no updatedAt, and weight stays gone', () => {
  const merged = E.mergeDayLogs(CLOUD_1119, LOCAL_1119);
  assert.strictEqual(merged.mode, 'treadmill');
  assert.strictEqual(merged.weight, undefined);
  assert.strictEqual(merged.updatedAt, 2000);
});

test('an older updatedAt cannot overwrite a newer cloud entry', () => {
  const local = Object.assign({}, LOCAL_1119, { updatedAt: 1500, weight: '0' });
  const merged = E.mergeDayLogs(CLOUD_1119, local);
  assert.strictEqual(merged.mode, 'treadmill');
  assert.strictEqual(merged.weight, undefined);
});

test('a newer local updatedAt wins the whole entry', () => {
  const local = Object.assign({}, CLOUD_1119, { updatedAt: 3000, notes: 'local' });
  const merged = E.mergeDayLogs(CLOUD_1119, local);
  assert.strictEqual(merged.notes, 'local');
  assert.strictEqual(merged.updatedAt, 3000);
});

test('Sync Up merge keeps cloud-only entries', () => {
  const cloud = { logs: { '2026-11-18': { type: 'strength', slot: 'strengthA', updatedAt: 1 }, '2026-11-19': CLOUD_1119 } };
  const local = { logs: { '2026-11-19': LOCAL_1119 } };
  const merged = E.mergeSyncState(cloud, local);
  assert.strictEqual(merged.logs['2026-11-18'].slot, 'strengthA');
  assert.strictEqual(merged.logs['2026-11-19'].mode, 'treadmill');
  assert.strictEqual(merged.logs['2026-11-19'].weight, undefined);
});

test('extras and a slot log can share a date', () => {
  const doc = E.mergeSyncState(
    { logs: { '2026-11-20': { type: 'cardio', mode: 'treadmill', slot: 'cardioA', slots: ['cardioA'], updatedAt: 5 } } },
    { extras: { '2026-11-20': [{ id: 'yoga-1', ouraId: 'yoga-1', extra: true, className: 'Yin', covers: '', updatedAt: 5 }] } }
  );
  assert.strictEqual(doc.logs['2026-11-20'].slot, 'cardioA');
  assert.strictEqual(doc.extras['2026-11-20'][0].className, 'Yin');
  assert.deepStrictEqual(E.slotsOnLog(doc.extras['2026-11-20'][0]), []);
});

test('a legacy extra in logs migrates to extras once', () => {
  const doc = {
    logs: {
      '2026-11-20': { extra: true, ouraId: 'yoga-1', className: 'Yin', covers: '', slot: 'cardioA', ts: 9 },
      '2026-11-18': { type: 'strength', slot: 'strengthA' },
    },
  };
  const first = E.migrateLegacyExtras(doc);
  assert.strictEqual(first.changed, true);
  assert.strictEqual(doc.logs['2026-11-20'], undefined);
  assert.strictEqual(doc.logs['2026-11-18'].slot, 'strengthA');
  assert.strictEqual(doc.extras['2026-11-20'][0].id, 'yoga-1');
  assert.strictEqual(doc.extras['2026-11-20'][0].slot, undefined);
  assert.strictEqual(doc.extras['2026-11-20'][0].covers, '');
  const second = E.migrateLegacyExtras(doc);
  assert.strictEqual(second.changed, false);
  assert.strictEqual(doc.extras['2026-11-20'].length, 1);
});

test('extras merge by id and the newer updatedAt wins whole', () => {
  const merged = E.mergeExtraLists(
    [{ id: 'yoga-1', className: 'Yin', extra: true, covers: '', calories: '80', weight: '0', updatedAt: 10 }],
    [{ id: 'yoga-1', className: 'Yin Yoga', extra: true, covers: 'strength', updatedAt: 20 }, { id: 'other', className: 'Stretch', extra: true, updatedAt: 3 }]
  );
  assert.strictEqual(merged.length, 2);
  const yin = merged.find((e) => e.id === 'yoga-1');
  assert.strictEqual(yin.className, 'Yin Yoga');
  assert.strictEqual(yin.weight, undefined);
  assert.strictEqual(yin.covers, '');
  assert.strictEqual(yin.updatedAt, 20);
});

test('11/19 migration stamps updatedAt and a second run is a no-op', () => {
  const doc = { logs: { '2026-11-19': Object.assign({}, LOCAL_1119), '2026-11-18': { type: 'strength', slot: 'strengthA' } } };
  const once = M19.migrateDoc(doc, 5000);
  assert.strictEqual(once.changed, true);
  assert.strictEqual(once.after.mode, 'treadmill');
  assert.strictEqual(once.after.weight, undefined);
  assert.strictEqual(once.after.updatedAt, 5000);
  const twice = M19.migrateDoc(once.doc, 9000);
  assert.strictEqual(twice.changed, false);
  assert.strictEqual(twice.after.updatedAt, 5000);
});

test('11/20 script moves yoga to extras and writes treadmill in the open cardio slot', () => {
  const doc = {
    startDate: '2026-11-15',
    currentBlockId: 'forge-4-mwijdguv',
    blocks: [{ id: 'forge-4-mwijdguv', name: 'FORGE 4', startDate: '2026-11-15' }],
    logs: {
      '2026-11-18': { type: 'strength', slot: 'strengthA', slots: ['strengthA'] },
      '2026-11-20': { extra: true, ouraId: M20.YOGA_ID, className: 'Yin Yoga', workout: 'Yin Yoga', covers: '', slot: 'cardioA' },
    },
  };
  assert.strictEqual(E.cardioSlotDue(doc, '2026-11-20'), 'cardioA');
  const result = M20.migrateDoc(doc, { now: 7000 });
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.slot, 'cardioA');
  assert.strictEqual(result.doc.logs['2026-11-20'].mode, 'treadmill');
  assert.strictEqual(result.doc.logs['2026-11-20'].slot, 'cardioA');
  assert.strictEqual(result.doc.logs['2026-11-20'].duration, '20');
  assert.strictEqual(result.doc.logs['2026-11-20'].distance, '1.38');
  assert.strictEqual(result.doc.logs['2026-11-20'].calories, '256');
  assert.strictEqual(result.doc.logs['2026-11-20'].speed, '4.2');
  assert.strictEqual(result.doc.logs['2026-11-20'].maxSpeed, '6.3');
  assert.strictEqual(result.doc.logs['2026-11-20'].rpe, '8');
  assert.strictEqual(result.doc.logs['2026-11-20'].hr, undefined);
  assert.strictEqual(result.doc.extras['2026-11-20'][0].id, M20.YOGA_ID);
  assert.strictEqual(result.doc.extras['2026-11-20'][0].extra, true);
  assert.strictEqual(result.doc.logs['2026-11-18'].slot, 'strengthA');
  const again = M20.migrateDoc(result.doc, { now: 8000 });
  assert.strictEqual(again.changed, false);
  assert.strictEqual(again.slot, 'cardioA');
});

test('11/20 script picks cardioB when cardioA is already logged that week', () => {
  const doc = {
    startDate: '2026-11-15',
    currentBlockId: 'forge-4-mwijdguv',
    blocks: [{ id: 'forge-4-mwijdguv', startDate: '2026-11-15' }],
    logs: {
      '2026-11-18': { type: 'cardio', mode: 'row', slot: 'cardioA', slots: ['cardioA'] },
      '2026-11-20': { extra: true, ouraId: M20.YOGA_ID, className: 'Yoga', workout: 'Yoga' },
    },
  };
  const result = M20.migrateDoc(doc, { now: 1, hr: '118' });
  assert.strictEqual(result.slot, 'cardioB');
  assert.strictEqual(result.doc.logs['2026-11-20'].hr, '118');
  assert.strictEqual(result.doc.logs['2026-11-20'].slot, 'cardioB');
});

test('11/20 script refuses a different entry', () => {
  const doc = {
    startDate: '2026-11-15',
    blocks: [{ id: 'forge-4-mwijdguv', startDate: '2026-11-15' }],
    logs: { '2026-11-20': { type: 'strength', slot: 'strengthB' } },
  };
  const result = M20.migrateDoc(doc, { now: 1 });
  assert.ok(result.error);
  assert.strictEqual(result.doc, undefined);
});

console.log('\n' + passed + ' tests passed');

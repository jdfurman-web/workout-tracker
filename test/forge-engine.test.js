#!/usr/bin/env node
// Fake-log harness for FORGE 2 slip/recalc + core 4–5. No real workout-data.
const assert = require('assert');
const E = require('../forge-engine.js');

const WEEK_ORDER = ['strengthA', 'cardioA', 'strengthB', 'cardioB'];
const START = '2026-08-15'; // Saturday — FORGE 2 day 1

function hasData(log) {
  if (!log) return false;
  if (log.type === 'strength') {
    const ex = log.exercises || {};
    for (const k in ex) { if (ex[k].sets && Object.keys(ex[k].sets).length) return true; }
    return false;
  }
  return !!(log.duration || log.distance || log.watts);
}

function pick(fromDs, done, lastDates, startDate, week) {
  const bounds = E.weekBounds(startDate || START, week || 1);
  return E.pickNextSlot({
    weekOrder: WEEK_ORDER,
    doneSlots: new Set(done || []),
    fromDs,
    weekEndDs: bounds.end,
    lastDates: lastDates || {},
  });
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

test('week 1 is Sat 8/15–Fri 8/21 from Saturday start', () => {
  const b = E.weekBounds(START, 1);
  assert.strictEqual(b.start, '2026-08-15');
  assert.strictEqual(b.end, '2026-08-21');
  assert.strictEqual(E.weekNumber(START, '2026-08-15'), 1);
  assert.strictEqual(E.weekNumber(START, '2026-08-21'), 1);
  assert.strictEqual(E.weekNumber(START, '2026-08-22'), 2);
  assert.strictEqual(E.weekNumber(START, '2026-08-14'), 0);
});

test('Saturday day 1 has a real first slot (not empty)', () => {
  const r = pick('2026-08-15', []);
  assert.ok(r.slot, 'week 1 Saturday must have a session');
  assert.strictEqual(r.slot, 'strengthA'); // no history → weekOrder default
  assert.strictEqual(r.reason, 'ok');
  assert.strictEqual(r.remaining.length, 4);
});

test('does not start the week before Saturday', () => {
  assert.strictEqual(E.weekNumber(START, '2026-08-14'), 0);
  assert.strictEqual(E.proposedBlockStart('2026-08-14', 'FORGE 2'), '2026-08-15');
  assert.strictEqual(E.proposedBlockStart('2026-08-15', 'FORGE 2'), '2026-08-15');
  assert.strictEqual(E.proposedBlockStart('2026-08-16', 'FORGE 2'), '2026-08-16');
  assert.strictEqual(E.proposedBlockStart('2026-08-14', 'FORGE 3'), '2026-08-14');
});

test('missed Saturday keeps the slot in the pool; Sunday shows one session', () => {
  // No log on Saturday → done still empty. Sunday is one slot, not two stacked.
  const sat = pick('2026-08-15', []);
  const sun = pick('2026-08-16', []);
  assert.strictEqual(sat.slot, 'strengthA');
  assert.strictEqual(sun.slot, 'strengthA');
  assert.strictEqual(sun.remaining.length, 4);
  assert.notStrictEqual(sun.reason, 'weekdone');
});

test('after a logged Saturday, Sunday is the next remaining slot (still one)', () => {
  const sun = pick('2026-08-16', ['strengthA']);
  assert.strictEqual(sun.slot, 'cardioA');
  assert.strictEqual(sun.remaining.length, 3);
});

test('Monday is not trainable — no strength/hard session', () => {
  assert.strictEqual(E.isMonday('2026-08-17'), true);
  assert.strictEqual(E.isTrainableDay('2026-08-17'), false);
  const mon = pick('2026-08-17', ['strengthA']);
  assert.strictEqual(mon.slot, null);
  assert.strictEqual(mon.reason, 'monday');
  assert.ok(mon.remaining.includes('cardioA'));
});

test('Tuesday after a Monday miss still has the leftover slot (not stacked)', () => {
  // Sat logged strengthA, Sun/Mon missed. Pool still has 3. Tuesday = one session.
  const tue = pick('2026-08-18', ['strengthA']);
  assert.ok(tue.slot);
  assert.strictEqual(tue.remaining.length, 3);
  assert.notStrictEqual(tue.slot, null);
});

test('3 slots left and 1 trainable day → one session, not 3', () => {
  // Friday 8/21 is last day of week 1. 3 slots still open.
  const fri = pick('2026-08-21', ['strengthA']);
  assert.ok(fri.slot);
  assert.strictEqual(fri.remaining.length, 3);
  assert.strictEqual(fri.trainableLeft, 1);
  assert.strictEqual(fri.reason, 'drop-extras');
  // extras die at window close — next week is a clean 4, no debt
  const nextSat = pick('2026-08-22', [], {}, START, 2);
  assert.strictEqual(nextSat.remaining.length, 4);
  assert.strictEqual(nextSat.slot, 'strengthA');
});

test('staleness: 17-day-old row beats a 2-day-old upper', () => {
  const lastDates = {
    strengthA: '2026-08-13', // 2 days before Saturday
    cardioA: '2026-07-29',   // 17 days stale
    strengthB: '2026-08-10',
    cardioB: '2026-08-08',
  };
  const r = pick('2026-08-15', [], lastDates);
  assert.strictEqual(r.slot, 'cardioA');
});

test('Monday is excluded from remaining-days math', () => {
  // From Saturday 8/15 through Friday 8/21: 6 trainable (Mon out)
  assert.strictEqual(E.remainingTrainableDays('2026-08-15', '2026-08-21'), 6);
  assert.strictEqual(E.remainingTrainableDays('2026-08-17', '2026-08-21'), 4); // Tue–Fri
  assert.strictEqual(E.remainingTrainableDays('2026-08-21', '2026-08-21'), 1);
});

test('core 4 floor / 5 stretch; 3/4 is not a fail', () => {
  const core = {
    '2026-08-15': { rounds: 2 },
    '2026-08-16': { rounds: 1 },
    '2026-08-18': { rounds: 3 },
  };
  const did = (c) => !!(c && (c.done || (c.rounds || 0) >= 1));
  const n = E.countCoreDays(core, '2026-08-15', '2026-08-21', did);
  assert.strictEqual(n, 3);
  assert.strictEqual(E.coreWeekLabel(3), 'core 3/4');
  assert.strictEqual(E.coreWeekLabel(4), 'core 4/4');
  assert.strictEqual(E.coreWeekLabel(5), 'core 4/4 · +1');
  assert.strictEqual(E.coreWeekLabel(0), 'core 0/4');
});

test('core-only does not fill a training slot', () => {
  const logs = {
    '2026-08-15': { slot: 'strengthA', type: 'strength', exercises: { x: { sets: { 0: { weight: 50, reps: 8 } } } } },
    '2026-08-16': { type: 'coreonly' }, // no slot
  };
  const last = E.lastSlotDates(logs, hasData);
  assert.deepStrictEqual(Object.keys(last).sort(), ['strengthA']);
  const sun = pick('2026-08-16', ['strengthA']);
  assert.ok(sun.slot);
  assert.notStrictEqual(sun.slot, 'strengthA');
});

test('bonus fifth is not asked: 4/4 → weekdone (picker returns null)', () => {
  const r = pick('2026-08-20', WEEK_ORDER);
  assert.strictEqual(r.slot, null);
  assert.strictEqual(r.reason, 'weekdone');
  assert.strictEqual(r.remaining.length, 0);
});

test('prettyDate uses local noon so 2026-08-15 is the 15th, not the 14th', () => {
  const p = E.prettyDate('2026-08-15');
  assert.match(p, /15/);
  assert.doesNotMatch(p, /14/);
});

test('offer copy: Friday vs Saturday', () => {
  const fri = E.forge2OfferCopy('2026-08-14', '2026-08-15');
  assert.match(fri.button, /Saturday/i);
  assert.match(fri.button, /15/);
  const sat = E.forge2OfferCopy('2026-08-15', '2026-08-15');
  assert.strictEqual(sat.button, 'Start FORGE 2 today');
});

test('fake last prescriptions are not invented — only read from logs', () => {
  const logs = {
    '2026-08-02': {
      slot: 'strengthA', type: 'strength',
      exercises: {
        'barbell-or-db-bench-press': { sets: { 0: { weight: '185', reps: '8' }, 1: { weight: '185', reps: '8' } } },
      },
    },
  };
  const last = E.lastSlotDates(logs, hasData);
  assert.strictEqual(last.strengthA, '2026-08-02');
  const bench = logs['2026-08-02'].exercises['barbell-or-db-bench-press'].sets[0];
  assert.strictEqual(bench.weight, '185');
  assert.strictEqual(bench.reps, '8');
});

test('a strength class fills the next strength slot; the next day slips to cardio', () => {
  const filled = E.assignClassSlots({ weekOrder: WEEK_ORDER, doneSlots: new Set(), covers: 'strength' });
  assert.deepStrictEqual(filled, ['strengthA']);
  const sun = pick('2026-08-16', filled);
  assert.strictEqual(sun.slot, 'cardioA');
  assert.strictEqual(sun.remaining.length, 3);
});

test('a class that covers both fills one strength slot and one cardio slot', () => {
  const filled = E.assignClassSlots({ weekOrder: WEEK_ORDER, doneSlots: new Set(), covers: 'both' });
  assert.deepStrictEqual(filled, ['strengthA', 'cardioA']);
  const sun = pick('2026-08-16', filled);
  assert.strictEqual(sun.slot, 'strengthB');
  assert.ok(!sun.remaining.includes('strengthA'));
  assert.ok(!sun.remaining.includes('cardioA'));
});

test('class cardio skips a strength slot that is still open', () => {
  const filled = E.assignClassSlots({
    weekOrder: WEEK_ORDER,
    doneSlots: new Set(),
    covers: 'cardio',
  });
  assert.deepStrictEqual(filled, ['cardioA']);
  const sun = pick('2026-08-16', filled);
  assert.strictEqual(sun.slot, 'strengthA');
});

test('second strength class takes strengthB, then that kind is only a bonus repeat', () => {
  const second = E.assignClassSlots({
    weekOrder: WEEK_ORDER,
    doneSlots: new Set(['strengthA']),
    covers: 'strength',
  });
  assert.deepStrictEqual(second, ['strengthB']);
  const bonus = E.assignClassSlots({
    weekOrder: WEEK_ORDER,
    doneSlots: new Set(['strengthA', 'strengthB']),
    covers: 'strength',
  });
  assert.deepStrictEqual(bonus, ['strengthB']);
});

test('Monday stays non-trainable after a class filled Saturday', () => {
  const mon = pick('2026-08-17', ['strengthA']);
  assert.strictEqual(mon.slot, null);
  assert.strictEqual(mon.reason, 'monday');
});

test('lastSlotDates records every slot one class filled', () => {
  const logs = {
    '2026-08-15': { type: 'class', className: 'GTX', covers: 'both', slot: 'strengthA', slots: ['strengthA', 'cardioA'], duration: '45' },
  };
  const has = (log) => !!(log && (log.className || log.duration));
  const last = E.lastSlotDates(logs, has);
  assert.strictEqual(last.strengthA, '2026-08-15');
  assert.strictEqual(last.cardioA, '2026-08-15');
  assert.strictEqual(last.strengthB, undefined);
});

test('GTX and Alpha default to strength; other names do not', () => {
  assert.strictEqual(E.defaultClassCovers('GTX'), 'strength');
  assert.strictEqual(E.defaultClassCovers('alpha'), 'strength');
  assert.strictEqual(E.defaultClassCovers('Spin'), '');
  assert.strictEqual(E.defaultClassCovers(''), '');
});

test('oura workouts degrade when missing or for another day', () => {
  assert.deepStrictEqual(E.ouraWorkoutsForDay(null, '2026-11-21'), []);
  assert.deepStrictEqual(E.ouraWorkoutsForDay({}, '2026-11-21'), []);
  assert.deepStrictEqual(E.ouraWorkoutsForDay({ workouts: [] }, '2026-11-21'), []);
  assert.deepStrictEqual(E.ouraWorkoutsForDay({ workouts: null }, '2026-11-21'), []);
  const data = { workouts: [{ id: 'a', day: '2026-11-20', activity: 'running' }] };
  assert.deepStrictEqual(E.ouraWorkoutsForDay(data, '2026-11-21'), []);
  assert.strictEqual(E.ouraWorkoutsForDay(data, '2026-11-20').length, 1);
});

test('oura prefill chooses treadmill or class and never names a slot', () => {
  const run = {
    id: 'ow1', day: '2026-11-22', activity: 'running', label: null,
    start: '2026-11-22T14:02:00-06:00', end: '2026-11-22T14:32:00-06:00',
    calories: 280, intensity: 'moderate', source: 'oura', avg_hr: 128, max_hr: 151,
  };
  const pre = E.ouraPrefill(run);
  assert.strictEqual(pre.kind, 'treadmill');
  assert.strictEqual(pre.mode, 'treadmill');
  assert.strictEqual(pre.duration, '30');
  assert.strictEqual(pre.hr, '128');
  assert.strictEqual(pre.calories, '280');
  assert.strictEqual(pre.slot, undefined);
  assert.strictEqual(pre.slots, undefined);
  assert.strictEqual(pre.distance, undefined);
  const gtx = {
    id: 'ow2', day: '2026-11-22', activity: 'strength_training', label: 'GTX',
    start: '2026-11-22T18:00:00-06:00', end: '2026-11-22T18:45:00-06:00',
    calories: 410, intensity: 'hard', source: 'oura', avg_hr: 142, max_hr: 168,
  };
  const klass = E.ouraPrefill(gtx);
  assert.strictEqual(klass.kind, 'class');
  assert.strictEqual(klass.className, 'GTX');
  assert.strictEqual(klass.covers, 'strength');
  assert.strictEqual(klass.duration, '45');
  assert.strictEqual(klass.intensity, 'hard');
  assert.strictEqual(klass.slot, undefined);
});

test('oura calories and heart rate round to whole numbers', () => {
  const pre = E.ouraPrefill({
    id: 'ow-float', day: '2026-11-22', activity: 'running', label: null,
    start: '2026-11-22T14:02:00-06:00', end: '2026-11-22T14:32:00-06:00',
    calories: 119.133056640625, intensity: 'moderate', source: 'oura', avg_hr: 127.4, max_hr: 151.2,
  });
  assert.strictEqual(pre.kind, 'treadmill');
  assert.strictEqual(pre.calories, '119');
  assert.strictEqual(pre.hr, '127');
  assert.strictEqual(pre.slot, undefined);
  assert.strictEqual(pre.ouraDraft, undefined);
  const klass = E.ouraPrefill({
    id: 'ow-class-float', day: '2026-11-22', activity: 'strength_training', label: 'GTX',
    start: '2026-11-22T18:00:00-06:00', end: '2026-11-22T18:45:00-06:00',
    calories: 410.6, intensity: 'hard', source: 'oura', avg_hr: 141.5,
  });
  assert.strictEqual(klass.calories, '411');
  assert.strictEqual(klass.hr, '142');
  assert.strictEqual(klass.intensity, 'hard');
  assert.strictEqual(klass.covers, 'strength');
});

console.log('\n' + passed + ' tests passed');

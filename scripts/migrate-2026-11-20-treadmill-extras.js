#!/usr/bin/env node
// Move the 2026-11-20 Yoga extra out of logs and write that day's treadmill
// into the cardio slot still open that week. Extras do not fill a plan slot.
//
//   node scripts/migrate-2026-11-20-treadmill-extras.js --file data/ruck-iron-data.json
//   node scripts/migrate-2026-11-20-treadmill-extras.js --file ... --hr 130
//   node scripts/migrate-2026-11-20-treadmill-extras.js --file ... --dry-run
//
// Backup, written only when a change is made:
//   data/backups/ruck-iron-data.2026-11-21.pre-1120.json
const fs = require('fs');
const path = require('path');
const E = require('../forge-engine.js');

const TARGET_DAY = '2026-11-20';
const BLOCK_ID = 'forge-4-mwijdguv';
const YOGA_ID = '45e0385f-01e3-466c-947b-43cad1e3853d';
const BACKUP_NAME = 'ruck-iron-data.2026-11-21.pre-1120.json';
const WEEK_ORDER = ['strengthA', 'cardioA', 'strengthB', 'cardioB'];

function sameNum(value, expected) {
  if (value == null || value === '') return false;
  const n = Number(value);
  return !Number.isNaN(n) && Math.abs(n - expected) < 1e-6;
}

function isYogaExtra(log) {
  if (!log || typeof log !== 'object') return false;
  const id = log.ouraId || log.id;
  return String(id || '') === YOGA_ID && (log.extra === true || /yoga/i.test(String(log.className || log.workout || log.activity || '')));
}

function isTargetTreadmill(log) {
  if (!log || log.mode !== 'treadmill' || log.type !== 'cardio') return false;
  if (log.extra) return false;
  if (log.weight != null && log.weight !== '') return false;
  return sameNum(log.duration, 20)
    && sameNum(log.distance, 1.38)
    && sameNum(log.calories, 256)
    && sameNum(log.speed, 4.2)
    && sameNum(log.maxSpeed, 6.3)
    && sameNum(log.rpe, 8)
    && (log.slot === 'cardioA' || log.slot === 'cardioB');
}

function yogaInExtras(doc) {
  const list = (doc.extras && doc.extras[TARGET_DAY]) || [];
  return list.some((entry) => entry && (entry.id === YOGA_ID || entry.ouraId === YOGA_ID));
}

function treadmillLog(slot, week, now, hr) {
  const entry = {
    type: 'cardio',
    mode: 'treadmill',
    workout: 'Treadmill',
    slot: slot,
    slots: [slot],
    week: week,
    blockId: BLOCK_ID,
    duration: '20',
    distance: '1.38',
    calories: '256',
    speed: '4.2',
    maxSpeed: '6.3',
    rpe: '8',
    ts: now,
    updatedAt: now,
  };
  if (hr != null && hr !== '') entry.hr = String(hr);
  return entry;
}

function migrateDoc(doc, opts) {
  opts = opts || {};
  const now = opts.now || Date.now();
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'root JSON is not an object' };
  if (!doc.logs || !doc.logs[TARGET_DAY]) return { error: 'no logs["' + TARGET_DAY + '"]' };
  const before = doc.logs[TARGET_DAY];
  const block = (doc.blocks || []).find((b) => b && b.id === BLOCK_ID);
  const start = (block && block.startDate) || doc.startDate;
  if (!start) return { error: 'no start date for ' + BLOCK_ID };
  const week = E.weekNumber(start, TARGET_DAY);
  const slot = E.cardioSlotDue(Object.assign({}, doc, { currentBlockId: BLOCK_ID }), TARGET_DAY, WEEK_ORDER);
  if (!slot) return { error: 'no open cardio slot for ' + TARGET_DAY };

  if (isTargetTreadmill(before) && yogaInExtras(doc) && before.slot === slot) {
    return { changed: false, before: before, after: before, slot: slot, week: week, doc: doc };
  }
  if (!isYogaExtra(before)) {
    return { error: TARGET_DAY + ' is not the Yoga extra ' + YOGA_ID + ' and is not already the treadmill conversion. Nothing was written.' };
  }

  const next = JSON.parse(JSON.stringify(doc));
  if (!next.extras) next.extras = {};
  const extra = Object.assign({}, before, {
    id: YOGA_ID,
    ouraId: YOGA_ID,
    extra: true,
    covers: '',
    updatedAt: before.updatedAt || before.ts || now,
  });
  delete extra.slot;
  delete extra.slots;
  const list = Array.isArray(next.extras[TARGET_DAY]) ? next.extras[TARGET_DAY].slice() : [];
  if (!list.some((entry) => entry && (entry.id === YOGA_ID || entry.ouraId === YOGA_ID))) list.push(extra);
  next.extras[TARGET_DAY] = list;
  const after = treadmillLog(slot, week, now, opts.hr);
  next.logs[TARGET_DAY] = after;
  return { changed: true, before: before, after: after, extra: extra, slot: slot, week: week, doc: next };
}

function parseArgs(argv) {
  const out = { file: '', dryRun: false, hr: '' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--file') out.file = argv[++i] || '';
    else if (argv[i] === '--hr') out.hr = argv[++i] || '';
    else if (!argv[i].startsWith('--') && !out.file) out.file = argv[i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node scripts/migrate-2026-11-20-treadmill-extras.js --file <ruck-iron-data.json> [--hr N] [--dry-run]');
    process.exit(2);
  }
  const file = path.resolve(args.file);
  const raw = fs.readFileSync(file, 'utf8');
  const result = migrateDoc(JSON.parse(raw), { hr: args.hr });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(JSON.stringify({
    day: TARGET_DAY,
    changed: result.changed,
    dryRun: args.dryRun,
    slot: result.slot,
    week: result.week,
    why: 'First cardio slot still open that week (cardioA, then cardioB). The Yoga extra does not fill a slot.',
  }, null, 2));
  if (!result.changed || args.dryRun) return;
  const backupDir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, BACKUP_NAME);
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, raw.endsWith('\n') ? raw : raw + '\n');
  fs.writeFileSync(file, JSON.stringify(result.doc, null, 2) + '\n');
  console.error('Wrote ' + file);
  console.error('Backup ' + backupPath);
}

module.exports = {
  TARGET_DAY,
  YOGA_ID,
  BACKUP_NAME,
  migrateDoc,
  isYogaExtra,
  isTargetTreadmill,
};

if (require.main === module) main();

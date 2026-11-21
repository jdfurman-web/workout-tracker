#!/usr/bin/env node
// Idempotent: convert the 2026-11-19 0 lb ruck (30 min, 1.77 mi, HR 130, RPE 7)
// into a treadmill entry. Touches no other day. Writes a dated backup first.
//
//   node scripts/migrate-2026-11-19-treadmill.js --file /path/to/data/ruck-iron-data.json
//   node scripts/migrate-2026-11-19-treadmill.js --file ... --dry-run
//
// The live workout-data repo was not reachable from this environment.
// Run this against data/ruck-iron-data.json there. A second run is a no-op
// once that entry is already a treadmill session with the pack weight gone.
const fs = require('fs');
const path = require('path');

const TARGET_DAY = '2026-11-19';
const BACKUP_NAME = 'ruck-iron-data.2026-11-21.pre-treadmill.json';

function sameNum(value, expected) {
  if (value == null || value === '') return false;
  const n = Number(value);
  return !Number.isNaN(n) && Math.abs(n - expected) < 1e-6;
}

function isTargetRuck(log) {
  if (!log || typeof log !== 'object') return false;
  const mode = log.mode || (log.type === 'ruck' ? 'ruck' : '');
  if (mode !== 'ruck') return false;
  return sameNum(log.duration, 30)
    && sameNum(log.distance, 1.77)
    && sameNum(log.hr, 130)
    && sameNum(log.rpe, 7)
    && sameNum(log.weight, 0);
}

function isTargetTreadmill(log) {
  if (!log || typeof log !== 'object') return false;
  if (log.mode !== 'treadmill') return false;
  if (log.weight != null && log.weight !== '') return false;
  return sameNum(log.duration, 30)
    && sameNum(log.distance, 1.77)
    && sameNum(log.hr, 130)
    && sameNum(log.rpe, 7);
}

function convertEntry(log) {
  const next = Object.assign({}, log);
  next.mode = 'treadmill';
  if (next.type === 'ruck' || next.type == null || next.type === '') next.type = 'cardio';
  delete next.weight;
  return next;
}

// Returns { changed, before, after, doc } or { error }.
// `doc` is a deep copy with only logs[TARGET_DAY] replaced.
function migrateDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { error: 'root JSON is not an object' };
  }
  if (!doc.logs || typeof doc.logs !== 'object' || !doc.logs[TARGET_DAY]) {
    return { error: 'no logs["' + TARGET_DAY + '"] entry to convert' };
  }
  const before = doc.logs[TARGET_DAY];
  if (isTargetTreadmill(before)) {
    return { changed: false, before: before, after: before, doc: doc };
  }
  const treadmillWithPack = before.mode === 'treadmill'
    && sameNum(before.duration, 30)
    && sameNum(before.distance, 1.77)
    && sameNum(before.hr, 130)
    && sameNum(before.rpe, 7)
    && sameNum(before.weight, 0);
  if (treadmillWithPack) {
    const after = convertEntry(before);
    const next = JSON.parse(JSON.stringify(doc));
    next.logs[TARGET_DAY] = after;
    return { changed: true, before: before, after: after, doc: next };
  }
  if (!isTargetRuck(before)) {
    return {
      error: TARGET_DAY + ' is not the 0 lb ruck (30 min, 1.77 mi, HR 130, RPE 7) and is not already the treadmill conversion. Nothing was written.',
    };
  }
  const after = convertEntry(before);
  const next = JSON.parse(JSON.stringify(doc));
  next.logs[TARGET_DAY] = after;
  return { changed: true, before: before, after: after, doc: next };
}

function entryCount(doc) {
  return Object.keys((doc && doc.logs) || {}).length;
}

function hashExceptDay(doc, day) {
  const crypto = require('crypto');
  const clone = JSON.parse(JSON.stringify(doc));
  if (clone.logs) delete clone.logs[day];
  return crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
}

function parseArgs(argv) {
  const out = { file: '', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--file') out.file = argv[++i] || '';
    else if (!argv[i].startsWith('--') && !out.file) out.file = argv[i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node scripts/migrate-2026-11-19-treadmill.js --file <ruck-iron-data.json> [--dry-run]');
    process.exit(2);
  }
  const file = path.resolve(args.file);
  const raw = fs.readFileSync(file, 'utf8');
  const doc = JSON.parse(raw);
  const result = migrateDoc(doc);
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  const beforeCount = entryCount(doc);
  const afterCount = entryCount(result.doc);
  const beforeHash = hashExceptDay(doc, TARGET_DAY);
  const afterHash = hashExceptDay(result.doc, TARGET_DAY);
  console.log(JSON.stringify({
    day: TARGET_DAY,
    changed: result.changed,
    dryRun: args.dryRun,
    entryCountBefore: beforeCount,
    entryCountAfter: afterCount,
    otherEntriesHashBefore: beforeHash,
    otherEntriesHashAfter: afterHash,
    before: result.before,
    after: result.after,
  }, null, 2));
  if (beforeCount !== afterCount || beforeHash !== afterHash) {
    console.error('Refusing to write: entry count or other-entry hash changed.');
    process.exit(1);
  }
  if (!result.changed || args.dryRun) return;
  const backupDir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, BACKUP_NAME);
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, raw.endsWith('\n') ? raw : raw + '\n');
  const text = JSON.stringify(result.doc, null, 2) + '\n';
  fs.writeFileSync(file, text);
  console.error('Wrote ' + file);
  console.error('Backup ' + backupPath);
}

module.exports = {
  TARGET_DAY,
  BACKUP_NAME,
  migrateDoc,
  convertEntry,
  isTargetRuck,
  isTargetTreadmill,
  entryCount,
  hashExceptDay,
};

if (require.main === module) main();

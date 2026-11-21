// FORGE cadence engine — pure functions (browser + node).
// Week windows are 7 days from block startDate (not calendar Sunday).
// Today shows one training slot. Missed days do not consume a slot.
// Monday is not a trainable day (no strength / hard session suggestion).
(function (root) {
  const FORGE2_START = '2026-08-15';
  const CORE_FLOOR = 4;
  const CORE_STRETCH = 5;

  function dateStr(d) {
    if (typeof d === 'string') return d.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function addDays(ds, n) {
    const d = new Date(ds + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }

  function isMonday(ds) {
    return new Date(ds + 'T12:00:00').getDay() === 1;
  }

  function isTrainableDay(ds) {
    return !isMonday(ds);
  }

  function weekNumber(startDate, date) {
    if (!startDate) return 0;
    const start = new Date(startDate + 'T12:00:00');
    start.setHours(0, 0, 0, 0);
    const d = (date instanceof Date) ? new Date(date) : new Date(dateStr(date) + 'T12:00:00');
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((d - start) / 86400000);
    if (diff < 0) return 0;
    return Math.floor(diff / 7) + 1;
  }

  function weekBounds(startDate, week) {
    const start = addDays(startDate, (week - 1) * 7);
    return { start, end: addDays(start, 6) };
  }

  function remainingTrainableDays(fromDs, weekEndDs) {
    if (!fromDs || !weekEndDs || fromDs > weekEndDs) return 0;
    let n = 0;
    let d = fromDs;
    while (d <= weekEndDs) {
      if (isTrainableDay(d)) n++;
      d = addDays(d, 1);
    }
    return n;
  }

  // A log may name one slot (`slot`) or several (`slots`) when one class
  // covers both a strength slot and a cardio slot. Same reader either way.
  function slotsOnLog(log) {
    if (!log) return [];
    const many = Array.isArray(log.slots) ? log.slots.filter(Boolean) : [];
    if (many.length) return many.slice();
    return log.slot ? [log.slot] : [];
  }

  function slotKind(slot) {
    const s = String(slot || '');
    if (s.indexOf('strength') === 0) return 'strength';
    if (s.indexOf('cardio') === 0) return 'cardio';
    return '';
  }

  // Next open slot of the kind a class counts as. Already-done slots stay
  // done; this only names which remaining pool entries the class satisfies.
  // If that kind is already full, the last slot of the kind is repeated
  // (bonus), which the existing week-done picker already ignores.
  function assignClassSlots(opts) {
    const weekOrder = opts.weekOrder || [];
    const done = opts.doneSlots instanceof Set ? opts.doneSlots : new Set(opts.doneSlots || []);
    const covers = opts.covers === 'both' ? 'both' : (opts.covers === 'cardio' ? 'cardio' : (opts.covers === 'strength' ? 'strength' : ''));
    if (!covers) return [];
    const kinds = covers === 'both' ? ['strength', 'cardio'] : [covers];
    const out = [];
    for (let i = 0; i < kinds.length; i++) {
      const ofKind = weekOrder.filter((s) => slotKind(s) === kinds[i]);
      if (!ofKind.length) continue;
      let pick = null;
      for (let j = 0; j < ofKind.length; j++) {
        if (!done.has(ofKind[j]) && out.indexOf(ofKind[j]) === -1) { pick = ofKind[j]; break; }
      }
      if (!pick) pick = ofKind[ofKind.length - 1];
      if (out.indexOf(pick) === -1) out.push(pick);
    }
    return out;
  }

  function lastSlotDates(logs, hasData) {
    const last = {};
    for (const ds of Object.keys(logs || {})) {
      const log = logs[ds];
      if (!log) continue;
      if (hasData && !hasData(log)) continue;
      const slots = slotsOnLog(log);
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!last[slot] || ds > last[slot]) last[slot] = ds;
      }
    }
    return last;
  }

  function ouraWorkoutsForDay(data, day) {
    if (!data || !Array.isArray(data.workouts) || !day) return [];
    return data.workouts.filter((w) => w && w.day === day);
  }

  function minutesBetweenIso(start, end) {
    const a = Date.parse(start || '');
    const b = Date.parse(end || '');
    if (!isFinite(a) || !isFinite(b) || b < a) return '';
    return String(Math.round((b - a) / 60000));
  }

  function ouraEntryKind(item) {
    const label = String((item && item.label) || '').toLowerCase();
    const activity = String((item && item.activity) || '').toLowerCase();
    const blob = label + ' ' + activity;
    if (/\b(gtx|alpha)\b/.test(blob)) return 'class';
    if (/class|strength|weight|lift|hiit|yoga|pilates|crossfit|functional/.test(blob)) return 'class';
    if (/tread|run|jog|walk|elliptical/.test(blob)) return 'treadmill';
    return 'class';
  }

  function defaultClassCovers(name) {
    const n = String(name || '').trim().toLowerCase();
    if (n === 'gtx' || n === 'alpha') return 'strength';
    return '';
  }

  function inferClassCovers(item) {
    const named = defaultClassCovers(item && (item.label || item.className));
    if (named) return named;
    const blob = String((item && item.activity) || '').toLowerCase();
    if (/strength|weight|lift|hiit|functional|crossfit|yoga|pilates/.test(blob)) return 'strength';
    if (/cardio|run|walk|row|cycle|bike|tread|elliptical|jog/.test(blob)) return 'cardio';
    return '';
  }

  function ouraClassName(item) {
    const label = item && item.label != null ? String(item.label).trim() : '';
    if (label) return label;
    const act = item && item.activity ? String(item.activity).trim() : '';
    if (!act) return '';
    return act.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  function blankNum(v) {
    if (v == null || v === '') return '';
    return String(v);
  }

  // Form values only. No slot — a suggestion must not complete a session.
  function ouraPrefill(item) {
    const kind = ouraEntryKind(item || {});
    const duration = minutesBetweenIso(item && item.start, item && item.end);
    const base = {
      kind: kind,
      duration: duration,
      calories: blankNum(item && item.calories),
      hr: blankNum(item && item.avg_hr),
      ouraId: item && item.id != null ? String(item.id) : '',
    };
    if (kind === 'treadmill') {
      base.type = 'cardio';
      base.mode = 'treadmill';
      return base;
    }
    const className = ouraClassName(item || {});
    base.type = 'class';
    base.mode = 'class';
    base.className = className;
    base.covers = defaultClassCovers(className) || inferClassCovers(item || {});
    base.intensity = blankNum(item && item.intensity);
    return base;
  }

  function remainingSlots(weekOrder, doneSlots) {
    const done = doneSlots instanceof Set ? doneSlots : new Set(doneSlots || []);
    return (weekOrder || []).filter((s) => !done.has(s));
  }

  function sortSlotsByStaleness(slots, lastDates, weekOrder) {
    const last = lastDates || {};
    const order = weekOrder || [];
    return slots.slice().sort((a, b) => {
      const da = last[a] || '';
      const db = last[b] || '';
      if (da !== db) return da < db ? -1 : 1; // older / never-logged first
      return order.indexOf(a) - order.indexOf(b);
    });
  }

  // One slot for this day, or null (rest / week done). Never returns a stack.
  // If remaining slots > remaining trainable days, still one highest-priority
  // slot — extras are allowed to drop when the window closes. No debt.
  function pickNextSlot(opts) {
    const weekOrder = opts.weekOrder || [];
    const doneSlots = opts.doneSlots instanceof Set ? opts.doneSlots : new Set(opts.doneSlots || []);
    const fromDs = opts.fromDs;
    const weekEndDs = opts.weekEndDs;
    const lastDates = opts.lastDates || {};
    const remaining = remainingSlots(weekOrder, doneSlots);
    const trainableLeft = remainingTrainableDays(fromDs, weekEndDs);

    if (!remaining.length) {
      return { slot: null, reason: 'weekdone', remaining, trainableLeft };
    }
    if (fromDs > weekEndDs) {
      return { slot: null, reason: 'past-window', remaining, trainableLeft: 0 };
    }
    if (isMonday(fromDs)) {
      return { slot: null, reason: 'monday', remaining, trainableLeft };
    }
    if (trainableLeft <= 0) {
      return { slot: null, reason: 'no-days', remaining, trainableLeft };
    }

    const ordered = sortSlotsByStaleness(remaining, lastDates, weekOrder);
    return {
      slot: ordered[0],
      reason: remaining.length > trainableLeft ? 'drop-extras' : 'ok',
      remaining,
      trainableLeft,
    };
  }

  function countCoreDays(coreMap, startDs, endDs, didDay) {
    if (!startDs || !endDs) return 0;
    let n = 0;
    let d = startDs;
    while (d <= endDs) {
      if (didDay && didDay(coreMap && coreMap[d])) n++;
      d = addDays(d, 1);
    }
    return n;
  }

  function coreWeekLabel(done, floor, stretch) {
    const f = floor == null ? CORE_FLOOR : floor;
    const extra = done > f ? done - f : 0;
    if (extra > 0) return 'core ' + f + '/' + f + ' · +' + extra;
    return 'core ' + done + '/' + f;
  }

  function proposedBlockStart(today, nextName, forge2Start) {
    const earliest = forge2Start || FORGE2_START;
    if (nextName === 'FORGE 2' && today < earliest) return earliest;
    return today;
  }

  function prettyDate(ds) {
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function forge2OfferCopy(today, startOn) {
    if (startOn > today) {
      return {
        title: 'Start FORGE 2',
        button: 'Start FORGE 2 on ' + prettyDate(startOn),
        sub: 'Archives FORGE 1. ' + prettyDate(startOn) + ' opens week 1 with one session. Will not start early.',
      };
    }
    return {
      title: 'Start FORGE 2',
      button: 'Start FORGE 2 today',
      sub: 'Archives FORGE 1. Today is week 1 — one session ready.',
    };
  }

  const api = {
    FORGE2_START,
    CORE_FLOOR,
    CORE_STRETCH,
    dateStr,
    addDays,
    isMonday,
    isTrainableDay,
    weekNumber,
    weekBounds,
    remainingTrainableDays,
    slotsOnLog,
    slotKind,
    assignClassSlots,
    lastSlotDates,
    ouraWorkoutsForDay,
    minutesBetweenIso,
    ouraEntryKind,
    defaultClassCovers,
    inferClassCovers,
    ouraClassName,
    ouraPrefill,
    remainingSlots,
    sortSlotsByStaleness,
    pickNextSlot,
    countCoreDays,
    coreWeekLabel,
    proposedBlockStart,
    prettyDate,
    forge2OfferCopy,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ForgeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

  function lastSlotDates(logs, hasData) {
    const last = {};
    for (const ds of Object.keys(logs || {})) {
      const log = logs[ds];
      if (!log || !log.slot) continue;
      if (hasData && !hasData(log)) continue;
      if (!last[log.slot] || ds > last[log.slot]) last[log.slot] = ds;
    }
    return last;
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
    lastSlotDates,
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

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

  function mentionsYoga(item) {
    const activity = String((item && item.activity) || '').toLowerCase();
    const label = String((item && item.label) || '').toLowerCase();
    return activity.indexOf('yoga') !== -1 || label.indexOf('yoga') !== -1;
  }

  function ouraEntryKind(item) {
    const label = String((item && item.label) || '').toLowerCase();
    const activity = String((item && item.activity) || '').toLowerCase();
    const blob = label + ' ' + activity;
    // Yoga, including Yin, is an extra. It never fills a plan slot.
    if (mentionsYoga(item)) return 'extra';
    if (/\b(gtx|alpha)\b/.test(blob)) return 'class';
    if (/class|strength|weight|lift|hiit|pilates|crossfit|functional/.test(blob)) return 'class';
    if (/tread|run|jog|walk|elliptical/.test(blob)) return 'treadmill';
    return 'class';
  }

  function ouraOffersSlot(item) {
    return ouraEntryKind(item) !== 'extra';
  }

  function defaultClassCovers(name) {
    const n = String(name || '').trim().toLowerCase();
    if (n === 'gtx' || n === 'alpha') return 'strength';
    return '';
  }

  function inferClassCovers(item) {
    if (mentionsYoga(item)) return '';
    const named = defaultClassCovers(item && (item.label || item.className));
    if (named) return named;
    const blob = String((item && item.activity) || '').toLowerCase();
    if (/strength|weight|lift|hiit|functional|crossfit|pilates/.test(blob)) return 'strength';
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
    const n = Number(v);
    if (Number.isFinite(n)) return String(Math.round(n));
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
    if (kind === 'extra') {
      base.type = 'class';
      base.mode = 'class';
      base.className = ouraClassName(item || {}) || 'Yoga';
      base.covers = '';
      base.extra = true;
      base.intensity = blankNum(item && item.intensity);
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

  function entryUpdatedAt(entry) {
    if (!entry || entry.updatedAt == null || entry.updatedAt === '') return null;
    const n = Number(entry.updatedAt);
    return Number.isFinite(n) ? n : null;
  }

  function logRichness(log) {
    if (!log) return 0;
    let n = 0;
    if (log.type === 'strength') {
      const ex = log.exercises || {};
      for (const k of Object.keys(ex)) {
        const sets = (ex[k] && ex[k].sets) || {};
        for (const s of Object.keys(sets)) {
          const set = sets[s] || {};
          if (set.weight || set.reps || set.rpe) n += 1;
        }
      }
    } else {
      if (log.duration) n += 2;
      if (log.distance) n += 2;
      if (log.watts || log.weight) n += 1;
      if (log.hr) n += 1;
      if (log.rpe) n += 1;
      if (log.calories) n += 1;
      if (log.incline || log.speed || log.maxSpeed) n += 1;
      if (log.className) n += 2;
      if (log.covers) n += 1;
      if (log.intensity) n += 1;
    }
    if (log.notes) n += 1;
    return n;
  }

  function deepFill(primary, secondary) {
    const out = JSON.parse(JSON.stringify(primary));
    if (!secondary) return out;
    for (const k of Object.keys(secondary)) {
      if (out[k] == null || out[k] === '') out[k] = secondary[k];
      else if (k === 'exercises' && typeof secondary[k] === 'object') {
        out.exercises = out.exercises || {};
        for (const ek of Object.keys(secondary.exercises || {})) {
          if (!out.exercises[ek]) out.exercises[ek] = secondary.exercises[ek];
          else {
            out.exercises[ek].sets = out.exercises[ek].sets || {};
            const sSets = (secondary.exercises[ek] && secondary.exercises[ek].sets) || {};
            for (const sk of Object.keys(sSets)) {
              if (!out.exercises[ek].sets[sk]) out.exercises[ek].sets[sk] = sSets[sk];
              else {
                for (const f of ['weight', 'reps', 'rpe']) {
                  if (out.exercises[ek].sets[sk][f] == null || out.exercises[ek].sets[sk][f] === '') {
                    out.exercises[ek].sets[sk][f] = sSets[sk][f];
                  }
                }
              }
            }
            if (!out.exercises[ek].name && secondary.exercises[ek].name) out.exercises[ek].name = secondary.exercises[ek].name;
            if (!out.exercises[ek].id && secondary.exercises[ek].id) out.exercises[ek].id = secondary.exercises[ek].id;
          }
        }
      }
    }
    return out;
  }

  // Newer updatedAt wins the whole entry. A stamp on only one side wins.
  // Neither side stamped: richness, then ts, then deepFill — the old path.
  function mergeDayLogs(cloudLog, localLog) {
    if (!cloudLog) return localLog;
    if (!localLog) return cloudLog;
    const cU = entryUpdatedAt(cloudLog);
    const lU = entryUpdatedAt(localLog);
    if (cU != null && lU != null) return cU >= lU ? cloudLog : localLog;
    if (cU != null) return cloudLog;
    if (lU != null) return localLog;
    const cScore = logRichness(cloudLog);
    const lScore = logRichness(localLog);
    if (lScore > cScore) return deepFill(localLog, cloudLog);
    if (cScore > lScore) return deepFill(cloudLog, localLog);
    const cTs = cloudLog.ts || 0;
    const lTs = localLog.ts || 0;
    if (cTs > lTs) return deepFill(cloudLog, localLog);
    return deepFill(localLog, cloudLog);
  }

  function mergeLogMaps(cloudLogs, localLogs) {
    const keys = new Set([...Object.keys(cloudLogs || {}), ...Object.keys(localLogs || {})]);
    const out = {};
    keys.forEach((ds) => {
      out[ds] = mergeDayLogs((cloudLogs || {})[ds], (localLogs || {})[ds]);
    });
    return out;
  }

  function extraKey(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (entry.id) return String(entry.id);
    if (entry.ouraId) return String(entry.ouraId);
    return '';
  }

  function mergeExtraLists(cloudList, localList) {
    const order = [];
    const map = {};
    function take(entry) {
      if (!entry || typeof entry !== 'object') return;
      const id = extraKey(entry);
      if (!id) return;
      const withId = Object.assign({}, entry, { id: id, extra: true, covers: '' });
      delete withId.slot;
      delete withId.slots;
      if (!map[id]) order.push(id);
      map[id] = map[id] ? mergeDayLogs(map[id], withId) : withId;
      map[id].extra = true;
      map[id].covers = '';
      delete map[id].slot;
      delete map[id].slots;
    }
    (Array.isArray(cloudList) ? cloudList : []).forEach(take);
    (Array.isArray(localList) ? localList : []).forEach(take);
    return order.map((id) => map[id]);
  }

  function mergeExtrasMaps(cloudExtras, localExtras) {
    const keys = new Set([...Object.keys(cloudExtras || {}), ...Object.keys(localExtras || {})]);
    const out = {};
    keys.forEach((ds) => {
      const list = mergeExtraLists((cloudExtras || {})[ds], (localExtras || {})[ds]);
      if (list.length) out[ds] = list;
    });
    return out;
  }

  // Move logs[date] with extra:true into extras[date]. Safe to repeat.
  function migrateLegacyExtras(doc) {
    if (!doc || typeof doc !== 'object') return { changed: false };
    if (!doc.logs) doc.logs = {};
    if (!doc.extras) doc.extras = {};
    let changed = false;
    Object.keys(doc.logs).forEach((ds) => {
      const log = doc.logs[ds];
      if (!log || log.extra !== true) return;
      const id = extraKey(log) || ('legacy-' + ds);
      const entry = Object.assign({}, log, { id: id, extra: true, covers: '' });
      delete entry.slot;
      delete entry.slots;
      if (entry.updatedAt == null || entry.updatedAt === '') entry.updatedAt = entry.ts || 0;
      const list = Array.isArray(doc.extras[ds]) ? doc.extras[ds].slice() : [];
      const idx = list.findIndex((e) => extraKey(e) === id);
      if (idx === -1) list.push(entry);
      else list[idx] = mergeDayLogs(list[idx], entry);
      doc.extras[ds] = list;
      delete doc.logs[ds];
      changed = true;
    });
    return { changed: changed };
  }

  function mergeCoreMaps(cloudCore, localCore) {
    const out = {};
    const keys = new Set([...Object.keys(cloudCore || {}), ...Object.keys(localCore || {})]);
    keys.forEach((k) => {
      const c = (cloudCore || {})[k];
      const l = (localCore || {})[k];
      if (!c) out[k] = l;
      else if (!l) out[k] = c;
      else {
        const cU = entryUpdatedAt(c);
        const lU = entryUpdatedAt(l);
        if (cU != null || lU != null) {
          if (cU != null && lU != null) out[k] = cU >= lU ? c : l;
          else out[k] = cU != null ? c : l;
        } else {
          const cR = (c.rounds != null ? c.rounds : (c.done ? 3 : 0));
          const lR = (l.rounds != null ? l.rounds : (l.done ? 3 : 0));
          out[k] = (lR > cR || (l.ts || 0) >= (c.ts || 0)) ? Object.assign({}, c, l) : Object.assign({}, l, c);
          if (!out[k].note && (c.note || l.note)) out[k].note = l.note || c.note;
        }
      }
    });
    return out;
  }

  function mergeSyncState(cloud, local) {
    const c = JSON.parse(JSON.stringify(cloud || {}));
    const l = JSON.parse(JSON.stringify(local || {}));
    migrateLegacyExtras(c);
    migrateLegacyExtras(l);
    const merged = Object.assign({}, c);
    merged.logs = mergeLogMaps(c.logs || {}, l.logs || {});
    merged.extras = mergeExtrasMaps(c.extras || {}, l.extras || {});
    merged.core = mergeCoreMaps(c.core || {}, l.core || {});
    merged.swaps = Object.assign({}, c.swaps || {}, l.swaps || {});
    merged.benchmarks = Object.assign({}, c.benchmarks || {}, l.benchmarks || {});
    if (l.startDate && !merged.startDate) merged.startDate = l.startDate;
    const byId = {};
    (c.blocks || []).forEach((b) => { if (b && b.id) byId[b.id] = Object.assign({}, b); });
    (l.blocks || []).forEach((b) => {
      if (!b || !b.id) return;
      byId[b.id] = byId[b.id] ? Object.assign({}, byId[b.id], b) : Object.assign({}, b);
    });
    merged.blocks = Object.values(byId).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    merged.currentBlockId = l.currentBlockId || c.currentBlockId || (merged.blocks[0] && merged.blocks[0].id) || null;
    return merged;
  }

  // Next undone cardio slot for a date. Extras and that date's own log do not count.
  function cardioSlotDue(doc, day, weekOrder) {
    const order = weekOrder || ['strengthA', 'cardioA', 'strengthB', 'cardioB'];
    const block = (doc.blocks || []).find((b) => b && b.id === (doc.currentBlockId || 'forge-4-mwijdguv'))
      || (doc.blocks || []).find((b) => b && b.startDate);
    const start = (block && block.startDate) || doc.startDate;
    if (!start) return '';
    const week = weekNumber(start, day);
    if (week < 1) return '';
    const bounds = weekBounds(start, week);
    const done = new Set();
    const logs = doc.logs || {};
    Object.keys(logs).forEach((ds) => {
      if (ds === day || ds < bounds.start || ds > bounds.end) return;
      const log = logs[ds];
      if (!log || log.extra) return;
      slotsOnLog(log).forEach((slot) => done.add(slot));
    });
    const assigned = assignClassSlots({ weekOrder: order, doneSlots: done, covers: 'cardio' });
    return assigned[0] || '';
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
    ouraOffersSlot,
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
    entryUpdatedAt,
    logRichness,
    mergeDayLogs,
    mergeLogMaps,
    extraKey,
    mergeExtraLists,
    mergeExtrasMaps,
    migrateLegacyExtras,
    mergeSyncState,
    cardioSlotDue,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ForgeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

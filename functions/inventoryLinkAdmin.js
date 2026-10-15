// Inventory › Inventory app link (admin): what each button asks the server to do. index.js checks the
// admin's sign-in (requireAdmin) and passes `deps` (see inventoryLinkJobs.js) plus the store's
// checkConnection/readCatalog/serviceAccountEmail. Returns { status, body } for the HTTP answer.
const { validateLinks, paidDayOf, linkedEditions, openMatches } = require("./inventoryLink");
const { readState, runSweep, REHEARSAL_MS, STATE_DOC } = require("./inventoryLinkJobs");
const { shopDate } = require("./paymentGuards");

const ok = body => ({ status: 200, body });
const bad = (error, status = 400) => ({ status, body: { error } });
const PUBLIC_STATE_KEYS = ["links", "startDay", "autoSync", "rehearsalUntil", "firstApplyAt", "backfill", "connection",
  "lastSync", "lastStockAt", "lastRunAt", "lastPush", "pendingImport", "app", "lastError", "relinkPending", "shipmentError", "pendingError", "shipmentIssues", "newMatches", "ignoredMatches"];

async function counts(db) {
  const count = async query => { try { return (await query.count().get()).data().count; } catch { return null; } };
  const [undelivered, unlinked] = await Promise.all([
    count(db.collection("inventoryPushes").where("delivered", "==", false)),
    count(db.collection("inventoryPushes").where("unlinkedCount", ">", 0)),
  ]);
  return { undelivered, unlinkedOrders: unlinked };
}

/** The first day a real order was paid (the default start for "Send past orders"). */
async function earliestPaidDay(db) {
  const snap = await db.collection("orders").orderBy("paidAt").limit(25).get();
  const first = snap.docs.map(doc => doc.data()).find(order => order.isTest !== true && order.paymentStatus && order.paymentStatus !== "unpaid");
  return first ? paidDayOf(first) || null : null;
}

// newMatches with only the suggestions still worth offering under these links (none without links).
const trimmedMatches = (state, links, ignored = state.ignoredMatches || {}) => {
  if (!state.newMatches) return null;
  const before = Array.isArray(state.newMatches.items) ? state.newMatches.items : [];
  const items = openMatches(before, links, ignored);
  const count = Object.keys(links || {}).length ? Math.max(0, (state.newMatches.count || 0) - (before.length - items.length)) : 0;
  return { ...state.newMatches, items, count };
};

async function inventoryLinkAdmin(deps, body = {}, actor = "admin") {
  const { db, store } = deps;
  const ref = db.collection(STATE_DOC[0]).doc(STATE_DOC[1]);
  const now = deps.now();
  const op = String(body.op || "");

  if (op === "status") {
    const [state, extra, earliest, serviceAccount] = await Promise.all([
      readState(db), counts(db), earliestPaidDay(db).catch(() => null), store.serviceAccountEmail(),
    ]);
    const visible = Object.fromEntries(PUBLIC_STATE_KEYS.filter(key => state[key] !== undefined).map(key => [key, state[key]]));
    return ok({ state: visible, ...extra, earliestPaidDay: earliest, serviceAccount, busy: !!(state.lease?.until && Date.parse(state.lease.until) > now.getTime()), today: shopDate(now) });
  }

  if (op === "check") {
    const result = await store.checkConnection({ now });
    const connection = { ok: result.ok, serviceAccount: result.serviceAccount || "", problem: result.problem || null, error: result.error || null, checkedAt: now.toISOString() };
    await ref.set({ connection }, { merge: true });
    return ok({ connection });
  }

  if (op === "catalog") {
    try {
      return ok({ books: await store.readCatalog() });
    } catch (err) {
      return bad("The website can't read the inventory app yet. Finish the connection step first, then try again.", 409);
    }
  }

  if (op === "saveLinks") {
    if (!body.links || typeof body.links !== "object" || Array.isArray(body.links)) return bad("Send the links to save.");
    const state = await readState(db);
    // Only taking matches away needs no answer from the inventory app, so the owner can always undo the
    // link (for instance when the connection is broken) and edit those books' stock on the website again.
    const removalsOnly = linkedEditions(body.links).every(e => state.links?.[e.bookId]?.[e.variantId || "_"] === e.inventoryBookId);
    let inventoryIds = null;
    if (!removalsOnly) {
      try {
        inventoryIds = (await store.readCatalog()).map(book => book.id);
      } catch {
        return bad("The website can't read the inventory app yet. Finish the connection step first, then try again.", 409);
      }
    }
    const booksSnap = await db.collection("books").get();
    const books = booksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { links, errors } = validateLinks(books, body.links, inventoryIds);
    // New matches: orders with unmatched copies are sent again from the start (relinkBatch pages through all).
    const relink = !!state.startDay && !removalsOnly;
    // Suggestions for editions (or inventory app books) matched now are done with; unmatching all clears them.
    const newMatches = trimmedMatches(state, links);
    const patch = { links, linksSavedAt: now.toISOString(), linksSavedBy: actor, ...(relink ? { relinkPending: true, relinkCursor: null } : {}), ...(newMatches ? { newMatches } : {}) };
    // set() with merge replaces nested maps key by key; write `links` whole so a removed link is gone.
    await ref.update(patch).catch(async () => { await ref.set(patch, { merge: true }); });
    return ok({ links, errors });
  }

  // "Match these": adds the chosen stored suggestions to the links as they are now (read fresh), never
  // replacing a match: an edition already matched, or an inventory app book already in use, is skipped.
  if (op === "acceptMatches") {
    const keys = new Set((Array.isArray(body.keys) ? body.keys : []).filter(k => typeof k === "string" && k.length <= 300).slice(0, 50));
    if (!keys.size) return bad("Choose the matches to save.");
    const state = await readState(db);
    const current = state.links || {};
    const chosen = openMatches(state.newMatches?.items, current).filter(m => keys.has(m.key));
    if (!chosen.length) return bad("These suggestions are out of date. Reload the page to see the current ones.", 409);
    let inventoryIds;
    try {
      inventoryIds = (await store.readCatalog()).map(book => book.id);
    } catch {
      return bad("The website can't read the inventory app yet. Finish the connection step first, then try again.", 409);
    }
    const next = Object.fromEntries(Object.entries(current).map(([id, entry]) => [id, { ...entry }]));
    for (const m of chosen) next[m.bookId] = { ...(next[m.bookId] || {}), [m.variantId || "_"]: m.inventoryBookId };
    const booksSnap = await db.collection("books").get();
    const books = booksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { links, errors } = validateLinks(books, next, inventoryIds);
    // Never lose a match that was already there.
    const lost = linkedEditions(current).filter(e => links[e.bookId]?.[e.variantId || "_"] !== e.inventoryBookId);
    if (lost.length) return bad("These matches would change books already matched, so nothing was saved. Match them in the list below instead.", 409);
    const newMatches = trimmedMatches(state, links);
    const patch = { links, linksSavedAt: now.toISOString(), linksSavedBy: actor, ...(state.startDay ? { relinkPending: true, relinkCursor: null } : {}), ...(newMatches ? { newMatches } : {}) };
    await ref.update(patch).catch(async () => { await ref.set(patch, { merge: true }); });
    const added = chosen.filter(m => links[m.bookId]?.[m.variantId || "_"] === m.inventoryBookId).length;
    return ok({ links, errors, added });
  }

  // "Not these": the sweep stops suggesting these pairs (a different later suggestion still shows).
  if (op === "ignoreMatches") {
    const list = Array.isArray(body.matches) ? body.matches.slice(0, 50) : [];
    const pairs = list.filter(m => m && typeof m.key === "string" && m.key.length <= 300 && typeof m.inventoryBookId === "string" && m.inventoryBookId && m.inventoryBookId.length <= 200);
    if (!pairs.length) return bad("Choose the matches to leave out.");
    const state = await readState(db);
    const ignoredMatches = { ...(state.ignoredMatches || {}) };
    pairs.forEach(m => { ignoredMatches[m.key] = m.inventoryBookId; });
    const newMatches = trimmedMatches(state, state.links || {}, ignoredMatches);
    await ref.update({ ignoredMatches, ...(newMatches ? { newMatches } : {}) }).catch(async () => { await ref.set({ ignoredMatches, ...(newMatches ? { newMatches } : {}) }, { merge: true }); });
    return ok({ ignoredMatches, newMatches });
  }

  if (op === "setOptions") {
    const patch = {};
    if (typeof body.autoSync === "boolean") {
      const state = await readState(db);
      if (body.autoSync && !state.firstApplyAt) return bad("Preview and apply the stock numbers once before turning on automatic stock.", 409);
      patch.autoSync = body.autoSync;
    }
    if (typeof body.rehearsal === "boolean") patch.rehearsalUntil = body.rehearsal ? new Date(now.getTime() + REHEARSAL_MS).toISOString() : null;
    if (!Object.keys(patch).length) return bad("Nothing to change.");
    await ref.set(patch, { merge: true });
    return ok({ saved: patch });
  }

  if (op === "startSales") {
    const day = String(body.startDay || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) return bad("Choose the first day to send.");
    if (day > shopDate(now)) return bad("The first day can't be in the future.");
    const current = await readState(db);
    if (current.startDay) {
      // Moving the start day earlier sends the older orders too. A later day would mean taking back
      // orders the inventory app already has, so it is refused.
      if (day >= current.startDay) {
        return bad(`Website sales are already sent from ${current.startDay}. Choose an earlier day to send older orders too; a later day isn't possible because orders already sent can't be taken back.`, 409);
      }
      if (current.connection?.ok !== true) return bad("Check the connection to the inventory app first.", 409);
      // The inventory app hears first that older orders are on their way (informational).
      try {
        await store.markPastOrders({ from: day, at: now.toISOString() });
      } catch {
        return bad("The inventory app couldn't be told about the older orders, so nothing changed. Check the connection and try again.", 409);
      }
      const moved = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const state = snap.exists ? snap.data() : {};
        if (state.startDay !== current.startDay) return false;
        tx.set(ref, {
          startDay: day, backfill: { from: day, done: false, cursor: null, sent: 0 },
          startDayChangedAt: now.toISOString(), startDayChangedBy: actor, startDayChangedFrom: current.startDay,
        }, { merge: true });
        return true;
      });
      if (!moved) return bad("The start date was changed somewhere else a moment ago. Reload and try again.", 409);
      const run = await runSweep(deps, { stock: "none", budgetMs: 40 * 1000 });
      return ok({ startDay: day, changedFrom: current.startDay, run: summary(run) });
    }
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const state = snap.exists ? snap.data() : {};
      if (state.startDay) return state.startDay;
      if (state.connection?.ok !== true) return false;
      tx.set(ref, { startDay: day, backfill: { from: day, done: false, cursor: null, sent: 0 }, salesStartedAt: now.toISOString(), salesStartedBy: actor }, { merge: true });
      return true;
    });
    if (result === false) return bad("Check the connection to the inventory app first.", 409);
    if (result !== true) return bad(`Website sales are already being sent from ${result}. Reload the page to see it.`, 409);
    const run = await runSweep(deps, { stock: "none", budgetMs: 40 * 1000 });
    return ok({ startDay: day, run: summary(run) });
  }

  if (["preview", "apply", "syncNow"].includes(op)) {
    if (op === "apply" && typeof body.confirmHash !== "string") return bad("Preview the numbers first.");
    const run = await runSweep(deps, {
      stock: op === "preview" ? "preview" : op === "apply" ? "apply" : "force",
      confirmHash: body.confirmHash, by: actor, budgetMs: 40 * 1000,
    });
    if (run.busy) return bad("The link is busy with its regular check. Try again in a minute.", 409);
    return ok({ run: summary(run), stock: run.stock || null });
  }

  return bad("Unknown inventory link action.");
}

function summary(run) {
  if (!run) return null;
  const { stock, ...rest } = run;
  return rest;
}

module.exports = { inventoryLinkAdmin, earliestPaidDay };

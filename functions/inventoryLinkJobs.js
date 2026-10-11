// Website ↔ inventory app link: the jobs (docs/INVENTORY_LINK.md). Dependencies come in as `deps`
// so tests can run every step against in-memory fakes:
//   deps.db     — the website's Firestore (Admin SDK)
//   deps.store  — the inventory project's link documents (inventoryLinkStore.js)
//   deps.now()  — the clock
//   deps.sumNet(invId) — website copies counted for an inventory book (Firestore sum() by default)
//
// Order of trust: the website changes a linked book's stock only to the number the inventory app's
// own count gives (stockPlanFor). It never marks an order paid, refunds it, or touches a provider.
const crypto = require("crypto");
const { FieldPath, FieldValue, AggregateField } = require("firebase-admin/firestore");
const {
  pushKind, websiteOrder, linkedEditions, stockPlanFor, stockPatch, liveStock, stable,
} = require("./inventoryLink");
const { externalDispatchProblem } = require("./fulfillmentGuard");
const { catalogUnitPrice } = require("./catalogPrice");
const { runInBatches } = require("./sweepLimits");

const STATE_DOC = ["systemStatus", "inventoryLink"];
const LEASE_MS = 4 * 60 * 1000;
const STOCK_EVERY_MS = 15 * 60 * 1000;
const CATCH_UP_MARGIN_MS = 15 * 60 * 1000;
const FIRST_CATCH_UP_MS = 2 * 24 * 60 * 60 * 1000;
const BACKFILL_PAGE = 100;
const REHEARSAL_MS = 24 * 60 * 60 * 1000;
// An automatic run may apply these; the owner's confirmed preview also applies "untracked" and "big-change".
const CONFIRMED_HOLDS = new Set([null, "untracked", "big-change"]);

const iso = date => date.toISOString();
const errText = err => String((err && err.message) || err || "").slice(0, 300);
const stateRef = db => db.collection(STATE_DOC[0]).doc(STATE_DOC[1]);
const rehearsalOn = (state, now) => !!state.rehearsalUntil && Date.parse(state.rehearsalUntil) > now.getTime();
const salesOn = state => typeof state.startDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(state.startDay);
// Firestore Timestamps: is a later than b?
const later = (a, b) => !!a && !!b && (a.seconds - b.seconds || a.nanoseconds - b.nanoseconds) > 0;

async function readState(db) {
  const snap = await stateRef(db).get();
  return snap.exists ? snap.data() : {};
}

// A box set's price is shared by its parts in proportion to their catalog prices.
async function partPricer(db, order) {
  const ids = new Set();
  for (const item of order.items || []) for (const part of Array.isArray(item?.components) ? item.components : []) if (part?.id) ids.add(part.id);
  if (!ids.size) return () => 0;
  const snaps = await db.getAll(...[...ids].map(id => db.collection("books").doc(id)));
  const books = new Map(snaps.filter(s => s.exists).map(s => [s.id, s.data()]));
  return (bookId, variantId) => {
    const book = books.get(bookId);
    if (!book) return 0;
    const variant = variantId ? (book.variants || []).find(v => v && v.id === variantId) : null;
    const price = catalogUnitPrice(book, variant);
    return Number.isFinite(price) && price > 0 ? price : 0;
  };
}

/**
 * Send one order's current state to the inventory app. The website's own record (inventoryPushes) is
 * written first, so its copy count is right even while the inventory project can't be reached; the
 * sweep retries undelivered records. Returns { status, net?, error? }.
 */
async function pushOrder(deps, orderId, state) {
  const { db, store } = deps;
  const now = deps.now();
  const orderRef = db.collection("orders").doc(orderId);
  const recordRef = db.collection("inventoryPushes").doc(orderId);
  const [orderSnap, recordSnap] = await Promise.all([orderRef.get(), recordRef.get()]);
  if (!orderSnap.exists) return { status: "missing" };
  const order = orderSnap.data();
  const record = recordSnap.exists ? recordSnap.data() : null;
  const kind = pushKind(order, { startDay: state.startDay, rehearsal: rehearsalOn(state, now), record });
  if (!kind) return { status: "skipped" };
  const built = websiteOrder(order, {
    orderId, links: state.links || {}, frozen: record?.lineLinks, partPrice: await partPricer(db, order), test: kind === "test",
    sourceUpdatedAt: orderSnap.updateTime ? orderSnap.updateTime.toDate().toISOString() : null,
  });
  const local = await db.runTransaction(async tx => {
    const snap = await tx.get(recordRef);
    const cur = snap.exists ? snap.data() : null;
    if (cur?.sourceUpdatedAt && built.web.sourceUpdatedAt && cur.sourceUpdatedAt > built.web.sourceUpdatedAt) return "older";
    if (cur && cur.hash === built.hash && cur.delivered === true) return "same";
    tx.set(recordRef, {
      orderId, test: kind === "test", net: built.net, lineLinks: built.lineLinks, hash: built.hash,
      sourceUpdatedAt: built.web.sourceUpdatedAt, paidAt: order.paidAt || null, unlinkedCount: built.unlinkedCount,
      delivered: false, error: null, createdAt: cur?.createdAt || iso(now), updatedAt: iso(now),
    });
    return "recorded";
  });
  if (local !== "recorded") return { status: local, net: built.net };
  try {
    const remote = await store.writeWebsiteOrder(orderId, built.web);
    await db.runTransaction(async tx => {
      const snap = await tx.get(recordRef);
      if (snap.exists && snap.data().hash === built.hash) tx.update(recordRef, { delivered: true, deliveredAt: iso(now), remote });
    });
    return { status: "delivered", remote, net: built.net };
  } catch (err) {
    await recordRef.update({ error: errText(err), errorAt: iso(now) }).catch(() => {});
    return { status: "failed", error: errText(err), net: built.net };
  }
}

/**
 * Push every order that may have changed since `sinceIso`, plus undelivered records (and, after the
 * owner linked more books, orders with unlinked copies). Returns the inventory books whose push failed:
 * their stock is left alone this run.
 */
async function catchUp(deps, state, sinceIso, { deadline = Infinity } = {}) {
  const { db } = deps;
  const queries = [
    db.collection("orders").where("updatedAt", ">=", sinceIso).limit(300).get(),
    db.collection("orders").where("paidAt", ">=", sinceIso).limit(300).get(),
    db.collection("inventoryPushes").where("delivered", "==", false).limit(100).get(),
  ];
  if (state.relinkPending) queries.push(db.collection("inventoryPushes").where("unlinkedCount", ">", 0).limit(300).get());
  const snaps = await Promise.all(queries);
  const ids = [...new Set(snaps.flatMap(snap => snap.docs.map(doc => doc.id)))];
  const failedBooks = new Set();
  let failed = 0;
  const run = await runInBatches(ids, 5, async id => {
    const result = await pushOrder(deps, id, state);
    if (result.status === "failed") {
      failed += 1;
      Object.keys(result.net || {}).forEach(inv => failedBooks.add(inv));
    }
  }, { deadline, now: () => deps.now().getTime() });
  return { pushed: run.processed, failed: failed + run.failed, skipped: run.skipped.length, failedBooks };
}

/** One page of past orders (oldest first) since the start day. */
async function backfillBatch(deps, state, { deadline = Infinity } = {}) {
  const { db } = deps;
  const backfill = state.backfill || {};
  // A day early in UTC: pushKind decides on the Toronto day.
  const from = new Date(Date.parse(`${state.startDay}T00:00:00.000Z`) - 24 * 60 * 60 * 1000).toISOString();
  let query = db.collection("orders").where("paidAt", ">=", from).orderBy("paidAt").orderBy(FieldPath.documentId()).limit(BACKFILL_PAGE);
  if (backfill.cursor?.paidAt && backfill.cursor?.id) query = query.startAfter(backfill.cursor.paidAt, backfill.cursor.id);
  const snap = await query.get();
  let failed = 0;
  const failedBooks = new Set();
  const docs = [];
  for (const doc of snap.docs) {
    if (deps.now().getTime() >= deadline) break;
    const result = await pushOrder(deps, doc.id, state);
    if (result.status === "failed") { failed += 1; Object.keys(result.net || {}).forEach(inv => failedBooks.add(inv)); }
    docs.push(doc);
  }
  const last = docs[docs.length - 1];
  const done = docs.length === snap.size && snap.size < BACKFILL_PAGE;
  return {
    backfill: {
      ...backfill, from: state.startDay, done,
      cursor: last ? { paidAt: last.get("paidAt"), id: last.id } : backfill.cursor || null,
      sent: (Number(backfill.sent) || 0) + docs.length,
    },
    failed, failedBooks,
  };
}

async function defaultSumNet(db, inv) {
  const snap = await db.collection("inventoryPushes").aggregate({ n: AggregateField.sum(new FieldPath("net", inv)) }).get();
  return Number(snap.data().n) || 0;
}

/** Old → new stock for every linked edition (nothing written). */
async function planStock(deps, state, { skipBooks = new Set() } = {}) {
  const { db, store } = deps;
  const editions = linkedEditions(state.links);
  const invIds = [...new Set(editions.map(e => e.inventoryBookId))];
  const bookIds = [...new Set(editions.map(e => e.bookId))];
  const sumNet = deps.sumNet || (inv => defaultSumNet(db, inv));
  const [feeds, totals, bookSnaps] = await Promise.all([
    store.readFeeds(invIds),
    Promise.all(invIds.map(async inv => [inv, await sumNet(inv)])).then(Object.fromEntries),
    bookIds.length ? db.getAll(...bookIds.map(id => db.collection("books").doc(id))) : [],
  ]);
  const books = new Map(bookSnaps.filter(s => s.exists).map(s => [s.id, s.data()]));
  const rows = editions.map(edition => {
    const inv = edition.inventoryBookId;
    const book = books.get(edition.bookId);
    const feed = feeds[inv] || null;
    const variant = edition.variantId ? (book?.variants || []).find(v => v && v.id === edition.variantId) : null;
    const plan = book ? stockPlanFor({ book, variantId: edition.variantId, feed, webTotal: totals[inv] || 0 }) : { from: null, to: null, hold: "missing" };
    if (skipBooks.has(inv) && plan.to != null) plan.hold = "push-failed";
    return {
      ...edition, title: String(book?.title || "").slice(0, 200), edition: String(variant?.name || "").slice(0, 120),
      ...plan, appOnHand: feed ? Number(feed.onHand) : null, feedAt: feed?.at || null,
      webCopies: feed ? Number(feed.webCopies) || 0 : null, webTotal: totals[inv] || 0,
    };
  });
  const hash = crypto.createHash("sha256").update(stable(rows.map(r => [r.bookId, r.variantId, r.inventoryBookId, r.from, r.to, r.hold]))).digest("hex");
  return { rows, hash };
}

/**
 * Write the planned numbers. Each book is one transaction that re-reads it and skips it when anything
 * changed it after the run started (t0) — a sale paid a moment ago is never undone — or its count no
 * longer matches the plan. mode "auto" applies only rows without a hold; "confirmed" (the owner pressed
 * Apply on this preview) also turns stock counting on and applies big changes.
 */
async function applyStock(deps, rows, { t0 = null, mode = "auto", by = "Inventory app link" } = {}) {
  const { db } = deps;
  const allowed = mode === "confirmed" ? row => CONFIRMED_HOLDS.has(row.hold) : row => row.hold == null;
  const byBook = new Map();
  for (const row of rows) {
    if (row.to == null || row.from == null || row.to === row.from || !allowed(row)) continue;
    byBook.set(row.bookId, [...(byBook.get(row.bookId) || []), row]);
  }
  const results = [];
  for (const [bookId, bookRows] of byBook) {
    const ref = db.collection("books").doc(bookId);
    const now = iso(deps.now());
    try {
      const outcome = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return bookRows.map(row => ({ row, result: "missing" }));
        if (t0 && later(snap.updateTime, t0)) return bookRows.map(row => ({ row, result: "changed" }));
        let book = snap.data();
        const done = [];
        const logs = [];
        let patch = {};
        for (const row of bookRows) {
          const from = liveStock(book, row.variantId);
          if (from !== row.from) { done.push({ row, result: "changed" }); continue; }
          const change = stockPatch(book, row.variantId, row.to, { track: mode === "confirmed" });
          patch = { ...patch, ...change };
          book = { ...book, ...change };
          logs.push({
            bookId, variantId: row.variantId || null, title: row.title, edition: row.edition, from, to: row.to, delta: row.to - from,
            reason: "Inventory app", note: `The inventory app counts ${row.appOnHand ?? "?"} on hand${row.webTotal - (row.webCopies || 0) > 0 ? `; ${row.webTotal - (row.webCopies || 0)} website cop${row.webTotal - (row.webCopies || 0) === 1 ? "y" : "ies"} not imported there yet` : ""}.`,
            at: now, by,
          });
          done.push({ row, result: "applied" });
        }
        if (logs.length) {
          tx.update(ref, { ...patch, updatedAt: now });
          logs.forEach(log => tx.set(db.collection("inventoryLog").doc(), log));
        }
        return done;
      });
      results.push(...outcome);
    } catch (err) {
      results.push(...bookRows.map(row => ({ row, result: "failed", error: errText(err) })));
    }
  }
  return results.map(({ row, result, error }) => ({
    bookId: row.bookId, variantId: row.variantId, inventoryBookId: row.inventoryBookId, title: row.title, edition: row.edition,
    from: row.from, to: row.to, result, ...(error ? { error } : {}),
  }));
}

const cleanUrl = value => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { const url = new URL(raw); return ["https:", "http:"].includes(url.protocol) ? url.toString().slice(0, 500) : ""; } catch { return ""; }
};

/**
 * A label the inventory app bought for a website order: attach its tracking (label only) or dispatch
 * the order (marked shipped there), with Orders › Dispatch's safety checks. Test orders are only
 * checked. Every outcome is answered in the inventory app (shipmentReply). Returns { result, reason }.
 */
async function applyAppShipment(deps, { id: orderId, shipment }) {
  const { db, store } = deps;
  const now = deps.now();
  const answer = async (result, reason) => {
    await store.replyShipment(orderId, shipment?.hash, { result, reason, now });
    return { orderId, result, reason };
  };
  if (!shipment || typeof shipment.hash !== "string" || !shipment.hash) return { orderId, result: "ignored", reason: "no shipment" };
  const trackingNumber = String(shipment.trackingNumber || "").trim().slice(0, 100);
  const trackingCarrier = String(shipment.carrier || "").trim().slice(0, 80) || "Carrier";
  const trackingUrl = cleanUrl(shipment.trackingUrl);
  if (!trackingNumber) return answer("refused", "The label has no tracking number, so the website can't share it with the customer.");
  const shipped = !!shipment.shippedAt;
  const orderRef = db.collection("orders").doc(orderId);
  const opsRef = db.collection("order-operations").doc(orderId);
  let outcome;
  try {
    outcome = await db.runTransaction(async tx => {
      const [snap, opsSnap] = await Promise.all([tx.get(orderRef), tx.get(opsRef)]);
      if (!snap.exists) return { result: "refused", reason: "This order no longer exists on the website." };
      const order = snap.data();
      const operations = opsSnap.exists ? opsSnap.data() : {};
      const sameTracking = String(order.trackingNumber || "").trim() === trackingNumber;
      const dispatched = ["shipped", "out_for_delivery", "delivered", "collected"].includes(order.fulfillmentStatus) || order.status === "completed";
      if (order.isTest === true) {
        const problem = externalDispatchProblem({ ...order, isTest: false }, operations);
        return { result: "checked", reason: problem
          ? `Test order — the website would refuse: ${problem}`
          : `Test order — the website would ${shipped ? "dispatch it and email the customer" : "attach this tracking"}. Nothing was changed.` };
      }
      if (dispatched && sameTracking) return { result: "dispatched", reason: "Already dispatched with this tracking." };
      // A label the website bought (or one already sent) can't be silently replaced by another parcel.
      if (order.trackingNumber && !sameTracking && (order.labelUrl || order.trackingSource !== "inventory-app" || dispatched)) {
        return { result: "refused", reason: `The website already has tracking ${order.trackingNumber} for this order. Void one of the two labels, then send the one you're using.` };
      }
      const problem = externalDispatchProblem(order, operations);
      if (problem) return { result: "refused", reason: problem };
      if (!shipped && sameTracking) return { result: "attached", reason: "Tracking is on the order. Mark the parcel shipped when it leaves." };
      const at = iso(now);
      const label = {
        source: String(shipment.labelSource || "inventory-app").slice(0, 30), carrier: trackingCarrier, service: String(shipment.service || "").slice(0, 120),
        trackingNumber, cost: Number.isFinite(Number(shipment.labelCostCAD)) ? Math.round(Number(shipment.labelCostCAD) * 100) / 100 : null,
        boughtAt: typeof shipment.boughtAt === "string" ? shipment.boughtAt.slice(0, 40) : null, receivedAt: at,
      };
      const history = order.trackingNumber && !sameTracking
        ? [...(operations.labelHistory || []), { trackingNumber: order.trackingNumber, trackingCarrier: order.trackingCarrier || null, replacedAt: at, replacedBy: "inventory-app" }]
        : operations.labelHistory || [];
      const message = shipped
        ? `Dispatched from the inventory app via ${trackingCarrier}. Tracking: ${trackingNumber}`
        : `Label bought in the inventory app: ${trackingCarrier} ${trackingNumber}.`;
      tx.update(orderRef, {
        trackingNumber, trackingCarrier, trackingUrl, trackingSource: "inventory-app",
        ...(shipped ? { status: "completed", fulfillmentStatus: "shipped", shippedAt: at } : {}),
        updatedAt: at,
      });
      tx.set(opsRef, {
        ...operations, externalLabel: label, labelHistory: history,
        ...(shipped ? { dispatchedFrom: "inventory-app", dispatchedAt: at } : {}),
        updatedAt: at, activity: [...(operations.activity || []), { type: "event", message, createdAt: at }],
      });
      return shipped
        ? { result: "dispatched", reason: "Marked shipped on the website; the customer gets the shipped email." }
        : { result: "attached", reason: "Tracking is on the order. Mark the parcel shipped when it leaves." };
    });
  } catch (err) {
    // Not answered: the app keeps waiting and the next sweep tries again.
    return { orderId, result: "error", reason: errText(err) };
  }
  return answer(outcome.result, outcome.reason);
}

/**
 * One run: lease → heartbeat → labels from the app → catch-up pushes → past orders → stock.
 * opts.stock: "auto" (scheduled; applies when automatic stock is on and 15 min have passed),
 * "force" (Sync now), "preview" (plan only) or "apply" (owner confirmed preview `confirmHash`).
 */
async function runSweep(deps, opts = {}) {
  const { db, store } = deps;
  const ref = stateRef(db);
  const start = deps.now();
  const runId = crypto.randomUUID();
  const state = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    if (data.lease?.until && Date.parse(data.lease.until) > start.getTime()) return null;
    tx.set(ref, { lease: { until: iso(new Date(start.getTime() + LEASE_MS)), runId } }, { merge: true });
    return data;
  });
  if (!state) return { busy: true };
  const deadline = start.getTime() + (opts.budgetMs || 200 * 1000);
  const status = {};
  const out = { ran: true };
  try {
    const t0 = (await ref.update({ "lease.startedAt": iso(start) })).writeTime;
    const active = salesOn(state) || Object.keys(state.links || {}).length > 0 || state.connection?.ok === true;
    if (!active) return { ...out, inactive: true };

    try {
      await store.heartbeat({ now: start });
      status.connection = { ...(state.connection || {}), ok: true, checkedAt: iso(start), problem: null, error: null };
    } catch (err) {
      status.connection = { ...(state.connection || {}), ok: false, checkedAt: iso(start), error: errText(err) };
      return { ...out, connection: status.connection };
    }

    let failedBooks = new Set();
    if (salesOn(state)) {
      try {
        const waiting = await store.waitingShipments();
        out.shipments = [];
        for (const item of waiting) {
          if (deps.now().getTime() >= deadline) break;
          out.shipments.push(await applyAppShipment(deps, item));
        }
        // Labels the website refused stay listed (admin alert) until that order's label is sent again, for a week.
        if (out.shipments.length) {
          const handled = new Set(out.shipments.map(s => s.orderId));
          const weekAgo = start.getTime() - 7 * 24 * 60 * 60 * 1000;
          status.shipmentIssues = [
            ...(state.shipmentIssues || []).filter(i => i && !handled.has(i.orderId) && Date.parse(i.at) > weekAgo),
            ...out.shipments.filter(s => s.result === "refused").map(s => ({ orderId: s.orderId, reason: s.reason, at: iso(start) })),
          ].slice(-20);
        }
      } catch (err) { status.shipmentError = errText(err); }

      const since = state.lastCatchUpAt ? new Date(Date.parse(state.lastCatchUpAt) - CATCH_UP_MARGIN_MS) : new Date(start.getTime() - FIRST_CATCH_UP_MS);
      const caught = await catchUp(deps, state, iso(since), { deadline });
      out.catchUp = { pushed: caught.pushed, failed: caught.failed };
      failedBooks = caught.failedBooks;
      status.lastPush = { at: iso(start), failed: caught.failed };
      // Only move the window forward when nothing was left for later.
      if (!caught.skipped) status.lastCatchUpAt = iso(start);
      if (state.relinkPending && !caught.skipped) status.relinkPending = false;

      if (state.backfill && state.backfill.done !== true) {
        const page = await backfillBatch(deps, state, { deadline });
        status.backfill = page.backfill;
        page.failedBooks.forEach(inv => failedBooks.add(inv));
        out.backfill = page.backfill;
      }
      try {
        const [pending, app] = await Promise.all([store.pendingSummary(), store.readAppHeartbeat()]);
        status.pendingImport = pending;
        status.app = app ? { lastImportAt: app.lastImportAt || null, lastFeedAt: app.lastFeedAt || null, importConsentAt: app.importConsentAt || null } : null;
      } catch (err) { status.pendingError = errText(err); }
    }

    const backfillDone = (status.backfill || state.backfill)?.done === true;
    const stockReady = salesOn(state) && backfillDone;
    const mode = opts.stock || "auto";
    const due = mode === "force" || (mode === "auto" && state.autoSync === true && (!state.lastStockAt || start.getTime() - Date.parse(state.lastStockAt) >= STOCK_EVERY_MS - 60 * 1000));
    if (["preview", "apply"].includes(mode) || (due && stockReady)) {
      if (!stockReady) {
        out.stock = { notReady: true };
      } else {
        const plan = await planStock(deps, state, { skipBooks: failedBooks });
        out.stock = { hash: plan.hash, rows: plan.rows };
        if (mode === "apply" && plan.hash !== opts.confirmHash) {
          out.stock.changed = true; // numbers moved since the preview: show the new preview, write nothing
        } else if (mode !== "preview") {
          const applied = await applyStock(deps, plan.rows, { t0, mode: mode === "apply" ? "confirmed" : "auto", by: opts.by || "Inventory app link" });
          out.stock.applied = applied;
          status.lastStockAt = iso(start);
          status.lastSync = {
            at: iso(start), mode: mode === "apply" ? "confirmed" : mode,
            changes: applied.filter(r => r.result === "applied").slice(0, 100),
            skipped: applied.filter(r => r.result !== "applied").slice(0, 100),
            holds: plan.rows.filter(r => r.hold && !(mode === "apply" && CONFIRMED_HOLDS.has(r.hold))).map(r => ({
              bookId: r.bookId, variantId: r.variantId, title: r.title, edition: r.edition, from: r.from, to: r.to, hold: r.hold,
            })).slice(0, 100),
            appAhead: plan.rows.filter(r => r.appAhead).map(r => ({ bookId: r.bookId, variantId: r.variantId, title: r.title })).slice(0, 50),
          };
          if (mode === "apply" && !state.firstApplyAt) status.firstApplyAt = iso(start);
        }
      }
    }
    return out;
  } catch (err) {
    status.lastError = { at: iso(deps.now()), message: errText(err) };
    out.error = errText(err);
    return out;
  } finally {
    status.lastRunAt = iso(start);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const lease = snap.exists ? snap.data().lease : null;
      tx.set(ref, { ...status, ...(lease?.runId === runId ? { lease: FieldValue.delete() } : {}) }, { merge: true });
    }).catch(err => console.error("inventory link: could not save the run's status", err));
  }
}

module.exports = {
  LEASE_MS, REHEARSAL_MS, STATE_DOC, readState, pushOrder, catchUp, backfillBatch, planStock, applyStock,
  applyAppShipment, runSweep, rehearsalOn, salesOn,
};

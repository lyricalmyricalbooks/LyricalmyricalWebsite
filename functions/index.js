/**
 * Firebase Cloud Functions for Lyricalmyrical Books
 *
 *   1. createStripeCheckoutSession (HTTP) -> Secure session creation
 *   2. stripeWebhook (HTTP)               -> Secure payment webhook
 *   3. downloadDigitalAsset (HTTP)        -> Secure digital ebook downloads
 *   4. onOrderPaid (Firestore update)     -> Email customer + admin on payment success
 *   5. onOrderShipped (Firestore update)  -> Email customer with tracking
 *   6. abandonedCartSweep (scheduled)     -> Send recovery email after 1h
 */

const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { browserRequestHandler } = require("./appCheck");
const { Resend } = require("resend");
const { explainEmailError } = require("./emailErrors");
const { risoButton, risoLayout, placeItemsTable } = require("./emailTheme");
const Stripe = require("stripe");
const { calculateShipping, applyStockDelta } = require("./orderMath");
const { quoteShipping, pickQuote, parseWeightGrams } = require("./shippingEngine");
const { labelProblem, addressKey: guardAddressKey, shippoTransactionOutcome, advancesTracking, shippoDefiniteRefusal, terminal: terminalOrder } = require("./fulfillmentGuard");
const { labelHandedOver, transactionRefundState, findLabelTransaction, refundEntry, openRefunds, applyRefundChecks, REFUND_WINDOW_DAYS: LABEL_REFUND_WINDOW_DAYS } = require("./labelVoid");
const { buildOrderDigest, TRANSIT_DAYS } = require("./orderDigest");
const { checkoutRate } = require("./checkoutRate");
const { labelRatesFor, isPurchasableRate, isSoldRate: isSoldRateName, isCanadaPostRate: isCanadaPostRateName, soldName } = require("./labelRates");
const { needsCustoms, customsItems, customsDeclaration } = require("./customs");
const { addressMissing } = require("./addressRules");
const { discountedPhysicalSubtotal, resolveLocalSelection, isPhysicalItem, bogoPercent } = require("./localFulfillment");
const { catalogUnitPrice } = require("./catalogPrice");
const { expandDiscountCategories } = require("./discountCategories");
const { discountableItems, discountAmountFor, pickAutomaticDiscount } = require("./discountMath");
const { addOnSelection, bundleComponents, bundleAvailable, isGiftCardProduct, giftCardDetails } = require("./promotions");
const { expiryChange } = require("./giftCards");
const { MAX_CARDS_PER_ORDER, GIFT_CARD_MESSAGES, GiftCardError, newGiftCardCode, normalizeGiftCardCode, giftCardId, last4, giftCardProblem, availableMinor, allocateGiftCards, chargedRedemptions, reserveGiftCards, releaseGiftCards, readGiftCards, debitShortfall, writeGiftCardChange, cardsForOrder, withHistory } = require("./giftCards");
const { readBooks, writeStock } = require("./inventory");
const { resolveCountry } = require("./shippingGeo");
const { emailIdentity, openClaims, limitReached } = require("./discountClaims");
const { REQUIRED_WEBHOOK_EVENTS, modesToTry, intentAsSession, paidIntentOrderId, webhookEndpointReport, signingSecrets, reversalState, ordersDueReversalCheck, failedRefundId } = require("./stripeRecovery");
const { orderMoneyFmt, chargedTotalFmt, refundAmountText, withoutTrackingLines, withoutCarrierLines, refundEmailFacts, withoutBankRefundSentences, forDigitalOnlyOrder } = require("./emailMoney");
const { pendingRecord, confirmedRecord, confirmationEmail } = require("./newsletter");
const { findByEmail: findByEmailData, neverPaid, redactedOrderFields, redactedOperationsFields, giftCardsFor, reviewErasure, GIFT_CARD_PERSONAL } = require("./privacyData");
const { optOutId, unsubscribeToken, tokenMatches, purposeToken, purposeTokenMatches, footerAddress, normEmail: normMarketingEmail } = require("./marketingOptOut");
const { runReviewRequests, REVIEW_REQUEST_TEMPLATE } = require("./reviewRequests");
const { checkoutCurrencyOf, paidAmountCheck, toMinor, discountDateState, purchaseProblem, paypalCreateRequestId, lateFailureMayMarkFailed, refundProviderOf, paypalReversalCaptureId, discountUsedUp, checkoutRefusal, manualPaidRefusal, stripeIntentKey, cancelRefusal, mismatchResolved, stripePaymentTaken, previousAttemptPaid, paypalRefundedTotalMinor, sameOrderLines, shopDate } = require("./paymentGuards");
const { canViewOrder, publicOrderView } = require("./orderAccess");
const { returnTransition, publicReturn, returnRestockItems } = require("./returns");
const { refundRetrySuffix, refundPlan, refundedSoFar, restockLinesFor, withoutRestocked, partialRefundKey } = require("./partialRefund");
const { leftTheShop, restockRefundedOrder } = require("./refundRestock");
const { orderRequestProblem, orderRequestRecord, privacyRequestRecord } = require("./customerRequests");
const { hitLimit, LIMITS, clientIpOf, serverGeoCountry } = require("./rateLimit");
const { ADDRESS_ACTIONS, addressKeyProblem, handleAddressLookup } = require("./addressLookup");
const { handleAiWrite } = require("./aiWriter");
const { publicErrorMessage } = require("./publicErrors");
const { reserveStock, releaseStock, releaseStockForOrder, StockHoldError, holdOwner, holdLimitsFrom } = require("./stockHolds");
const { preorderActive, preorderLine, preorderEmailLines, releaseDateOf } = require("./preorder");
const digitalDelivery = require("./digitalDelivery");
const { claimEmailSend, claimEmailSendDetailed, reminderFirstName, nextDailyCount } = require("./emailThrottle");
const { hasOwnershipProof } = require("./emailProof");
const { paypalCredentials } = require("./paypalCredentials");
const { shopOrigin, checkoutClosed, dailyDigestEnabled, backupStatusRecord } = require("./shopSettings");
const { runInBatches, backupFoldersToPrune } = require("./sweepLimits");
const { MAX_ATTEMPTS, LEASE_MS, LOG_RETENTION_DAYS, GAVE_UP_RETENTION_DAYS, cleanRecipients, cleanSubject, cleanFromName, nextRetryAt, isPermanentEmailError, canSendNow, publicOutboxEntry, staleOrderEmailReason, daysAgoIso, withRequiredPlaceholders, blankUnknownPlaceholders } = require("./emailOutbox");

// Cost ceiling for every function (#147): an anonymous flood can scale a public endpoint or a
// Firestore trigger only this far. A function that sets its own maxInstances overrides it.
setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

// Server-only bookkeeping documents (webhook events, email claims, send throttles) carry an `expiresAt` that
// Firestore's TTL policy (firestore.indexes.json fieldOverrides) uses to delete them, so they cannot grow forever.
const retainFor = days => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const ADMIN_EMAILS = ["lyricalmyricalbooks@gmail.com"];

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4000",
  // The old GitHub Pages address now only forwards visitors; it stays allowed for tabs opened before the move
  // (remove it in the cleanup step, 30–60 days after the cutover).
  "https://lyricalmyricalbooks.github.io",
  // The shop (Firebase Hosting). firebaseapp.com is deliberately absent: the site sends visitors there to web.app
  // (scripts/canonicalHost.mjs) instead of serving checkout twice.
  "https://lyricalmyrical-web-v2.web.app",
  "https://lyricalmyricalbooks.com",
  "https://www.lyricalmyricalbooks.com",
];

// Returns true when the request was an OPTIONS preflight (already answered).
function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck, X-Order-Key");
    res.set("Access-Control-Max-Age", "3600");
    res.status(204).send("");
    return true;
  }
  return false;
}

// All browser endpoints share attestation; their existing authorization still runs afterwards.
function onBrowserRequest(...args) {
  const handler = args.pop();
  const protectedHandler = browserRequestHandler(handler, {
    mode: () => process.env.APP_CHECK_MODE || "monitor",
    appId: () => "1:248894589273:web:8bf4b06399c0931f1b6448",
    emulator: IS_EMULATOR,
    verifyToken: token => admin.appCheck().verifyToken(token),
    applyCors,
    log: fields => console.info(fields),
  });
  return onRequest(...args, protectedHandler);
}

// Verifies the Firebase ID token in the Authorization header and that it
// belongs to an admin. Sends the error response itself; returns null on failure.
async function requireAdmin(req, res) {
  const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: "Missing Authorization token" });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (!ADMIN_EMAILS.includes(decoded.email) || decoded.email_verified !== true) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return decoded;
  } catch (err) {
    res.status(401).json({ error: "Invalid Authorization token" });
    return null;
  }
}

exports.deleteTestOrders = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  if (!await requireAdmin(req, res)) return;

  const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
  if (!orderIds.length || orderIds.length > 100 || orderIds.some(id => typeof id !== "string" || !id)) {
    res.status(400).json({ error: "Provide between 1 and 100 valid order IDs." });
    return;
  }

  const refs = orderIds.map(id => db.collection("orders").doc(id));
  const snapshots = await db.getAll(...refs);
  if (snapshots.some(snapshot => snapshot.exists && snapshot.data()?.isTest !== true)) {
    res.status(400).json({ error: "Only records carrying isTest: true may be bulk deleted." });
    return;
  }

  const existing = snapshots.filter(snapshot => snapshot.exists);
  const batch = db.batch();
  existing.forEach(snapshot => batch.delete(snapshot.ref));
  await batch.commit();
  res.json({ deleted: existing.length });
});

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");
const PAYPAL_WEBHOOK_ID = defineSecret("PAYPAL_WEBHOOK_ID");
const SHIPPO_API_TOKEN = defineSecret("SHIPPO_API_TOKEN");
const SHIPPO_CONFIG_DOC = db.collection("private-integrations").doc("shippo");

async function getShippoToken() {
  const configDoc = await SHIPPO_CONFIG_DOC.get();
  const savedToken = configDoc.exists ? configDoc.data()?.apiToken : null;
  if (typeof savedToken === "string" && savedToken.trim()) {
    const trimmed = savedToken.trim();
    return trimmed !== "dummy_value" && trimmed !== "your_shippo_api_token" ? trimmed : null;
  }

  try {
    const secretToken = SHIPPO_API_TOKEN.value();
    return secretToken && secretToken !== "your_shippo_api_token" && secretToken !== "dummy_value" ? secretToken : null;
  } catch (err) {
    console.warn("SHIPPO_API_TOKEN secret not configured.");
    return null;
  }
}

// Secret keys entered in the admin live in the admin-only adminSecrets/* docs.
// Older saves put them in public settings/*; those are still honoured until the
// admin next opens Settings (which moves them), but adminSecrets wins.
async function readAdminSecret(id) {
  try {
    const snap = await db.collection("adminSecrets").doc(id).get();
    return snap.exists ? snap.data() || {} : {};
  } catch (err) {
    console.warn(`Could not read adminSecrets/${id}:`, err);
    return {};
  }
}

async function withPrivateStripeKeys(stripeSettings) {
  const merged = { ...(stripeSettings || {}) };
  const priv = await readAdminSecret("stripe");
  if (priv.secretKey) merged.secretKey = priv.secretKey;
  if (priv.testSecretKey) merged.testSecretKey = priv.testSecretKey;
  return merged;
}

async function getStripeClientForMode(mode, stripeAccountId = null) {
  const settingsDoc = await db.collection("settings").doc("website").get();
  const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
  const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
  const stripeSecret = mode === "test"
    ? stripeSettings.testSecretKey
    : (stripeSettings.secretKey || STRIPE_SECRET_KEY.value());

  if (!stripeSecret) {
    throw new Error(`Stripe ${mode === "test" ? "test" : "live"} secret key is not configured.`);
  }

  return {
    stripe: new Stripe(stripeSecret),
    requestOptions: stripeAccountId ? { stripeAccount: stripeAccountId } : {},
  };
}

// The secret key for one Stripe mode, or "" when none is set (never throws).
async function stripeSecretFor(mode) {
  const settingsDoc = await db.collection("settings").doc("website").get();
  const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
  const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
  if (mode === "test") return stripeSettings.testSecretKey || "";
  try { return stripeSettings.secretKey || STRIPE_SECRET_KEY.value() || ""; } catch { return stripeSettings.secretKey || ""; }
}

async function shopTestMode() {
  const settingsDoc = await db.collection("settings").doc("website").get();
  return !!(settingsDoc.exists && settingsDoc.data()?.payments?.testMode);
}

// Asks Stripe (test and live accounts, the order's own mode first) for one of the
// order's saved payments. Returns { found, mode } or null when no account knows it.
// Only a payment whose metadata/client_reference_id names this order counts.
async function retrieveOrderPayment(orderId, order, { paymentIntentId, sessionId } = {}) {
  const testMode = await shopTestMode();
  for (const mode of modesToTry(order, testMode)) {
    const secret = await stripeSecretFor(mode);
    if (!secret) continue;
    const stripe = new Stripe(secret);
    try {
      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.metadata?.order_id !== orderId) return null;
        return { intent, mode };
      }
      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.client_reference_id !== orderId) return null;
        return { session, mode };
      }
      return null;
    } catch (err) {
      // Wrong account for this id: try the other one. Anything else is a real failure.
      if (err?.code === "resource_missing" || err?.statusCode === 404 || err?.type === "StripeAuthenticationError") continue;
      throw err;
    }
  }
  return null;
}

const FROM = "Lyricalmyrical Books <orders@lyricalmyricalbooks.com>";
const ADMIN_TO = "lyricalmyricalbooks@gmail.com";

function moneyFmt(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

// The customer's items + totals table, in the currency they paid.
function customerTotalsTable(order) {
  const m = v => orderMoneyFmt(v, order);
  return `
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:13px;">
          ${orderRowsHtml(order.items, order)}
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Subtotal</td><td style="text-align:right;">${m(order.subtotal)}</td></tr>
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Shipping</td><td style="text-align:right;">${m(order.shipping)}</td></tr>
          ${order.tax ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Tax</td><td style="text-align:right;">${m(order.tax)}</td></tr>` : ""}
          ${order.discount ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#0a7;">${discountLabel(order)}</td><td style="text-align:right;color:#0a7;">−${m(order.discount)}</td></tr>` : ""}
          ${order.giftCardAmount ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Gift card${(order.giftCardRedemptions || []).length > 1 ? "s" : ""} ${escapeHtml((order.giftCardRedemptions || []).map(r => `••••${r.last4 || ""}`).join(", "))}</td><td style="text-align:right;">−${m(order.giftCardAmount)}</td></tr>` : ""}
          <tr><td colspan="2" style="padding:12px 0;text-align:right;font-weight:bold;">Total</td><td style="text-align:right;font-weight:bold;">${chargedTotalFmt(order)}</td></tr>
        </table>
      `;
}

// "Discount" / "Discount (SPRING)" / the automatic offer's title.
function discountLabel(order) {
  const applied = order.appliedDiscount || {};
  const name = applied.automatic ? applied.title : applied.code;
  return name ? `Discount (${escapeHtml(name)})` : "Discount";
}

// Add-ons, box-set contents, free gift and gift-card recipient under an order line (escaped).
function lineExtrasHtml(i) {
  const notes = [];
  if (i.promoGift) notes.push("Free gift");
  for (const addOn of Array.isArray(i.addOns) ? i.addOns : []) notes.push(`${escapeHtml(addOn.label)}${addOn.text ? `: “${escapeHtml(addOn.text)}”` : ""}`);
  if (Array.isArray(i.components) && i.components.length) notes.push(`Includes ${i.components.map(c => `${Number(c.quantity) > 1 ? `${Number(c.quantity)} × ` : ""}${escapeHtml(c.title || "")}${c.variantName ? ` (${escapeHtml(c.variantName)})` : ""}`).join(", ")}`);
  if (i.giftCard && i.giftCardDetails?.recipientEmail) notes.push(`For ${escapeHtml(i.giftCardDetails.recipientName || i.giftCardDetails.recipientEmail)}`);
  return notes.length ? `<div style="color:#888;font-size:12px;margin-top:4px;">${notes.join("<br/>")}</div>` : "";
}

function orderRowsHtml(items = [], order = null) {
  return items
    .map(
      i => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          ${escapeHtml(i.title)}${i.variantName ? ` <span style="color:#888;">(${escapeHtml(i.variantName)})</span>` : ""}${lineExtrasHtml(i)}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;color:#888;">×${i.quantity}</td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;">${order ? orderMoneyFmt(i.price * i.quantity, order) : moneyFmt(i.price * i.quantity)}</td>
      </tr>`,
    )
    .join("");
}

// Admin-only delivery log (firestore.rules: emailLog is readable by the admin, writable by no client).
// Shown in Admin › Notifications so failed sends are visible instead of only in Functions logs.
async function logEmailAttempt(entry) {
  try {
    await db.collection("emailLog").add({ ...entry, at: new Date().toISOString() });
  } catch (err) {
    console.warn("Could not write emailLog entry:", err);
  }
}

// One order email of each kind, even when Firestore re-runs the trigger: the send is claimed
// first in the server-only `email-claims` collection (firestore.rules deny every client) and
// the claim is released when the send fails, so a retry can still deliver it.
const emailClaimId = (orderId, kind) => `${orderId}_${kind}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 400);
async function sendOrderEmailOnce(orderId, kind, message) {
  const ref = db.collection("email-claims").doc(emailClaimId(orderId, kind));
  let claimed = true;
  try {
    claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { orderId, kind, claimedAt: new Date().toISOString(), expiresAt: retainFor(400) });
      return true;
    });
  } catch (err) {
    // Without a claim store we cannot tell; a rare duplicate beats a lost order email.
    console.warn(`Could not claim ${kind} email for ${orderId}; sending anyway:`, err);
  }
  if (!claimed) {
    console.log(`${kind} email for ${orderId} was already sent; skipping duplicate.`);
    return null;
  }
  try {
    return await sendEmail({ queue: kind, ...message, claimId: ref.id, about: { orderId } });
  } catch (err) {
    // Parked in the retry queue: keep the claim so a re-run trigger can't send a second copy.
    if (err?.queued) {
      await ref.set({ queuedAs: err.queued }, { merge: true }).catch(() => {});
      throw err;
    }
    await ref.delete().catch(releaseErr => console.warn(`Could not release ${kind} email claim for ${orderId}:`, releaseErr));
    throw err;
  }
}

// `queue` (a short kind, e.g. "orderConfirmed"): when every sender refuses, park the email in
// the server-only retry queue (emailOutbox) instead of losing it; the thrown error carries
// `.queued` (the queue id). `outboxId` marks a send made by the retry queue itself.
async function sendEmail({ to, subject, html, secret, queue = "", outboxId = "", attempt = 0, claimId = "", about = {} }) {
  const recipientList = cleanRecipients(to);
  subject = cleanSubject(subject);
  const sourceHtml = html;
  // Order emails name their order, so Order detail › Activity can list its delivery attempts.
  const aboutOrder = typeof about?.orderId === "string" && about.orderId ? { orderId: about.orderId } : {};
  const logBase = { to: Array.isArray(to) ? to.join(", ") : String(to || ""), subject, ...(queue ? { kind: String(queue) } : {}), ...(outboxId ? { outboxId } : {}), ...aboutOrder };
  if (!recipientList) {
    // Permanent: no retry can fix an address, and a bad one may be an attempt to inject headers.
    const message = `${String(logBase.to).replace(/[\r\n]+/g, " ").slice(0, 120) || "(no address)"} is not a valid email address, so nothing was sent.`;
    await logEmailAttempt({ ...logBase, to: String(logBase.to).replace(/[\r\n]+/g, " ").slice(0, 254), status: "failed", error: message, permanent: true });
    const err = new Error(message); err.permanent = true; throw err;
  }
  to = recipientList.length === 1 ? recipientList[0] : recipientList;
  // One id for this email across every try: the queue entry's id, and Resend's idempotency key,
  // so a reply lost after Resend accepted the message can't turn into a second copy.
  const queueId = outboxId || (queue ? crypto.randomBytes(12).toString("hex") : "");
  const okExtra = { ...(queue ? { kind: String(queue) } : {}), ...(outboxId ? { outboxId } : {}), ...(attempt > 1 ? { attempt } : {}), ...aboutOrder };
  // Callers that forgot to pass the Functions secret still get it (every function that can
  // send mail declares RESEND_API_KEY): resendSecretValue() reads "" when it isn't declared.
  secret = secret || resendSecretValue();
  let apiKey = secret;
  let keySource = secret ? "secret" : "none";
  let fromName = "Lyricalmyrical Books";
  let fromEmail = "orders@lyricalmyricalbooks.com";
  let replyTo = null;
  let brand = {};
  let mailingAddress = "";

  try {
    const settingsDoc = await db.collection("settings").doc("website").get();
    if (settingsDoc.exists) {
      const settings = settingsDoc.data() || {};
      const comms = settings.communications || {};
      if (comms.fromName) fromName = comms.fromName;
      if (comms.replyTo) replyTo = comms.replyTo;
      if (comms.fromEmail) fromEmail = comms.fromEmail;
      if (comms.resendApiKey) { apiKey = comms.resendApiKey; keySource = "settings"; }
      mailingAddress = footerAddress(settings.location);
    }
  } catch (err) {
    console.warn("Failed to load custom sender details, using default fallbacks:", err);
  }

  // Also check settings/notifications for custom API Key
  try {
    const notificationsDoc = await db.collection("settings").doc("notifications").get();
    if (notificationsDoc.exists) {
      const notifications = notificationsDoc.data() || {};
      if (notifications.resendApiKey) { apiKey = notifications.resendApiKey; keySource = "settings"; }
      if (notifications.brand && notifications.brand.resendApiKey) { apiKey = notifications.brand.resendApiKey; keySource = "settings"; }
      brand = notifications.brand || {};
    }
  } catch (err) {
    console.warn("Failed to load notifications custom API Key:", err);
  }

  const privateResend = await readAdminSecret("resend");
  if (privateResend.apiKey) { apiKey = privateResend.apiKey; keySource = "settings"; }

  if (typeof apiKey === "string") apiKey = apiKey.trim();
  const recipients = Array.isArray(to) ? to.join(", ") : String(to || "");
  // Every email footer carries the shop's postal address (Settings › General › Location).
  const withFooter = doc => mailingAddress && doc ? doc.replace("<!--fm-footer-extra-->", ` &middot; ${escapeHtml(mailingAddress)}`) : doc;

  // Gmail SMTP is the primary sender while the shop has no verified domain in Resend. Gmail
  // always sends from the authenticated account, so customers get real inbox delivery.
  // If it is unset or fails, fall through to Resend below.
  let gmailPass = "";
  try {
    const gmailDoc = await db.collection("adminSecrets").doc("gmail").get();
    if (gmailDoc.exists) gmailPass = String(gmailDoc.data()?.appPassword || "").replace(/\s+/g, "");
  } catch (err) {
    console.warn("Could not read adminSecrets/gmail:", err);
  }
  let gmailProblem = "";
  if (gmailPass) {
    try {
      if (html && !/<html[\s>]/i.test(html)) {
        html = risoLayout(html, { logoUrl: brand.logoUrl || "", accent: brand.brandColor, theme: brand.emailTheme });
      }
      // Bounded waits: a hung connection must not stall a trigger or the 15-minute sweep.
      const transport = nodemailer.createTransport({ service: "gmail", auth: { user: ADMIN_TO, pass: gmailPass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
      const info = await transport.sendMail({
        from: `"${cleanFromName(fromName)}" <${ADMIN_TO}>`,
        to,
        subject,
        html: withFooter(html),
        replyTo: replyTo || undefined,
      });
      await logEmailAttempt({ to: recipients, subject, status: "sent", from: ADMIN_TO, keySource: "gmail", id: info.messageId || null, ...okExtra });
      return { id: info.messageId || null };
    } catch (err) {
      console.error("Gmail SMTP send failed, falling back to Resend:", err);
      gmailProblem = `Gmail SMTP rejected the send (${err?.message || err}). Re-enter the Gmail app password in Settings › Notifications › Gmail sending.`;
      // Not a failure yet: Resend below may still deliver it. Only the final outcome counts as "failed".
      await logEmailAttempt({ to: recipients, subject, status: "fallback", from: ADMIN_TO, keySource: "gmail", ...okExtra,
        error: `${gmailProblem} Trying the backup sender (Resend).` });
    }
  }
  const fail = async (message, extra = {}) => {
    const error = gmailProblem ? `${message} (${gmailProblem})` : message;
    const thrown = new Error(message);
    // The retry queue logs its own outcome (try N of M / gave up).
    if (outboxId) throw thrown;
    if (queue && !isPermanentEmailError(error)) {
      const queued = await enqueueEmail({ id: queueId, to: recipientList, subject, html: sourceHtml, kind: queue, error, claimId, about });
      if (queued) {
        await logEmailAttempt({ to: recipients, subject, status: "queued", error: `${error} Saved to try again automatically.`, from: fromEmail, keySource, kind: String(queue), outboxId: queued.id, retryAt: queued.nextAttemptAt, ...aboutOrder, ...extra });
        thrown.queued = queued.id;
        throw thrown;
      }
    }
    await logEmailAttempt({ to: recipients, subject, status: "failed", error, from: fromEmail, keySource, ...(queue ? { kind: String(queue) } : {}), ...aboutOrder, ...extra });
    throw thrown;
  };

  if (!apiKey || apiKey === "dummy_value" || !apiKey.startsWith("re_")) {
    await fail(explainEmailError("Missing API key", { fromEmail }));
  }

  const resend = new Resend(apiKey);

  // Every email gets the Riso Press shell (light/dark, accent and logo from Notifications › Email branding);
  // templates from compileEmailTemplate are already full documents.
  if (html && !/<html[\s>]/i.test(html)) {
    html = risoLayout(html, { logoUrl: brand.logoUrl || "", accent: brand.brandColor, theme: brand.emailTheme });
  }

  // If using a Resend onboarding key, force the sender to onboarding@resend.dev
  if (apiKey.startsWith("re_onb_")) {
    fromEmail = "onboarding@resend.dev";
  }

  const send = (fromAddress) => {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ data: null, error: { message: "Resend did not answer within 20 seconds." } }), 20000); });
    const request = resend.emails.send({
      from: `${cleanFromName(fromName)} <${fromAddress}>`,
      to,
      subject,
      html: withFooter(html),
      replyTo: replyTo || undefined
    }, queueId ? { idempotencyKey: `${queueId}:${fromAddress}` } : undefined)
      .catch(err => ({ data: null, error: { message: err?.message || String(err) } }));
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  };

  let response = await send(fromEmail);
  let usedSandbox = fromEmail === "onboarding@resend.dev";

  if (response.error && !usedSandbox) {
    const errorMsg = (response.error.message || "").toLowerCase();
    // If it's a domain validation / verification error, retry using the Resend sandbox address
    if (["verify", "domain", "sender", "from address", "unverified"].some(word => errorMsg.includes(word))) {
      console.warn(`Domain not verified for '${fromEmail}'. Retrying send via 'onboarding@resend.dev' sandbox fallback...`);
      const fallbackResponse = await send("onboarding@resend.dev");
      usedSandbox = true;
      if (!fallbackResponse.error) {
        await logEmailAttempt({ to: recipients, subject, status: "sent", from: "onboarding@resend.dev", keySource, id: fallbackResponse.data?.id || null, sandbox: true, ...okExtra,
          note: `${fromEmail.split("@")[1] || "Sender domain"} is not verified in Resend; sent from onboarding@resend.dev, which only reaches the Resend account owner.` });
        return fallbackResponse.data;
      }
      response = fallbackResponse; // If fallback also fails, report the fallback's error
    }
  }

  if (response.error) {
    console.error(`Resend rejected email to ${recipients}:`, response.error);
    await fail(explainEmailError(response.error.message, { fromEmail, usedSandbox }), usedSandbox ? { sandbox: true } : {});
  }
  await logEmailAttempt({ to: recipients, subject, status: "sent", from: usedSandbox ? "onboarding@resend.dev" : fromEmail, keySource, id: response.data?.id || null, ...(usedSandbox ? { sandbox: true } : {}), ...okExtra });
  return response.data;
}


// ── Email retry queue (server-only emailOutbox; rules in ./emailOutbox) ──
async function enqueueEmail({ id = "", to, subject, html, kind, error, claimId = "", about = {} }) {
  id = id || crypto.randomBytes(12).toString("hex");
  const now = Date.now();
  const entry = {
    to, subject, html: String(html || ""), kind: String(kind || ""), status: "pending", attempts: 1,
    createdAt: new Date(now).toISOString(), lastAttemptAt: new Date(now).toISOString(),
    nextAttemptAt: nextRetryAt(1, now), lastError: String(error || "").slice(0, 1000), leaseUntil: null,
    ...(claimId ? { claimId } : {}),
    // Re-checked before each retry (an order refunded meanwhile, a gift card voided) and used by privacy erase.
    toLower: to.map(addr => String(addr).toLowerCase()),
    ...(typeof about.orderId === "string" && about.orderId ? { orderId: about.orderId } : {}),
    ...(typeof about.giftCardId === "string" && about.giftCardId ? { giftCardId: about.giftCardId } : {}),
  };
  try {
    await db.collection("emailOutbox").doc(id).set(entry);
    return { id, nextAttemptAt: entry.nextAttemptAt };
  } catch (err) {
    console.warn("Could not save the email for a retry:", err.message);
    return null;
  }
}

const resendSecretValue = () => { try { return RESEND_API_KEY.value(); } catch { return ""; } };

// Sends one queued email (due, or `force` for the admin's Retry now). Takes a short lease in a
// transaction first so two runs can never send the same email twice.
async function sendQueuedEmail(id, { force = false } = {}) {
  const ref = db.collection("emailOutbox").doc(id);
  let entry = null;
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || !canSendNow(snap.data(), now, { force })) return;
    entry = snap.data();
    tx.update(ref, { leaseUntil: new Date(now + LEASE_MS).toISOString() });
  });
  if (!entry) return { status: "skipped" };
  const toText = Array.isArray(entry.to) ? entry.to.join(", ") : String(entry.to || "");
  // Hours may have passed: an order confirmation must not arrive after the refund email.
  const stale = await queuedEmailStale(entry).catch(err => { console.warn(`Could not re-check queued email ${id}:`, err.message); return ""; });
  if (stale) {
    await ref.delete().catch(err => console.warn(`Could not drop queued email ${id}:`, err.message));
    await logEmailAttempt({ to: toText, subject: entry.subject, kind: entry.kind || "", outboxId: id, status: "cancelled", error: `Not sent: ${stale}.` });
    return { status: "cancelled", reason: stale };
  }
  const attempt = (Number(entry.attempts) || 1) + 1;
  try {
    await sendEmail({ to: entry.to, subject: entry.subject, html: entry.html, secret: resendSecretValue(), queue: entry.kind || "retry", outboxId: id, attempt, about: { orderId: entry.orderId || "" } });
  } catch (err) {
    const message = String(err?.message || err).slice(0, 1000);
    const at = new Date().toISOString();
    const retryAt = err?.permanent || isPermanentEmailError(message) ? null : nextRetryAt(attempt, Date.now());
    await ref.update({ attempts: attempt, lastError: message, lastAttemptAt: at, nextAttemptAt: retryAt, status: retryAt ? "pending" : "failed", leaseUntil: null, ...(retryAt ? {} : { gaveUpAt: at }) })
      .catch(updateErr => console.warn(`Could not update queued email ${id}:`, updateErr.message));
    await logEmailAttempt({ to: toText, subject: entry.subject, kind: entry.kind || "", outboxId: id, attempt,
      status: retryAt ? "queued" : "failed", retryAt,
      error: retryAt ? `Try ${attempt} of ${MAX_ATTEMPTS} failed: ${message} Trying again automatically.` : `Gave up after ${attempt} tries: ${message}` });
    return { status: retryAt ? "queued" : "failed", error: message, retryAt };
  }
  // Delivered. Nothing below may send it again: mark it done before removing it, and never fall
  // back into the retry branch if a bookkeeping write fails.
  const at = new Date().toISOString();
  await ref.update({ status: "sent", nextAttemptAt: null, leaseUntil: null, sentAt: at })
    .catch(err => console.warn(`Could not mark queued email ${id} sent:`, err.message));
  await ref.delete().catch(err => console.warn(`Could not remove sent email ${id} from the queue:`, err.message));
  if (entry.claimId) await db.collection("email-claims").doc(entry.claimId).set({ sentAt: at, queuedAs: null }, { merge: true }).catch(() => {});
  if (entry.giftCardId) {
    // Gift cards › Last emailed, as for a first-time send (emailGiftCard).
    try {
      const cardRef = db.collection("giftCards").doc(entry.giftCardId);
      const card = await cardRef.get();
      if (card.exists) await cardRef.update({ emailedAt: at, history: withHistory(card.data(), { type: "emailed", minor: 0, to: toText, at }), updatedAt: at });
    } catch (err) { console.warn(`Could not record gift card ${entry.giftCardId} as emailed:`, err.message); }
  }
  return { status: "sent" };
}

// "" when a queued email still fits, else why it no longer does.
async function queuedEmailStale(entry) {
  if (entry.orderId) {
    const order = await db.collection("orders").doc(entry.orderId).get();
    const reason = staleOrderEmailReason(entry.kind, order.exists ? order.data() : null);
    if (reason) return reason;
  }
  if (entry.giftCardId) {
    const card = await db.collection("giftCards").doc(entry.giftCardId).get();
    if (!card.exists) return "the gift card no longer exists";
    if (card.data().enabled === false) return "the gift card was disabled since";
  }
  return "";
}

// Every 15 minutes (from unpaidPaymentSweep): send due queued emails, then drop old delivery
// rows and given-up queue entries so personal data isn't kept forever.
// `budgetMs` caps the sending so a backlog can never run the sweep out of time; the rest wait.
async function runEmailOutbox(now = Date.now(), { budgetMs = 30000 } = {}) {
  const started = Date.now();
  const due = await db.collection("emailOutbox").where("nextAttemptAt", "<=", new Date(now).toISOString())
    .orderBy("nextAttemptAt").limit(25).get();
  let sent = 0;
  for (const doc of due.docs) {
    if (Date.now() - started > budgetMs) break;
    const result = await sendQueuedEmail(doc.id).catch(err => ({ status: "error", error: err.message }));
    if (result.status === "sent") sent += 1;
  }
  const prune = async (collection, field, before, max) => {
    const old = await db.collection(collection).where(field, "<", before).limit(max).get();
    await Promise.all(old.docs.map(d => d.ref.delete()));
    return old.docs.length;
  };
  const prunedLog = await prune("emailLog", "at", daysAgoIso(LOG_RETENTION_DAYS, now), 300).catch(err => { console.warn("emailLog prune failed:", err.message); return 0; });
  const prunedOutbox = await prune("emailOutbox", "gaveUpAt", daysAgoIso(GAVE_UP_RETENTION_DAYS, now), 100).catch(err => { console.warn("emailOutbox prune failed:", err.message); return 0; });
  // Newsletter signups nobody confirmed within 30 days are strangers' addresses: drop them.
  const prunedPending = await db.collection("newsletter").where("status", "==", "pending").limit(300).get()
    .then(async snap => {
      const cutoff = daysAgoIso(30, now);
      const stale = snap.docs.filter(d => String(d.data().requestedAt || "") < cutoff);
      await Promise.all(stale.map(d => d.ref.delete()));
      return stale.length;
    }).catch(err => { console.warn("pending newsletter prune failed:", err.message); return 0; });
  return { tried: due.docs.length, sent, prunedLog, prunedOutbox, prunedPending };
}

// ──────────────────────────────────────────────────────────────
// Shippo API Normalizers & Helpers
// ──────────────────────────────────────────────────────────────
const US_STATES = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
};

const CA_PROVINCES = {
  "ontario": "ON", "quebec": "QC", "nova scotia": "NS", "new brunswick": "NB", "manitoba": "MB", "british columbia": "BC", "prince edward island": "PE", "saskatchewan": "SK", "alberta": "AB", "newfoundland and labrador": "NL", "newfoundland": "NL", "labrador": "NL", "northwest territories": "NT", "yukon": "YT", "nunavut": "NU"
};

// Country name or code -> ISO code. Unknown names give "" (never a guess: the
// old fallback turned every unrecognised country into "US", so French
// addresses were quoted as American and US-allowlisted live rates leaked abroad).
function getCountryCode(countryName) {
  const resolved = resolveCountry(countryName);
  if (resolved) return resolved.code;
  const clean = String(countryName || "").trim();
  return /^[a-z]{2}$/i.test(clean) ? clean.toUpperCase() : "";
}

function getStateCode(stateName) {
  const clean = (stateName || "").trim().toLowerCase();
  if (clean.length === 2) {
    return clean.toUpperCase();
  }
  return US_STATES[clean] || CA_PROVINCES[clean] || String(stateName || "").toUpperCase();
}

// Shippo "address_from": Settings › General › Location (street, city, province, postal code,
// country, phone), each blank field falling back to the original Toronto address.
function originAddress(settings) {
  const origin = shopOrigin(settings);
  return { ...origin, state: getStateCode(origin.state), country: getCountryCode(origin.country) || "CA" };
}

// fetch() with a hard timeout so a slow/hung third party can never stall a
// request that sits on the checkout critical path. Resolves/rejects like fetch;
// aborts (and throws) after `ms` milliseconds.
async function fetchWithTimeout(url, options = {}, ms = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Timeout: a hung Shippo call must never hold a function open until it is killed. Label purchases
// are the one place an aborted request may still have been processed, so they stay "uncertain".
async function callShippo(endpoint, method, body, token, timeoutMs = 15000) {
  const headers = {
    "Authorization": `ShippoToken ${token}`,
    "Content-Type": "application/json"
  };
  const res = await fetchWithTimeout(`https://api.goshippo.com/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }, timeoutMs);
  if (!res.ok) {
    const errorText = await res.text();
    const error = new Error(`Shippo API error: ${res.status} - ${errorText}`);
    error.shippoStatus = res.status;
    throw error;
  }
  return await res.json();
}

// `calculateShipping` now lives in ./orderMath (pure + unit-tested).

// Region-aware tax matching: prefer a rate whose region matches the
// destination state/province, otherwise fall back to the country-wide rate.
function matchTaxRate(rates, country, state) {
  const normalizeCountry = value => {
    const clean = String(value || '').trim().toLowerCase();
    if (clean === 'ca' || clean === 'canada') return 'ca';
    if (['us', 'usa', 'united states', 'united states of america'].includes(clean)) return 'us';
    return clean;
  };
  const c = normalizeCountry(country);
  const countryRates = (rates || []).filter(
    r => normalizeCountry(r.country) === c
  );
  if (countryRates.length === 0) return null;
  const stateCode = getStateCode(state || "");
  const regional = countryRates.find(r => {
    const region = (r.region || "").trim();
    return region && getStateCode(region) === stateCode;
  });
  return regional || countryRates.find(r => !r.region) || null;
}

// Loads a discount by code and enforces active / expiry / usage limits.
// Throws with a customer-readable message when the code cannot be used.
async function fetchValidDiscount(code) {
  // Pasted/autocorrected codes often carry spaces ("SUMMER25 ").
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) throw new Error("Invalid or expired discount code");
  const snap = await db
    .collection("discounts")
    .where("code", "==", clean)
    .limit(10)
    .get();
  if (snap.empty) throw new Error("Invalid or expired discount code");
  // A code re-created for a new campaign can sit beside its expired/used-up predecessor:
  // use whichever copy is usable, and only report a problem when none is.
  let firstProblem = null;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    // An automatic offer is never redeemed by typing a code (even one left over from before).
    if (data.method === "automatic") continue;
    const problem = discountProblem(data);
    if (!problem) return { id: docSnap.id, ...data };
    firstProblem = firstProblem || problem;
  }
  throw new Error(firstProblem || "Invalid or expired discount code");
}

function discountProblem(data) {
  const isActive = data.isActive ?? data.active ?? true;
  if (!isActive) return "This code is not currently active";
  const dateState = discountDateState(data);
  if (dateState === "not_started") return "This code is not active yet";
  if (dateState === "expired") return "This code has expired";
  if (data.usageLimit && (data.usageCount || 0) >= data.usageLimit) return "This code has reached its usage limit";
  return null;
}

// "One use per customer" and the code's usage limit, on the trusted server path. A customer is the
// mailbox behind the address (name+2@gmail.com and n.ame@gmail.com are name@gmail.com), and a use is
// held from the moment an order that used the code is paid, waiting for a manual payment, or has a
// card/PayPal payment under way (functions/discountClaims.js) — so two tabs, or a crowd checking out at
// once, cannot all get a "first 50 customers" price before the first of them has paid.
async function assertDiscountNotUsedByCustomer(discount, email, orderId = "") {
  const limited = Number(discount.usageLimit) > 0;
  if (!discount.onePerCustomer && !limited) return;
  const normalized = String(email || "").trim().toLowerCase();
  if (discount.onePerCustomer && !normalized) throw new Error("Enter your email address to use this code.");
  const identity = emailIdentity(normalized);
  const snap = await db.collection("orders")
    .where("appliedDiscount.id", "==", discount.id)
    .where("paymentStatus", "in", ["paid", "pending", "unpaid"])
    .limit(1000)
    .get();
  const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (discount.onePerCustomer) {
    const mine = rows.filter(row => row.id !== orderId && emailIdentity(row.customer?.email) === identity);
    if (mine.some(row => row.paymentStatus === "paid" || openClaims([row], { orderId }).some(claim => claim.paymentStatus === "pending"))) {
      throw new Error("You have already used this code.");
    }
  }
  if (limited && limitReached(discount, openClaims(rows, { orderId }), identity)) throw new Error("This code has reached its usage limit");
}

// Enforce customer targeting on the trusted server path. Client validation is
// only an early UX hint and must never authorize a restricted promotion.
function validateDiscountCustomer(discount, email) {
  const normalized = String(email || "").trim().toLowerCase();
  const emails = String(discount.allowedCustomerEmails || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  const domains = String(discount.allowedEmailDomains || "").split(",").map(v => v.trim().toLowerCase().replace(/^[@.]+/, "")).filter(Boolean);
  if ((emails.length || domains.length) && !normalized) throw new Error("Enter your email address to use this code.");
  if (emails.length && !emails.includes(normalized)) throw new Error("This code is restricted to selected customers.");
  if (domains.length) {
    const customerDomain = normalized.split("@")[1] || "";
    if (!domains.some(domain => customerDomain === domain || customerDomain.endsWith(`.${domain}`))) throw new Error("This code is restricted to selected email domains.");
  }
}

// Exchange rates (functions/exchangeRates.js): checkout charges the saved daily copy in settings/exchangeRates,
// the same numbers the storefront shows. The scheduled job below refreshes it.
const { FALLBACK_RATES, createRateReader, refreshStoredRates } = require("./exchangeRates");
const getExchangeRates = createRateReader({ db });

exports.refreshExchangeRates = onSchedule({ schedule: "every 3 hours", timeoutSeconds: 60 }, async () => {
  const saved = await refreshStoredRates({ db });
  if (saved) console.log(`Exchange rates saved: 1 CAD = ${saved.usd} USD, ${saved.eur} EUR (feed updated ${saved.providerUpdatedAt || "unknown"}).`);
  else console.warn("Exchange-rate refresh failed: the shop keeps its last saved rates.");
});

// ──────────────────────────────────────────────────────────────
// PayPal Orders API helpers
// ──────────────────────────────────────────────────────────────
function paypalBaseUrl(testMode) {
  return testMode ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

async function getPayPalConfig() {
  const settingsDoc = await db.collection("settings").doc("website").get();
  const settings = settingsDoc.data() || {};
  return {
    settings,
    testMode: Boolean(settings.payments?.testMode),
    // The Functions secrets stay the live fallback; Settings › Payments › PayPal (client ids) and the private
    // adminSecrets/paypal (client secrets) are read when the token is requested, once the order's mode is known.
    clientId: PAYPAL_CLIENT_ID.value(),
    clientSecret: PAYPAL_CLIENT_SECRET.value(),
    settingsPaypal: settings.payments?.paypal || {},
    privateSecrets: await readAdminSecret("paypal"),
  };
}

async function getPayPalAccessToken(config) {
  const creds = paypalCredentials({
    testMode: config.testMode, settingsPaypal: config.settingsPaypal, privateSecrets: config.privateSecrets,
    fallback: { clientId: config.clientId, clientSecret: config.clientSecret },
  });
  if (!creds.ok) throw new Error(creds.error);
  const response = await fetch(`${paypalBaseUrl(config.testMode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "PayPal authentication failed.");
  return data.access_token;
}

async function paypalRequest(config, path, options = {}) {
  const accessToken = await getPayPalAccessToken(config);
  const response = await fetch(`${paypalBaseUrl(config.testMode)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.details?.[0]?.description || data.message || "PayPal request failed.";
    throw new Error(detail);
  }
  return data;
}

// What the customer is told to expect, saved on the order for the thank-you page,
// tracking page and emails. `days` is a carrier number or a profile range ("3-7").
function shippingEstimateOf(days, terms) {
  const cleanDays = days === undefined || days === null || days === "" ? "" : String(days).trim().slice(0, 20);
  const cleanTerms = String(terms || "").trim().slice(0, 200);
  return cleanDays || cleanTerms ? { days: cleanDays, terms: cleanTerms } : null;
}

// Server-authoritative shipping: quotes every configured rate for the cart and
// charges the one the customer selected (order.shippingMethod), else the
// cheapest. Profiles without zones keep the legacy flat calculation. Returns
// { cost, method } or throws when the destination can't be served.
async function resolveShipping(items, order, profiles, freeShipping, settings, discountedPhysical) {
  const address = order.customer && order.customer.address;
  const selection = order.fulfillmentSelection;
  const physicalItems = items.filter(isPhysicalItem);
  if (selection && selection.method !== 'shipping') {
    return resolveLocalSelection(settings.localFulfillment, selection, address, discountedPhysical, physicalItems, freeShipping);
  }
  if (!physicalItems.length) {
    if (selection && selection.method !== 'shipping') throw new Error('That fulfillment option is unavailable for digital orders.');
    return { cost: 0, method: null, fulfillment: null };
  }
  if (selection && (selection.method !== 'shipping' || /^(pickup|local_delivery):/.test(String(selection.optionId || '')))) throw new Error('Choose an available fulfillment option.');
  let liveRatesTried = false;
  if (address) {
    const configDoc = await SHIPPO_CONFIG_DOC.get();
    const config = configDoc.exists ? configDoc.data() || {} : {};
    const destinationCountry = getCountryCode(address.country);
    const enabledCountries = Array.isArray(config.dynamicRateCountries) ? config.dynamicRateCountries : [];
    if (config.dynamicRatesEnabled === true && enabledCountries.includes(destinationCountry)) {
      // A free-shipping code covers whichever live carrier rate the shopper picked;
      // the profile rates below never contain carrier names, so they can't match it.
      if (freeShipping) return { cost: 0, method: String(selection?.optionId || order.shippingMethod || '').slice(0, 200) || null };
      liveRatesTried = true;
      const shippoToken = await getShippoToken();
      // No usable live rates (no token, Shippo down, no carrier quotes, or the shopper
      // was shown profile rates instead): fall through to the profile/zone rates below,
      // exactly as checkout does in the browser. The charge is still priced here.
      const liveQuote = shippoToken ? await (async () => {
      const settingsDoc = await db.collection("settings").doc("website").get();
      const settings = settingsDoc.data() || {};
      const totalWeightLb = physicalItems.reduce((sum, item) => {
        const grams = Number(item.weightGrams);
        return sum + ((Number.isFinite(grams) && grams > 0 ? grams / 453.592 : 1.5) * (item.quantity || 1));
      }, 0);
      const shipment = await callShippo("shipments/", "POST", {
        address_from: originAddress(settings),
        address_to: {
          name: order.customer?.name || "Customer",
          street1: address.street,
        street2: address.unit || "",
          city: address.city,
          state: getStateCode(address.state),
          zip: address.zip,
          country: destinationCountry,
        },
        parcels: [{ length: "10", width: "8", height: "2", distance_unit: "in", weight: Math.max(0.1, totalWeightLb).toFixed(1), mass_unit: "lb" }],
        async: false,
      }, shippoToken);
      const carrierQuotes = (shipment.rates || []).map(rate => ({
        name: `${rate.provider || ""} ${rate.servicelevel?.name || rate.servicelevel?.token || "Shipping"}`.trim(),
        price: Number(rate.amount),
        estimate: shippingEstimateOf(rate.estimated_days, rate.duration_terms),
      })).filter(rate => Number.isFinite(rate.price)).sort((a, b) => a.price - b.price);
      if (!carrierQuotes.length) return null;
      const selectedCarrier = selection?.optionId || order.shippingMethod;
      const pickedCarrier = selection ? carrierQuotes.find(quote => quote.name === selectedCarrier) : pickQuote(carrierQuotes, selectedCarrier);
      if (pickedCarrier) return { cost: pickedCarrier.price, method: pickedCarrier.name, estimate: pickedCarrier.estimate };
      // The shopper picked a profile rate (browser fallback) — price it from profiles below.
      // Live rates exist now, so a cheaper profile rate may not stand in for them: the shop would pay the
      // carrier's real price for the label and collect the profile price. The profile fallback is only for
      // when the carrier gave no rates at all (handled above) or could not be reached.
      throw new Error("That live carrier rate is no longer available. Please review the shipping options and try again.");
      })().catch(err => {
        if (/no longer available/.test(err.message)) throw err;
        console.warn("Live carrier rates unavailable, using profile rates:", err.message);
        return null;
      }) : null;
      if (liveQuote) return liveQuote;
    }
  }
  const hasZones = profiles.some((p) => Array.isArray(p.zones) && p.zones.length);
  // The shopper picked a carrier rate but the carrier couldn't be reached (or returned nothing): say so,
  // instead of claiming the shop doesn't ship there.
  const carrierUnavailable = () => new Error("Live carrier shipping rates are temporarily unavailable. Please try again in a few minutes.");
  if (!hasZones) {
    if (selection) {
      const choices = quoteShipping(physicalItems, address, profiles, { freeAll: !!freeShipping }).filter(quote => quote.type !== 'pickup');
      const chosen = choices.find(quote => quote.id === selection.optionId || quote.name === selection.optionId);
      if (!chosen && liveRatesTried) throw carrierUnavailable();
      if (!chosen) throw new Error('That shipping rate is no longer available. Please review the options and try again.');
      return { cost: chosen.price, method: chosen.name, estimate: shippingEstimateOf(chosen.deliveryDays) };
    }
    return { cost: freeShipping ? 0 : calculateShipping(physicalItems, address, profiles), method: order.shippingMethod || null };
  }
  const quotes = quoteShipping(physicalItems, address, profiles, { freeAll: !!freeShipping }).filter(quote => quote.type !== 'pickup');
  const selectedRate = selection?.optionId || order.shippingMethod;
  const picked = selection ? quotes.find(quote => quote.id === selectedRate || quote.name === selectedRate) : pickQuote(quotes, selectedRate);
  if (!picked && selection && liveRatesTried) throw carrierUnavailable();
  if (!picked) {
    throw new Error(`We don't currently ship these items to ${(address && address.country) || "that destination"}. Please contact us for a custom quote.`);
  }
  return { cost: picked.price, method: picked.name, estimate: shippingEstimateOf(picked.deliveryDays) };
}

function authoritativeTax(items, discountAmount, discount, booksById, settings, order, fulfillment) {
  const rates = settings.taxes?.rates || [];
  const discountedPhysical = discountedPhysicalSubtotal(items, discountAmount, discount, booksById);
  const taxableTotal = Math.max(0, items.reduce((sum, item) => sum + item.price * item.quantity, 0) - discountAmount);
  const address = order.customer?.address || {};
  if (fulfillment?.method === 'pickup') {
    const pickup = fulfillment.address;
    // Pickup limited to an area collects the shopper's address instead of a separate billing location.
    const given = order.customer?.billingAddress;
    const billing = given?.country && given?.state ? given : order.customer?.address;
    if (!billing || !billing.country || !billing.state) throw new Error('Billing country and province or state are required for pickup.');
    const physicalRate = matchTaxRate(rates, pickup.country, pickup.state);
    const digitalRate = matchTaxRate(rates, billing.country, billing.state);
    return discountedPhysical * (Number(physicalRate?.rate || 0) / 100) + (taxableTotal - discountedPhysical) * (Number(digitalRate?.rate || 0) / 100);
  }
  const basis = Object.keys(address).length ? address : order.customer?.billingAddress || {};
  if (!basis.country) throw new Error('Destination country is required for tax.');
  const taxRate = matchTaxRate(rates, basis.country, basis.state);
  // Not silent: a country with rates but none for this province is flagged in Ready to sell.
  if (!taxRate && taxableTotal > 0 && rates.length) console.warn(`No tax rate matches ${basis.country}/${basis.state || "-"}; charging no tax.`);
  return taxableTotal * (Number(taxRate?.rate || 0) / 100);
}

function itemWeightGrams(book, variant) {
  return parseWeightGrams(variant && variant.weight) ?? parseWeightGrams(book.weight);
}
function catalogFormat(book, variant) {
  if (variant?.format) return variant.format;
  if (/digital|ebook|e-book|epub|pdf|audiobook|paperback|hardcover|hardback|softcover/i.test(String(variant?.name || ''))) return variant.name;
  return book.format || '';
}
function catalogDigital(book, variant) {
  // A gift card is emailed, never shipped.
  if (isGiftCardProduct(book)) return true;
  return variant?.digital === true || variant?.isDigital === true || (!variant && (book.digital === true || book.isDigital === true));
}

// One line's pre-order state from several catalog books (a box set and its parts): on pre-order
// when any is; the release date is the latest, and "date to be announced" when any has none.
function combinedPreorder(books) {
  const lines = books.filter(Boolean).map(b => preorderLine(b)).filter(line => line.preorder);
  if (!lines.length) return { preorder: false, releaseDate: null };
  if (lines.some(line => !line.releaseDate)) return { preorder: true, releaseDate: null };
  return { preorder: true, releaseDate: lines.map(line => line.releaseDate).sort().at(-1) };
}

// A checkout refusal the shopper can act on (sold out, discount refused…): answered with 400.
class PricingError extends Error {
  constructor(message, code) {
    super(message);
    this.status = 400;
    if (code) this.code = code;
  }
}

// Active automatic discounts (Discounts › Automatic): no code, applied by checkout itself.
async function loadAutomaticDiscounts() {
  const snap = await db.collection("discounts").where("method", "==", "automatic").limit(50).get();
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })).filter(discount => !discountProblem(discount));
}

// The public "automaticDiscounts" answer only: shared by every caller of this instance for 30 s. Pricing an
// order always calls loadAutomaticDiscounts() fresh.
let automaticDiscountsCache = { at: 0, promise: null };
function cachedAutomaticDiscounts(now = Date.now()) {
  if (!automaticDiscountsCache.promise || now - automaticDiscountsCache.at > 30_000) {
    const promise = loadAutomaticDiscounts();
    promise.catch(() => { if (automaticDiscountsCache.promise === promise) automaticDiscountsCache = { at: 0, promise: null }; });
    automaticDiscountsCache = { at: now, promise };
  }
  return automaticDiscountsCache.promise;
}

// Prices an order from the live catalog for every checkout path (card, PayPal, manual, free).
// Nothing the browser sends decides a price: books, editions, add-ons, box-set parts, the
// discount (a code, else the best automatic offer, including a free gift), shipping, tax and
// gift-card amounts are all worked out here. Throws PricingError for a shopper-fixable problem.
async function priceOrder(order, { orderId = "", settings: knownSettings = null } = {}) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(order.customer?.email || "").trim())) {
    throw new PricingError("Check the email address: it doesn't look complete.");
  }
  const booksById = {};
  const getBook = async id => {
    if (typeof id !== "string" || !id || id.includes("/")) return null;
    if (!(id in booksById)) {
      const snap = await db.collection("books").doc(id).get();
      booksById[id] = snap.exists ? snap.data() : null;
    }
    return booksById[id];
  };
  const items = [];
  for (const requested of order.items || []) {
    // A free gift is never taken from the browser: it is re-added below when the order earns it.
    if (!requested || requested.promoGift === true) continue;
    const label = requested.title || requested.id;
    const book = await getBook(requested.id);
    if (!book) throw new PricingError(`Book ${label} not found in library catalog.`);
    const problem = purchaseProblem(book, requested.variantId);
    if (problem === "choose_edition") throw new PricingError(`Choose an edition of "${book.title || label}" before checking out.`);
    if (problem) throw new PricingError(`"${book.title || label}" is not available to buy right now. Please remove it from your bag.`);
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(requested.quantity) || 1)));
    const variant = requested.variantId ? (book.variants || []).find(v => v.id === requested.variantId) || null : null;
    if (requested.variantId && !variant) throw new PricingError(`Selected edition for "${book.title || label}" is no longer available.`);
    const parts = bundleComponents(book);
    const components = [];
    if (parts.length) {
      for (const part of parts) {
        const partBook = await getBook(part.id);
        const partVariant = part.variantId ? (partBook?.variants || []).find(v => v.id === part.variantId) || null : null;
        if (!partBook || (part.variantId && !partVariant)) throw new PricingError(`"${book.title || label}" is not available to buy right now. Please remove it from your bag.`);
        components.push({ id: part.id, variantId: part.variantId, quantity: part.quantity, title: partBook.title || "", ...(partVariant?.name ? { variantName: partVariant.name } : {}) });
      }
      const sets = bundleAvailable(book, id => booksById[id] || undefined);
      if (sets < quantity) throw new PricingError(`Insufficient stock for ${book.title || label}. Only ${Math.max(0, sets)} left.`);
    } else if (book.trackInventory && !book.allowBackorder) {
      const available = variant ? Number(variant.stock || 0) : Number(book.stockLevel || 0);
      if (available < quantity) throw new PricingError(`Insufficient stock for ${book.title || label}${variant?.name ? ` (${variant.name})` : ""}. Only ${available} left.`);
    }
    const basePrice = catalogUnitPrice(book, variant);
    if (!Number.isFinite(basePrice) || basePrice < 0) throw new PricingError(`"${book.title || label}" is temporarily unavailable for purchase (pricing error).`);
    let picked;
    try {
      picked = addOnSelection(book, requested.addOns);
    } catch (err) {
      throw new PricingError(err.message);
    }
    const giftCard = isGiftCardProduct(book);
    if (giftCard && !(basePrice > 0)) throw new PricingError(`"${book.title || label}" is not available to buy right now. Please remove it from your bag.`);
    let giftCardInfo = null;
    if (giftCard) {
      try {
        giftCardInfo = giftCardDetails(requested.giftCardDetails);
      } catch (err) {
        throw new PricingError(err.message);
      }
    }
    // Only fields the browser may describe are kept; everything that prices or ships comes from the catalog.
    const { components: _c, promoGift: _p, giftCard: _g, giftCardDetails: _d, addOns: _a, bundle: _b, basePrice: _bp, ...rest } = requested;
    // Each part weighs what its chosen edition weighs (falling back to the book).
    const partWeights = components.map(part => {
      const partBook = booksById[part.id] || {};
      const partVariant = part.variantId ? (partBook.variants || []).find(v => v.id === part.variantId) || null : null;
      return itemWeightGrams(partBook, partVariant) ?? null;
    });
    const bundleWeight = components.length && partWeights.every(w => w != null) ? partWeights.reduce((sum, w, i) => sum + w * components[i].quantity, 0) : null;
    items.push({
      ...rest,
      // Names come from the catalog, never from the browser (they go into emails).
      title: book.title || requested.title || "",
      variantName: variant ? (variant.name || null) : null,
      quantity,
      price: Math.round((basePrice + picked.price) * 100) / 100,
      ...(picked.addOns.length ? { basePrice, addOns: picked.addOns } : {}),
      ...(components.length ? { bundle: true, components } : {}),
      ...(giftCard ? { giftCard: true, giftCardDetails: giftCardInfo } : {}),
      format: giftCard ? "Gift card" : catalogFormat(book, variant),
      digital: catalogDigital(book, variant),
      isDigital: catalogDigital(book, variant),
      shippingProfileId: book.shippingProfileId || null,
      weightGrams: itemWeightGrams(book, variant) ?? bundleWeight,
      // Pre-order state comes from the catalog at checkout (never from the browser). A box set
      // waits for the latest pre-order book inside it.
      ...combinedPreorder([book, ...components.map(part => booksById[part.id])]),
    });
  }
  if (!items.length) throw new PricingError("Order has no items.");

  const settings = knownSettings || (await db.collection("settings").doc("website").get()).data() || {};
  // Settings › General › Store status › Maintenance: every checkout path is priced here, so this stops them all.
  if (checkoutClosed(settings)) throw new PricingError("The shop is paused for maintenance, so checkout is closed for now. Please try again soon.", "store_closed");
  const testMode = settings.payments?.testMode === true;
  const email = order.customer?.email;
  const discountable = discountableItems(items);

  // Discount: a code the shopper entered, else the best automatic offer. One per order.
  let discount = 0;
  let appliedDiscount = null;
  let verifiedDiscount = null;
  let freeShipping = false;
  const giftPrices = {};
  const giftLineFor = async offer => {
    const giftBook = await getBook(offer.giftBookId);
    const giftVariant = offer.giftVariantId ? (giftBook?.variants || []).find(v => v.id === offer.giftVariantId) || null : null;
    if (!giftBook || purchaseProblem(giftBook, offer.giftVariantId || null) || (offer.giftVariantId && !giftVariant)) return null;
    if (isGiftCardProduct(giftBook) || bundleComponents(giftBook).length) return null;
    if (giftBook.trackInventory && !giftBook.allowBackorder) {
      const inBag = items.filter(i => i.id === offer.giftBookId && (i.variantId || null) === (offer.giftVariantId || null)).reduce((sum, i) => sum + i.quantity, 0);
      const stock = giftVariant ? Number(giftVariant.stock || 0) : Number(giftBook.stockLevel || 0);
      if (stock < inBag + 1) return null;
    }
    const price = catalogUnitPrice(giftBook, giftVariant);
    if (!Number.isFinite(price) || price < 0) return null;
    return {
      id: offer.giftBookId, variantId: offer.giftVariantId || null, title: giftBook.title || "", variantName: giftVariant?.name || null,
      quantity: 1, price, promoGift: true, photoUrl: giftVariant?.photoUrl || giftBook.photos?.[0]?.url || "",
      format: catalogFormat(giftBook, giftVariant), digital: catalogDigital(giftBook, giftVariant), isDigital: catalogDigital(giftBook, giftVariant),
      shippingProfileId: giftBook.shippingProfileId || null, weightGrams: itemWeightGrams(giftBook, giftVariant), ...preorderLine(giftBook),
    };
  };
  const giftLines = {};
  const priceGift = async offer => {
    if (!(offer.id in giftLines)) giftLines[offer.id] = await giftLineFor(offer);
    giftPrices[offer.id] = giftLines[offer.id] ? giftLines[offer.id].price : NaN;
  };
  if (order.appliedDiscount?.code) {
    // Same "Discount code error:" prefix on every path, so checkout can drop the code and explain.
    try {
      const verified = expandDiscountCategories(await fetchValidDiscount(order.appliedDiscount.code), settings.design?.categories);
      verifiedDiscount = verified;
      validateDiscountCustomer(verified, email);
      await assertDiscountNotUsedByCustomer(verified, email, orderId);
      if (verified.type === "gift") await priceGift(verified);
      discount = discountAmountFor(verified, discountable, booksById, { giftPrice: giftPrices[verified.id] });
      freeShipping = verified.type === "freeship";
      appliedDiscount = { id: verified.id, code: verified.code, type: verified.type, value: verified.value ?? null };
    } catch (discountErr) {
      throw new PricingError(`Discount code error: ${discountErr.message}`, "discount_rejected");
    }
  } else {
    const offers = [];
    for (const rawOffer of await loadAutomaticDiscounts()) {
      // Category offers cover the storefront's category membership (aliases, sub-categories).
      const offer = expandDiscountCategories(rawOffer, settings.design?.categories);
      try {
        validateDiscountCustomer(offer, email);
        await assertDiscountNotUsedByCustomer(offer, email, orderId);
      } catch {
        continue;
      }
      if (offer.type === "gift") await priceGift(offer);
      offers.push(offer);
    }
    const best = pickAutomaticDiscount(offers, discountable, booksById, offer => giftPrices[offer.id]);
    if (best) {
      verifiedDiscount = best.discount;
      discount = best.amount;
      freeShipping = best.freeShipping;
      appliedDiscount = { id: best.discount.id, code: null, automatic: true, title: String(best.discount.title || "").slice(0, 120), type: best.discount.type, value: best.discount.value ?? null };
    }
  }
  if (verifiedDiscount?.type === "gift" && giftLines[verifiedDiscount.id]) items.push(giftLines[verifiedDiscount.id]);
  discount = Math.round(discount * 100) / 100;

  // Gift cards are paid at face value: no tax and no discount on them.
  const taxable = items.filter(item => item.giftCard !== true);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const profilesSnap = await db.collection("shipping-profiles").get();
  const profiles = profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const discountedPhysical = discountedPhysicalSubtotal(taxable, discount, verifiedDiscount, booksById);
  let shipResult;
  try {
    shipResult = await resolveShipping(items, order, profiles, freeShipping, settings, discountedPhysical);
  } catch (err) {
    throw new PricingError(err.message);
  }
  const shipping = shipResult.cost;
  let tax;
  try {
    tax = authoritativeTax(taxable, discount, verifiedDiscount, booksById, settings, order, shipResult.fulfillment);
  } catch (err) {
    throw new PricingError(err.message);
  }
  const beforeGiftCards = subtotal - discount + shipping + tax;

  // Gift cards (checkout's "Gift card" box) pay what is left, except other gift cards in the bag.
  const giftCardLines = items.filter(item => item.giftCard === true).reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coverableMinor = Math.max(0, Math.round((beforeGiftCards - giftCardLines) * 100));
  const codes = [...new Set((Array.isArray(order.giftCards) ? order.giftCards : []).map(card => normalizeGiftCardCode(card && card.code)).filter(Boolean))];
  if (codes.length > MAX_CARDS_PER_ORDER) throw new PricingError(`Use up to ${MAX_CARDS_PER_ORDER} gift cards on one order.`, "gift_card_rejected");
  const cardsAvailable = [];
  const nowMs = Date.now();
  const owner = holdOwner(order);
  let testCardUsed = false;
  for (const code of codes) {
    const id = giftCardId(code);
    const snap = await db.collection("giftCards").doc(id).get();
    const card = snap.exists ? snap.data() : null;
    const problem = giftCardProblem(card, { testMode });
    if (problem) throw new PricingError(`Gift card error: ${GIFT_CARD_MESSAGES[problem]}`, "gift_card_rejected");
    if (card.isTest === true) testCardUsed = true;
    cardsAvailable.push({ id, last4: last4(code), availableMinor: availableMinor(card, orderId, nowMs, owner) });
  }
  const redemptions = allocateGiftCards(cardsAvailable, coverableMinor).map(r => ({ ...r, last4: cardsAvailable.find(c => c.id === r.id).last4 }));
  const giftCardAmount = redemptions.reduce((sum, r) => sum + r.minor, 0) / 100;
  const total = Math.round((beforeGiftCards - giftCardAmount) * 100) / 100;
  return {
    items, booksById, settings, testMode, subtotal, discount, appliedDiscount, verifiedDiscount,
    shipping, shippingMethod: shipResult.method || null, shippingEstimate: shipResult.estimate || null, fulfillment: shipResult.fulfillment || null,
    tax, giftCardAmount, giftCardRedemptions: redemptions, total, testCardUsed,
  };
}

async function recalculateOrder(orderRef, order, checkoutCurrency, orderId = "") {
  const priced = await priceOrder(order, { orderId });
  const { items, subtotal, discount, appliedDiscount, shipping, tax, total, settings } = priced;
  const rates = await getExchangeRates();
  const exchangeRate = rates[checkoutCurrency] || FALLBACK_RATES[checkoutCurrency] || 1;
  const convertedTotal = Math.round(total * exchangeRate * 100) / 100;
  const update = {
    items: items.map(({ shippingProfileId, ...item }) => item), subtotal, discount, appliedDiscount,
    shipping, tax, total, checkoutCurrency: checkoutCurrency.toUpperCase(), exchangeRate,
    giftCardAmount: priced.giftCardAmount, giftCardRedemptions: priced.giftCardRedemptions,
    ...(priced.shippingMethod ? { shippingMethod: priced.shippingMethod } : {}),
    shippingEstimate: priced.shippingEstimate,
    fulfillment: priced.fulfillment,
    updatedAt: new Date().toISOString(),
  };
  await orderRef.update(update);
  return { ...update, convertedTotal, settings, testMode: priced.testMode, testCardUsed: priced.testCardUsed };
}

// A shopper who retries (switches card ↔ PayPal ↔ e-Transfer, or edits the bag) gets a new
// order; their own earlier unpaid attempt must not keep the last copy held against them for
// 30 minutes. The browser names that earlier order; it is released only when it is still
// unpaid and belongs to the same customer email.
// Returns { paidOrderId } when that earlier attempt already took (or is taking) the shopper's
// money: the caller refuses the new attempt (refusePreviousAttemptPaid) so nobody pays twice.
async function releaseSupersededAttempt(req, email, currentOrderId, currentItems = null) {
  const prevId = req.body?.previousOrderId;
  if (typeof prevId !== "string" || !prevId || prevId.includes("/") || prevId === currentOrderId) return {};
  try {
    const snap = await db.collection("orders").doc(prevId).get();
    if (!snap.exists) return {};
    const prev = snap.data();
    const same = String(prev.customer?.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase();
    if (!same) return {};
    // Paid, or a payment that may have gone through (webhook not here yet): keep its hold and
    // stop this retry, so the shopper isn't charged twice and the last copy isn't sold twice.
    // Only a repeat of the same purchase is a duplicate: a different bag is a new order, and the
    // earlier paid order's holds are left exactly as they are.
    const sameBag = currentItems == null || sameOrderLines(prev.items, currentItems);
    if (previousAttemptPaid(prev, null, null)) return sameBag ? { paidOrderId: prevId } : {};
    if (prev.paymentStatus !== "unpaid" || checkoutRefusal(prev)) return {};
    const intentId = String(prev.stripePaymentIntentId || ""), sessionId = String(prev.stripeCheckoutSessionId || "");
    if (intentId.startsWith("pi_") || sessionId.startsWith("cs_")) {
      const { stripe, requestOptions } = await getStripeClientForMode(prev.stripeMode === "test" ? "test" : "live", prev.stripeAccountId || null);
      const intent = intentId.startsWith("pi_") ? await stripe.paymentIntents.retrieve(intentId, {}, requestOptions) : null;
      const session = sessionId.startsWith("cs_") ? await stripe.checkout.sessions.retrieve(sessionId, {}, requestOptions) : null;
      if (previousAttemptPaid(prev, intent, session)) return sameBag ? { paidOrderId: prevId } : {};
      if (intent && !["requires_payment_method", "canceled"].includes(intent.status)) return {};
    }
    await releaseStock(db, prevId, prev.items || []);
    await releaseGiftCards(db, prevId, [...chargedRedemptions(prev), ...(prev.giftCardRedemptions || [])]);
  } catch (err) {
    console.warn(`Could not release superseded attempt ${prevId}:`, err.message);
  }
  return {};
}

// 409 for a retry whose earlier attempt already has the shopper's money. The browser opens that
// order's confirmation (Text & labels › Checkout › coPreviousPaid) instead of charging again.
function refusePreviousAttemptPaid(res, superseded) {
  if (!superseded?.paidOrderId) return false;
  res.status(409).json({ error: "Your earlier payment for this order already went through.", code: "previous_attempt_paid", previousOrderId: superseded.paidOrderId });
  return true;
}

// Holds the order's tracked stock, then its gift-card amounts, for the payment window.
// A gift card that can no longer cover its part gives the stock back and throws GiftCardError.
// A shopper starting checkout is held to the per-shopper caps (stockHolds HOLD_LIMITS, keyed by
// email and, with `req`, the connecting address); HoldLimitError is a StockHoldError ("hold_limit").
// The per-shopper caps the owner set in Settings › General › Checkout stock holds (defaults when unset).
async function loadHoldLimits() {
  try {
    return holdLimitsFrom((await db.collection("settings").doc("website").get()).data() || {});
  } catch (err) {
    console.warn("Could not read the stock-hold limits; using the defaults:", err.message);
    return holdLimitsFrom({});
  }
}

async function reserveCheckout(orderId, items, order, giftCardRedemptions, testMode, req = null) {
  await reserveStock(db, orderId, items, Date.now(), holdOwner(order), { limits: true, ip: req ? clientIpOf(req) : "", holdLimits: await loadHoldLimits() });
  if (!(giftCardRedemptions || []).length) return;
  try {
    await reserveGiftCards(db, orderId, giftCardRedemptions, { testMode, owner: holdOwner(order) });
  } catch (err) {
    await releaseStock(db, orderId, items);
    throw err;
  }
}

// Inside a payment transaction, after every read: takes the order's gift-card amounts off the
// cards once. Returns false (and records giftCardConflict) when a card can no longer pay its part:
// the order is then not marked paid, exactly like a stock conflict.
function settleGiftCards(transaction, orderRef, orderId, order, cards, provider, now) {
  const redemptions = chargedRedemptions(order);
  if (!redemptions.length || order.giftCardsDebitedAt) return true;
  const short = debitShortfall(redemptions, cards);
  if (short) {
    transaction.update(orderRef, {
      giftCardConflict: { provider, reason: "balance", cardId: short, at: now },
      activity: [...(order.activity || []), { type: "event", message: `${provider} confirmed payment, but a gift card on this order no longer had enough balance. The order was not marked paid; refund or reconcile the payment and contact the customer.`, createdAt: now }],
      updatedAt: now,
    });
    return false;
  }
  writeGiftCardChange(transaction, db, orderId, redemptions, cards, -1, now);
  transaction.update(orderRef, { giftCardsDebitedAt: now });
  return true;
}

async function reserveForConfirmedPayment(orderId, provider, paymentId) {
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return true;
  const order = snap.data();
  if (order.paymentStatus === "paid" || order.status === "cancelled" || order.isTest === true || order.paypalMode === "test" || order.stripeMode === "test") return true;
  try {
    await reserveStock(db, orderId, order.items || [], Date.now(), holdOwner(order));
    return true;
  } catch (err) {
    if (!(err instanceof StockHoldError)) throw err;
    const at = new Date().toISOString();
    await ref.update({
      inventoryConflict: { provider, paymentId: paymentId || null, reason: err.code, at },
      activity: [...(order.activity || []), { type: "event", message: `${provider} confirmed payment, but stock was no longer available. The order was not marked paid or fulfilled; reconcile the captured payment and contact the customer.`, createdAt: at }],
      updatedAt: at,
    });
    return false;
  }
}

async function markOrderPaidFromPayPal(orderId, paypalData) {
  const orderRef = db.collection("orders").doc(orderId);
  let paidTotal = null;
  const initialOrder = await orderRef.get();
  if (initialOrder.exists && initialOrder.data().paypalMode !== "test"
      && !await reserveForConfirmedPayment(orderId, "PayPal", paypalData.captureId)) return false;
  await db.runTransaction(async transaction => {
    paidTotal = null; // a retried attempt must not keep the last attempt's value
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists) throw new Error("Order not found.");
    const order = orderDoc.data();
    if (order.paymentStatus === "paid") return;
    if (order.paypalOrderId !== paypalData.paypalOrderId) throw new Error("PayPal order does not match checkout order.");
    if (order.status === "cancelled") {
      if (order.paymentMismatch?.paidAfterCancel) return;
      const at = new Date().toISOString();
      transaction.update(orderRef, {
        paypalCaptureId: paypalData.captureId || null,
        paymentMismatch: { paidAfterCancel: true, provider: "paypal", captureId: paypalData.captureId || null, at },
        activity: [...(order.activity || []), { type: "event", message: "PayPal payment arrived after this order was cancelled. Not marked paid — refund it in PayPal.", createdAt: at }],
        updatedAt: at,
      });
      return;
    }
    const amountCheck = paidAmountCheck(order, toMinor(paypalData.capture?.amount?.value), paypalData.capture?.amount?.currency_code);
    if (!amountCheck.ok) {
      const at = new Date().toISOString();
      transaction.update(orderRef, {
        paymentMismatch: { ...amountCheck, provider: "paypal", captureId: paypalData.captureId || null, at },
        activity: [...(order.activity || []), { type: "event", message: `PayPal capture did not match the order total (expected ${amountCheck.expected.minor} ${amountCheck.expected.currency}, got ${amountCheck.paid.minor} ${amountCheck.paid.currency}). Not marked paid — review in PayPal.`, createdAt: at }],
        updatedAt: at,
      });
      console.error(`PayPal amount mismatch on order ${orderId}`, amountCheck);
      return;
    }

    // PayPal sandbox capture: a rehearsal — test order, no stock, discount or revenue.
    const sandbox = order.paypalMode === "test";
    const books = sandbox ? new Map() : await readBooks(transaction, db, order.items);
    let discountRef = null;
    let discountDoc = null;
    if (order.appliedDiscount?.id && !sandbox) {
      discountRef = db.collection("discounts").doc(order.appliedDiscount.id);
      discountDoc = await transaction.get(discountRef);
    }
    const giftCards = sandbox ? new Map() : await readGiftCards(transaction, db, chargedRedemptions(order));
    const now = new Date().toISOString();
    if (!sandbox && !settleGiftCards(transaction, orderRef, orderId, order, giftCards, "PayPal", now)) {
      transaction.update(orderRef, { paypalCaptureId: paypalData.captureId || null });
      return;
    }
    transaction.update(orderRef, {
      paymentStatus: "paid", fulfillmentStatus: "paid", status: "open",
      ...(sandbox ? { isTest: true, sandboxPayment: true } : {}),
      paidAt: now, updatedAt: now, downloadToken: crypto.randomBytes(32).toString("hex"),
      paypalCaptureId: paypalData.captureId || null,
      paypalPayerId: paypalData.payerId || null,
      paypalTransactionId: paypalData.transactionId || paypalData.captureId || null,
      paypalCaptureStatus: paypalData.captureStatus || "COMPLETED",
      paypalCapture: paypalData.capture || null,
      activity: [...(order.activity || []), { type: "event", message: "Payment completed (verified PayPal capture)", createdAt: now }],
    });
    if (!sandbox && writeStock(transaction, db, order.items, books, -1, now)) transaction.update(orderRef, { oversold: true });
    if (discountRef && discountDoc?.exists) {
      transaction.update(discountRef, { usageCount: (discountDoc.data().usageCount || 0) + 1, updatedAt: now });
      if (discountUsedUp(discountDoc.data())) transaction.update(orderRef, { discountOverLimit: true });
    }
    paidTotal = sandbox ? null : Number(order.total) || 0;
  });
  await releaseStockForOrder(db, orderId);
  if (paidTotal !== null) {
    const today = new Date().toISOString().split("T")[0];
    await db.collection("analytics").doc(today).set({
      date: today,
      orders: admin.firestore.FieldValue.increment(1),
      revenue: admin.firestore.FieldValue.increment(paidTotal),
    }, { merge: true });
  }
  return paidTotal !== null || (await orderRef.get()).data()?.paymentStatus === "paid";
}

exports.createPayPalOrder = onBrowserRequest(
  // SHIPPO_API_TOKEN: live carrier rates are re-priced here; an undeclared secret reads as empty.
  { secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, SHIPPO_API_TOKEN, STRIPE_SECRET_KEY] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!(await hitLimit(db, "paypal", req, LIMITS.paypal))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });
    try {
      const { orderId, currency: requestedCurrency, returnUrl } = req.body || {};
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });
      const currency = checkoutCurrencyOf(requestedCurrency);
      if (!currency) return res.status(400).json({ error: "Unsupported currency." });
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) return res.status(404).json({ error: "Order not found" });
      const order = orderDoc.data();
      if (!canViewOrder(order, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
      const refusal = checkoutRefusal(order);
      if (refusal === "paid") return res.status(409).json({ error: "Order is already paid" });
      if (refusal) return res.status(409).json({ error: "This order was cancelled. Please start a new order from your bag.", code: "order_closed" });
      // Before anything is re-priced or held: the shopper's earlier attempt may already be paid.
      if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, order.customer?.email, orderId, order.items))) return;
      let priced;
      try {
        priced = await recalculateOrder(orderRef, order, currency, orderId);
      } catch (pricingErr) {
        return res.status(400).json({ error: pricingErr.message, ...(pricingErr.code ? { code: pricingErr.code } : {}) });
      }
      if (!(priced.convertedTotal > 0)) return res.status(400).json({ error: "Your gift card covers this order. Review your bag and place the order again.", code: "nothing_to_charge" });
      const config = await getPayPalConfig();
      if (!config.testMode) {
        try {
          // Priced lines (with box-set parts), not the browser's lines.
          await reserveCheckout(orderId, priced.items, order, priced.giftCardRedemptions, config.testMode, req);
        } catch (holdErr) {
          if (holdErr instanceof StockHoldError) return res.status(409).json({ error: holdErr.message, code: holdErr.code });
          if (holdErr instanceof GiftCardError) return res.status(409).json({ error: holdErr.message, code: "gift_card_rejected" });
          throw holdErr;
        }
      }
      let checkoutBase = `${req.headers.origin || "http://localhost:5173"}/checkout`;
      if (typeof returnUrl === "string" && ALLOWED_ORIGINS.some(origin => returnUrl === origin || returnUrl.startsWith(`${origin}/`))) checkoutBase = returnUrl;
      const joiner = checkoutBase.includes("?") ? "&" : "?";
      const paypalOrder = await paypalRequest(config, "/v2/checkout/orders", {
        method: "POST",
        // The request id includes the amount: a retry with a new total must not get the old PayPal order back.
        headers: { "PayPal-Request-Id": paypalCreateRequestId(orderId, currency, priced.convertedTotal) },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: orderId,
            custom_id: orderId,
            invoice_id: orderId,
            amount: { currency_code: currency.toUpperCase(), value: priced.convertedTotal.toFixed(2) },
          }],
          payment_source: { paypal: { experience_context: {
            user_action: "PAY_NOW",
            return_url: `${checkoutBase}${joiner}paypal_return=true&order_id=${encodeURIComponent(orderId)}`,
            cancel_url: `${checkoutBase}${joiner}canceled=true&order_id=${encodeURIComponent(orderId)}`,
          } } },
        }),
      });
      const approvalUrl = paypalOrder.links?.find(link => link.rel === "payer-action" || link.rel === "approve")?.href;
      await orderRef.update({
        paymentMethod: "PayPal", paypalOrderId: paypalOrder.id, paypalOrderStatus: paypalOrder.status,
        paypalCurrency: currency.toUpperCase(),
        paypalMode: config.testMode ? "test" : "live",
        // Capture marks the order paid only for exactly this amount and currency.
        expectedAmountMinor: toMinor(priced.convertedTotal.toFixed(2)), expectedCurrency: currency,
        chargedGiftCards: priced.giftCardRedemptions,
        updatedAt: new Date().toISOString(),
      });
      // The amount PayPal will ask for, so checkout can show a changed total before sending the shopper there.
      res.json({ orderToken: paypalOrder.id, approvalUrl, amount: toMinor(priced.convertedTotal.toFixed(2)), currency: String(currency).toLowerCase() });
    } catch (err) {
      console.error("PayPal order creation failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);

exports.capturePayPalOrder = onBrowserRequest(
  { secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!(await hitLimit(db, "paypal", req, LIMITS.paypal))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });
    try {
      const { orderId, paypalOrderId } = req.body || {};
      if (!orderId || !paypalOrderId) return res.status(400).json({ error: "Missing order identifiers" });
      const orderDoc = await db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists || orderDoc.data().paypalOrderId !== paypalOrderId) return res.status(400).json({ error: "PayPal order mismatch" });
      // The PayPal order id (checked above) is the proof here: it only reaches a browser through
      // PayPal's own approval redirect, which may land in a new tab without this tab's order key.
      // Capturing can only complete the shop's own order; it reveals nothing about it.
      if (orderDoc.data().paymentStatus === "paid") return res.json({ paid: true });
      // A cancelled or refunded order must not take the shopper's money.
      if (checkoutRefusal(orderDoc.data()) === "closed") return res.status(409).json({ error: "This order was cancelled. Your payment was not taken.", code: "order_closed" });
      if (!await reserveForConfirmedPayment(orderId, "PayPal", paypalOrderId)) return res.status(409).json({ error: "Stock is no longer available. Your payment was not taken.", code: "stock_unavailable" });
      const config = await getPayPalConfig();
      // Capture in the PayPal account the order was created in, even if the shop switched
      // sandbox/live while the shopper was approving (same rule as refunds).
      if (orderDoc.data().paypalMode === "test") config.testMode = true;
      else if (orderDoc.data().paypalMode === "live") config.testMode = false;
      const captured = await paypalRequest(config, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
        // One id per PayPal order: a new PayPal order (new total, new attempt) gets its own capture.
        method: "POST", headers: { "PayPal-Request-Id": `capture-${orderId}-${paypalOrderId}` }, body: "{}",
      });
      const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
      if (captured.status !== "COMPLETED" || capture?.status !== "COMPLETED") throw new Error("PayPal capture has not completed.");
      const markedPaid = await markOrderPaidFromPayPal(orderId, {
        paypalOrderId, captureId: capture.id, transactionId: capture.id,
        payerId: captured.payer?.payer_id || null, captureStatus: capture.status, capture,
      });
      res.json({ paid: markedPaid === true, paymentReview: markedPaid !== true });
    } catch (err) {
      console.error("PayPal capture failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);

exports.paypalWebhook = onRequest(
  { secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    try {
      const config = await getPayPalConfig();
      const verification = await paypalRequest(config, "/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
          auth_algo: req.headers["paypal-auth-algo"], cert_url: req.headers["paypal-cert-url"],
          transmission_id: req.headers["paypal-transmission-id"], transmission_sig: req.headers["paypal-transmission-sig"],
          transmission_time: req.headers["paypal-transmission-time"], webhook_id: PAYPAL_WEBHOOK_ID.value(),
          webhook_event: req.body,
        }),
      });
      if (verification.verification_status !== "SUCCESS") return res.status(400).send("Invalid PayPal webhook signature");
      const eventRef = db.collection("payment-webhook-events").doc(`paypal-${req.body.id}`);
      if ((await eventRef.get()).exists) return res.json({ received: true, duplicate: true });
      if (req.body.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const capture = req.body.resource;
        const orderId = capture.custom_id || capture.invoice_id;
        const paypalOrderId = capture.supplementary_data?.related_ids?.order_id;
        if (orderId && paypalOrderId) await markOrderPaidFromPayPal(orderId, {
          paypalOrderId, captureId: capture.id, transactionId: capture.id,
          payerId: capture.supplementary_data?.related_ids?.payer_id || null,
          captureStatus: capture.status, capture,
        });
      }
      const reversedCaptureId = paypalReversalCaptureId(req.body);
      if (reversedCaptureId) {
        const match = await db.collection("orders").where("paypalCaptureId", "==", reversedCaptureId).limit(1).get();
        if (!match.empty) {
          const refund = req.body.resource || {};
          const fullAmount = req.body.event_type !== "PAYMENT.CAPTURE.REFUNDED";
          const order = match.docs[0].data();
          // Running total across every PayPal refund of this capture, not just this one.
          const refundedMinor = fullAmount ? (refund.amount?.value != null ? toMinor(refund.amount.value) : null) : paypalRefundedTotalMinor(order, refund);
          const orderMinor = Number(order.expectedAmountMinor) || null;
          if (fullAmount || refundedMinor == null || orderMinor == null || refundedMinor >= orderMinor) {
            await applyOrderRefund(match.docs[0].id, {
              provider: "paypal", refundId: refund.id || null, amountMinor: refundedMinor, currency: refund.amount?.currency_code || null,
              status: "succeeded", actor: "paypal", note: req.body.event_type === "PAYMENT.CAPTURE.REFUNDED" ? "refunded in PayPal" : "payment reversed by PayPal",
            });
          } else {
            const now = new Date().toISOString();
            await match.docs[0].ref.update({
              refundedAmountMinor: refundedMinor, partiallyRefunded: true, updatedAt: now,
              ...(refund.id ? { paypalRefundIds: admin.firestore.FieldValue.arrayUnion(refund.id) } : {}),
              activity: admin.firestore.FieldValue.arrayUnion({ type: "event", message: `Partial refund in PayPal: ${(refundedMinor / 100).toFixed(2)} ${refund.amount?.currency_code || ""} refunded so far. Order stays paid — adjust what you ship.`, createdAt: now }),
            });
          }
        }
      }
      await eventRef.set({ eventType: req.body.event_type, paypalEventId: req.body.id, processedAt: new Date().toISOString(), expiresAt: retainFor(90) });
      res.json({ received: true });
    } catch (err) {
      console.error("PayPal webhook failed:", err);
      res.status(500).send("Webhook processing failed.");
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 1. HTTP Endpoint: Create Stripe Checkout Session (Secure)
// ──────────────────────────────────────────────────────────────
exports.createStripeCheckoutSession = onBrowserRequest(
  // SHIPPO_API_TOKEN: live carrier rates are re-priced here; STRIPE_WEBHOOK_SECRET: webhook health reports it.
  // RESEND_API_KEY: Admin › Gift cards emails codes through this function (Gmail first, Resend fallback).
  { secrets: [STRIPE_SECRET_KEY, SHIPPO_API_TOKEN, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (req.body?.action === "newsletterSignup") return handleNewsletterSignup(req, res);
    if (req.body?.action === "newsletterConfirm") return handleNewsletterConfirm(req, res);
    if (req.body?.action === "status") return handleCheckoutStatus(req, res);
    if (req.body?.action === "track") return handleTrackOrder(req, res);
    if (req.body?.action === "trackingLink") return handleTrackingLink(req, res);
    if (req.body?.action === "registerPaymentDomain") return handleRegisterPaymentDomain(req, res);
    if (req.body?.action === "webhookHealth") return handleWebhookHealth(req, res);
    if (req.body?.action === "giftCardAdmin") return handleGiftCardAdmin(req, res);
    if (req.body?.action === "inventoryLink") return handleInventoryLinkAdmin(req, res);
    if (req.body?.action === "backupNow") return handleBackupNow(req, res);
    if (req.body?.action === "restockRefunded") return handleRestockRefunded(req, res);
    if (req.body?.action === "backups") return handleBackups(req, res);
    if (req.body?.action === "aiWrite") return handleAiWriteRequest(req, res);
    if (req.body?.action === "cancelOrder") return handleCancelOrder(req, res);
    if (req.body?.action === "resolvePaymentMismatch") return handleResolveMismatch(req, res);
    if (req.body?.action === "orderRequest") return handleOrderRequest(req, res);
    if (req.body?.action === "privacyRequest") return handlePrivacyRequest(req, res);
    if (req.body?.action === "privacyExport" || req.body?.action === "privacyErase") return handlePrivacyAdmin(req, res);
    if (req.body?.action === "verifyStripeKeys") return handleVerifyStripeKeys(req, res);
    // Payment creation is limited per visitor so bots can't test stolen cards here.
    if (!(await hitLimit(db, "checkout", req, LIMITS.checkout))) {
      res.status(429).json({ error: "Too many checkout attempts. Please wait a few minutes and try again." });
      return;
    }
    if (req.body?.action === 'createManualLocalOrder') {
      try {
        const source = req.body.orderDraft;
        if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Order details are required.');
        if (!Array.isArray(source.items) || !source.items.length || source.items.length > 50) throw new Error('Choose between 1 and 50 books.');
        const items = source.items.map(item => {
          if (typeof item?.id !== 'string' || !item.id || item.id.length > 160 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error('Check the selected books and quantities.');
          // Paid add-ons and gift-card recipient details ride along; priceOrder validates and prices them from the catalog.
          return {
            id: item.id,
            variantId: typeof item.variantId === 'string' ? item.variantId.slice(0, 160) : null,
            quantity: item.quantity,
            ...(Array.isArray(item.addOns) && item.addOns.length ? { addOns: item.addOns.slice(0, 12) } : {}),
            ...(item.giftCardDetails && typeof item.giftCardDetails === 'object' && !Array.isArray(item.giftCardDetails) ? { giftCardDetails: item.giftCardDetails } : {}),
          };
        });
        const contact = source.customer || {};
        if (typeof contact.name !== 'string' || !contact.name.trim() || typeof contact.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error('Customer name and email are required.');
        const cleanAddress = value => Object.fromEntries(['street', 'unit', 'city', 'state', 'zip', 'country'].map(key => [key, typeof value?.[key] === 'string' ? value[key].trim().slice(0, 200) : '']));
        // Every manual order (pickup, local delivery, shipped or e-book only) is priced here from the catalog.
        const selection = source.fulfillmentSelection == null ? null : source.fulfillmentSelection;
        if (selection && (!['pickup', 'local_delivery', 'shipping'].includes(selection.method) || typeof selection.optionId !== 'string')) throw new Error('Choose a delivery option.');
        const settingsDoc = await db.collection('settings').doc('website').get();
        const settings = settingsDoc.data() || {};
        const manual = (settings.payments?.manualMethods || []).find(method => method.id === req.body.manualMethodId && method.enabled === true);
        if (!manual) throw new Error('That payment method is no longer available.');
        const now = new Date().toISOString();
        const order = {
          customer: { name: contact.name.trim().slice(0, 200), email: contact.email.trim().toLowerCase().slice(0, 320), phone: typeof contact.phone === 'string' ? contact.phone.trim().slice(0, 80) : '', address: cleanAddress(contact.address), billingAddress: cleanAddress(contact.billingAddress) },
          items,
          ...(selection ? { fulfillmentSelection: { method: selection.method, optionId: selection.optionId.slice(0, 200) } } : {}),
          ...(typeof source.shippingMethod === 'string' && source.shippingMethod ? { shippingMethod: source.shippingMethod.slice(0, 200) } : {}),
          ...(typeof source.cartId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(source.cartId) ? { cartId: source.cartId } : {}),
          referralSource: typeof source.referralSource === 'string' ? source.referralSource.slice(0, 120) : 'direct',
          appliedDiscount: typeof source.appliedDiscount?.code === 'string' ? { code: source.appliedDiscount.code.slice(0, 100) } : null,
          ...(typeof source.orderNote === 'string' ? { orderNote: source.orderNote.slice(0, 500) } : {}),
          ...(typeof source.locale === 'string' ? { locale: source.locale.slice(0, 20) } : {}),
        };
        // Gift cards are taken when the payment is confirmed, which a manual payment may be days later.
        if (Array.isArray(source.giftCards) && source.giftCards.length) throw new Error('Gift cards can be used when paying by card or PayPal, or when they cover the whole order.');
        const priced = await recalculateOrder({ update: async () => {} }, order, checkoutCurrencyOf(req.body.currency) || 'cad');
        const { convertedTotal, settings: ignoredSettings, testMode: ignoredTestMode, ...trusted } = priced;
        const orderId = crypto.randomBytes(12).toString('hex').toUpperCase();
        const trackingKey = crypto.randomBytes(32).toString('hex');
        // The order is placed: stop the "you left something in your bag" reminder now, not
        // only when the thank-you page loads (it may never load) or payment arrives days later.
        for (const cartKey of [order.cartId, `active_${order.customer.email}`].filter(Boolean)) {
          await db.collection('abandoned-carts').doc(cartKey).update({ recovered: true, recoveredAt: now }).catch(() => {});
        }
        if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, order.customer.email, orderId, items))) return;
        // Hold the priced lines (box-set parts and the free gift included), not the browser's raw list.
        const heldItems = Array.isArray(trusted.items) && trusted.items.length ? trusted.items : items;
        await reserveStock(db, orderId, heldItems, Date.now(), holdOwner(order), { limits: true, ip: clientIpOf(req), holdLimits: await loadHoldLimits() });
        try {
          await db.collection('orders').doc(orderId).create({ ...order, ...trusted, orderId, trackingKey, paymentStatus: 'pending', status: 'pending_payment', paymentMethod: manual.name, paymentInstructions: manual.instructions || '', createdAt: now, updatedAt: now, activity: [{ type: 'event', message: 'Order created', createdAt: now }] });
        } catch (createErr) {
          await releaseStock(db, orderId, heldItems);
          throw createErr;
        }
        return res.status(200).json({ orderId, trackingKey, shipping: trusted.shipping, tax: trusted.tax, total: trusted.total, fulfillment: trusted.fulfillment });
      } catch (err) {
        return res.status(400).json({ error: publicErrorMessage(err, "We could not place this order. Please check your details and try again."), ...(["hold_limit", "store_closed"].includes(err.code) ? { code: err.code } : {}) });
      }
    }

    // One-click unsubscribe from marketing email (the link in abandoned-cart reminders).
    if (req.body?.action === "unsubscribe") {
      const email = normMarketingEmail(req.body.email);
      const key = (await readAdminSecret("marketing")).unsubscribeKey;
      if (!email || !tokenMatches(email, String(req.body.token || ""), key)) return res.status(400).json({ error: "invalid_link" });
      await db.collection("marketing-optout").doc(optOutId(email)).set({ at: new Date().toISOString(), source: "email-link" });
      // The same link also takes the address off the newsletter list (the opt-out record above is kept as proof).
      await db.collection("newsletter").doc(email).delete().catch(() => {});
      return res.status(200).json({ unsubscribed: true });
    }

    // A $0 order (100% discount, free e-book): priced here from the catalog, and completed
    // only when the server's own total is zero. Nothing is charged.
    if (req.body?.action === "completeFreeOrder") {
      try {
        const freeId = req.body.orderId;
        if (typeof freeId !== "string" || !freeId || freeId.includes("/")) return res.status(400).json({ error: "Missing orderId" });
        const freeRef = db.collection("orders").doc(freeId);
        const freeDoc = await freeRef.get();
        if (!freeDoc.exists) return res.status(404).json({ error: "Order not found" });
        const freeOrder = freeDoc.data();
        if (!canViewOrder(freeOrder, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
        if (freeOrder.paymentStatus === "paid") return res.status(200).json({ paid: true });
        if (freeOrder.paymentStatus !== "unpaid" || freeOrder.paymentMethod !== "Free" || freeOrder.isTest === true || checkoutRefusal(freeOrder)) {
          return res.status(400).json({ error: "This order can't be completed without payment." });
        }
        // The shopper's own earlier attempt gives back its holds first, so it can't block this one.
        if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, freeOrder.customer?.email, freeId, freeOrder.items))) return;
        const priced = await recalculateOrder(freeRef, freeOrder, checkoutCurrencyOf(req.body.currency) || "cad", freeId);
        // A test-mode gift card is a rehearsal: it can't pay for a real order on its own.
        if (priced.testCardUsed) return res.status(400).json({ error: "Gift card error: This test gift card can only be used with a test card payment.", code: "gift_card_rejected" });
        if (Math.round(Number(priced.total) * 100) !== 0) {
          return res.status(400).json({ error: "This order has a total to pay. Review your bag and choose a payment method.", code: "total_changed" });
        }
        const paidNow = await completeOrderWithoutCard(freeId, priced.giftCardAmount > 0 ? "Order paid in full with a gift card." : "Free order completed — nothing to charge.", { req });
        if (!paidNow) return res.status(409).json({ error: "Your gift card balance changed. Review your order and try again.", code: "gift_card_rejected" });
        return res.status(200).json({ paid: true });
      } catch (err) {
        return res.status(400).json({ error: publicErrorMessage(err, "We could not complete this order. Please check your details and try again."), ...(err.code && /^(gift_card|discount_|hold_limit|store_closed)/.test(err.code) ? { code: err.code.startsWith("gift_card") ? "gift_card_rejected" : err.code } : {}) });
      }
    }

    const { orderId, currency: reqCurrency, returnUrl, embedded, paymentElement } = req.body;
    const checkoutCurrency = checkoutCurrencyOf(reqCurrency);
    if (!checkoutCurrency) {
      res.status(400).json({ error: "Unsupported currency." });
      return;
    }
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }

    try {
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const order = orderDoc.data();
      if (!canViewOrder(order, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
      if (order.isTest === true) {
        res.status(400).json({ error: "Test orders cannot enter checkout." });
        return;
      }
      const refusal = checkoutRefusal(order);
      if (refusal === "paid") {
        res.status(400).json({ error: "Order has already been paid" });
        return;
      }
      if (refusal) {
        res.status(409).json({ error: "This order was cancelled. Please start a new order from your bag.", code: "order_closed" });
        return;
      }

      // 1–4. Server pricing: catalog items, add-ons, box sets, discount (code or automatic),
      //      shipping, tax and gift cards. Client-supplied prices are never trusted.
      let priced;
      try {
        priced = await priceOrder(order, { orderId });
      } catch (pricingErr) {
        if (pricingErr instanceof PricingError) return res.status(400).json({ error: pricingErr.message, ...(pricingErr.code ? { code: pricingErr.code } : {}) });
        throw pricingErr;
      }
      const { items, settings, appliedDiscount, fulfillment, shippingEstimate } = priced;
      const subtotalTrusted = priced.subtotal;
      const discountAmount = priced.discount;
      const shippingCost = priced.shipping;
      const shippingMethodCharged = priced.shippingMethod;
      const taxCost = priced.tax;
      const giftCardAmount = priced.giftCardAmount;
      const giftCardRedemptions = priced.giftCardRedemptions;
      const finalTotal = priced.total;
      const rates = await getExchangeRates();
      const exchangeRate = rates[checkoutCurrency] || FALLBACK_RATES[checkoutCurrency] || 1.0;

      // The connecting address is the right-most non-proxy hop (clientIpOf), never the client-typed left-most one. The
      // country comes from the platform's own geo header only; no shopper address is sent to a third-party lookup (#109).
      const clientIp = clientIpOf(req);
      const ipCountry = serverGeoCountry(req);

      const shippingCountryCode = getCountryCode((fulfillment?.method === 'pickup' ? fulfillment.address : order.customer?.address)?.country || order.customer?.billingAddress?.country || '');
      const ipCountryMatchesShipping = !ipCountry || ipCountry.toUpperCase() === shippingCountryCode.toUpperCase();
      const testMode = settings.payments?.testMode || false;
      const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);

      // 5. Stripe checkout parameters
      const stripeSecret = testMode 
        ? stripeSettings.testSecretKey 
        : (stripeSettings.secretKey || STRIPE_SECRET_KEY.value());

      if (!stripeSecret) {
        throw new Error(testMode 
          ? "Stripe Test Secret Key is not configured in settings." 
          : "Stripe Secret Key is not configured.");
      }

      const stripe = new Stripe(stripeSecret);
      // The discount is spread over the discountable lines; gift cards are always face value.
      const discountableSubtotal = items.filter(item => item.giftCard !== true).reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discountFactor = discountableSubtotal > 0 ? (discountableSubtotal - discountAmount) / discountableSubtotal : 1;

      const lineItems = items.map(item => {
        const convertedPrice = item.price * exchangeRate;
        const itemPriceInCents = Math.round(convertedPrice * (item.giftCard === true ? 1 : discountFactor) * 100);
        let title = item.title;
        if (item.variantName) {
          title += ` (${item.variantName})`;
        }
        return {
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: title,
              images: item.photoUrl ? [item.photoUrl] : [],
            },
            unit_amount: itemPriceInCents,
          },
          quantity: item.quantity,
        };
      });

      if (shippingCost > 0) {
        lineItems.push({
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: "Shipping & Handling",
            },
            unit_amount: Math.round(shippingCost * exchangeRate * 100),
          },
          quantity: 1,
        });
      }

      if (taxCost > 0) {
        lineItems.push({
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: "Estimated Sales Tax",
            },
            unit_amount: Math.round(taxCost * exchangeRate * 100),
          },
          quantity: 1,
        });
      }

      // Gift cards pay part of the order: the card is charged only what is left.
      const giftCardMinor = Math.round(giftCardAmount * exchangeRate * 100);
      const chargeMinor = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0) - giftCardMinor;
      if (giftCardMinor > 0 && !paymentElement) {
        res.status(400).json({ error: "Gift cards can be used with the card form on the checkout page.", code: "gift_card_rejected" });
        return;
      }
      if (giftCardMinor > 0 && chargeMinor < 1) {
        res.status(400).json({ error: "Your gift card covers this order. Review your bag and place the order again.", code: "nothing_to_charge" });
        return;
      }

      // The shopper's earlier attempt already has their money: refuse before this order is touched.
      if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, order.customer?.email, orderId, order.items))) return;

      // A retry on the same order replaces its earlier unfinished PaymentIntent, so two tabs can't both pay.
      // Checked before the order is re-priced: a refused retry must leave the amounts (and gift cards)
      // of the payment that is still in progress exactly as they were.
      if (paymentElement) {
        if (order.stripePaymentIntentId) {
          try {
            const previous = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
            if (["succeeded", "processing", "requires_capture"].includes(previous.status)) {
              res.status(409).json({ error: "This order already has a payment in progress. Check your order status before paying again.", code: "payment_in_progress" });
              return;
            }
            if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(previous.status)) {
              try {
                await stripe.paymentIntents.cancel(previous.id);
              } catch (cancelErr) {
                // A simultaneous request may have cancelled it first; only a still-live intent blocks a new one.
                const again = await stripe.paymentIntents.retrieve(previous.id);
                if (again.status !== "canceled") throw cancelErr;
              }
            }
          } catch (err) {
            // Unsure whether the earlier payment is still live: never open a second one beside it.
            console.warn(`Could not settle previous PaymentIntent for ${orderId}:`, err.message);
            res.status(409).json({ error: "This order already has a payment in progress. Check your order status before paying again.", code: "payment_in_progress" });
            return;
          }
        }
      }

      await orderRef.update({
        // Lower-case so "one use per customer" cannot be dodged by changing the email's capitalisation.
        ...(order.customer?.email ? { "customer.email": String(order.customer.email).trim().toLowerCase() } : {}),
        items: items.map(({ shippingProfileId, ...rest }) => rest),
        subtotal: subtotalTrusted,
        discount: discountAmount,
        appliedDiscount: appliedDiscount,
        shipping: shippingCost,
        ...(shippingMethodCharged ? { shippingMethod: shippingMethodCharged } : {}),
        shippingEstimate,
        fulfillment,
        tax: taxCost,
        giftCardAmount,
        giftCardRedemptions,
        total: finalTotal,
        checkoutCurrency: checkoutCurrency.toUpperCase(),
        exchangeRate: exchangeRate,
        stripeMode: testMode ? "test" : "live",
        clientIp: clientIp,
        ipCountry: ipCountry || null,
        ipCountryMatchesShipping: ipCountryMatchesShipping,
        updatedAt: new Date().toISOString()
      });

      // Sandbox sessions rehearse payment only; they do not reserve or consume live stock or gift cards.
      if (!testMode) {
        try {
          await reserveCheckout(orderId, items, order, giftCardRedemptions, testMode, req);
        } catch (holdErr) {
          if (holdErr instanceof StockHoldError || holdErr instanceof GiftCardError) {
            res.status(409).json({ error: holdErr.message, code: holdErr instanceof GiftCardError ? "gift_card_rejected" : holdErr.code });
            return;
          }
          throw holdErr;
        }
      }

      // Payment Element on the checkout page: charge the same server-priced
      // total through a PaymentIntent instead of a Checkout Session.
      if (paymentElement) {
        const amount = chargeMinor;
        const intent = await stripe.paymentIntents.create({
          amount,
          currency: checkoutCurrency,
          automatic_payment_methods: { enabled: true },
          // No receipt_email: the shop's own "Order confirmed" email is the customer's
          // one confirmation (Stripe's receipt duplicated it).
          description: `Order ${orderId}`,
          metadata: { order_id: orderId, checkout: "payment_element" },
        }, { idempotencyKey: stripeIntentKey(orderId, amount, checkoutCurrency, order.stripePaymentIntentId) });
        // The webhook marks the order paid only for exactly this amount and currency.
        await orderRef.update({ stripePaymentIntentId: intent.id, expectedAmountMinor: amount, expectedCurrency: checkoutCurrency, chargedGiftCards: giftCardRedemptions, updatedAt: new Date().toISOString() });
        // stripeMode lets the browser check its card form uses the same Stripe mode.
        res.status(200).json({ clientSecret: intent.client_secret, amount, currency: checkoutCurrency, stripeMode: testMode ? "test" : "live" });
        return;
      }

      // The storefront passes its own checkout URL (it may live under a
      // sub-path, e.g. GitHub Pages). Only accept it if it belongs to an
      // allowed origin; otherwise fall back to origin + /checkout.
      let checkoutBase = `${req.headers.origin || "http://localhost:5173"}/checkout`;
      if (
        typeof returnUrl === "string" &&
        ALLOWED_ORIGINS.some(o => returnUrl === o || returnUrl.startsWith(`${o}/`))
      ) {
        checkoutBase = returnUrl;
      }
      const joiner = checkoutBase.includes("?") ? "&" : "?";

      await orderRef.update({
        expectedAmountMinor: lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0),
        expectedCurrency: checkoutCurrency,
        chargedGiftCards: giftCardRedemptions,
        updatedAt: new Date().toISOString(),
      });
      // Same order, amount and minute = the same session (a double click can't open two).
      const sessionAmount = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
      const sessionMinute = Math.floor(Date.now() / 60000);
      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: "payment",
        client_reference_id: orderId,
        customer_email: order.customer.email,
        // Let Stripe select eligible methods from Dashboard configuration.
        // Delayed methods remain unpaid until the success webhook settles them.
        payment_intent_data: {
          metadata: { order_id: orderId },
        },
        // Shorten the unpaid-stock-hold window: session dies after 30 minutes.
        expires_at: sessionMinute * 60 + 31 * 60,
        // Embedded mode keeps the card form on the storefront's checkout page;
        // the webhook still receives checkout.session.completed either way.
        ...(embedded
          ? {
            ui_mode: "embedded",
            return_url: `${checkoutBase}${joiner}success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
          }
          : {
            success_url: `${checkoutBase}${joiner}success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${checkoutBase}${joiner}canceled=true`,
          }),
      }, { idempotencyKey: `cs-${orderId}-${checkoutCurrency}-${sessionAmount}-${embedded ? "e" : "h"}-${sessionMinute}` });

      // Save the session now so a missed webhook can still be recovered from the order alone.
      await orderRef.update({ stripeCheckoutSessionId: session.id, updatedAt: new Date().toISOString() });

      res.status(200).json({
        sessionId: session.id,
        url: session.url || null,
        clientSecret: embedded ? session.client_secret : null,
      });
    } catch (err) {
      console.error("Stripe Session Creation Failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);

// Read-only status check for the checkout return page. Only reports on a
// session that belongs to the given order, and never marks anything paid —
// the webhook stays the single source of truth for payment.
// Admin-only: register the storefront domain with Stripe so Apple Pay and
// Google Pay appear in the card form. Only allowed origins can be registered.
// Served through createStripeCheckoutSession (body.action) so no new public
// function needs deploying — the CI deploy account can't set IAM on new ones.
const STRIPE_WEBHOOK_URL = "https://us-central1-lyricalmyrical-web-v2.cloudfunctions.net/stripeWebhook";

// Stripe signs every delivery with "t=<timestamp>,v1=<signature>[,…]".
function looksLikeStripeSignature(sig) {
  return typeof sig === "string" && /(^|,)t=\d+/.test(sig) && /(^|,)v1=[0-9a-f]+/.test(sig);
}

// A delivery that verified but failed while updating the order (Stripe will retry):
// shown in Webhook health so "Working" never hides a failing handler.
async function recordWebhookProcessingFailure(event, err) {
  await db.collection("adminSecrets").doc("stripeWebhookStatus").set({
    lastProcessingFailureAt: new Date().toISOString(),
    lastProcessingFailure: `${event?.type || "event"}: ${String(err?.message || err).slice(0, 300)}`,
  }, { merge: true }).catch(() => {});
}

// Admin: "Test connection" — does each saved Stripe secret key work, which Stripe
// account and mode is it, and do the publishable keys match their mode?
async function handleVerifyStripeKeys(req, res) {
  if (!await requireAdmin(req, res)) return;
  try {
    const settingsDoc = await db.collection("settings").doc("website").get();
    const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
    const stripeSettings = settings.payments?.stripe || {};
    const priv = await readAdminSecret("stripe");
    const results = {};
    for (const mode of ["live", "test"]) {
      const stored = mode === "live" ? priv.secretKey : priv.testSecretKey;
      let fallback = "";
      if (mode === "live" && !stored) { try { fallback = STRIPE_SECRET_KEY.value() || ""; } catch { fallback = ""; } }
      const key = stored || fallback;
      const publishable = String((mode === "live" ? stripeSettings.publicKey : stripeSettings.testPublicKey) || "").trim();
      const r = {
        source: stored ? "stored" : fallback ? "functions" : "none",
        publishableKeyMode: /^pk_live_/.test(publishable) ? "live" : /^pk_test_/.test(publishable) ? "test" : publishable ? "invalid" : "missing",
      };
      if (key) {
        r.keyMode = /_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : "unknown";
        try {
          const account = await new Stripe(key).accounts.retrieve();
          Object.assign(r, { ok: true, accountId: account.id, accountName: account.settings?.dashboard?.display_name || account.business_profile?.name || null, chargesEnabled: account.charges_enabled !== false });
        } catch (err) {
          // Restricted keys may not read the account: a balance read still proves the key works.
          try { await new Stripe(key).balance.retrieve(); Object.assign(r, { ok: true, accountId: null }); }
          catch (err2) { Object.assign(r, { ok: false, error: err2?.message || err?.message || "Stripe rejected the key." }); }
        }
      }
      results[mode] = r;
    }
    const activeMode = settings.payments?.testMode ? "test" : "live";
    const sameAccount = results.live.accountId && results.test.accountId ? results.live.accountId === results.test.accountId : null;
    res.status(200).json({ activeMode, ...results, sameAccount });
  } catch (err) {
    console.error("Stripe key check failed:", err);
    res.status(500).json({ error: err.message });
  }
}

// Admin: checks (and with fix: true repairs) the Stripe webhook endpoint for the
// mode the shop is using. Repair adds missing events, re-enables a disabled
// endpoint, or creates the endpoint and saves its signing secret privately in
// adminSecrets/stripeWebhook so stripeWebhook can verify it.
// Admin › Gift cards: issue, disable/enable, adjust a balance or resend the email. The browser
// can read gift cards (admin only) but never write them; every change goes through here.
// Inventory › Inventory app link (docs/INVENTORY_LINK.md). Admin only; never a payment path.
function inventoryLinkDeps() {
  const store = require("./inventoryLinkStore");
  return { db, store, now: () => new Date() };
}
async function handleInventoryLinkAdmin(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  try {
    const { inventoryLinkAdmin } = require("./inventoryLinkAdmin");
    const { status, body } = await inventoryLinkAdmin(inventoryLinkDeps(), req.body || {}, adminUser.email || "admin");
    res.status(status).json(body);
  } catch (err) {
    console.error("inventoryLink admin failed:", err);
    res.status(500).json({ error: "The inventory app link didn't answer. Try again in a minute." });
  }
}

async function handleGiftCardAdmin(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  const body = req.body || {};
  const actor = adminUser.email || "admin";
  const now = new Date().toISOString();
  try {
    if (body.op === "issue") {
      const amountMinor = Math.floor(Number(body.amountMinor));
      if (!Number.isFinite(amountMinor) || amountMinor < 100 || amountMinor > 1000000) return res.status(400).json({ error: "Enter an amount between CA$1 and CA$10,000." });
      const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase().slice(0, 320);
      if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipientEmail)) return res.status(400).json({ error: "Check the recipient's email address." });
      const expiresOn = String(body.expiresOn || "").slice(0, 10);
      if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return res.status(400).json({ error: "Use a date for the expiry." });
      if (body.sendEmail === true && !recipientEmail) return res.status(400).json({ error: "Add the recipient's email address to send the code." });
      let code = "";
      let id = "";
      const data = {
        last4: "", initialMinor: amountMinor, balanceMinor: amountMinor, currency: "CAD", enabled: true,
        ...(expiresOn ? { expiresOn } : {}),
        recipientEmail, recipientName: String(body.recipientName || "").trim().slice(0, 100),
        senderName: String(body.senderName || "Lyricalmyrical Books").trim().slice(0, 100),
        message: String(body.message || "").trim().slice(0, 300), note: String(body.note || "").trim().slice(0, 500),
        source: "admin", issuedBy: actor, holds: {},
        history: [{ type: "issued", minor: amountMinor, actor, at: now }],
        createdAt: now, updatedAt: now,
      };
      // A fresh random code; create() refuses the (astronomically unlikely) duplicate.
      for (let attempt = 0; attempt < 3 && !id; attempt++) {
        code = newGiftCardCode();
        try {
          await db.collection("giftCards").doc(giftCardId(code)).create({ ...data, code, last4: last4(code) });
          id = giftCardId(code);
        } catch (err) {
          if (attempt === 2) throw err;
        }
      }
      let emailError = null;
      if (body.sendEmail === true) {
        try {
          await emailGiftCard(id, { ...data, code, last4: last4(code) });
        } catch (err) {
          emailError = err.message;
        }
      }
      return res.status(200).json({ id, code, last4: last4(code), ...(emailError ? { emailError } : {}) });
    }
    const id = typeof body.id === "string" && /^[a-f0-9]{40}$/.test(body.id) ? body.id : "";
    if (!id) return res.status(400).json({ error: "Missing gift card." });
    const ref = db.collection("giftCards").doc(id);
    if (body.op === "setEnabled") {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("Gift card not found.");
        const card = snap.data();
        const enabled = body.enabled === true;
        tx.update(ref, { enabled, history: withHistory(card, { type: enabled ? "enabled" : "disabled", minor: 0, actor, at: now }), updatedAt: now });
      });
      return res.status(200).json({ ok: true });
    }
    if (body.op === "adjust") {
      const delta = Math.trunc(Number(body.deltaMinor));
      const reason = String(body.reason || "").trim().slice(0, 300);
      if (!Number.isFinite(delta) || !delta || Math.abs(delta) > 1000000) return res.status(400).json({ error: "Enter an amount to add or remove." });
      if (!reason) return res.status(400).json({ error: "Add a reason for the change." });
      let balanceMinor = 0, appliedMinor = 0;
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("Gift card not found.");
        const card = snap.data();
        const before = Math.floor(Number(card.balanceMinor) || 0);
        balanceMinor = Math.max(0, before + delta);
        // The history records what really changed (the balance never goes below zero), so it always sums to the balance.
        appliedMinor = balanceMinor - before;
        tx.update(ref, { balanceMinor, history: withHistory(card, { type: "adjusted", minor: appliedMinor, ...(appliedMinor !== delta ? { requestedMinor: delta } : {}), reason, actor, at: now }), updatedAt: now });
      });
      return res.status(200).json({ ok: true, balanceMinor, appliedMinor, clamped: appliedMinor !== delta });
    }
    if (body.op === "setExpiry") {
      let expiresOn = "";
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("Gift card not found.");
        const update = expiryChange(snap.data(), body.expiresOn, { actor, reason: body.reason });
        expiresOn = update.expiresOn;
        tx.update(ref, update);
      });
      return res.status(200).json({ ok: true, expiresOn });
    }
    if (body.op === "resend") {
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Gift card not found." });
      const to = String(body.to || "").trim().toLowerCase();
      await emailGiftCard(id, snap.data(), { to });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown gift card action." });
  } catch (err) {
    console.error("giftCardAdmin failed:", err);
    return res.status(400).json({ error: err.message });
  }
}

async function handleWebhookHealth(req, res) {
  if (!await requireAdmin(req, res)) return;
  try {
    const testMode = await shopTestMode();
    const mode = testMode ? "test" : "live";
    const secret = await stripeSecretFor(mode);
    if (!secret) { res.status(400).json({ error: `Add your Stripe ${mode} secret key first.` }); return; }
    const stripe = new Stripe(secret);
    const listed = await stripe.webhookEndpoints.list({ limit: 100 });
    let report = webhookEndpointReport(listed.data, STRIPE_WEBHOOK_URL);
    const actions = [];
    // Stripe only reveals an endpoint's signing secret when it is created. If the
    // signatures keep failing, replace the endpoint so a known secret is saved.
    if (req.body?.recreate === true && report.found) {
      await stripe.webhookEndpoints.del(report.endpointId);
      report = webhookEndpointReport([], STRIPE_WEBHOOK_URL);
      actions.push("Removed the old webhook endpoint (its signing secret didn't match).");
    }
    if (req.body?.fix === true || req.body?.recreate === true) {
      if (!report.found) {
        const created = await stripe.webhookEndpoints.create({
          url: STRIPE_WEBHOOK_URL,
          enabled_events: REQUIRED_WEBHOOK_EVENTS,
          description: "Lyricalmyrical shop orders (created by Admin › Payments)",
        });
        await db.collection("adminSecrets").doc("stripeWebhook").set({ [mode]: created.secret, [`${mode}EndpointId`]: created.id, updatedAt: new Date().toISOString() }, { merge: true });
        // A fresh endpoint with a known secret: older signature failures no longer apply.
        await db.collection("adminSecrets").doc("stripeWebhookStatus").set({ lastFailureAt: null, lastFailure: null, resetAt: new Date().toISOString() }, { merge: true });
        actions.push("Created the webhook endpoint in Stripe and saved its signing secret.");
      } else {
        const update = {};
        if (report.missingEvents.length) {
          const current = (listed.data.find(e => e.id === report.endpointId)?.enabled_events) || [];
          update.enabled_events = Array.from(new Set([...current, ...report.missingEvents]));
          actions.push(`Turned on ${report.missingEvents.length} missing event${report.missingEvents.length === 1 ? "" : "s"}: ${report.missingEvents.join(", ")}.`);
        }
        if (!report.enabled) { update.disabled = false; actions.push("Re-enabled the endpoint."); }
        if (report.wrongUrl) { update.url = STRIPE_WEBHOOK_URL; actions.push("Pointed the endpoint at the shop's webhook address."); }
        if (Object.keys(update).length) await stripe.webhookEndpoints.update(report.endpointId, update);
      }
      const relisted = await stripe.webhookEndpoints.list({ limit: 100 });
      report = webhookEndpointReport(relisted.data, STRIPE_WEBHOOK_URL);
    }
    const status = (await db.collection("adminSecrets").doc("stripeWebhookStatus").get()).data() || {};
    const saved = await readAdminSecret("stripeWebhook");
    let deployedSecret = false;
    try { deployedSecret = !!STRIPE_WEBHOOK_SECRET.value(); } catch { deployedSecret = false; }
    const forMode = status[mode] || {};
    res.status(200).json({
      mode,
      url: STRIPE_WEBHOOK_URL,
      ...report,
      savedSecret: !!saved[mode],
      deployedSecret,
      // This account's own deliveries only (older records without per-mode data fall back).
      lastReceivedAt: forMode.lastReceivedAt || (status.lastMode === mode ? status.lastReceivedAt : null) || null,
      lastEventType: forMode.lastEventType || (status.lastMode === mode ? status.lastEventType : null) || null,
      lastProcessingFailureAt: status.lastProcessingFailureAt || null,
      lastProcessingFailure: status.lastProcessingFailure || null,
      lastFailureAt: status.lastFailureAt || null,
      lastFailure: status.lastFailure || null,
      actions,
    });
  } catch (err) {
    console.error("Webhook health check failed:", err);
    res.status(500).json({ error: err.message });
  }
}

async function handleRegisterPaymentDomain(req, res) {
  {
    if (!await requireAdmin(req, res)) return;
    const origin = ALLOWED_ORIGINS.find(o => o === req.body?.origin);
    if (!origin) {
      res.status(400).json({ error: "That address isn't an allowed storefront origin." });
      return;
    }
    const domainName = new URL(origin).hostname;
    if (domainName === "localhost" || domainName === "127.0.0.1") {
      res.status(400).json({ error: "Wallets can't be registered for localhost." });
      return;
    }
    try {
      const settingsDoc = await db.collection("settings").doc("website").get();
      const settings = settingsDoc.exists ? settingsDoc.data() : {};
      const testMode = settings.payments?.testMode || false;
      const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
      const stripeSecret = testMode
        ? stripeSettings.testSecretKey
        : (stripeSettings.secretKey || STRIPE_SECRET_KEY.value());
      if (!stripeSecret) throw new Error("Stripe is not configured.");
      const stripe = new Stripe(stripeSecret);
      const existing = await stripe.paymentMethodDomains.list({ domain_name: domainName, limit: 1 });
      let domain = existing.data[0];
      if (!domain) domain = await stripe.paymentMethodDomains.create({ domain_name: domainName, enabled: true });
      else domain = await stripe.paymentMethodDomains.validate(domain.id);
      res.status(200).json({
        domain: domainName,
        applePay: domain.apple_pay?.status || "unknown",
        googlePay: domain.google_pay?.status || "unknown",
      });
    } catch (err) {
      console.error("Payment domain registration failed:", err);
      res.status(500).json({ error: err.message });
    }
  }
}

// Served through createStripeCheckoutSession (body.action) so no new public
// function needs deploying — the CI deploy account can't set IAM on new ones.
// Marks a Stripe-paid order paid: stock, discount usage, download token and
// analytics, once (idempotent — a repeat sees "paid" and only refreshes the
// Stripe ids). `session` is a Checkout Session, or a PaymentIntent shaped like
// one, that the server itself fetched from Stripe or received in a signed
// webhook — never browser data. The amount and currency must match the payment
// this order was created for.
const STRIPE_WEBHOOK_AUTHORITY = Symbol("verified Stripe webhook");
async function markStripeOrderPaid(orderId, session, opts = {}) {
    if (opts.authority !== STRIPE_WEBHOOK_AUTHORITY) throw new Error("Stripe orders require a verified webhook.");
    const orderRef = db.collection("orders").doc(orderId);
    let paidTotal = null;
    let markedPaid = false;
    let duplicateAlert = null;
    const initialOrder = await orderRef.get();
    if (initialOrder.exists) {
      const initial = initialOrder.data();
      const amountCheck = paidAmountCheck(initial, session.amount_total, session.currency);
      if (amountCheck.ok && session.livemode !== false && initial.stripeMode !== "test"
          && initial.paymentStatus !== "paid" && initial.status !== "cancelled"
          && !await reserveForConfirmedPayment(orderId, "Stripe", typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id)) return false;
    }

    await db.runTransaction(async transaction => {
      paidTotal = null; // a retried attempt must not keep the last attempt's value
      markedPaid = false;
      duplicateAlert = null;
      // Firestore transactions require ALL reads before any writes.
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) return;
      const order = orderDoc.data();
      const now = new Date().toISOString();
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;
      const stripeTransaction = {
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        stripeAccountId: opts.account || null,
        stripeMode: session.livemode ? "live" : "test",
        stripeAmountTotal: session.amount_total,
        stripeCurrency: session.currency,
        updatedAt: now,
      };

      if (order.paymentStatus === "paid") {
        const samePayment = !order.stripePaymentIntentId || !paymentIntentId || order.stripePaymentIntentId === paymentIntentId;
        if (samePayment) {
          transaction.update(orderRef, stripeTransaction);
          return;
        }
        // A second, separate Stripe payment for an order that is already paid (two tabs, a retry):
        // keep the original ids so refunds and disputes still find the first charge, and flag it.
        if ((order.duplicatePayments || []).some(p => p.paymentIntentId === paymentIntentId)) return;
        transaction.update(orderRef, {
          duplicatePayments: [...(order.duplicatePayments || []), { provider: "stripe", paymentIntentId, sessionId: session.id, amountMinor: session.amount_total, currency: session.currency, at: now }],
          paymentMismatch: { duplicate: true, provider: "stripe", paymentIntentId, at: now },
          updatedAt: now,
          activity: [...(order.activity || []), { type: "event", message: `A second Stripe payment (${paymentIntentId || session.id}) arrived for this already-paid order. Refund it in the Stripe Dashboard.`, createdAt: now }],
        });
        duplicateAlert = { orderId, paymentIntentId, amount: session.amount_total, currency: session.currency };
        return;
      }

      // Money arrived for an order the shop had already cancelled: don't revive it (stock, emails,
      // fulfillment). Record the payment and leave it in Needs attention so the admin refunds it.
      if (order.status === "cancelled") {
        if (order.paymentMismatch?.paidAfterCancel && order.paymentMismatch.paymentIntentId === paymentIntentId) return;
        transaction.update(orderRef, {
          ...stripeTransaction,
          paymentMismatch: { paidAfterCancel: true, provider: "stripe", paymentIntentId, at: now },
          activity: [...(order.activity || []), { type: "event", message: `Stripe payment ${paymentIntentId || session.id} arrived after this order was cancelled. Not marked paid — refund it in the Stripe Dashboard or reopen the order with the customer.`, createdAt: now }],
        });
        return;
      }

      const amountCheck = paidAmountCheck(order, session.amount_total, session.currency);
      if (!amountCheck.ok) {
        transaction.update(orderRef, {
          ...stripeTransaction,
          paymentMismatch: { ...amountCheck, provider: "stripe", paymentIntentId, at: now },
          activity: [...(order.activity || []), { type: "event", message: `Stripe payment did not match the order total (expected ${amountCheck.expected.minor} ${amountCheck.expected.currency}, got ${amountCheck.paid.minor} ${amountCheck.paid.currency}). Not marked paid — refund or review in Stripe.`, createdAt: now }],
        });
        console.error(`Stripe amount mismatch on order ${orderId}`, amountCheck);
        return;
      }

      // A sandbox (test-mode) payment is a rehearsal: flag the order as a test order
      // (kept out of fulfillment, revenue and launch readiness) and never touch
      // real stock or discount usage.
      const sandbox = session.livemode === false || order.stripeMode === "test";
      const itemList = order.items || [];
      const books = sandbox ? new Map() : await readBooks(transaction, db, itemList);

      let discountRef = null;
      let discountDoc = null;
      if (order.appliedDiscount?.id && !sandbox) {
        discountRef = db.collection("discounts").doc(order.appliedDiscount.id);
        discountDoc = await transaction.get(discountRef);
      }
      const giftCards = sandbox ? new Map() : await readGiftCards(transaction, db, chargedRedemptions(order));
      // A gift card that can no longer pay its part keeps the order unpaid (like a stock conflict).
      if (!sandbox && !settleGiftCards(transaction, orderRef, orderId, order, giftCards, "Stripe", now)) {
        transaction.update(orderRef, stripeTransaction);
        return;
      }

      // Single-use token securing digital download links in emails.
      const downloadToken = crypto.randomBytes(32).toString("hex");

      transaction.update(orderRef, {
        ...stripeTransaction,
        paymentStatus: "paid",
        reconciliationPending: null,
        ...(sandbox ? { isTest: true, sandboxPayment: true } : {}),
        fulfillmentStatus: "paid",
        status: "open",
        downloadToken,
        stripePaymentIntentId: session.payment_intent || null,
        paidAt: now,
        updatedAt: now,
        activity: [
          ...(order.activity || []),
          { type: "event", message: opts.message, createdAt: now }
        ]
      });

      // Atomic stock decrement, one write per book (two editions of a book both count).
      if (!sandbox && writeStock(transaction, db, itemList, books, -1, now)) transaction.update(orderRef, { oversold: true });

      // Count discount redemptions so usage limits are enforceable.
      if (discountRef && discountDoc?.exists) {
        transaction.update(discountRef, {
          usageCount: (discountDoc.data().usageCount || 0) + 1,
          updatedAt: new Date().toISOString()
        });
        // Two shoppers can pass the limit check at once; the paid order is flagged for the admin.
        if (discountUsedUp(discountDoc.data())) transaction.update(orderRef, { discountOverLimit: true });
      }

      // Sandbox payments are not revenue.
      paidTotal = sandbox ? null : Number(order.total) || 0;
      markedPaid = true;
    });

    // Revenue/order analytics are recorded here — at payment time —
    // never client-side at order creation.
    if (paidTotal !== null) {
      const today = new Date().toISOString().split("T")[0];
      await db.collection("analytics").doc(today).set({
        date: today,
        orders: admin.firestore.FieldValue.increment(1),
        revenue: admin.firestore.FieldValue.increment(paidTotal),
      }, { merge: true });
    }
    if (duplicateAlert) {
      await sendEmail({
        queue: "paidTwiceAlert",
        secret: RESEND_API_KEY.value(),
        to: ADMIN_TO,
        subject: `⚠ Order ${duplicateAlert.orderId} was paid twice`,
        html: `<p>Stripe took a second payment (${escapeHtml(duplicateAlert.paymentIntentId || "")}, ${(Number(duplicateAlert.amount) / 100).toFixed(2)} ${escapeHtml(String(duplicateAlert.currency || "").toUpperCase())}) for order <strong>${escapeHtml(duplicateAlert.orderId)}</strong>, which was already paid.</p><p>Refund the second payment in the Stripe Dashboard. The order keeps its first payment.</p>`,
      }).catch(err => console.warn("duplicate payment alert failed:", err.message));
    }
    // The stock is now taken for real; the checkout hold has done its job.
    if (markedPaid) await releaseStockForOrder(db, orderId);
  return markedPaid;
}

// Records a refund on an order, whoever made it (admin, Stripe/PayPal dashboard, a lost
// dispute): stock back (unless declined), the discount use given back and revenue
// reversed — each at most once. A pending refund does all of that now and only
// flips paymentStatus to "refunded" when it completes.
async function applyOrderRefund(orderId, { provider, refundId = null, amountMinor = null, currency = null, status = "succeeded", restock, reason = "", actor = "system", note = "" }) {
  const orderRef = db.collection("orders").doc(orderId);
  let reversal = null;
  let alreadyRecorded = false;
  await db.runTransaction(async transaction => {
    reversal = null;
    alreadyRecorded = false;
    const snap = await transaction.get(orderRef);
    if (!snap.exists) { alreadyRecorded = true; return; }
    const order = snap.data();
    const now = new Date().toISOString();
    const done = status === "succeeded";
    const label = provider === "stripe" ? "Stripe" : provider === "paypal" ? "PayPal" : provider === "dispute" ? "Lost dispute" : "Manual";
    const amountText = amountMinor != null ? ` for ${(amountMinor / 100).toFixed(2)} ${String(currency || "").toUpperCase()}` : "";

    if (order.paymentStatus === "refunded") { alreadyRecorded = true; return; }
    if (order.paymentStatus === "refund_pending") {
      // Stock, discount and revenue were handled when the refund started.
      if (!done) { alreadyRecorded = true; return; }
      transaction.update(orderRef, {
        paymentStatus: "refunded",
        ...(provider === "dispute" && order.customerRequest?.status === "open" ? { customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      ...(order.returnProgress && !["rejected", "closed"].includes(order.returnProgress.state) && provider !== "dispute" ? { returnProgress: { ...order.returnProgress, state: "completed", updatedAt: now }, customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
        ...(order.refund ? { refund: { ...order.refund, status: "succeeded" } } : {}),
        updatedAt: now,
        activity: [...(order.activity || []), { type: "event", message: `${label} refund completed${amountText}${note ? ` — ${note}` : ""}.`, createdAt: now }],
      });
      return;
    }
    if (order.paymentStatus !== "paid") { alreadyRecorded = true; return; }

    const opsSnap = order.returnProgress ? await transaction.get(db.collection("order-operations").doc(orderId)) : null;
    // Copies an earlier partial refund already put back are not restocked a second time.
    const itemList = withoutRestocked(returnRestockItems(order, opsSnap?.data()?.returnCase), order);
    const sandboxPaid = order.sandboxPayment === true;
    // Without an explicit choice (Dashboard/PayPal refunds, sweeps) books that already left the shop
    // are not put back on the shelf; the admin's saved choice or an explicit flag always wins.
    const wantsRestock = restock !== undefined ? restock !== false
      : typeof order.refundRequest?.restock === "boolean" ? order.refundRequest.restock
      : !leftTheShop(order);
    const shouldRestock = !sandboxPaid && wantsRestock && itemList.length > 0 && order.inventoryRestockedAt == null;
    const books = shouldRestock ? await readBooks(transaction, db, itemList) : new Map();
    const shouldReverseDiscount = !sandboxPaid && order.appliedDiscount?.id && order.discountUsageReversedAt == null;
    const discountRef = shouldReverseDiscount ? db.collection("discounts").doc(order.appliedDiscount.id) : null;
    const discountDoc = discountRef ? await transaction.get(discountRef) : null;
    // A full refund also gives back what gift cards paid, once.
    const charged = chargedRedemptions(order);
    const shouldRestoreGiftCards = !!order.giftCardsDebitedAt && !order.giftCardsRestoredAt && charged.length > 0;
    const giftCards = shouldRestoreGiftCards ? await readGiftCards(transaction, db, charged) : new Map();
    // Gift cards this order bought stop working once their purchase is refunded.
    const issuedCards = !order.giftCardsVoidedAt ? await readGiftCards(transaction, db, order.giftCardsIssued) : new Map();

    if (shouldRestock) writeStock(transaction, db, itemList, books, 1, now);
    if (shouldRestoreGiftCards) writeGiftCardChange(transaction, db, orderId, charged, giftCards, 1, now);
    for (const [cardId, card] of issuedCards) {
      if (card.enabled === false) continue;
      transaction.update(db.collection("giftCards").doc(cardId), { enabled: false, history: withHistory(card, { type: "disabled", minor: 0, orderId, reason: "Purchase refunded", at: now }), updatedAt: now });
    }
    if (discountRef && discountDoc?.exists) {
      transaction.update(discountRef, { usageCount: Math.max(0, (Number(discountDoc.data().usageCount) || 0) - 1), updatedAt: now });
    }
    transaction.update(orderRef, {
      paymentStatus: done ? "refunded" : "refund_pending",
      ...(provider === "dispute" && order.customerRequest?.status === "open" ? { customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      ...(order.returnProgress && !["rejected", "closed"].includes(order.returnProgress.state) && provider !== "dispute" ? { returnProgress: { ...order.returnProgress, state: done ? "completed" : "refund_pending", updatedAt: now }, customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      status: "cancelled",
      // What the order looked like before the refund, so a refund the bank later rejects can be undone.
      preRefund: { status: order.status || null, returnProgress: order.returnProgress || null, customerRequest: order.customerRequest || null },
      refund: {
        id: refundId,
        provider,
        amount: amountMinor != null ? amountMinor / 100 : Number(order.total) || 0,
        // A manual refund records the order total, which is CAD; a provider refund is in the currency it reports.
        currency: amountMinor != null ? String(currency || order.checkoutCurrency || "CAD").toUpperCase() : "CAD",
        reason: String(reason || order.refundRequest?.reason || "").slice(0, 500),
        status: done ? "succeeded" : "pending",
        actor,
        createdAt: now,
      },
      refundedAt: now,
      refundedBy: actor,
      ...(amountMinor != null ? { refundedAmountMinor: amountMinor } : {}),
      ...(shouldRestock ? {
        inventoryRestockedAt: now,
        restockedItems: itemList.map(item => ({ id: item.id, variantId: item.variantId || null, quantity: Number(item.quantity) || 0,
          ...(Array.isArray(item.components) && item.components.length ? { components: item.components.map(part => ({ id: part.id, variantId: part.variantId || null, quantity: Number(part.quantity) || 1 })) } : {}) })),
      } : {}),
      ...(discountRef ? { discountUsageReversedAt: now } : {}),
      ...(shouldRestoreGiftCards ? { giftCardsRestoredAt: now } : {}),
      ...(issuedCards.size ? { giftCardsVoidedAt: now } : {}),
      updatedAt: now,
      activity: [...(order.activity || []), {
        type: "event",
        message: `${label} refund ${done ? "completed" : "started"}${amountText}${shouldRestock ? "; inventory restocked" : ""}${shouldRestoreGiftCards ? `; ${charged.reduce((sum, r) => sum + (Number(r.minor) || 0), 0) / 100} CAD put back on gift cards` : ""}${note ? ` — ${note}` : ""}.`,
        createdAt: now,
        actor,
      }],
    });
    // Revenue was recorded as order.total (base currency) at payment time; reverse that figure.
    reversal = sandboxPaid ? null : { revenue: Number(order.total) || 0, paidDay: typeof order.paidAt === "string" ? order.paidAt.split("T")[0] : null };
  });

  if (reversal) {
    const day = reversal.paidDay || new Date().toISOString().split("T")[0];
    await db.collection("analytics").doc(day).set({
      date: day,
      orders: admin.firestore.FieldValue.increment(-1),
      revenue: admin.firestore.FieldValue.increment(-(reversal.revenue || 0)),
      refunds: admin.firestore.FieldValue.increment(1),
      refundedRevenue: admin.firestore.FieldValue.increment(reversal.revenue || 0),
    }, { merge: true });
  }
  return { alreadyRecorded };
}

// A partial refund the admin made (Order detail › Refund with a smaller amount, or a return where
// only some books came back). The order stays paid with `partiallyRefunded` and a running
// `refundedAmountMinor` — the same state a Stripe Dashboard partial refund leaves — and only the
// lines the owner ticked (or the inspected resellable copies of a return) go back to stock.
// Recorded once per provider refund id; discount use, gift cards and revenue are left alone.
async function applyPartialRefund(orderId, { provider, refundId = null, amountMinor, already = 0, currency = null, status = "succeeded", restockLines = [], fromReturn = false, reason = "", actor = "system", claimedAt = null }) {
  const orderRef = db.collection("orders").doc(orderId);
  let alreadyRecorded = false;
  await db.runTransaction(async transaction => {
    alreadyRecorded = false;
    const snap = await transaction.get(orderRef);
    if (!snap.exists) { alreadyRecorded = true; return; }
    const order = snap.data();
    const records = Array.isArray(order.partialRefunds) ? order.partialRefunds : [];
    if (order.paymentStatus !== "paid" || (refundId && records.some(r => r && r.id === refundId))) { alreadyRecorded = true; return; }
    const now = new Date().toISOString();
    // Sandbox payments never touch real stock.
    const lines = order.sandboxPayment === true ? [] : restockLines;
    const books = lines.length ? await readBooks(transaction, db, lines) : new Map();
    if (lines.length) writeStock(transaction, db, lines, books, 1, now);
    const label = provider === "stripe" ? "Stripe" : provider === "paypal" ? "PayPal" : "Manual";
    const cur = String(currency || order.expectedCurrency || "CAD").toUpperCase();
    // Stripe/PayPal may already have reported this refund (webhook first): never count it twice.
    const total = Math.max(refundedSoFar(order), already + amountMinor);
    const finishReturn = fromReturn && order.returnProgress?.state === "inspected";
    transaction.update(orderRef, {
      partiallyRefunded: true,
      refundedAmountMinor: total,
      partialRefunds: [...records, { id: refundId, provider, amountMinor, currency: cur, status, reason: String(reason || "").slice(0, 500), actor, createdAt: now,
        restocked: lines.map(line => ({ index: line.index, quantity: line.quantity })) }],
      ...(lines.length ? { partialRestockedItems: [...(Array.isArray(order.partialRestockedItems) ? order.partialRestockedItems : []),
        ...lines.map(line => ({ index: line.index, id: line.id, variantId: line.variantId || null, quantity: line.quantity, at: now }))] } : {}),
      ...(provider === "paypal" && refundId ? { paypalRefundIds: [...(Array.isArray(order.paypalRefundIds) ? order.paypalRefundIds : []), refundId] } : {}),
      ...(!claimedAt || order.refundRequest?.at === claimedAt ? { refundRequest: null } : {}),
      ...(finishReturn ? { returnProgress: { ...order.returnProgress, state: "completed", updatedAt: now }, customerRequest: { ...order.customerRequest, status: "handled" } } : {}),
      updatedAt: now,
      activity: [...(order.activity || []), {
        type: "event",
        message: `${label} partial refund ${status === "pending" ? "started" : "made"}: ${(amountMinor / 100).toFixed(2)} ${cur} (${(total / 100).toFixed(2)} ${cur} refunded so far)${lines.length ? `; ${lines.reduce((n, l) => n + l.quantity, 0)} cop${lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "y" : "ies"} back in stock` : ""}${reason ? ` — ${String(reason).slice(0, 200)}` : ""}. The order stays paid.`,
        createdAt: now,
        actor,
      }],
    });
  });
  return { alreadyRecorded };
}

// A refund Stripe accepted (order went to refund_pending, stock back, discount use and revenue
// reversed) that then failed at the bank: the customer still paid, so undo exactly what
// applyOrderRefund did, once. Only for a refund_pending order; the "failed" refund is recorded.
async function revertFailedRefund(orderId, { refundId = null, source = "", chargeUnrefunded = false } = {}) {
  const orderRef = db.collection("orders").doc(orderId);
  let revenue = null;
  let reverted = false;
  await db.runTransaction(async transaction => {
    revenue = null;
    reverted = false;
    const snap = await transaction.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data();
    // A refund Stripe reported as succeeded (card refunds usually do) or one made in the Dashboard can
    // still be rejected by the issuer later. Undo a "refunded" Stripe order only when this is that
    // refund's id, or the caller read the charge and saw nothing was refunded.
    const refundedByStripe = order.paymentStatus === "refunded" && order.refund?.provider === "stripe" && order.refund?.status !== "failed"
      && ((refundId && order.refund.id === refundId) || (chargeUnrefunded === true && (!refundId || !order.refund.id || order.refund.id === refundId)));
    if (order.paymentStatus !== "refund_pending" && !refundedByStripe) return;
    // Another refund on this order failed, not the one it is waiting for.
    if (refundId && order.refund?.id && order.refund.id !== refundId) return;
    const now = new Date().toISOString();
    const sandboxPaid = order.sandboxPayment === true;
    const restocked = order.inventoryRestockedAt != null && Array.isArray(order.restockedItems) ? order.restockedItems : [];
    const books = restocked.length ? await readBooks(transaction, db, restocked) : new Map();
    const discountRef = order.discountUsageReversedAt != null && order.appliedDiscount?.id ? db.collection("discounts").doc(order.appliedDiscount.id) : null;
    const discountDoc = discountRef ? await transaction.get(discountRef) : null;
    const charged = order.giftCardsRestoredAt ? chargedRedemptions(order) : [];
    const cards = charged.length ? await readGiftCards(transaction, db, charged) : new Map();
    const voided = order.giftCardsVoidedAt ? await readGiftCards(transaction, db, order.giftCardsIssued) : new Map();
    const giftShort = charged.length ? debitShortfall(charged, cards) : null;
    const notes = [];

    if (restocked.length && writeStock(transaction, db, restocked, books, -1, now)) notes.push("some of the restocked copies had already sold, so stock may be oversold");
    if (discountRef && discountDoc?.exists) transaction.update(discountRef, { usageCount: (Number(discountDoc.data().usageCount) || 0) + 1, updatedAt: now });
    if (charged.length && !giftShort) writeGiftCardChange(transaction, db, orderId, charged, cards, -1, now);
    if (giftShort) notes.push("a gift card's balance was spent after the refund, so its part could not be taken back — reconcile it in Gift cards");
    for (const [cardId, card] of voided) {
      const last = Array.isArray(card.history) ? card.history[card.history.length - 1] : null;
      if (card.enabled !== false || !last || last.type !== "disabled" || last.orderId !== orderId) continue;
      transaction.update(db.collection("giftCards").doc(cardId), { enabled: true, history: withHistory(card, { type: "enabled", minor: 0, orderId, reason: "Refund failed", at: now }), updatedAt: now });
    }
    const before = order.preRefund || {};
    transaction.update(orderRef, {
      paymentStatus: "paid",
      status: before.status && before.status !== "cancelled" ? before.status : "processing",
      ...(before.returnProgress ? { returnProgress: before.returnProgress } : {}),
      ...(before.customerRequest ? { customerRequest: before.customerRequest } : {}),
      refund: { ...(order.refund || {}), status: "failed", failedAt: now },
      refundFailedAt: now,
      refundRequest: null,
      refundedAt: null,
      refundedAmountMinor: null,
      preRefund: null,
      ...(restocked.length ? { inventoryRestockedAt: null, restockedItems: null } : {}),
      ...(discountRef ? { discountUsageReversedAt: null } : {}),
      ...(charged.length && !giftShort ? { giftCardsRestoredAt: null } : {}),
      ...(voided.size ? { giftCardsVoidedAt: null } : {}),
      updatedAt: now,
      activity: [...(order.activity || []), {
        type: "event",
        message: `Stripe refund failed${source ? ` (${source})` : ""}: the customer was not refunded. The order is paid again${restocked.length ? "; restocked copies taken back out of stock" : ""}${notes.length ? `; ${notes.join("; ")}` : ""}. Refund again or contact the customer.`,
        createdAt: now,
      }],
    });
    reverted = true;
    revenue = sandboxPaid ? null : { amount: Number(order.total) || 0, paidDay: typeof order.paidAt === "string" ? order.paidAt.split("T")[0] : null };
  });
  if (revenue) {
    const day = revenue.paidDay || new Date().toISOString().split("T")[0];
    await db.collection("analytics").doc(day).set({
      date: day,
      orders: admin.firestore.FieldValue.increment(1),
      revenue: admin.firestore.FieldValue.increment(revenue.amount),
      refunds: admin.firestore.FieldValue.increment(-1),
      refundedRevenue: admin.firestore.FieldValue.increment(-revenue.amount),
    }, { merge: true });
  }
  return { reverted };
}

// Brings a paid order in line with what Stripe says happened to its charge after
// payment: a full refund (order refunded + cancelled, stock back, revenue
// reversed — once), a partial refund (amount recorded, order stays paid), or a
// dispute (status recorded). Used by the charge.refunded webhook AND by the
// direct Stripe checks, so a missed webhook can't leave a refunded order "Paid".
async function syncStripeReversal(orderId, { charge, dispute = null, source }) {
  const r = reversalState(charge, dispute);
  const orderRef = db.collection("orders").doc(orderId);
  let fullRefund = null;
  await db.runTransaction(async transaction => {
    fullRefund = null;
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists) return;
    const order = orderDoc.data();
    const now = new Date().toISOString();
    const notes = [];
    const update = {};

    if (r.disputeStatus && r.disputeStatus !== order.disputeStatus) {
      update.disputeStatus = r.disputeStatus;
      if (dispute?.id) update.disputeId = dispute.id;
      notes.push(`Stripe dispute ${r.disputeStatus.replace(/_/g, " ")} (${source}).`);
    }

    // Money taken after the order was cancelled (or for the wrong amount), now fully refunded:
    // the problem is dealt with, so it leaves Needs attention and the alerts.
    if (r.fullyRefunded && order.paymentMismatch && !mismatchResolved(order) && order.paymentStatus !== "paid") {
      update["paymentMismatch.resolvedAt"] = now;
      update["paymentMismatch.resolvedBy"] = "stripe-refund";
      notes.push(`The unexpected Stripe payment was refunded (${source}).`);
    }

    // The card payment for an order whose gift card fell short, now refunded: nothing left to settle.
    if (r.fullyRefunded && order.giftCardConflict && !order.giftCardConflict.resolvedAt && order.paymentStatus !== "paid") {
      update["giftCardConflict.resolvedAt"] = now;
      update["giftCardConflict.resolvedBy"] = "stripe-refund";
      notes.push(`The payment for this order (gift card couldn't cover its part) was refunded (${source}).`);
    }

    if ((r.fullyRefunded || r.disputeStatus === "lost") && ["paid", "refund_pending"].includes(order.paymentStatus)) {
      fullRefund = r.fullyRefunded ? "refund" : "dispute";
    } else if (r.partiallyRefunded && order.paymentStatus === "paid" && (order.refundedAmountMinor || 0) !== r.refundedMinor) {
      update.refundedAmountMinor = r.refundedMinor;
      update.partiallyRefunded = true;
      notes.push(`Partial refund in Stripe: ${(r.refundedMinor / 100).toFixed(2)} ${r.currency} of ${(r.amountMinor / 100).toFixed(2)}. Order stays paid — adjust what you ship (${source}).`);
    }

    if (!notes.length) return;
    transaction.update(orderRef, {
      ...update,
      updatedAt: now,
      activity: [...(order.activity || []), ...notes.map(message => ({ type: "event", message, createdAt: now }))],
    });
  });

  if (fullRefund === "refund") {
    // Refunds made in the Stripe Dashboard follow the admin's restock choice when one was saved.
    await applyOrderRefund(orderId, { provider: "stripe", refundId: null, amountMinor: r.refundedMinor, currency: r.currency, status: "succeeded", actor: "stripe-dashboard", note: source });
  } else if (fullRefund === "dispute") {
    // A lost chargeback: the money is gone, so the order is reversed like a refund. The books were sent; no restock.
    await applyOrderRefund(orderId, { provider: "dispute", amountMinor: r.amountMinor, currency: r.currency, status: "succeeded", restock: false, actor: "stripe-dispute", note: source });
  }
  return r;
}

// Asks Stripe for a paid order's charge (and any dispute) and syncs refunds/disputes.
async function checkStripeReversal(orderId, order, source) {
  const pi = String(order.stripePaymentIntentId || "");
  if (!pi.startsWith("pi_")) return null;
  const testMode = await shopTestMode();
  for (const mode of modesToTry(order, testMode)) {
    const secret = await stripeSecretFor(mode);
    if (!secret) continue;
    const stripe = new Stripe(secret);
    try {
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
      if (intent.metadata?.order_id !== orderId) return null;
      const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      if (!charge) return null;
      let dispute = null;
      if (charge.disputed) {
        const list = await stripe.disputes.list({ payment_intent: pi, limit: 1 });
        dispute = list.data[0] || null;
      }
      await db.collection("orders").doc(orderId).update({ stripeCheckedAt: new Date().toISOString() });
      // A pending refund that moved no money: ask Stripe whether it failed (missed charge.refund.updated).
      if (["refund_pending", "refunded"].includes(order.paymentStatus) && Number(charge.amount_refunded) === 0) {
        const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 10 });
        const failed = failedRefundId(order, charge, refunds?.data || []);
        if (failed) await revertFailedRefund(orderId, { refundId: failed === "unknown" ? null : failed, source, chargeUnrefunded: true });
      }
      return await syncStripeReversal(orderId, { charge, dispute, source });
    } catch (err) {
      if (err?.code === "resource_missing" || err?.statusCode === 404 || err?.type === "StripeAuthenticationError") continue;
      throw err;
    }
  }
  return null;
}

async function orderRequestIdentity(req) {
  const match = String(req.headers?.authorization || "").match(/^Bearer (.+)$/);
  if (!match) return null;
  try { return await admin.auth().verifyIdToken(match[1]); } catch { return null; }
}
function orderRequestKey(req) {
  return typeof req.body?.key === "string" ? req.body.key : String(req.headers?.["x-order-key"] || "");
}
async function recordStripeReconciliation(orderId, session) {
  const ref = db.collection("orders").doc(orderId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().paymentStatus === "paid") return;
    tx.update(ref, { reconciliationPending: { provider: "stripe", providerStatus: "paid", paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null, sessionId: session.id || null, checkedAt: new Date().toISOString() } });
  });
}

// Admin: cancel an unpaid order. Done in a transaction so an order that was paid a moment
// ago (webhook) is refused instead of quietly hidden, then the payment the shopper may still
// be completing is stopped (Stripe PaymentIntent cancelled / Checkout Session expired).
async function handleCancelOrder(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  const orderId = req.body?.orderId;
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) return res.status(400).json({ error: "Missing orderId" });
  const ref = db.collection("orders").doc(orderId);
  try {
    // Ask Stripe first: an order still "unpaid" here may already be paid there (missed webhook).
    // Cancelling it would leave a charged customer with no books and no alert.
    const before = await ref.get();
    const pre = before.exists ? before.data() : null;
    const intentId = String(pre?.stripePaymentIntentId || "");
    const sessionId = String(pre?.stripeCheckoutSessionId || "");
    let stripeCtx = null, intent = null, session = null;
    if (pre && !cancelRefusal(pre) && (intentId.startsWith("pi_") || sessionId.startsWith("cs_"))) {
      try {
        stripeCtx = await getStripeClientForMode(pre.stripeMode === "test" ? "test" : "live", pre.stripeAccountId || null);
        if (intentId.startsWith("pi_")) intent = await stripeCtx.stripe.paymentIntents.retrieve(intentId, {}, stripeCtx.requestOptions);
        if (sessionId.startsWith("cs_")) session = await stripeCtx.stripe.checkout.sessions.retrieve(sessionId, {}, stripeCtx.requestOptions);
      } catch (err) {
        if (!(err?.code === "resource_missing" || err?.statusCode === 404)) {
          return res.status(503).json({ error: "Couldn't check this payment with Stripe. Try again in a minute.", code: "stripe_unreachable" });
        }
      }
      if (stripePaymentTaken(intent, session)) {
        await recordStripeReconciliation(orderId, { id: session?.id || null, payment_intent: intent?.id || session?.payment_intent || null }).catch(() => {});
        return res.status(409).json({ error: "Stripe shows this order as paid. Don't cancel it: resend the payment event from Stripe (Webhook health), then ship or refund it.", code: "paid_in_stripe" });
      }
    }
    const order = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : null;
      const refusal = cancelRefusal(current);
      if (refusal) {
        const message = refusal === "paid" ? "This order has just been paid. Refund it instead of cancelling."
          : refusal === "refunded" ? "This order is being refunded." : refusal === "missing" ? "Order not found" : "This order is already closed.";
        const err = new Error(message); err.status = refusal === "missing" ? 404 : 409; err.code = refusal; throw err;
      }
      const now = new Date().toISOString();
      tx.update(ref, {
        status: "cancelled", cancelledAt: now, cancelledBy: adminUser.email || adminUser.uid, updatedAt: now,
        activity: admin.firestore.FieldValue.arrayUnion({ type: "event", message: `Unpaid order cancelled by ${adminUser.email || "administrator"}.`, createdAt: now }),
      });
      return current;
    });
    // Best effort: stop a payment the shopper may still finish. A payment that slips through
    // anyway is recorded as "paid after cancelling" by the webhook, and the sweep still checks
    // cancelled orders with a Stripe payment.
    const stopped = [];
    try {
      if (stripeCtx) {
        const { stripe, requestOptions } = stripeCtx;
        if (session && session.status === "open") {
          await stripe.checkout.sessions.expire(session.id, {}, requestOptions).then(() => stopped.push("checkout")).catch(() => {});
        }
        if (intent && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
          await stripe.paymentIntents.cancel(intent.id, {}, requestOptions).then(() => stopped.push("card")).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`cancelOrder ${orderId}: could not stop the Stripe payment:`, err.message);
    }
    await releaseStock(db, orderId, order.items || []);
    await releaseGiftCards(db, orderId, [...chargedRedemptions(order), ...(order.giftCardRedemptions || [])]);
    return res.status(200).json({ cancelled: true, stopped });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}

// Admin: the extra/late payment on this order has been refunded in Stripe or PayPal.
async function handleResolveMismatch(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  const orderId = req.body?.orderId;
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) return res.status(400).json({ error: "Missing orderId" });
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : null;
  if (!current || (!current.paymentMismatch && !current.giftCardConflict)) return res.status(404).json({ error: "Nothing to resolve on this order." });
  const now = new Date().toISOString();
  const by = adminUser.email || adminUser.uid;
  await ref.update({
    ...(current.paymentMismatch ? { "paymentMismatch.resolvedAt": now, "paymentMismatch.resolvedBy": by } : {}),
    ...(current.giftCardConflict ? { "giftCardConflict.resolvedAt": now, "giftCardConflict.resolvedBy": by } : {}),
    updatedAt: now,
    activity: admin.firestore.FieldValue.arrayUnion({ type: "event", message: `Payment problem marked as refunded/resolved by ${adminUser.email || "administrator"}.`, createdAt: now }),
  });
  return res.status(200).json({ resolved: true });
}

async function handleCheckoutStatus(req, res) {
  let { orderId, sessionId, paymentIntentId } = req.body || {};
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) {
    res.status(400).json({ error: "Missing orderId" });
    return;
  }
  // Each call can reach Stripe (live and test), so it is limited per visitor like the other order-key actions.
  if (!(await hitLimit(db, "status", req, LIMITS.status))) { res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." }); return; }
  try {
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) { res.status(404).json({ error: "Order not found" }); return; }
    const saved = orderSnap.data() || {};
    if (!canViewOrder(saved, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
    if (saved.paymentStatus === "paid") {
      // Already paid: still ask Stripe whether it was since refunded or disputed (this is what the
      // admin's "Sync with Stripe" relies on). Throttled to once a minute per order.
      let paymentStatus = "paid";
      if (String(saved.stripePaymentIntentId || "").startsWith("pi_") && !(Date.now() - Date.parse(saved.stripeCheckedAt || "") < 60 * 1000)) {
        try {
          await checkStripeReversal(orderId, saved, "status check");
          paymentStatus = (await db.collection("orders").doc(orderId).get()).data()?.paymentStatus || "paid";
        } catch (err) {
          console.warn(`Refund/dispute check failed for ${orderId}:`, err.message);
        }
      }
      res.status(200).json({ status: "complete", paymentStatus });
      return;
    }
    // The tracking page and the admin may only know the order number: fall back to
    // the payment ids this server saved on the order when it created the payment.
    // Only the payment ids this server saved on the order are looked up: an id typed into the request
    // that the order doesn't carry never triggers a Stripe call (#106).
    const savedIntent = typeof saved.stripePaymentIntentId === "string" && saved.stripePaymentIntentId.startsWith("pi_") ? saved.stripePaymentIntentId : "";
    const savedSession = typeof saved.stripeCheckoutSessionId === "string" && saved.stripeCheckoutSessionId.startsWith("cs_") ? saved.stripeCheckoutSessionId : "";
    paymentIntentId = typeof paymentIntentId === "string" && paymentIntentId === savedIntent ? savedIntent : "";
    sessionId = typeof sessionId === "string" && sessionId === savedSession ? savedSession : "";
    if (!paymentIntentId && !sessionId) {
      paymentIntentId = savedIntent;
      sessionId = savedSession;
    }
    if (!paymentIntentId && !sessionId) {
      res.status(200).json({ status: "open", paymentStatus: "unpaid" });
      return;
    }

    const found = await retrieveOrderPayment(orderId, saved, paymentIntentId ? { paymentIntentId } : { sessionId });
    if (!found) { res.status(404).json({ error: "Payment not found" }); return; }

    if (found.intent) {
      const intent = found.intent;
      const settled = intent.status === "succeeded";
      if (settled) await recordStripeReconciliation(orderId, intentAsSession(intent));
      const status = settled ? "complete" : intent.status === "processing" ? "processing" : "open";
      res.status(200).json({ status, paymentStatus: saved.paymentStatus, providerPaymentStatus: intent.status, awaitingWebhook: settled, mode: found.mode });
      return;
    }
    const session = found.session;
    if (session.payment_status === "paid") {
      await recordStripeReconciliation(orderId, session);
    }
    res.status(200).json({ status: session.status, paymentStatus: saved.paymentStatus, providerPaymentStatus: session.payment_status, awaitingWebhook: session.payment_status === "paid", mode: found.mode });
  } catch (err) {
    console.error("Stripe status check failed:", err);
    res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
  }
}

// Guest order lookup (tracking page + checkout thank-you page). Orders are not
// publicly readable in Firestore; this returns one only to its owner: the
// matching customer email or the private key from the order email link.
// Served through createStripeCheckoutSession (body.action): no new public function.
async function handleTrackingLink(req, res) {
  const { orderId, email } = req.body || {};
  const accepted = () => res.status(200).json({ accepted: true });
  if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId) || typeof email !== "string" || email.length > 254) return accepted();
  if (!(await hitLimit(db, "tracking-link", req, { max: 5, windowMs: 10 * 60 * 1000 }))) return res.status(429).json({ error: "too_many" });
  try {
    const ref = db.collection("orders").doc(orderId);
    let order = null;
    await db.runTransaction(async tx => {
      order = null;
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const saved = snap.data();
      if (normMarketingEmail(saved.customer?.email) !== normMarketingEmail(email)) return;
      if (Date.now() - Date.parse(saved.trackingLinkSentAt || "") < 60_000) return;
      const trackingKey = typeof saved.trackingKey === "string" && /^[a-f0-9]{32,64}$/.test(saved.trackingKey) ? saved.trackingKey : crypto.randomBytes(32).toString("hex");
      tx.update(ref, { trackingKey, trackingLinkSentAt: new Date().toISOString() });
      order = { ...saved, trackingKey };
    });
    if (order) {
      const settings = (await db.collection("settings").doc("website").get()).data() || {};
      const copy = settings.design?.copy || {};
      const url = siteLink(`/track?orderId=${encodeURIComponent(orderId)}&key=${order.trackingKey}`);
      await sendEmail({ to: order.customer.email, secret: RESEND_API_KEY.value(),
        subject: String(copy.trackLinkEmailSubject ?? "Your secure order link"),
        html: `<p>${escapeHtml(copy.trackLinkEmailIntro ?? "Use this private link to view your order and delivery updates.")}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.trackLinkEmailButton ?? "View my order")}</a></p>` });
    }
  } catch (err) { console.warn("Tracking link could not be sent:", err.message); }
  return accepted();
}

async function handleTrackOrder(req, res) {
  const { orderId } = req.body || {};
  if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) {
    res.status(400).json({ error: "not_found" });
    return;
  }
  if (!(await hitLimit(db, "track", req, LIMITS.track))) {
    res.status(429).json({ error: "too_many" });
    return;
  }
  try {
    const snap = await db.collection("orders").doc(orderId).get();
    if (!snap.exists) { res.status(404).json({ error: "not_found" }); return; }
    const order = snap.data() || {};
    if (!canViewOrder(order, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) {
      res.status(403).json({ error: "email_mismatch" });
      return;
    }
    res.status(200).json({ order: publicOrderView(snap.id, order) });
  } catch (err) {
    console.error("Order lookup failed:", err);
    res.status(500).json({ error: "failed" });
  }
}

// A shopper asks to cancel an order or to return it. Same proof as order tracking (email
// or the emailed key). Nothing about money or stock changes here: the request is put on
// the order (Orders › Needs attention) and the shop is emailed to decide.
async function handleOrderRequest(req, res) {
  const { orderId, email, key, type, message } = req.body || {};
  if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) {
    res.status(400).json({ error: "not_found" });
    return;
  }
  if (!(await hitLimit(db, "track", req, LIMITS.track))) {
    res.status(429).json({ error: "too_many" });
    return;
  }
  try {
    const orderRef = db.collection("orders").doc(orderId);
    let problem = null;
    let order = null;
    const identity = await orderRequestIdentity(req);
    await db.runTransaction(async tx => {
      const snap = await tx.get(orderRef);
      order = snap.exists ? snap.data() : null;
      if (order && !canViewOrder(order, { key: orderRequestKey(req), identity })) {
        problem = "email_mismatch";
        return;
      }
      problem = orderRequestProblem(order, type);
      if (problem) return;
      const record = orderRequestRecord(type, message);
      tx.update(orderRef, {
        customerRequest: record,
        updatedAt: record.createdAt,
        activity: [...(order.activity || []), { type: "event", message: `Customer asked to ${type === "cancel" ? "cancel this order" : "return this order"}${record.message ? `: "${record.message}"` : "."}`, createdAt: record.createdAt }],
      });
      order = { ...order, customerRequest: record };
    });
    if (problem) {
      res.status(problem === "not_found" ? 404 : problem === "email_mismatch" ? 403 : 409).json({ error: problem });
      return;
    }
    const request = order.customerRequest;
    // The request itself is saved on the order; the shop-wide email budget only decides whether it is also mailed.
    if (await claimEmailSend(db, "orderRequestNotify", orderId, { failOpen: true })) await sendEmail({
      queue: "orderRequest",
      secret: RESEND_API_KEY.value(),
      to: ADMIN_TO,
      subject: `${request.type === "cancel" ? "Cancellation" : "Return"} request · order ${orderId}`,
      html: `<p>${escapeHtml(order.customer?.name || order.customer?.email || "A customer")} asked to <strong>${request.type === "cancel" ? "cancel" : "return"}</strong> order <strong>${escapeHtml(orderId)}</strong>.</p>${request.message ? `<blockquote>${escapeHtml(request.message)}</blockquote>` : ""}<p>Open it in Admin › Orders (Needs me). Refunds and cancellations are done from the order as usual; mark the request handled when you have replied.</p>`,
    }).catch(err => console.warn("order request email failed:", err.message));
    res.status(200).json({ order: publicOrderView(orderId, order) });
  } catch (err) {
    console.error("Order request failed:", err);
    res.status(500).json({ error: "failed" });
  }
}

// ──────────────────────────────────────────────────────────────
// Newsletter double opt-in. Signup stores a PENDING record (+ consent text and time) and mails a signed
// confirmation link; only the link makes the address a subscriber. Browsers never write `newsletter`
// (firestore.rules), so a stranger cannot seed the list. Unsubscribe is the shared signed link
// (`action: "unsubscribe"`), which deletes newsletter/<email> and records the opt-out.
// ──────────────────────────────────────────────────────────────
const newsletterLinks = async email => {
  const key = await marketingUnsubscribeKey();
  const e = encodeURIComponent(normMarketingEmail(email));
  return {
    confirmUrl: siteLink(`/track?newsletter_confirm=1&e=${e}&t=${purposeToken(email, key, "newsletter-confirm")}`),
    unsubscribeUrl: siteLink(`/track?unsubscribe=1&e=${e}&t=${unsubscribeToken(email, key)}`),
  };
};

async function handleNewsletterSignup(req, res) {
  if (!(await hitLimit(db, "track", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
  const email = normMarketingEmail(req.body?.email);
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(email) || email.length > 254) return res.status(400).json({ error: "invalid" });
  try {
    const ref = db.collection("newsletter").doc(email);
    const existing = await ref.get();
    // Already confirmed (or a legacy subscriber): nothing to send, and the answer looks the same.
    if (existing.exists && existing.data()?.status !== "pending") return res.status(200).json({ ok: true });
    const claim = await claimEmailSendDetailed(db, "newsletterConfirm", email, { failOpen: false });
    if (!claim.allowed) {
      // A confirmation went to this address in the last day: stay quiet. Over the shop-wide budget: ask to retry.
      if (claim.reason === "address") return res.status(200).json({ ok: true });
      return res.status(429).json({ error: "busy" });
    }
    await ref.set(pendingRecord(email, req.body?.source, new Date().toISOString()));
    const { confirmUrl, unsubscribeUrl } = await newsletterLinks(email);
    const website = (await db.collection("settings").doc("website").get()).data() || {};
    const mail = confirmationEmail({ shopName: "Lyricalmyrical Books", confirmUrl, unsubscribeUrl, address: footerAddress(website.location) });
    await sendEmail({ queue: "newsletterConfirm", secret: RESEND_API_KEY.value(), to: email, subject: mail.subject, html: mail.html })
      .catch(err => console.warn("newsletter confirmation email failed:", err.message));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Newsletter signup failed:", err);
    return res.status(500).json({ error: "failed" });
  }
}

async function handleNewsletterConfirm(req, res) {
  if (!(await hitLimit(db, "track", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
  const email = normMarketingEmail(req.body?.email);
  const key = (await readAdminSecret("marketing")).unsubscribeKey;
  if (!email || !purposeTokenMatches(email, String(req.body?.token || ""), key, "newsletter-confirm")) return res.status(400).json({ error: "invalid_link" });
  try {
    const ref = db.collection("newsletter").doc(email);
    const snap = await ref.get();
    // No record: it was removed (unsubscribed or erased) after the email went out, so the old link must not revive it.
    if (!snap.exists) return res.status(410).json({ error: "expired" });
    const next = confirmedRecord(snap.data(), new Date().toISOString());
    if (next !== snap.data()) await ref.set(next);
    return res.status(200).json({ confirmed: true });
  } catch (err) {
    console.error("Newsletter confirm failed:", err);
    return res.status(500).json({ error: "failed" });
  }
}

// A privacy request (copy of my data / delete my data). Anyone can ask, so nothing is
// sent or deleted automatically: the shop confirms the person owns the address (reply
// from it), then uses Settings › Privacy requests to export or erase.
async function handlePrivacyRequest(req, res) {
  const { email, type, message } = req.body || {};
  if (!(await hitLimit(db, "track", req, LIMITS.track))) {
    res.status(429).json({ error: "too_many" });
    return;
  }
  const record = privacyRequestRecord(email, type, message);
  if (!record) {
    res.status(400).json({ error: "invalid" });
    return;
  }
  try {
    // Anyone can type any address: the same address asking again within a day adds neither a
    // second record nor a second email, and the shop-wide email budget caps the rest. A request
    // over the budget is still recorded (Settings › General › Privacy requests) but not mailed.
    const claim = await claimEmailSendDetailed(db, "privacyNotify", record.email, { failOpen: true });
    if (!claim.allowed && claim.reason === "address") {
      res.status(200).json({ ok: true });
      return;
    }
    await db.collection("privacyRequests").add(record);
    if (!claim.allowed) {
      res.status(200).json({ ok: true });
      return;
    }
    await sendEmail({
      queue: "privacyRequest",
      secret: RESEND_API_KEY.value(),
      to: ADMIN_TO,
      subject: `Privacy request (${record.type === "delete" ? "delete data" : "copy of data"}) · ${record.email}`,
      html: `<p><strong>${escapeHtml(record.email)}</strong> asked for ${record.type === "delete" ? "their personal data to be deleted" : "a copy of their personal data"}.</p>${record.message ? `<blockquote>${escapeHtml(record.message)}</blockquote>` : ""}<p>Confirm the request by email with that address first, then open Admin › Settings › General › Privacy requests.</p>`,
    }).catch(err => console.warn("privacy request email failed:", err.message));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Privacy request failed:", err);
    res.status(500).json({ error: "failed" });
  }
}

// Everything the shop holds about one email address (any capitalisation: see privacyData.js).
async function personalDataFor(email) {
  const [orders, alerts, carts, contacts, messages, newsletter, queuedEmails, emailRows, giftCards] = await Promise.all([
    findByEmailData(db, "orders", "customer.email", email), findByEmailData(db, "stockAlerts", "email", email),
    findByEmailData(db, "abandoned-carts", "email", email), findByEmailData(db, "reviewContacts", "email", email),
    findByEmailData(db, "contactMessages", "email", email), db.collection("newsletter").doc(email).get(),
    // Emails waiting in the retry queue to or about this person, and their delivery-log rows
    // (`to` can list several recipients, so it is matched as a list).
    db.collection("emailOutbox").where("toLower", "array-contains", email).get().then(s => s.docs),
    findByEmailData(db, "emailLog", "to", email, { contains: true }),
    giftCardsFor(db, email),
  ]);
  // Private fulfilment notes kept about the person's orders (admin-only order-operations).
  const operations = orders.length ? (await db.getAll(...orders.map(o => db.collection("order-operations").doc(o.id)))).filter(d => d.exists) : [];
  let user = null;
  try { user = await admin.auth().getUserByEmail(email); } catch { user = null; }
  const profile = user ? await db.collection("customers").doc(user.uid).get() : null;
  const reviews = contacts.length
    ? (await Promise.all(contacts.map(c => db.collection("reviews").doc(c.id).get()))).filter(r => r.exists)
    : [];
  const incompleteScan = [["orders", orders], ["stockAlerts", alerts], ["abandoned-carts", carts], ["reviewContacts", contacts], ["contactMessages", messages], ["emailLog", emailRows]].filter(([, d]) => d.truncated).map(([n]) => n);
  return { orders, alerts, carts, contacts, messages, newsletter, user, profile, reviews, queuedEmails, emailRows, giftCards, operations, incompleteScan };
}

async function handlePrivacyAdmin(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(email)) {
    res.status(400).json({ error: "Enter the customer's email address." });
    return;
  }
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
  try {
    const data = await personalDataFor(email);
    const rows = docs => docs.map(d => ({ id: d.id, ...d.data() }));
    if (req.body.action === "privacyExport") {
      const strip = o => { const { downloadToken, trackingKey, clientIp, ...rest } = o; return rest; };
      res.status(200).json({
        email,
        exportedAt: new Date().toISOString(),
        account: data.user ? { uid: data.user.uid, createdAt: data.user.metadata?.creationTime || null } : null,
        profile: data.profile?.exists ? data.profile.data() : null,
        newsletter: data.newsletter.exists ? data.newsletter.data() : null,
        orders: rows(data.orders).map(strip),
        orderNotesAndHistory: rows(data.operations),
        backInStockAlerts: rows(data.alerts),
        savedCarts: rows(data.carts),
        reviews: data.reviews.map(r => ({ id: r.id, ...r.data() })),
        contactMessages: rows(data.messages),
        giftCards: rows(data.giftCards).map(({ code, holds, ...card }) => card),
        emailDeliveryLog: rows(data.emailRows).map(({ toLower, ...row }) => row),
        emailsWaitingToSend: data.queuedEmails.map(d => publicOutboxEntry(d.id, d.data())),
        ...(data.incompleteScan.length ? { incompleteScan: data.incompleteScan } : {}),
      });
      if (requestId) await db.collection("privacyRequests").doc(requestId).set({ status: "exported", handledAt: new Date().toISOString(), handledBy: adminUser.email }, { merge: true });
      return;
    }
    // Erase: delete marketing, cart, alert, contact and account data. Orders that were never paid
    // lose the customer's details; paid orders stay (tax and accounting records) with their
    // private notes blanked. Gift cards keep their balance but lose names, emails and message.
    // Reviews lose the name, and (admin's choice) are unpublished or lose their text.
    const reviewMode = ["unpublish", "remove-text"].includes(req.body?.reviewAction) ? req.body.reviewAction : "anonymize";
    const now = new Date().toISOString();
    const ops = [];
    for (const d of [...data.alerts, ...data.carts, ...data.contacts, ...data.messages, ...data.queuedEmails, ...data.emailRows]) ops.push(b => b.delete(d.ref));
    if (data.newsletter.exists) ops.push(b => b.delete(data.newsletter.ref));
    if (data.profile?.exists) ops.push(b => b.delete(data.profile.ref));
    for (const r of data.reviews) ops.push(b => b.update(r.ref, reviewErasure(reviewMode)));
    const redactedOrders = data.orders.filter(d => neverPaid(d.data()));
    const keptOrders = data.orders.filter(d => !neverPaid(d.data()));
    const redactedIds = new Set(redactedOrders.map(d => d.id));
    for (const d of redactedOrders) ops.push(b => b.update(d.ref, redactedOrderFields(now)));
    for (const d of data.operations) {
      if (redactedIds.has(d.id)) ops.push(b => b.delete(d.ref));
      else ops.push(b => b.set(d.ref, redactedOperationsFields(d.data(), now), { merge: true }));
    }
    for (const d of data.giftCards) ops.push(b => b.update(d.ref, { ...GIFT_CARD_PERSONAL, privacyRedactedAt: now }));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      for (const op of ops.slice(i, i + 400)) op(batch);
      await batch.commit();
    }
    if (data.user) await admin.auth().deleteUser(data.user.uid);
    await db.collection("marketing-optout").doc(optOutId(email)).set({ at: now, source: "privacy-erase" }).catch(() => {});
    const summary = {
      deleted: { backInStockAlerts: data.alerts.length, savedCarts: data.carts.length, reviewContacts: data.contacts.length, contactMessages: data.messages.length, queuedEmails: data.queuedEmails.length, emailLogRows: data.emailRows.length, newsletter: data.newsletter.exists ? 1 : 0, account: data.user ? 1 : 0 },
      anonymizedReviews: data.reviews.length,
      reviewAction: reviewMode,
      redactedUnpaidOrders: redactedOrders.map(d => d.id),
      redactedGiftCards: data.giftCards.length,
      keptOrders: keptOrders.map(d => d.id),
      ...(data.incompleteScan.length ? { incompleteScan: data.incompleteScan } : {}),
    };
    if (requestId) await db.collection("privacyRequests").doc(requestId).set({ status: "erased", handledAt: now, handledBy: adminUser.email, summary }, { merge: true });
    res.status(200).json(summary);
  } catch (err) {
    console.error("Privacy action failed:", err);
    res.status(500).json({ error: "The privacy action failed. Try again; nothing is half-deleted that a retry won't finish." });
  }
}

// ──────────────────────────────────────────────────────────────
// 2. HTTP Endpoint: Stripe Payment Webhook (Secure)
// ──────────────────────────────────────────────────────────────
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    let testMode = false;
    let stripeSecret = STRIPE_SECRET_KEY.value();
    try {
      const settingsDoc = await db.collection("settings").doc("website").get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data() || {};
        testMode = settings.payments?.testMode || false;
        const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);
        if (testMode && stripeSettings.testSecretKey) {
          stripeSecret = stripeSettings.testSecretKey;
        } else if (!testMode && stripeSettings.secretKey) {
          stripeSecret = stripeSettings.secretKey;
        }
      }
    } catch (dbErr) {
      console.warn("Failed to load settings in webhook, falling back to env secret key:", dbErr);
    }

    const stripe = new Stripe(stripeSecret);
    const sig = req.headers["stripe-signature"];

    // Test and live endpoints each sign with their own secret: accept the deployed
    // Functions secret and the endpoint secrets saved by Settings › Payments ›
    // "Check & fix webhook". A signature must still verify against one of them.
    const savedSecrets = await readAdminSecret("stripeWebhook");
    let deployedSecret = "";
    try { deployedSecret = STRIPE_WEBHOOK_SECRET.value(); } catch { /* not set */ }
    const secrets = signingSecrets(deployedSecret, savedSecrets.live, savedSecrets.test);
    let event;
    let lastError = null;
    for (const secret of secrets) {
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!event) {
      const message = lastError?.message || "No webhook signing secret is configured.";
      console.error("Signature verification failed:", message);
      // Leave a trace the admin can see (Settings › Payments › Webhook health) — but only
      // for requests that look like Stripe's (a signed header), so bots and scanners
      // hitting this public URL can't make a working webhook look broken.
      if (looksLikeStripeSignature(sig)) {
        await db.collection("adminSecrets").doc("stripeWebhookStatus").set({
          lastFailureAt: new Date().toISOString(),
          lastFailure: `Signature check failed: ${String(message).slice(0, 300)}`,
        }, { merge: true }).catch(() => {});
      }
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    // Event-level idempotency: Stripe can deliver the same event more than once.
    // Mirror the PayPal webhook's dedupe so each event is processed at most once.
    const stripeEventRef = db.collection("payment-webhook-events").doc(`stripe-${event.id}`);
    if ((await stripeEventRef.get()).exists) {
      res.json({ received: true, duplicate: true });
      return;
    }

    // Stripe-side outcomes that never mark an order paid: record them on the
    // order timeline so the admin can see what happened.
    const noteOnOrder = async (orderId, message, extra = {}) => {
      if (!orderId) return;
      const ref = db.collection("orders").doc(orderId);
      await db.runTransaction(async t => {
        const snap = await t.get(ref);
        if (!snap.exists) return;
        const now = new Date().toISOString();
        const fields = typeof extra === "function" ? extra(snap.data()) : extra;
        t.update(ref, {
          ...fields,
          updatedAt: now,
          activity: [...(snap.data().activity || []), { type: "event", message, createdAt: now }],
        });
      });
    };

    try {
      if (event.type === "checkout.session.expired") {
        await noteOnOrder(event.data.object.client_reference_id, "Stripe Checkout session expired without payment.");
      } else if (event.type === "checkout.session.async_payment_failed") {
        const failedSession = event.data.object;
        // A late failure from an old session must never undo a paid order or one paid through another session.
        await noteOnOrder(failedSession.client_reference_id, "Delayed payment failed (Stripe).", current =>
          lateFailureMayMarkFailed(current, failedSession.id) ? { paymentStatus: "failed" } : {});
      } else if (event.type === "payment_intent.payment_failed" && event.data.object?.metadata?.checkout === "payment_element") {
        const reason = event.data.object.last_payment_error?.message || "unknown reason";
        await noteOnOrder(event.data.object.metadata.order_id, `Card payment attempt failed (Stripe): ${reason}`);
      } else if (event.type.startsWith("charge.dispute.")) {
        const dispute = event.data.object;
        const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        if (piId) {
          const snap = await db.collection("orders").where("stripePaymentIntentId", "==", piId).limit(1).get();
          if (!snap.empty) {
            await noteOnOrder(snap.docs[0].id,
              event.type === "charge.dispute.created"
                ? `Stripe dispute opened (${(dispute.amount / 100).toFixed(2)} ${(dispute.currency || "").toUpperCase()}, reason: ${dispute.reason || "unknown"}). Respond in the Stripe Dashboard before the evidence deadline.`
                : `Stripe dispute is now ${String(dispute.status || "updated").replace(/_/g, " ")}.`,
              { disputeStatus: dispute.status || "needs_response", disputeId: dispute.id });
            if (event.type === "charge.dispute.closed" && dispute.status === "lost") {
              await applyOrderRefund(snap.docs[0].id, { provider: "dispute", amountMinor: dispute.amount, currency: dispute.currency, status: "succeeded", restock: false, actor: "stripe-dispute", note: "chargeback lost" });
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to record ${event.type}:`, err);
      await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Webhook failure: ${err.message}`);
      return;
    }

    // Any succeeded PaymentIntent that names one of our orders settles it (card form
    // or hosted Checkout — a duplicate of checkout.session.completed is a no-op).
    const isElementPayment = !!paidIntentOrderId(event);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded" || isElementPayment) {
      // A succeeded intent is shaped into the session fields used below.
      const session = isElementPayment ? intentAsSession(event.data.object) : event.data.object;
      const orderId = session.client_reference_id;
      // completed can fire before delayed methods settle; only paid sessions count.
      const settled = session.payment_status === "paid" || session.payment_status === "no_payment_required";

      if (orderId && settled) {
        try {
          await markStripeOrderPaid(orderId, session, { authority: STRIPE_WEBHOOK_AUTHORITY, account: event.account || null, message: isElementPayment ? "Payment completed (Stripe card form)" : "Payment completed (Stripe Webhook)" });
          console.log(`Order ${orderId} successfully processed via webhook.`);
        } catch (err) {
          console.error("Failed to process order update in transaction:", err);
          await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Transaction failure: ${err.message}`);
          return;
        }
      }
    }

    // A refund the bank rejected after Stripe accepted it: the order goes back to paid.
    if (event.type === "charge.refund.updated") {
      const refund = event.data.object;
      const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || null;
      if (paymentIntentId && ["failed", "canceled"].includes(String(refund.status))) {
        try {
          const snap = await db.collection("orders")
            .where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
          if (!snap.empty) await revertFailedRefund(snap.docs[0].id, { refundId: refund.id || null, source: `Stripe webhook${refund.failure_reason ? `: ${String(refund.failure_reason).replace(/_/g, " ")}` : ""}` });
        } catch (err) {
          console.error("Failed to sync charge.refund.updated:", err);
          await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Refund sync failure: ${err.message}`);
          return;
        }
      }
    }

    // Refunds issued directly from the Stripe Dashboard (or by any other path)
    // arrive as charge.refunded — sync them back so the order, inventory, and
    // analytics don't drift out of "paid".
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id || null;
      if (paymentIntentId) {
        try {
          const snap = await db.collection("orders")
            .where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
          if (!snap.empty) await syncStripeReversal(snap.docs[0].id, { charge, source: "Stripe webhook" });
        } catch (err) {
          console.error("Failed to sync charge.refunded:", err);
          await recordWebhookProcessingFailure(event, err);
          res.status(500).send(`Refund sync failure: ${err.message}`);
          return;
        }
      }
    }

    // Mark this event processed (after successful handling) for idempotency.
    await stripeEventRef.set({
      eventType: event.type,
      stripeEventId: event.id,
      processedAt: new Date().toISOString(),
      expiresAt: retainFor(90),
    });
    const receivedAt = new Date().toISOString();
    const eventMode = event.livemode ? "live" : "test";
    await db.collection("adminSecrets").doc("stripeWebhookStatus").set({
      lastReceivedAt: receivedAt,
      lastEventType: event.type,
      lastMode: eventMode,
      // Per Stripe account, so a test endpoint can't make the live one look healthy.
      [eventMode]: { lastReceivedAt: receivedAt, lastEventType: event.type },
    }, { merge: true }).catch(() => {});

    res.json({ received: true });
  }
);

// ──────────────────────────────────────────────────────────────
// 3. HTTP Endpoint: Refund a paid Stripe order (admin only)
// ──────────────────────────────────────────────────────────────
// Read-only profile estimate. Checkout resolves live carrier rates and reprices independently.
exports.cartShippingPreview = onBrowserRequest({}, async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  if (!(await hitLimit(db, "cart-shipping", req, LIMITS.track))) return res.status(429).json({ error: "too_many" });
  const { items: requested, country, postalCode } = req.body || {};
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 50 || typeof country !== "string" || !resolveCountry(country) || typeof postalCode !== "string" || !postalCode.trim() || postalCode.length > 20) return res.status(400).json({ error: "invalid_destination" });
  try {
    const lines = await Promise.all(requested.map(async item => {
      if (typeof item?.id !== "string" || !item.id || item.id.includes("/") || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error("invalid_cart");
      const snap = await db.collection("books").doc(item.id).get();
      const book = snap.data();
      if (!snap.exists || purchaseProblem(book, item.variantId)) throw new Error("invalid_cart");
      const variant = item.variantId ? (book.variants || []).find(value => value.id === item.variantId) : null;
      // An edition that no longer exists is refused here exactly as checkout refuses it.
      if (item.variantId && !variant) throw new Error("invalid_cart");
      const price = catalogUnitPrice(book, variant);
      if (!Number.isFinite(price) || price < 0) throw new Error("invalid_cart");
      // E-books and audiobooks are recognised by format too, as checkout does (isPhysicalItem).
      const digital = !isPhysicalItem({ format: catalogFormat(book, variant), digital: catalogDigital(book, variant) });
      // A box set without its own weight weighs what its books weigh (as priceOrder does), so the estimate matches the charge.
      let weightGrams = itemWeightGrams(book, variant);
      const parts = bundleComponents(book);
      if (weightGrams == null && parts.length) {
        const partBooks = await Promise.all(parts.map(part => db.collection("books").doc(part.id).get()));
        const weights = partBooks.map((doc, i) => {
          if (!doc.exists) return null;
          const partBook = doc.data();
          return itemWeightGrams(partBook, parts[i].variantId ? (partBook.variants || []).find(value => value.id === parts[i].variantId) || null : null);
        });
        if (weights.every(w => w != null)) weightGrams = weights.reduce((sum, w, i) => sum + w * parts[i].quantity, 0);
      }
      return { price, quantity: item.quantity, shippingProfileId: book.shippingProfileId || null, weightGrams, digital };
    }));
    const profilesSnap = await db.collection("shipping-profiles").get();
    const physical = lines.filter(item => !item.digital);
    // No invented fallback rate when shipping has not been configured.
    const profiles = profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const quotes = profiles.length ? quoteShipping(physical, { country }, profiles).filter(quote => quote.type !== "pickup") : [];
    res.status(200).json({ quotes, digitalOnly: physical.length === 0, preliminary: true });
  } catch (error) { res.status(error.message === "invalid_cart" ? 409 : 500).json({ error: error.message === "invalid_cart" ? "invalid_cart" : "unavailable" }); }
});

// Admin-only return decisions; operational inspection details stay private.
exports.manageReturn = onBrowserRequest({}, async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const user = await requireAdmin(req, res);
  if (!user) return;
  const { orderId, action, instructions, inspection } = req.body || {};
  if (typeof orderId !== "string" || !orderId || orderId.length > 64 || orderId.includes("/")) return res.status(400).json({ error: "Invalid order ID." });
  try {
    const progress = await db.runTransaction(async tx => {
      const orderRef = db.collection("orders").doc(orderId);
      const opsRef = db.collection("order-operations").doc(orderId);
      const [orderSnap, opsSnap] = await Promise.all([tx.get(orderRef), tx.get(opsRef)]);
      if (!orderSnap.exists) { const error = new Error("Order not found."); error.status = 404; throw error; }
      const order = orderSnap.data(), ops = opsSnap.data() || {};
      const now = new Date().toISOString();
      const next = returnTransition(order, ops.returnCase, action, { instructions, inspection }, now, user.email || user.uid);
      if (next === ops.returnCase) return publicReturn(next);
      const progress = publicReturn(next);
      tx.set(opsRef, { ...ops, returnCase: next, updatedAt: now, activity: [...(ops.activity || []), { type: "event", message: `Return ${action}.`, createdAt: now, actor: user.email || user.uid }] });
      tx.update(orderRef, { returnProgress: progress, customerRequest: { ...order.customerRequest, status: ["rejected", "closed"].includes(action) ? "handled" : "open" }, updatedAt: now });
      return progress;
    });
    res.status(200).json({ progress });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || "Could not update return." }); }
});

exports.refundOrder = onBrowserRequest(
  { secrets: [STRIPE_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { orderId, reason, restock = true, amountMinor = null, restockLines = null } = req.body || {};
    if (!orderId || typeof orderId !== "string" || orderId.includes("/")) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }

    const orderRef = db.collection("orders").doc(orderId);
    const actor = adminUser.email || adminUser.uid;
    const reasonText = String(reason || "Admin refund").slice(0, 500);
    const claimedAt = new Date().toISOString();
    let claimed = false, providerAccepted = false, providerCalled = false;
    // Only these mean the provider certainly took no refund; anything else may still complete.
    const DEFINITE_REFUSALS = ["StripeInvalidRequestError", "StripeCardError", "StripePermissionError", "StripeAuthenticationError"];
    // A refund attempt that never reached the provider must not leave its claim behind:
    // a stale refundRequest would block every later return step on this order.
    const releaseClaim = () => db.runTransaction(async transaction => {
      const snap = await transaction.get(orderRef);
      const current = snap.exists ? snap.data() : null;
      if (current && current.paymentStatus === "paid" && current.refundRequest?.at === claimedAt) transaction.update(orderRef, { refundRequest: null });
    }).catch(err => console.warn(`Could not release refund claim for ${orderId}:`, err.message));
    try {
      // Claim the refund first and save the admin's restock choice, so a Stripe/PayPal
      // refund webhook that lands before we finish follows the same choice.
      let plan = null, partialLines = [], fromReturn = false;
      const order = await db.runTransaction(async transaction => {
        const snap = await transaction.get(orderRef);
        if (!snap.exists) { const e = new Error("Order not found"); e.status = 404; throw e; }
        const current = snap.data();
        if (current.paymentStatus !== "paid") {
          const e = new Error(current.paymentStatus === "refunded" ? "This order has already been refunded." : "Only paid orders can be refunded.");
          e.status = 409; throw e;
        }
        // Books on their way back (approved / received) are inspected before the money goes back.
        // A request the shop hasn't approved (e-book orders, goodwill refunds) can be refunded directly.
        if (current.customerRequest?.type === "return" && current.customerRequest.status === "open" && ["approved", "received"].includes(current.returnProgress?.state)) {
          const error = new Error("Receive and inspect the returned books before refunding this return."); error.status = 409; throw error;
        }
        // Never more than was charged; an amount reaching what is left is today's full refund.
        plan = refundPlan(current, amountMinor);
        partialLines = []; fromReturn = false;
        if (plan.kind === "partial") {
          fromReturn = current.returnProgress?.state === "inspected";
          if (fromReturn && restock !== false) {
            // A partial return: the inspected resellable copies go back, as for a full return refund.
            const ops = (await transaction.get(db.collection("order-operations").doc(orderId))).data() || {};
            partialLines = restockLinesFor(current, (ops.returnCase?.inspection || []).map(row => ({ index: row.index, quantity: row.restockQuantity ?? (row.condition === "resellable" ? row.quantity : 0) })));
          } else if (!fromReturn) partialLines = restockLinesFor(current, restockLines);
        }
        // A gift card this order bought that has since been spent can't be taken back by a refund.
        const issued = plan.kind === "full" && Array.isArray(current.giftCardsIssued) ? current.giftCardsIssued : [];
        if (issued.length) {
          const cards = await Promise.all(issued.map(card => transaction.get(db.collection("giftCards").doc(card.id))));
          const spentMinor = cards.reduce((sum, cardSnap) => {
            const card = cardSnap.exists ? cardSnap.data() : null;
            return card ? sum + Math.max(0, Math.floor(Number(card.initialMinor) || 0) - Math.floor(Number(card.balanceMinor) || 0)) : sum;
          }, 0);
          if (spentMinor > 0) {
            const error = new Error(`CA$${(spentMinor / 100).toFixed(2)} of the gift cards this order bought has already been spent. A full refund would give that money back twice. Refund only the unused part in Stripe or PayPal directly, then disable the card in Gift cards.`);
            error.status = 409; throw error;
          }
        }
        transaction.update(orderRef, { refundRequest: plan.kind === "partial"
          ? { restock: false, partial: true, amountMinor: plan.amountMinor, reason: reasonText, actor, at: claimedAt }
          : { restock: restock !== false, reason: reasonText, actor, at: claimedAt } });
        return current;
      });
      claimed = true;

      const provider = refundProviderOf(order);
      if (!provider) {
        await releaseClaim();
        res.status(409).json({ error: "This order has no saved card or PayPal payment to refund. Refund it in Stripe or PayPal directly; the order updates itself." });
        return;
      }
      let outcome;
      if (provider === "stripe") {
        const stripeMode = order.stripeMode === "test" ? "test" : "live";
        const { stripe, requestOptions } = await getStripeClientForMode(stripeMode, order.stripeAccountId || null);
        providerCalled = true;
        const refund = await stripe.refunds.create({
          payment_intent: order.stripePaymentIntentId,
          ...(plan.kind === "partial" ? { amount: plan.amountMinor } : {}),
          reason: "requested_by_customer",
          metadata: { order_id: orderId, admin_email: adminUser.email || "", reason: reasonText },
        }, { ...requestOptions, idempotencyKey: plan.kind === "partial" ? partialRefundKey(orderId, plan.already, plan.amountMinor) : `order-refund-${orderId}-full${refundRetrySuffix(order)}` });
        if (!["succeeded", "pending"].includes(refund.status)) {
          throw new Error(`Stripe refund was not accepted (status: ${refund.status}).`);
        }
        outcome = { refundId: refund.id, amountMinor: refund.amount, currency: refund.currency, status: refund.status };
      } else if (provider === "paypal") {
        const config = await getPayPalConfig();
        if (order.paypalMode === "test") config.testMode = true;
        else if (order.paypalMode === "live") config.testMode = false;
        providerCalled = true;
        const refund = await paypalRequest(config, `/v2/payments/captures/${encodeURIComponent(order.paypalCaptureId)}/refund`, {
          method: "POST",
          headers: { "PayPal-Request-Id": plan.kind === "partial" ? `refund-${orderId}-partial-${plan.already}-${plan.amountMinor}` : `refund-${orderId}-full${refundRetrySuffix(order)}` },
          body: JSON.stringify({ note_to_payer: reasonText.slice(0, 255),
            ...(plan.kind === "partial" ? { amount: { value: (plan.amountMinor / 100).toFixed(2), currency_code: String(order.paypalCurrency || plan.currency).toUpperCase() } } : {}) }),
        });
        const status = String(refund.status || "").toUpperCase();
        if (!["COMPLETED", "PENDING"].includes(status)) throw new Error(`PayPal refund was not accepted (status: ${refund.status}).`);
        outcome = {
          refundId: refund.id,
          amountMinor: refund.amount?.value != null ? toMinor(refund.amount.value) : null,
          currency: refund.amount?.currency_code || order.paypalCurrency || null,
          status: status === "COMPLETED" ? "succeeded" : "pending",
        };
      } else {
        // e-Transfer, cash, pickup: the money goes back outside the shop; this records it.
        outcome = { refundId: null, amountMinor: plan.kind === "partial" ? plan.amountMinor : null, currency: plan.kind === "partial" ? plan.currency : null, status: "succeeded" };
      }

      providerAccepted = true;
      if (plan.kind === "partial") {
        const result = await applyPartialRefund(orderId, {
          provider, refundId: outcome.refundId, amountMinor: outcome.amountMinor ?? plan.amountMinor, already: plan.already,
          currency: outcome.currency || plan.currency, status: outcome.status, restockLines: partialLines, fromReturn, reason: reasonText, actor, claimedAt,
        });
        res.status(200).json({ refundId: outcome.refundId, amount: (outcome.amountMinor ?? plan.amountMinor) / 100, currency: String(outcome.currency || plan.currency).toUpperCase(),
          status: outcome.status, provider, partial: true, alreadyRecorded: result.alreadyRecorded });
        return;
      }
      // After earlier partial refunds the provider refunds what is left; record the running total.
      if (plan.already > 0 && outcome.amountMinor != null) outcome.amountMinor += plan.already;
      const result = await applyOrderRefund(orderId, {
        provider, ...outcome, restock: restock !== false, reason: reasonText, actor,
      });
      res.status(200).json({
        refundId: outcome.refundId,
        amount: outcome.amountMinor != null ? outcome.amountMinor / 100 : Number(order.total) || 0,
        currency: String(outcome.currency || order.checkoutCurrency || "CAD").toUpperCase(),
        status: outcome.status,
        provider,
        alreadyRecorded: result.alreadyRecorded,
      });
    } catch (err) {
      console.error("refundOrder failed:", err);
      // Keep the claim only when the provider may have taken the refund (accepted, or a lost
      // connection): its webhook then follows the admin's restock choice.
      if (claimed && !providerAccepted && (!providerCalled || DEFINITE_REFUSALS.includes(err?.type) || (err?.status >= 400 && err?.status < 500))) await releaseClaim();
      const status = err.status || (err.type?.startsWith("Stripe") ? 400 : 500);
      res.status(status).json({ error: err.message || "Refund failed" });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// 4. HTTP Endpoint: Secure Digital Ebook Asset Downloads
// ──────────────────────────────────────────────────────────────
exports.downloadDigitalAsset = onRequest(
  async (req, res) => {
    const { orderId, itemId, token } = req.query;
    if (!orderId || !itemId || !token) {
      res.status(400).send("Missing download parameters");
      return;
    }

    try {
      const orderDoc = await db.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) {
        res.status(404).send("Order not found");
        return;
      }

      const order = orderDoc.data();
      // The token is a random secret generated at payment time and only ever
      // delivered to the buyer's inbox — possession proves entitlement.
      const expected = order.downloadToken || "";
      const provided = String(token);
      const valid =
        expected.length > 0 &&
        expected.length === provided.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
      if (!valid) {
        res.status(403).send("Unauthorized access");
        return;
      }

      const refusal = digitalDelivery.downloadRefusal(order);
      if (refusal) {
        res.status(refusal.status).send(refusal.message);
        return;
      }

      // The order's own lines for this book, plus box-set parts (a part's book id is a valid itemId).
      const variantParam = req.query.variantId === undefined ? undefined : String(req.query.variantId);
      const candidates = digitalDelivery.deliveryCandidates(order, String(itemId), variantParam);
      if (!candidates.length) {
        res.status(404).send("Item not found in this order");
        return;
      }

      const bookDoc = await db.collection("books").doc(String(itemId)).get();
      if (!bookDoc.exists) {
        res.status(404).send("Product details not found");
        return;
      }

      const book = bookDoc.data();
      // Only a digital edition unlocks the file: a paperback of the same book does not.
      // Older orders saved no format, so their line is checked against the catalog.
      const bought = candidates.filter(({ line, variantId, bundle }) => {
        const recorded = !bundle && (line.digital !== undefined || line.isDigital !== undefined || line.format !== undefined);
        if (recorded) return !isPhysicalItem(line);
        const variant = variantId ? (book.variants || []).find(v => v.id === variantId) || null : null;
        return catalogDigital(book, variant);
      });
      if (!bought.length) {
        res.status(403).send("This order does not include the digital edition.");
        return;
      }
      // A pre-ordered e-book unlocks on its publication date (the live catalog decides, so a
      // release the publisher brings forward unlocks early too). Only lines bought as a
      // pre-order wait: turning pre-order on later for a new edition never locks earlier buyers out.
      const ready = bought.filter(({ line, bundle }) => !((bundle ? bundle.preorder : line.preorder) === true && preorderActive(book)));
      if (!ready.length) {
        res.status(403).send(book.publishDate ? `This pre-order can be downloaded from ${String(book.publishDate).slice(0, 10)}.` : "This pre-order can be downloaded once the book is released.");
        return;
      }
      // One file per digital edition: the edition's own file, else the book's.
      const target = ready.find(c => digitalDelivery.pickFileName(book, c.variantId)) || ready[0];
      const fileName = digitalDelivery.pickFileName(book, target.variantId);
      if (!fileName) {
        res.status(400).send("This publication does not have a digital download configured.");
        return;
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(`digital-assets/${fileName}`);

      const exists = await file.exists();
      if (!exists[0]) {
        res.status(404).send("Digital asset file not found in storage.");
        return;
      }

      // Each book + edition on the order can be fetched a limited number of times (counted atomically);
      // Order detail › Reset downloads gives the buyer a fresh allowance.
      const orderRef = db.collection("orders").doc(String(orderId));
      const key = digitalDelivery.countKey(target.bookId, target.variantId);
      const claim = await db.runTransaction(async tx => {
        const fresh = await tx.get(orderRef);
        const current = fresh.exists ? fresh.data() : {};
        const decision = digitalDelivery.nextDownloadCount(current.downloadCounts, key);
        if (decision.ok) tx.update(orderRef, { downloadCounts: decision.next });
        return decision;
      });
      if (!claim.ok) {
        res.status(429).send(`This download has been used ${claim.used} times, which is the limit. Please reply to your order email and we will reset it.`);
        return;
      }

      // A fresh, short-lived link per click, saved as an attachment named after the book.
      const filename = digitalDelivery.downloadFilename(book.title || target.line.title, fileName);
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + digitalDelivery.SIGNED_URL_MINUTES * 60 * 1000,
        responseDisposition: digitalDelivery.contentDisposition(filename),
        responseType: digitalDelivery.contentTypeFor(fileName),
      });

      res.redirect(signedUrl);
    } catch (err) {
      console.error("Download redirection failed:", err);
      res.status(500).send("Sorry, the download could not be prepared right now. Please try again in a few minutes, or reply to your order email for help.");
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 4. Notification Settings and Helper Functions
// ──────────────────────────────────────────────────────────────
const DEFAULT_NOTIFICATIONS = {
  // Settings › Notifications: off by default (`enabled: false`); `delayDays` after shipping (functions/reviewRequests.js).
  review_request: REVIEW_REQUEST_TEMPLATE,
  brand: {
    logoUrl: "",
    brandColor: "#e8402a",
    emailTheme: "light"
  },
  order_confirmation: {
    subject: "Order confirmed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your purchase! We've received your order and are preparing it for shipment. We will send you another email when it has shipped.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe Lyricalmyrical Team",
    enabled: true
  },
  shipping_confirmation: {
    subject: "Your order is on the way!",
    body: "Hi {{customer_name}},\n\nGood news! Your order {{order_id}} has shipped with {{tracking_carrier}} and is on its way.\n\nTracking number: {{tracking_number}}\n\nUse the button below to follow your parcel on the carrier's website.",
    buttonText: "Track your shipment",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  abandoned_cart: {
    subject: "Did you forget something?",
    body: "Hi {{customer_name}},\n\nWe noticed you left some items in your cart. We've saved them for you, so you can easily complete your purchase whenever you're ready!",
    buttonText: "Resume purchase",
    signoff: "Thanks,\nThe Lyricalmyrical Team",
    enabled: true
  },
  order_cancelled: {
    subject: "Order cancelled: {{order_id}}",
    body: "Hi {{customer_name}},\n\nYour order has been cancelled and you will not be charged. If you have any questions, please contact us.",
    buttonText: "",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  order_pending_payment: {
    subject: "Order received — payment needed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your order! It is reserved for you, but it is not paid yet. Please pay {{total_price}} by {{payment_method}} using the instructions below. We'll confirm by email as soon as your payment arrives and then prepare your order.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe Lyricalmyrical Team",
    enabled: true
  },
  order_refunded: {
    subject: "Order refunded: {{order_id}}",
    body: "Hi {{customer_name}},\n\nWe have successfully refunded {{total_price}} for your order. The funds should return to your original payment method in 5-10 business days.",
    buttonText: "",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  customer_welcome: {
    subject: "Welcome to Lyricalmyrical Books!",
    body: "Hi {{customer_name}},\n\nThank you for creating an account with Lyricalmyrical Books! You can now log in to view your orders, save shipping addresses, and download digital library books.",
    buttonText: "Go to your account",
    signoff: "Warmly,\nThe Lyricalmyrical Team",
    enabled: true
  },
  contact_reply: {
    subject: "We got your message",
    body: "Hi {{customer_name}},\n\nThanks for getting in touch with Lyricalmyrical Books! We've received your message and will reply as soon as we can.",
    buttonText: "",
    signoff: "Warmly,\nThe Lyricalmyrical Team",
    enabled: true
  },
  gift_card: {
    subject: "You've received a {{amount}} gift card",
    body: "Hi {{recipient_name}},\n\n{{sender_name}} sent you a {{amount}} gift card for Lyricalmyrical Books.\n\n{{message}}\n\nYour gift card code: {{code}}\n\nEnter it in the Gift card box at checkout. {{expires}}",
    buttonText: "Shop now",
    signoff: "Happy reading,\nThe Lyricalmyrical Team",
    enabled: true
  },
  delivery_update: {
    subject: "Delivery Update: Your order is {{status}}",
    body: "Hi {{customer_name}},\n\nYour package tracking status has been updated: {{status}}.\n\nCarrier: {{tracking_carrier}}\nTracking: {{tracking_number}}",
    buttonText: "Track shipment",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  }
};

async function loadNotificationSettings() {
  let dbSettings = {};
  try {
    const snap = await db.collection("settings").doc("notifications").get();
    if (snap.exists) {
      dbSettings = snap.data() || {};
    }
  } catch (err) {
    console.warn("Failed to load notifications from Firestore, using default fallback:", err);
  }

  const merged = { ...DEFAULT_NOTIFICATIONS };
  for (const key of Object.keys(DEFAULT_NOTIFICATIONS)) {
    if (key === "brand") {
      merged.brand = { ...DEFAULT_NOTIFICATIONS.brand, ...(dbSettings.brand || {}) };
    } else {
      merged[key] = { ...DEFAULT_NOTIFICATIONS[key], ...(dbSettings[key] || {}) };
    }
  }
  // Emails to the shop itself (Settings › Notifications › Emails to the shop). On unless switched off;
  // an older saved new_order_admin.enabled is honoured too.
  merged.shopAlerts = {
    newOrder: dbSettings.shopAlerts?.newOrder ?? (dbSettings.new_order_admin?.enabled !== false),
    shipped: dbSettings.shopAlerts?.shipped !== false,
  };
  return merged;
}

// Studio › Style › Customer accounts. On unless the published design turns it off.
async function customerAccountsEnabled() {
  try {
    const design = (await db.collection("settings").doc("website").get()).data()?.design || {};
    return (design.storefront?.customerAccounts ?? design.customerAccounts) !== false;
  } catch (err) {
    console.warn("Could not read customer-accounts setting:", err);
    return true;
  }
}

// Keep in step with src/app/lib/tracking.ts. A publisher-entered link (manual
// dispatch with a carrier we don't recognise) wins over the built-in pages.
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

// How the order reaches the customer, for the order confirmation email.
// Pickup or local delivery (the server-priced choice, else the shopper's selection).
const localMethodOf = order => order?.fulfillment?.method || order?.fulfillmentSelection?.method || "";
const isLocalOrder = order => ["pickup", "local_delivery"].includes(localMethodOf(order));

function deliveryDetails(order) {
  const local = order.fulfillment || {};
  if (local.method === "pickup") {
    const a = local.address || {};
    return {
      heading: "Pickup",
      method: local.name || "Pickup",
      estimate: local.estimate || "",
      lines: [local.name, [a.street, a.city, a.state, a.zip].filter(Boolean).join(", "), local.hours, local.estimate, "We'll email you when your order is ready to collect."].filter(Boolean),
    };
  }
  if (local.method === "local_delivery") {
    return { heading: "Local delivery", method: local.name || "Local delivery", estimate: local.estimate || "", lines: [local.name, local.estimate].filter(Boolean) };
  }
  if (!order.shippingMethod) return { heading: "", method: "", estimate: "", lines: [] };
  const est = order.shippingEstimate || {};
  const days = String(est.days || "").trim();
  const estimate = days ? `${days} business day${days === "1" ? "" : "s"} after dispatch` : String(est.terms || "").trim();
  const a = order.customer?.address || {};
  return {
    heading: "Shipping",
    method: order.shippingMethod,
    estimate,
    lines: [order.shippingMethod, estimate && `Expected delivery: ${estimate}`, [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(", "), "We'll email your tracking number as soon as it ships."].filter(Boolean),
  };
}

const isPhysicalAny = order => (order?.items || []).some(item => item && isPhysicalItem(item));

// Public storefront address for links in emails (Firebase Hosting). When the shop gets its own domain, set the
// repository variable SITE_URL: deploy-firebase.yml writes it into the Functions env (functions/.env.<project>).
const SITE_URL = String(process.env.SITE_URL || "https://lyricalmyrical-web-v2.web.app").replace(/\/+$/, "");
const siteLink = path => `${SITE_URL}${path}`;

// One-click order link for emails: /track opens the order straight away when the
// key matches, instead of asking the customer to type the order number and email.
async function orderTrackUrl(orderId, order) {
  let key = "";
  try {
    await db.runTransaction(async tx => {
      const ref = db.collection("orders").doc(orderId);
      const snap = await tx.get(ref);
      const saved = snap.exists ? snap.data() : order;
      key = typeof saved?.trackingKey === "string" && /^[a-f0-9]{32,64}$/.test(saved.trackingKey) ? saved.trackingKey : crypto.randomBytes(32).toString("hex");
      if (snap.exists && saved.trackingKey !== key) tx.update(ref, { trackingKey: key });
    });
  } catch (err) { return siteLink(`/track?orderId=${encodeURIComponent(orderId)}`); }
  return siteLink(`/track?orderId=${encodeURIComponent(orderId)}&key=${key}`);
}

function getTrackingUrl(carrier, trackingNum, customUrl) {
  try {
    const custom = new URL(String(customUrl || "").trim());
    if (custom.protocol === "https:" || custom.protocol === "http:") return custom.toString();
  } catch (_) { /* no usable custom link */ }
  // Shippo reports carriers as tokens ("canada_post"), people type "Canada Post".
  const cleanCarrier = (carrier || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const cleanNum = (trackingNum || "").trim();
  if (cleanCarrier.includes("purolator")) {
    return `https://www.purolator.com/en/shipping/tracker?pin=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("canpar")) {
    return `https://www.canpar.com/en/tracking/delivery_options.htm?barcode=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("canada post")) {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("fedex")) {
    return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${encodeURIComponent(cleanNum)}`;
  }
  if (cleanCarrier.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(cleanNum)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(carrier + " " + cleanNum)}`;
}

function compileEmailTemplate(templateId, settings, vars, additionalSection) {
  const brand = settings.brand || {};
  const logoUrl = brand.logoUrl || "";
  const brandColor = brand.brandColor || "#e8402a";
  
  const template = settings[templateId] || DEFAULT_NOTIFICATIONS[templateId];
  let subject = template.subject || DEFAULT_NOTIFICATIONS[templateId].subject;
  // A required line (the gift-card code) comes back even if an edit removed it.
  let body = withRequiredPlaceholders(templateId, template.body || DEFAULT_NOTIFICATIONS[templateId].body);
  let buttonText = template.buttonText !== undefined ? template.buttonText : DEFAULT_NOTIFICATIONS[templateId].buttonText;
  let signoff = template.signoff || DEFAULT_NOTIFICATIONS[templateId].signoff;

  // Replace placeholders in subject and body
  // Values are shopper-controlled (names, messages, statuses): HTML-escaped in the
  // body, newline-stripped in the subject. A replacer function keeps "$" literal.
  // items_table is the one var built here as trusted HTML.
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const text = String(value ?? "");
    // The order table is HTML: it belongs in the body only.
    subject = subject.replace(regex, () => (key === "items_table" ? "" : text.replace(/[\r\n]+/g, " ")));
    // items_table is placed after line breaks are added (placeItemsTable), so it is left in the body here.
    if (key !== "items_table") body = body.replace(regex, () => escapeHtml(text));
    if (key !== "items_table") signoff = signoff.replace(regex, () => escapeHtml(text));
  }

  subject = blankUnknownPlaceholders(subject).replace(/\s{2,}/g, " ").trim();
  // Keep {{items_table}} for placeItemsTable; every other unknown placeholder reads as blank.
  body = blankUnknownPlaceholders(body.replace(/\{\{\s*items_table\s*\}\}/g, "\u0000ITEMS\u0000")).replace(/\u0000ITEMS\u0000/g, "{{items_table}}");
  buttonText = blankUnknownPlaceholders(buttonText);
  signoff = blankUnknownPlaceholders(signoff);

  // Only a real web link becomes a button (never javascript: or a broken attribute).
  const buttonUrl = /^https?:\/\//i.test(String(vars.button_url || "")) ? escapeHtml(String(vars.button_url)) : "";
  const ctaButtonHtml = buttonText && buttonUrl ? risoButton(buttonUrl, buttonText, brandColor, brand.emailTheme) : "";

  const placed = placeItemsTable(body.replace(/\n/g, "<br/>"), vars.items_table || "");
  const finalBody = placed.body;
  const itemsTableHtml = placed.after;
  const signoffHtml = signoff.replace(/\n/g, "<br/>");

  const html = risoLayout(`
    <p style="margin-top:0;">${finalBody}</p>
    ${ctaButtonHtml}
    ${itemsTableHtml}
    ${additionalSection || ""}
    <p style="margin-top:30px;font-weight:600;">${signoffHtml}</p>
  `, { logoUrl, accent: brandColor, theme: brand.emailTheme });

  return { subject, html };
}


// [Duplicate exports.onOrderCreated removed; logic consolidated in export at bottom]

// ──────────────────────────────────────────────────────────────
// 5b. Order Paid: Trigger notifications only AFTER successful payment
// ──────────────────────────────────────────────────────────────
// Emails one gift card's code to its recipient (or `to`). Records emailedAt on the card.
async function emailGiftCard(cardId, card, { to = "", notificationSettings = null, queue = "", test = false } = {}) {
  const recipient = String(to || card.recipientEmail || card.purchaserEmail || "").trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)) throw new Error("This gift card has no email address to send to.");
  const settings = notificationSettings || await loadNotificationSettings();
  const compiled = compileEmailTemplate("gift_card", settings, {
    recipient_name: card.recipientName || "there",
    sender_name: card.senderName || "Someone",
    amount: `CA$${(Number(card.initialMinor) / 100).toFixed(2)}`,
    code: card.code,
    message: card.message || "",
    expires: card.expiresOn ? `It can be used until ${card.expiresOn}.` : "",
    button_url: siteLink("/"),
    shop_url: siteLink("/"),
  });
  await sendEmail({ to: recipient, subject: `${test ? "[TEST] " : ""}${compiled.subject}`, html: compiled.html, secret: RESEND_API_KEY.value(), queue, about: { giftCardId: cardId } });
  const at = new Date().toISOString();
  await db.collection("giftCards").doc(cardId).update({ emailedAt: at, history: withHistory(card, { type: "emailed", minor: 0, to: recipient, at }), updatedAt: at });
}

// A paid order with gift-card lines gets its cards once (giftCardsIssuedAt), then each is emailed.
async function issueGiftCardsForOrder(orderId) {
  const orderRef = db.collection("orders").doc(orderId);
  let created = [];
  let testOrder = false;
  await db.runTransaction(async tx => {
    created = [];
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const order = snap.data();
    testOrder = order.isTest === true || order.sandboxPayment === true;
    if (order.giftCardsIssuedAt || order.paymentStatus !== "paid") return;
    const cards = cardsForOrder(orderId, order);
    if (!cards.length) return;
    const now = new Date().toISOString();
    for (const card of cards) tx.create(db.collection("giftCards").doc(card.id), card.data);
    tx.update(orderRef, {
      giftCardsIssuedAt: now,
      giftCardsIssued: cards.map(card => ({ id: card.id, last4: card.data.last4, minor: card.data.initialMinor, recipientEmail: card.data.recipientEmail, lineIndex: card.data.lineIndex })),
      updatedAt: now,
    });
    created = cards;
  });
  const notificationSettings = await loadNotificationSettings();
  if (notificationSettings.gift_card?.enabled === false) return;
  // A test-card (sandbox) purchase never emails the recipients it names: anyone could otherwise
  // use test mode to send the shop's mail to strangers. The shop gets one [TEST] copy instead.
  const sends = testOrder ? created.slice(0, 1) : created;
  for (const card of sends) {
    try {
      await emailGiftCard(card.id, card.data, testOrder ? { notificationSettings, to: ADMIN_TO, test: true } : { notificationSettings, queue: "giftCard" });
    } catch (err) {
      console.error(`Gift card email failed for order ${orderId}:`, err.message);
    }
  }
}

// The carrier address check is a nice-to-have: it runs AFTER every email, so a slow Shippo can
// never cost the customer their confirmation or the shop its new-order alert.
async function checkAddressAfterPayment(event) {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  if (after.isTest === true && after.sandboxPayment !== true) return;
  if (!(before.paymentStatus !== "paid" && after.paymentStatus === "paid") || !after.customer?.email) return;
  try {
    await autoApproveShippingAddress(event.params.orderId, after);
  } catch (err) {
    console.warn("Automatic address check failed; publisher review stays required", err);
  }
}
exports.onOrderUpdated = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [RESEND_API_KEY, SHIPPO_API_TOKEN], timeoutSeconds: 120 },
  async event => {
    try { await handleOrderUpdated(event); }
    finally { await checkAddressAfterPayment(event); }
  }
);
async function handleOrderUpdated(event) {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const orderId = event.params.orderId;

    // Test orders send nothing — except sandbox payments, whose emails are part of
    // the checkout rehearsal (they still never buy labels or touch stock).
    if (after.isTest === true && after.sandboxPayment !== true) return;
    // A refund the bank rejected put this order back to paid: tell the shop, because the customer
    // was told they were refunded (Orders › Needs attention also lists it).
    if (after.refundFailedAt && before.refundFailedAt !== after.refundFailedAt && after.paymentStatus === "paid") {
      try {
        await sendEmail({
          to: ADMIN_TO,
          subject: `Refund failed: order ${orderId} needs a new refund`,
          html: `<p>The refund for order <strong>${escapeHtml(orderId)}</strong> was rejected after it was accepted, so the customer was <strong>not</strong> refunded and the order is paid again.</p><p>Open the order in <a href="${siteLink(`/admin#orders/${encodeURIComponent(orderId)}`)}">Orders</a> to refund again or contact the customer. Do not pack it unless they still want it.</p>`,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error(`Could not email the shop about the failed refund on ${orderId}:`, err.message);
      }
    }
    if (!after.customer?.email) return;

    const notificationSettings = await loadNotificationSettings();
    let trackUrlPromise;
    const trackUrl = () => (trackUrlPromise = trackUrlPromise || orderTrackUrl(orderId, after));

    // 1. Order Confirmation (Order Paid)
    const becamePaid = before.paymentStatus !== "paid" && after.paymentStatus === "paid";
    // A paid order ends its checkout cart, so abandonedCartSweep never emails a paying customer.
    if (becamePaid && typeof after.cartId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(after.cartId)) {
      try {
        await db.collection("abandoned-carts").doc(after.cartId).set({ recovered: true, recoveredAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn("Could not mark checkout cart recovered", err);
      }
    }
    if (becamePaid && (after.items || []).some(item => item && item.giftCard === true)) {
      try {
        await issueGiftCardsForOrder(orderId);
      } catch (err) {
        console.error(`Could not issue gift cards for ${orderId}:`, err);
      }
    }
    if (becamePaid) {
      // If it is a manual payment method, decrement stock levels
      const isManual = after.paymentMethod && after.paymentMethod !== "Stripe" && after.paymentMethod !== "PayPal";
      if (isManual && after.inventoryDecrementedAt == null) {
        const itemList = after.items || [];
        try {
          await reserveStock(db, orderId, itemList, Date.now(), holdOwner(after));
          await db.runTransaction(async transaction => {
            const books = await readBooks(transaction, db, itemList);
            const oversold = writeStock(transaction, db, itemList, books, -1, new Date().toISOString());
            if (oversold) transaction.update(db.collection("orders").doc(orderId), { oversold: true });
            // Mark as decremented on the order document
            transaction.update(db.collection("orders").doc(orderId), {
              inventoryDecrementedAt: new Date().toISOString()
            });
          });
          console.log(`Successfully decremented inventory for manual order ${orderId}`);
        } catch (err) {
          console.error(`Failed to decrement inventory for manual order ${orderId}:`, err);
        }
      }

    }
    // Admin "Resend order confirmation" (Order detail › More order actions) stamps
    // confirmationEmailRequestedAt; each stamp sends the customer's confirmation once more.
    const resendConfirmation = !becamePaid && !!after.confirmationEmailRequestedAt && after.confirmationEmailRequestedAt !== before.confirmationEmailRequestedAt;
    if ((becamePaid || resendConfirmation) && after.paymentStatus === "paid") {
      // The customer's "Order confirmed" and the shop's new-order alert have separate switches:
      // pausing one must never silence the other. A resend never repeats the shop's alert.
      const customerPaidOn = notificationSettings.order_confirmation?.enabled !== false;
      const shopPaidOn = becamePaid && notificationSettings.shopAlerts?.newOrder !== false;
      if (customerPaidOn || shopPaidOn) {
      const order = after;

      // Compile digital items download section if any digital formats exist
      // Same digital rule as downloads, returns and labels ("Ebook", "Digital edition", digital: true).
      // Box sets contribute their e-book parts; pre-ordered e-books get no live link until release.
      const digitalItems = await digitalDelivery.emailDigitalEntries(order, {
        loadBook: async id => { const snap = await db.collection("books").doc(String(id)).get(); return snap.exists ? snap.data() : null; },
        isPhysical: isPhysicalItem, catalogDigital, preorderActive, releaseDateOf, today: shopDate(),
      });

      let downloadSection = "";
      if (digitalItems.length > 0) {
        const linkFor = item => `https://us-central1-lyricalmyrical-web-v2.cloudfunctions.net/downloadDigitalAsset?orderId=${encodeURIComponent(orderId)}&itemId=${encodeURIComponent(item.itemId)}${item.variantId ? `&variantId=${encodeURIComponent(item.variantId)}` : ""}&token=${encodeURIComponent(order.downloadToken || "")}`;
        const note = String(notificationSettings.order_confirmation?.downloadNote || digitalDelivery.DEFAULT_DOWNLOAD_NOTE);
        downloadSection = `
          <div style="margin-top:28px;padding:24px;background:#f8f6ff;border-radius:16px;border:1px solid #7c3aed20;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#7c3aed;">Digital Library Access</h3>
            <p style="font-size:11px;color:#666;margin-bottom:16px;line-height:1.5;">${escapeHtml(note)}</p>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              ${digitalItems.map(item => `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #7c3aed10;"><strong>${escapeHtml(item.title)}</strong></td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #7c3aed10;">
                    ${item.pendingUntil
                      ? `<span style="font-size:11px;color:#666;">${item.pendingUntil === "announced" ? "Available once the book is released" : `Available from ${escapeHtml(item.pendingUntil)}`}</span>`
                      : `<a href="${linkFor(item)}"
                       style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:10px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;">Download File</a>`}
                  </td>
                </tr>
              `).join("")}
            </table>
          </div>
        `;
      }

      const itemsTable = customerTotalsTable(order);

      let paymentConfirmedSection = "";
      if (order.paymentMethod && !["Stripe", "PayPal", "Free"].includes(order.paymentMethod)) {
        paymentConfirmedSection = `
          <div style="margin-top:28px;padding:24px;background:#ecfdf5;border-radius:16px;border:1px solid #10b98120;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#10b981;">Payment Verified</h3>
            <p style="font-size:12px;color:#065f46;margin-bottom:0;line-height:1.6;">We have verified your payment via <strong>${escapeHtml(order.paymentMethod)}</strong>. Your order is now confirmed${isPhysicalAny(order) ? " and being prepared for shipment" : ""}.</p>
          </div>
        `;
      }
      const delivery = deliveryDetails(order);
      // Nothing physical in the order: no "preparing it for shipment" / "we'll email when it ships".
      const digitalOnlyOrder = (order.items || []).length > 0 && (order.items || []).every(item => !item || !isPhysicalItem(item));
      const deliverySection = delivery.heading ? `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">${escapeHtml(delivery.heading)}</h3>
            ${delivery.lines.map(line => `<p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}
          </div>` : "";
      // Pre-ordered books: when each is released and when the parcel ships.
      const preorderLines = preorderEmailLines(order);
      const preorderSection = preorderLines.length ? `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">Pre-order</h3>
            ${preorderLines.map(line => `<p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}
          </div>` : "";
      const combinedSection = [preorderSection, deliverySection, paymentConfirmedSection, downloadSection].filter(Boolean).join("\n");

      const confirmationSettings = digitalOnlyOrder ? { ...notificationSettings, order_confirmation: { ...notificationSettings.order_confirmation,
        body: forDigitalOnlyOrder(notificationSettings.order_confirmation?.body || DEFAULT_NOTIFICATIONS.order_confirmation.body, { hasDownloads: digitalItems.length > 0 }) } } : notificationSettings;
      const compiled = compileEmailTemplate("order_confirmation", confirmationSettings, {
        customer_name: order.customer.name || "there",
        order_id: order.orderId || orderId,
        shipping_method: delivery.method,
        delivery_estimate: delivery.estimate,
        order_url: await trackUrl(),
        button_url: await trackUrl(),
        items_table: itemsTable,
        total_price: chargedTotalFmt(order)
      }, combinedSection);

      const adminOrderUrl = siteLink(`/admin#orders/${encodeURIComponent(orderId)}`);
      const adminAddr = order.customer?.address
        ? [order.customer.address.street, order.customer.address.unit, order.customer.address.city, order.customer.address.state, order.customer.address.zip, order.customer.address.country].filter(Boolean).join(", ")
        : "—";
      const adminPaidHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin-top:0;color:#16a34a;">&#10003; Payment Received</h2>
          <p><strong>Order:</strong> ${escapeHtml(order.orderId || orderId)} &nbsp;·&nbsp; <strong>${escapeHtml(chargedTotalFmt(order))}</strong></p>
          ${risoButton(adminOrderUrl, "Fulfil this order &rarr;", notificationSettings.brand?.brandColor, notificationSettings.brand?.emailTheme)}
          <p><strong>Customer:</strong> ${escapeHtml(order.customer.name)} &lt;${escapeHtml(order.customer.email)}&gt;${order.customer.phone ? ` · ${escapeHtml(order.customer.phone)}` : ""}</p>
          <p><strong>Ship to:</strong> ${escapeHtml(adminAddr)}</p>
          <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || "Stripe")}</p>
          ${preorderLines.length ? `<p><strong>Pre-order:</strong> ${preorderLines.map(escapeHtml).join(" ")} It waits in Orders › Awaiting release until then.</p>` : ""}
          ${itemsTable}
          <p style="margin-top:24px;"><a href="${adminOrderUrl}">Open the order in the admin</a> to pack it, buy a label and mark it shipped.</p>
        </div>
      `;

      if (customerPaidOn) try {
        await sendOrderEmailOnce(orderId, becamePaid ? "orderConfirmed" : `orderConfirmedResend_${after.confirmationEmailRequestedAt}`, {
          to: order.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Payment confirmation email to customer failed", err);
      }
      // The shop's one email per paid order (Settings › Notifications › new-order alert).
      // It goes out even when the customer's address is rejected.
      if (shopPaidOn) try {
        await sendOrderEmailOnce(orderId, "shopNewOrder", {
          to: ADMIN_TO,
          subject: `${order.sandboxPayment ? "[TEST] " : ""}[NEW ${preorderLines.length ? "PRE-ORDER" : "ORDER"}] ${order.orderId || orderId} · paid · ${chargedTotalFmt(order)} · ${order.customer.name}`,
          html: adminPaidHtml,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Payment admin notification email failed", err);
      }
    }
  }

    // 2. Shipping Confirmation (Order Shipped)
    const becameShipped = before.fulfillmentStatus !== "shipped" && after.fulfillmentStatus === "shipped";
    // Admin "Resend shipping email" (Order detail › In transit) stamps shippingEmailRequestedAt.
    const resendShipped = !!after.shippingEmailRequestedAt && after.shippingEmailRequestedAt !== before.shippingEmailRequestedAt;
    const handedOverLocally = isLocalOrder(after);
    // Customer "Order shipped" and the shop's shipped copy have separate switches too.
    const customerShippedOn = notificationSettings.shipping_confirmation?.enabled !== false;
    const shopShippedOn = becameShipped && notificationSettings.shopAlerts?.shipped !== false;
    if ((becameShipped || resendShipped) && !handedOverLocally && (customerShippedOn || shopShippedOn)) {
      // Straight to the carrier's tracking page; without a tracking number, the shop's order-status page.
      const trackingUrl = after.trackingNumber
        ? getTrackingUrl(after.trackingCarrier, after.trackingNumber, after.trackingUrl)
        : await trackUrl();
      // No tracking number: leave out the carrier/tracking lines instead of printing blanks.
      const shippedSettings = after.trackingNumber ? notificationSettings : { ...notificationSettings, shipping_confirmation: {
        ...notificationSettings.shipping_confirmation,
        body: withoutTrackingLines(notificationSettings.shipping_confirmation?.body || DEFAULT_NOTIFICATIONS.shipping_confirmation.body) } };
      const compiled = compileEmailTemplate("shipping_confirmation", shippedSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        tracking_carrier: after.trackingCarrier || "carrier",
        tracking_number: after.trackingNumber || "",
        button_url: trackingUrl,
        tracking_url: trackingUrl
      });

      const shippedAdminHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin-top:0;">&#128666; Order Shipped</h2>
          <p><strong>Order:</strong> ${escapeHtml(after.orderId || orderId)}</p>
          <p><strong>Customer:</strong> ${escapeHtml(after.customer?.name)} &lt;${escapeHtml(after.customer?.email)}&gt;</p>
          <p><strong>Carrier:</strong> ${escapeHtml(after.trackingCarrier || "—")} &nbsp;·&nbsp; <strong>Tracking:</strong> ${escapeHtml(after.trackingNumber || "—")}</p>
          ${after.trackingNumber && /^https?:\/\//i.test(trackingUrl) ? `<p><a href="${escapeHtml(trackingUrl)}">Track shipment &rarr;</a></p>` : ""}
        </div>
      `;

      // A first dispatch sends once; each admin "Resend shipping email" (its own stamp) sends once more.
      const shippedKind = becameShipped ? "shipped" : `shippedResend_${after.shippingEmailRequestedAt}`;
      if (customerShippedOn) try {
        await sendOrderEmailOnce(orderId, shippedKind, {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Shipping confirmation email to customer failed", err);
      }
      // The shop's own copy goes out even when the customer's address is rejected (first dispatch only).
      if (shopShippedOn) try {
        await sendOrderEmailOnce(orderId, "shopShipped", {
          to: ADMIN_TO,
          subject: `[SHIPPED] ${after.orderId || orderId} · ${after.customer?.name}`,
          html: shippedAdminHtml,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Shipping admin notification email failed", err);
      }
    }

    // 2b. Shipped parcels: "out for delivery" and "delivered" (admin buttons or Shippo tracking) send
    // no customer email. The shipping email is the only one (owner's choice); the order status still moves.

    // 2c. Pickup and local delivery: the confirmation promises "we'll email you when your order is
    // ready to collect", so each customer-facing step the admin records sends one Delivery email.
    const localMethod = localMethodOf(after);
    const LOCAL_STEPS = localMethod === "pickup" ? { ready_for_pickup: "ready to collect" }
      : localMethod === "local_delivery" ? { out_for_delivery: "out for delivery", delivered: "delivered" } : {};
    const localStep = LOCAL_STEPS[after.fulfillmentStatus];
    if (localStep && before.fulfillmentStatus !== after.fulfillmentStatus && notificationSettings.delivery_update?.enabled !== false) {
      const localSettings = { ...notificationSettings, delivery_update: { ...notificationSettings.delivery_update,
        body: withoutCarrierLines(notificationSettings.delivery_update?.body || DEFAULT_NOTIFICATIONS.delivery_update.body) } };
      const compiled = compileEmailTemplate("delivery_update", localSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        status: localStep,
        button_url: await trackUrl(),
      }, localMethod === "pickup" ? (() => {
        const lines = deliveryDetails(after).lines.filter(line => !/we'll email you/i.test(line));
        return lines.length ? `<div style="margin-top:28px;padding:20px 24px;border:2px solid #111;"><h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">Pickup</h3>${lines.map(line => `<p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(line)}</p>`).join("")}</div>` : "";
      })() : "");
      try {
        await sendOrderEmailOnce(orderId, `local_${after.fulfillmentStatus}`, {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Pickup/local delivery email failed", err);
      }
    }

    // 3. Order Cancelled (skip if the order is being refunded simultaneously — the refund email is more accurate)
    // A cancelled order frees any copies it was holding at checkout.
    if (before.status !== "cancelled" && after.status === "cancelled") {
      await releaseStock(db, orderId, after.items || []);
      await releaseGiftCards(db, orderId, [...chargedRedemptions(after), ...(after.giftCardRedemptions || [])]);
    }
    const becameCancelled = before.status !== "cancelled" && after.status === "cancelled"
      && after.paymentStatus !== "refunded" && after.paymentStatus !== "refund_pending"
      // "You will not be charged" is only true for an order that was never paid.
      && after.paymentStatus !== "paid";
    if (becameCancelled && notificationSettings.order_cancelled?.enabled !== false) {
      const compiled = compileEmailTemplate("order_cancelled", notificationSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        button_url: await trackUrl()
      });

      try {
        await sendOrderEmailOnce(orderId, "cancelled", {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Order cancelled email failed", err);
      }
    }

    // 4. Order Refunded
    const becameRefunded = before.paymentStatus !== "refunded" && after.paymentStatus === "refunded";
    if (becameRefunded) {
      // If it is a manual payment method, handle restocking
      const isManual = after.paymentMethod && after.paymentMethod !== "Stripe" && after.paymentMethod !== "PayPal";
      // applyOrderRefund already handled stock (or the admin's "don't restock" choice) when it set refund.provider.
      const shouldRestock = isManual && !after.refund?.provider && after.refundRequest?.restock !== false
        && after.restockOnRefund !== false && after.inventoryRestockedAt == null;
      if (shouldRestock) {
        const itemList = after.items || [];
        try {
          await db.runTransaction(async transaction => {
            const books = await readBooks(transaction, db, itemList);
            writeStock(transaction, db, itemList, books, 1, new Date().toISOString());
            // Mark as restocked on the order document
            transaction.update(db.collection("orders").doc(orderId), {
              inventoryRestockedAt: new Date().toISOString()
            });
          });
          console.log(`Successfully restocked manual order ${orderId}`);
        } catch (err) {
          console.error(`Failed to restock manual order ${orderId}:`, err);
        }
      }

      const facts = refundEmailFacts(after, chargedRedemptions(after));
      if (facts && notificationSettings.order_refunded?.enabled !== false) {
      // {{total_price}} now carries its own currency (e.g. "US$12.40"); older saved templates
      // that wrote "CA${{total_price}}" are read without the hard-coded prefix.
      const refundBody = String(notificationSettings.order_refunded?.body || "").replace(/CA\$\s*\{\{total_price\}\}/g, "{{total_price}}");
      const refundSettings = { ...notificationSettings, order_refunded: { ...notificationSettings.order_refunded,
        // Paid entirely by gift card: the money is back on the card now, not "in 5-10 business days".
        body: facts.giftOnly ? withoutBankRefundSentences(refundBody || DEFAULT_NOTIFICATIONS.order_refunded.body) : refundBody } };
      const giftSection = facts.giftText ? `
          <div style="margin-top:28px;padding:20px 24px;border:2px solid #111;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;">Gift card</h3>
            <p style="font-size:13px;margin:4px 0;line-height:1.6;">${escapeHtml(facts.giftText)} is back on your gift card${facts.cards ? ` ${escapeHtml(facts.cards)}` : ""} and can be used right away.</p>
          </div>` : "";
      const compiled = compileEmailTemplate("order_refunded", refundSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        // What was actually refunded, in the currency it went back in.
        total_price: facts.amountText,
        button_url: await trackUrl()
      }, giftSection);

      try {
        await sendOrderEmailOnce(orderId, "refunded", {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Order refunded email failed", err);
      }
    }
  }

    // 5. Partial refund (Stripe or PayPal): the order stays paid, so nothing above tells the
    // customer. One email per new running total.
    const refundedBefore = Number(before.refundedAmountMinor) || 0;
    const refundedAfter = Number(after.refundedAmountMinor) || 0;
    if (after.paymentStatus === "paid" && after.partiallyRefunded && refundedAfter > refundedBefore
      && notificationSettings.order_refunded?.enabled !== false) {
      const currency = String(after.expectedCurrency || after.checkoutCurrency || "CAD").toUpperCase();
      // refundedAmountMinor is already in the charged currency: format it, never convert it again.
      const amountText = refundAmountText({ refund: { amount: (refundedAfter - refundedBefore) / 100, currency } });
      const compiled = compileEmailTemplate("order_refunded", notificationSettings, {
        customer_name: after.customer?.name || "there",
        order_id: after.orderId || orderId,
        total_price: amountText,
        button_url: await trackUrl()
      }, `<p style="margin-top:20px;font-size:13px;line-height:1.6;">This is a partial refund. The rest of your order is unchanged.</p>`);
      try {
        await sendOrderEmailOnce(orderId, `partialRefund_${refundedAfter}`, {
          to: after.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Partial refund email failed", err);
      }
    }
}

// ──────────────────────────────────────────────────────────────
// 7. Abandoned cart sweep: every hour, recover carts older than 1h
// ──────────────────────────────────────────────────────────────
// Daily 8am (Toronto) email to the publisher listing paid parcels not shipped after
// 3 days, parcels in transit 14+ days and label purchases that need checking in
// Shippo. Nothing is sent on days with nothing to report.
exports.dailyOrderDigest = onSchedule(
  { schedule: "every day 08:00", timeZone: "America/Toronto", secrets: [RESEND_API_KEY] },
  async () => {
    // Settings › Notifications › Shop alerts › Daily "orders needing you" email.
    const notificationDoc = await db.collection("settings").doc("notifications").get().catch(() => null);
    if (!dailyDigestEnabled(notificationDoc?.data?.() || {})) return;
    // Bounded: paid orders of the last DIGEST_WINDOW_DAYS (newest first, at most DIGEST_ORDER_LIMIT), and the private
    // record only for orders that are still open, so reads no longer grow with every order the shop has ever taken.
    const paidSnap = await db.collection("orders").where("paymentStatus", "==", "paid")
      .where("createdAt", ">=", digestSince()).orderBy("createdAt", "desc").limit(DIGEST_ORDER_LIMIT).get();
    const orders = paidSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const ops = new Map();
    const openIds = orders.filter(digestNeedsOperations).map(o => o.id);
    for (let i = 0; i < openIds.length; i += 300) {
      const refs = openIds.slice(i, i + 300).map(id => db.collection("order-operations").doc(id));
      for (const snap of await db.getAll(...refs)) if (snap.exists) ops.set(snap.id, snap.data());
    }
    const digest = buildOrderDigest(orders, ops);
    if (!digest.total) return;
    const link = id => siteLink(`/admin#orders/${encodeURIComponent(id)}`);
    const rows = (items, describe) => items.map(item => `<li style="margin:6px 0;"><a href="${link(item.id)}">${escapeHtml(item.label)}</a> — ${escapeHtml(describe(item))}</li>`).join("");
    const section = (title, items, describe) => items.length ? `<h3 style="margin:24px 0 8px;">${title} (${items.length})</h3><ul style="padding-left:18px;">${rows(items, describe)}</ul>` : "";
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">Orders needing you today</h2>
        ${section("Paid, not shipped yet", digest.unshipped, o => `${o.days} days since payment${o.customer ? ` · ${o.customer}` : ""}`)}
        ${section(`In transit ${TRANSIT_DAYS}+ days`, digest.stuck, o => `${o.days} days · ${[o.carrier, o.tracking].filter(Boolean).join(" ")} — check tracking or open a claim`)}
        ${section("Label purchase to check in Shippo", digest.labelChecks, () => "a label purchase didn't finish; check Shippo before buying again")}
        <p style="margin-top:24px;"><a href="${siteLink("/admin#orders")}">Open Orders &rarr;</a></p>
      </div>`;
    try {
      await sendEmail({
        to: ADMIN_TO,
        subject: `[TO DO] ${digest.total} order${digest.total === 1 ? "" : "s"} need attention`,
        html,
        secret: RESEND_API_KEY.value(),
      });
    } catch (err) {
      console.error("Daily order digest failed", err);
    }
  }
);

// Secret for signing unsubscribe links, created once and kept server-only in adminSecrets.
async function marketingUnsubscribeKey() {
  const ref = db.collection("adminSecrets").doc("marketing");
  const snap = await ref.get();
  const existing = snap.exists ? String(snap.data()?.unsubscribeKey || "") : "";
  if (existing.length >= 32) return existing;
  const key = crypto.randomBytes(32).toString("hex");
  await ref.set({ unsubscribeKey: key }, { merge: true });
  return key;
}

const ABANDONED_CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ABANDONED_CART_THROTTLE_MS = 3 * 24 * 60 * 60 * 1000;
const ABANDONED_CART_MAX_ITEMS = 20;
const ABANDONED_CART_BATCH = 500;
const { digestSince, digestNeedsOperations, DIGEST_ORDER_LIMIT } = require("./orderDigest");
const { pruneOldCarts } = require("./cartCleanup");

exports.abandonedCartSweep = onSchedule(
  { schedule: "every 60 minutes", timeoutSeconds: 300, secrets: [RESEND_API_KEY] },
  async () => {
    const sweepDeadline = Date.now() + 240 * 1000;
    // Carts nobody can still be reminded about are deleted, so this collection (and every later sweep)
    // stays small however many carts visitors have written. Own try/catch: never blocks the reminders.
    try { await pruneOldCarts(db); } catch (err) { console.warn("abandonedCartSweep: cart cleanup failed:", err.message); }
    const notificationSettings = await loadNotificationSettings();
    // Settings › Notifications › Abandoned Cart can switch these reminders off.
    if (notificationSettings.abandoned_cart?.enabled === false) return;
    // Marketing email must carry the shop's postal address (Settings › General › Location);
    // without one the footer would leave it out, so no reminders go until it is saved.
    const websiteForAddress = (await db.collection("settings").doc("website").get().catch(() => null))?.data?.() || {};
    if (!footerAddress(websiteForAddress.location)) {
      console.warn("Abandoned-cart reminders skipped: no postal address saved in Settings › General › Location");
      return;
    }
    const unsubscribeKey = await marketingUnsubscribeKey();
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Only the 7-day window a reminder can still be sent in, newest first, at most ABANDONED_CART_BATCH per run
    // (the same index as before: recovered + updatedAt). Older carts are not read at all.
    const oldestUpdated = new Date(Date.now() - ABANDONED_CART_MAX_AGE_MS).toISOString();
    const snap = await db
      .collection("abandoned-carts")
      .where("recovered", "==", false)
      .where("updatedAt", ">=", oldestUpdated)
      .where("updatedAt", "<", cutoff)
      .orderBy("updatedAt", "desc")
      .limit(ABANDONED_CART_BATCH)
      .get();

    // Cart docs are written by anonymous browsers, so nothing in them is trusted
    // for the email: items/prices are rebuilt from the catalog, text is escaped,
    // stale or forged timestamps are skipped and each address is throttled.
    const oldest = new Date(Date.now() - ABANDONED_CART_MAX_AGE_MS).toISOString();
    const pending = snap.docs.filter(doc => doc.data().notified !== true && String(doc.data().updatedAt || "") >= oldest);
    const bookCache = new Map();
    const loadBook = async id => {
      if (!bookCache.has(id)) bookCache.set(id, db.collection("books").doc(id).get().then(d => (d.exists ? d.data() : null)).catch(() => null));
      return bookCache.get(id);
    };
    const emailedThisRun = new Set();
    const proofCache = new Map();
    const ownershipProofOnce = email => {
      if (!proofCache.has(email)) proofCache.set(email, hasOwnershipProof(db, admin.auth(), email));
      return proofCache.get(email);
    };

    await runInBatches(pending, 10, async (doc) => {
      const c = doc.data();
      const email = String(c.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      // Someone who unsubscribed never gets another reminder.
      if ((await db.collection("marketing-optout").doc(optOutId(email)).get()).exists) return;
      // Carts are written by anonymous browsers: only an address with proof of an owner (a
      // checkout attempt or a verified account) is ever emailed. Others stay unsent and age out.
      if (!(await ownershipProofOnce(email))) return;

      const lines = [];
      for (const item of (Array.isArray(c.items) ? c.items : []).slice(0, ABANDONED_CART_MAX_ITEMS)) {
        if (!item || typeof item.id !== "string" || !item.id || item.id.includes("/")) continue;
        const book = await loadBook(item.id);
        if (!book) continue;
        const variant = item.variantId ? (book.variants || []).find(v => v.id === item.variantId) : null;
        if (item.variantId && !variant) continue;
        const price = catalogUnitPrice(book, variant);
        if (!Number.isFinite(price) || price < 0) continue;
        const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty || item.quantity) || 1)));
        lines.push({ title: `${book.title || ""}${variant?.name ? ` (${variant.name})` : ""}`, qty, price });
      }
      if (!lines.length || emailedThisRun.has(email)) return;
      emailedThisRun.add(email);

      // One reminder per address per throttle window, however many cart docs exist for it.
      const throttleRef = db.collection("abandoned-cart-throttle").doc(crypto.createHash("sha256").update(email).digest("hex"));
      let previousThrottle = null;
      const throttled = await db.runTransaction(async tx => {
        const t = await tx.get(throttleRef);
        if (t.exists && Date.now() - Date.parse(t.data().lastSentAt || 0) < ABANDONED_CART_THROTTLE_MS) return true;
        previousThrottle = t.exists ? t.data() : null;
        tx.set(throttleRef, { lastSentAt: new Date().toISOString(), expiresAt: retainFor(30) });
        return false;
      }).catch(() => true);
      if (throttled) {
        await doc.ref.update({ notified: true, notifiedAt: new Date().toISOString(), notifySkipped: "throttled" }).catch(() => {});
        return;
      }
      // Shop-wide daily cap: forged carts can't make the shop a bulk sender. Over the cap, this
      // cart stays un-notified (and the address unthrottled) so tomorrow's sweep can still send it.
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const dailyRef = db.collection("abandoned-cart-throttle").doc("_daily");
      const underCap = await db.runTransaction(async tx => {
        const d = await tx.get(dailyRef);
        const next = nextDailyCount(d.exists ? d.data() : null, day);
        if (!next) return false;
        tx.set(dailyRef, next);
        return true;
      }).catch(() => false);
      // The shop-wide hourly/daily budget for anonymous-triggered email also applies.
      if (!underCap || !(await claimEmailSend(db, "abandonedCart", "", { failOpen: false }))) {
        await (previousThrottle ? throttleRef.set(previousThrottle) : throttleRef.delete()).catch(() => {});
        return;
      }

      const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
      const itemsTable = `
        <div style="margin: 20px 0; border-top: 1px solid #eee; padding-top: 15px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${lines.map(line => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;">${escapeHtml(line.title)} (x${line.qty})</td>
                <td style="padding: 8px 0; text-align: right; font-family: monospace;">${moneyFmt(line.price * line.qty)}</td>
              </tr>`).join("")}
            <tr style="font-weight: bold;">
              <td style="padding: 12px 0;">Total</td>
              <td style="padding: 12px 0; text-align: right; font-family: monospace;">${moneyFmt(subtotal)}</td>
            </tr>
          </table>
        </div>
      `;

      const cartUrl = siteLink(`/checkout?cartId=${doc.id}`);
      const unsubscribeUrl = siteLink(`/track?unsubscribe=1&e=${encodeURIComponent(normMarketingEmail(email))}&t=${unsubscribeToken(email, unsubscribeKey)}`);
      const compiled = compileEmailTemplate("abandoned_cart", notificationSettings, {
        // Only a plain first name from the (visitor-written) cart; never their free text.
        customer_name: reminderFirstName(c.customer?.name || c.name),
        cart_url: cartUrl,
        button_url: cartUrl,
        items_table: itemsTable
      }, `<p style="margin-top:28px;font-size:11px;color:#888;">Don't want reminders like this? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>.</p>`);

      try {
        await sendEmail({
          to: email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
        await doc.ref.update({ notified: true, notifiedAt: new Date().toISOString() });
      } catch (err) {
        // Release the claim so a failed send doesn't block this address's reminder.
        await (previousThrottle ? throttleRef.set(previousThrottle) : throttleRef.delete()).catch(() => {});
        console.error("Abandoned cart email failed", err);
      }
    }, { deadline: sweepDeadline });
  },
);

// ──────────────────────────────────────────────────────────────
// 7. HTTP Endpoint: Validate Address via Shippo (Secure)
// ──────────────────────────────────────────────────────────────
// "live" or "test" from the key's own prefix (shippo_live_… / shippo_test_…); null when it is neither.
const shippoKeyMode = key => /^shippo_live_/.test(String(key || "")) ? "live" : /^shippo_test_/.test(String(key || "")) ? "test" : null;
exports.getShippoConfig = onBrowserRequest({ secrets: [SHIPPO_API_TOKEN] }, async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  try {
    const configDoc = await SHIPPO_CONFIG_DOC.get();
    const config = configDoc.exists ? configDoc.data() : {};
    const fallbackToken = await getShippoToken();
    res.status(200).json({
      configured: Boolean(fallbackToken),
      source: configDoc.exists && config?.apiToken ? "firebase" : fallbackToken ? "environment" : null,
      lastFour: config?.lastFour || (fallbackToken ? fallbackToken.slice(-4) : null),
      // Which Shippo account the key in use belongs to: a test key buys sandbox labels with no postage.
      mode: shippoKeyMode(fallbackToken),
      verifiedAt: config?.apiToken ? config?.verifiedAt || null : null,
      updatedAt: config?.updatedAt || null,
      dynamicRatesEnabled: config?.dynamicRatesEnabled ?? false,
      dynamicRateCountries: Array.isArray(config?.dynamicRateCountries) ? config.dynamicRateCountries : [],
    });
  } catch (err) {
    console.error("getShippoConfig failed:", err);
    res.status(500).json({ error: "Unable to load Shippo configuration." });
  }
});

exports.setShippoDynamicRates = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const enabled = Boolean(req.body?.enabled);
  const dynamicRateCountries = Array.isArray(req.body?.countries)
    ? [...new Set(req.body.countries.map(country => String(country).trim().toUpperCase()).filter(country => /^[A-Z]{2}$/.test(country)))].slice(0, 250)
    : null;

  try {
    const configDoc = await SHIPPO_CONFIG_DOC.get();
    const current = configDoc.exists ? configDoc.data() : {};
    await SHIPPO_CONFIG_DOC.set({
      ...current,
      dynamicRatesEnabled: enabled,
      ...(dynamicRateCountries ? { dynamicRateCountries } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser.email,
    });
    res.status(200).json({
      success: true,
      dynamicRatesEnabled: enabled,
      dynamicRateCountries: dynamicRateCountries ?? current.dynamicRateCountries ?? [],
    });
  } catch (err) {
    console.error("setShippoDynamicRates failed:", err);
    res.status(500).json({ error: "Unable to update Shippo dynamic rates setting." });
  }
});

exports.getShippoRates = onBrowserRequest(
  { secrets: [SHIPPO_API_TOKEN] },
  async (req, res) => {
    if (applyCors(req, res)) return;

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    if (!(await hitLimit(db, "shippo", req, LIMITS.shippo))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });

    const { address, items } = req.body;
    if (!address || !items || !Array.isArray(items)) {
      res.status(400).json({ error: "Missing address or items" });
      return;
    }
    // Same bounds as the other cart endpoints: one Firestore read is made per line, so the list is capped
    // and every id must be a plain document id before anything is read (#107).
    if (items.length > 50 || !items.every(item => item && typeof item === "object" && typeof item.id === "string" && item.id && item.id.length <= 160 && !item.id.includes("/"))) {
      res.status(400).json({ error: "Check the selected books." });
      return;
    }

    try {
      const configDoc = await SHIPPO_CONFIG_DOC.get();
      const config = configDoc.exists ? configDoc.data() : {};
      if (config.dynamicRatesEnabled !== true) {
        res.status(400).json({ error: "Dynamic rates are disabled" });
        return;
      }

      const destinationCountry = getCountryCode(address.country);
      const enabledCountries = Array.isArray(config.dynamicRateCountries) ? config.dynamicRateCountries : [];
      if (!enabledCountries.includes(destinationCountry)) {
        res.status(200).json({ rates: [], useRegularRates: true });
        return;
      }

      const shippoToken = await getShippoToken();
      if (!shippoToken) {
        res.status(400).json({ error: "Shippo is not configured" });
        return;
      }

      const settingsDoc = await db.collection("settings").doc("website").get();
      const settings = settingsDoc.data() || {};

      const addressFrom = originAddress(settings);

      const addressTo = {
        name: address.name || "Customer",
        street1: address.street,
        street2: address.unit || "",
        city: address.city,
        state: getStateCode(address.state),
        zip: address.zip,
        country: getCountryCode(address.country),
      };

      const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      if (totalQty === 0) {
        res.status(200).json({ rates: [] });
        return;
      }

      const bookRefs = items.map(item => db.collection("books").doc(item.id));
      const bookDocs = await Promise.all(bookRefs.map(ref => ref.get()));

      // Same parcel weight as the charge path (resolveShipping): physical items only,
      // catalog weights read as grams ("450 g", "0.5 kg", bare numbers = grams).
      let totalWeightLb = 0;
      for (const [index, item] of items.entries()) {
        const bookDoc = bookDocs[index];
        if (!bookDoc.exists) continue;
        const book = bookDoc.data();
        const variant = item.variantId ? (book.variants || []).find(v => v.id === item.variantId) || null : null;
        const line = { format: catalogFormat(book, variant), digital: catalogDigital(book, variant), isDigital: catalogDigital(book, variant) };
        if (!isPhysicalItem(line)) continue;
        const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
        let grams = Number(itemWeightGrams(book, variant));
        // A box set without its own weight weighs what its books weigh (as priceOrder does).
        const parts = bundleComponents(book);
        if (!(grams > 0) && parts.length) {
          const partDocs = await Promise.all(parts.map(part => db.collection("books").doc(part.id).get()));
          const partWeights = partDocs.map((doc, i) => {
            if (!doc.exists) return null;
            const partBook = doc.data();
            const partVariant = parts[i].variantId ? (partBook.variants || []).find(v => v.id === parts[i].variantId) || null : null;
            return itemWeightGrams(partBook, partVariant);
          });
          if (partWeights.every(w => w != null)) grams = partWeights.reduce((sum, w, i) => sum + w * parts[i].quantity, 0);
        }
        totalWeightLb += (Number.isFinite(grams) && grams > 0 ? grams / 453.592 : 1.5) * qty;
      }
      if (totalWeightLb === 0) {
        res.status(200).json({ rates: [], useRegularRates: true });
        return;
      }

      const parcel = {
        length: "10",
        width: "8",
        height: "2",
        distance_unit: "in",
        weight: Math.max(0.1, totalWeightLb).toFixed(1),
        mass_unit: "lb"
      };

      const shipment = await callShippo("shipments/", "POST", {
        address_from: addressFrom,
        address_to: addressTo,
        parcels: [parcel],
        async: false
      }, shippoToken);

      const rates = shipment.rates || [];
      const formattedRates = rates.map(checkoutRate);

      res.status(200).json({ rates: formattedRates });
    } catch (err) {
      console.error("getShippoRates failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);


exports.saveShippoConfig = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const apiToken = typeof req.body?.apiToken === "string" ? req.body.apiToken.trim() : "";
  if (apiToken.length < 20 || apiToken.length > 250 || /\s/.test(apiToken)) {
    res.status(400).json({ error: "Enter a valid Shippo API key without spaces." });
    return;
  }
  const mode = shippoKeyMode(apiToken);
  if (!mode) {
    res.status(400).json({ error: "That doesn't look like a Shippo API key. Live keys start with shippo_live_ and test keys with shippo_test_." });
    return;
  }
  // Ask Shippo before saving: a typo'd key must never replace a working one.
  try {
    await callShippo("carrier_accounts/?results=1", "GET", null, apiToken, 8000);
  } catch (err) {
    if ([401, 403].includes(Number(err?.shippoStatus))) {
      res.status(400).json({ error: "Shippo did not accept this key. Copy it again from Shippo › Settings › API; nothing was saved." });
    } else {
      res.status(502).json({ error: "Couldn't reach Shippo to check the key, so it was not saved. Try again in a minute." });
    }
    return;
  }

  try {
    const updatedAt = new Date().toISOString();
    await SHIPPO_CONFIG_DOC.set({
      apiToken,
      lastFour: apiToken.slice(-4),
      mode,
      verifiedAt: updatedAt,
      updatedAt,
      updatedBy: adminUser.email,
    }, { merge: true });
    const saved = (await SHIPPO_CONFIG_DOC.get()).data() || {};
    res.status(200).json({
      configured: true,
      source: "firebase",
      lastFour: apiToken.slice(-4),
      mode,
      verifiedAt: updatedAt,
      updatedAt,
      dynamicRatesEnabled: saved.dynamicRatesEnabled ?? false,
      dynamicRateCountries: Array.isArray(saved.dynamicRateCountries) ? saved.dynamicRateCountries : [],
    });
  } catch (err) {
    console.error("saveShippoConfig failed:", err);
    res.status(500).json({ error: "Unable to save the Shippo API key." });
  }
});

// Server-side carrier check of a paid order's shipping address. A valid address is
// recorded as reviewed in the admin-only order-operations record, so the publisher
// goes straight to packing. Anything else keeps the order in "Needs attention".
async function autoApproveShippingAddress(orderId, order) {
  const method = order.fulfillmentSelection?.method || order.fulfillment?.method || "shipping";
  const address = order.customer?.address || {};
  // Countries with no province list or no postal code are checked too (addressRules.js).
  if (method !== "shipping" || order.isTest || addressMissing(address).length) return;
  const shippoToken = await getShippoToken();
  if (!shippoToken) return;
  const result = await callShippo("addresses/", "POST", {
    name: order.customer?.name || "Customer",
    street1: address.street,
    street2: address.unit || "",
    city: address.city,
    state: getStateCode(address.state),
    zip: address.zip,
    country: getCountryCode(address.country),
    validate: true,
  }, shippoToken);
  if (result?.validation_results?.is_valid !== true) return;
  const opsRef = db.collection("order-operations").doc(orderId);
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const [fresh, ops] = await Promise.all([tx.get(db.collection("orders").doc(orderId)), tx.get(opsRef)]);
    const current = fresh.data() || {};
    const key = guardAddressKey(current);
    // Only approve the address that was checked, and never override a publisher decision.
    if (key !== guardAddressKey(order) || (ops.data() || {}).addressReviewed) return;
    tx.set(opsRef, {
      addressReviewed: key,
      updatedAt: now,
      activity: [...((ops.data() || {}).activity || []), { type: "event", message: "Shipping address verified automatically with the carrier after payment.", createdAt: now }],
    }, { merge: true });
  });
}

// The Google key for the checkout address finder (admin-only adminSecrets/addressLookup), read at most
// once a minute per instance: the finder asks on nearly every keystroke.
let addressKeyCache = { at: 0, key: "" };
async function readAddressLookupKey(fresh = false) {
  if (!fresh && Date.now() - addressKeyCache.at < 60 * 1000) return addressKeyCache.key;
  const key = String((await readAdminSecret("addressLookup")).googlePlacesKey || "").trim();
  addressKeyCache = { at: Date.now(), key: addressKeyProblem(key) ? "" : key };
  return addressKeyCache.key;
}
// One counter for the whole shop (rate limits are keyed by connection): caps what the key can cost per day.
const SHOP_WIDE_REQUEST = { headers: { "x-forwarded-for": "shop-wide" } };

exports.validateAddress = onBrowserRequest(
  { secrets: [SHIPPO_API_TOKEN] },
  async (req, res) => {
    if (applyCors(req, res)) return;

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    // Checkout address finder (Google Places through the shop's key) shares this endpoint.
    if (ADDRESS_ACTIONS.includes(req.body?.action)) {
      const out = await handleAddressLookup(req.body, {
        readKey: readAddressLookupKey,
        allow: async () => (await hitLimit(db, "address", req, LIMITS.address))
          && (await hitLimit(db, "address-shop-day", SHOP_WIDE_REQUEST, LIMITS.addressShopDay)),
        isAdmin: async () => Boolean(await requireAdmin(req, res)),
      });
      if (out) res.status(out.status).json(out.body);
      return;
    }

    if (!(await hitLimit(db, "shippo", req, LIMITS.shippo))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });

    const { address } = req.body;
    if (!address || addressMissing(address).length) {
      res.status(400).json({ error: "Missing address fields" });
      return;
    }

    try {
      const shippoToken = await getShippoToken();

      if (!shippoToken) {
        if (IS_EMULATOR) {
          console.warn("Using dev address verification fallback (emulator only).");
          const isTestInvalid = (address.street || "").toLowerCase().includes("invalid");
          if (isTestInvalid) {
            res.status(200).json({
              isValid: false,
              messages: [{
                code: "address_not_found",
                text: "The street address 'invalid' is not recognized by carrier databases.",
                source: "USPS"
              }]
            });
          } else {
            res.status(200).json({ isValid: true, messages: [] });
          }
          return;
        }
        // In production a missing token must not silently "verify" every
        // address. Let checkout proceed, but flag the order as unverified.
        console.error("SHIPPO_API_TOKEN missing in production — address NOT verified.");
        res.status(200).json({
          isValid: true,
          unverified: true,
          messages: [{ code: "verification_unavailable", text: "Address verification service is not configured; address was not verified." }]
        });
        return;
      }

      const countryCode = getCountryCode(address.country);
      const stateCode = getStateCode(address.state);

      const shippoRes = await callShippo("addresses/", "POST", {
        name: address.name || "Customer",
        street1: address.street,
        street2: address.unit || "",
        city: address.city,
        state: stateCode,
        zip: address.zip,
        country: countryCode,
        validate: true
      }, shippoToken);

      const validationResults = shippoRes.validation_results || {};
      const isValid = validationResults.is_valid === true;

      res.status(200).json({
        isValid,
        messages: validationResults.messages || []
      });
    } catch (err) {
      console.error("validateAddress failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 8. HTTP Endpoint: Create Shipping Label via Shippo (Secure)
// ──────────────────────────────────────────────────────────────
exports.createShippingLabel = onBrowserRequest(
  { secrets: [SHIPPO_API_TOKEN] },
  async (req, res) => {
    if (applyCors(req, res)) return;

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Buying a label spends real money on the Shippo account — admin only.
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { orderId, mode, shipmentId, rateId } = req.body;
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }

    // When mode === "shippoOrder" we only stage a pre-filled order in the
    // Shippo dashboard (no money spent) and return this URL for the admin to
    // finish buying the label on Shippo's site.
    const SHIPPO_DASHBOARD_URL = "https://app.goshippo.com/orders";

    try {
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const order = orderDoc.data();
      const operationsRef = db.collection("order-operations").doc(orderId);
      const operations = (await operationsRef.get()).data() || {};
      // The owner checked Shippo after an uncertain purchase and confirmed no label was bought
      // (or voided it there): unlock buying a new one. Recorded in the private order history.
      if (mode === "clearPurchaseLock") {
        const now = new Date().toISOString();
        const cleared = await db.runTransaction(async tx => {
          const fresh = (await tx.get(operationsRef)).data() || {};
          if (!fresh.labelPurchasePending) return false;
          tx.set(operationsRef, {
            labelPurchasePending: false,
            labelPurchaseClearedAt: now,
            labelPurchaseClearedBy: adminUser.email || "admin",
            updatedAt: now,
            activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: now,
              message: `Owner checked Shippo and allowed a new label purchase (pending purchase started ${fresh.labelPurchaseStartedAt || "earlier"} cleared).` }),
          }, { merge: true });
          return true;
        });
        if (!cleared) { res.status(409).json({ error: "No label purchase is waiting to be checked. Reload the order." }); return; }
        res.status(200).json({ cleared: true });
        return;
      }
      // Void a label that won't be used (wrong label, or the order was cancelled/refunded before the parcel
      // left): ask Shippo for the refund (or accept the owner's word that they did it there), take the
      // label off the order and follow the refund (labelRefunds, checked by unpaidPaymentSweep). Never
      // after the parcel was handed over. Rules: functions/labelVoid.js.
      if (mode === "voidLabel") {
        const confirmedElsewhere = req.body.confirmedElsewhere === true;
        if (!order.labelUrl) { res.status(409).json({ error: "This order has no label to void." }); return; }
        if (labelHandedOver(order)) { res.status(409).json({ error: "The parcel has already been handed over, so its label is in use. To fix the tracking number, use Correct tracking instead." }); return; }
        if (operations.labelPurchasePending) { res.status(409).json({ error: "A label purchase is pending. Check Shippo first." }); return; }
        const keepWords = "If you already voided it in Shippo, tick \"I already voided it in Shippo\".";
        let refundStatus = "VOIDED_IN_SHIPPO";
        let refundId = null;
        let transactionId = operations.shippoTransactionId || null;
        if (!confirmedElsewhere) {
          const voidToken = await getShippoToken();
          if (!voidToken) { res.status(500).json({ error: "SHIPPO_API_TOKEN is not configured." }); return; }
          // Labels bought before the transaction number was saved: find it in Shippo by tracking number.
          if (!transactionId && order.trackingNumber) {
            const since = new Date(Date.now() - (LABEL_REFUND_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
            try {
              for (let page = 1; page <= 5 && !transactionId; page++) {
                const list = await callShippo(`transactions/?results=100&page=${page}&object_created_gte=${since}`, "GET", null, voidToken);
                transactionId = findLabelTransaction(list?.results, order.trackingNumber)?.object_id || null;
                if (!list?.next) break;
              }
            } catch (err) { console.warn("voidLabel: transaction lookup failed:", err.message); }
          }
          if (!transactionId) {
            res.status(409).json({ error: `Shippo has no label with tracking number ${order.trackingNumber || "(none)"} from the last ${LABEL_REFUND_WINDOW_DAYS} days, so it can't be voided from here. ${keepWords}`, needsConfirmation: true });
            return;
          }
          // Read the label first: never ask twice, and never void a label that belongs to another parcel.
          let transaction;
          try { transaction = await callShippo(`transactions/${encodeURIComponent(transactionId)}/`, "GET", null, voidToken); }
          catch (err) { res.status(502).json({ error: `Couldn't reach Shippo to check the label: ${String(err.message || err).replace(/^Shippo API error: /, "").slice(0, 200)}. Try again in a minute.` }); return; }
          if (order.trackingNumber && transaction?.tracking_number && String(transaction.tracking_number).replace(/\s+/g, "") !== String(order.trackingNumber).replace(/\s+/g, "")) {
            res.status(409).json({ error: `The saved Shippo label (${transaction.tracking_number}) doesn't match this order's tracking number (${order.trackingNumber}). Check the order in Shippo. ${keepWords}`, needsConfirmation: true });
            return;
          }
          const already = transactionRefundState(transaction);
          if (already === "rejected") { res.status(409).json({ error: `Shippo already refused a refund for this label (the carrier scanned or used it). ${keepWords}`, needsConfirmation: true }); return; }
          if (already) refundStatus = String(transaction.status || "").toUpperCase();
          else {
            let refund;
            try { refund = await callShippo("refunds/", "POST", { transaction: transactionId, async: false }, voidToken); }
            catch (err) { res.status(409).json({ error: `Shippo would not void the label: ${String(err.message || err).replace(/^Shippo API error: /, "").slice(0, 300)}. Labels can be refunded only if unused and bought in the last ${LABEL_REFUND_WINDOW_DAYS} days. ${keepWords}`, needsConfirmation: true }); return; }
            refundStatus = String(refund?.status || "QUEUED").toUpperCase();
            refundId = refund?.object_id || null;
            if (refundStatus === "ERROR") { res.status(409).json({ error: `Shippo refused to void this label (it may already be used or older than ${LABEL_REFUND_WINDOW_DAYS} days). ${keepWords}`, needsConfirmation: true }); return; }
          }
        }
        const nowIso = new Date().toISOString();
        const by = adminUser.email || "admin";
        const old = { trackingNumber: order.trackingNumber || null, trackingCarrier: order.trackingCarrier || null, labelUrl: order.labelUrl, shippoTransactionId: transactionId };
        const entry = confirmedElsewhere ? null : refundEntry({ transactionId, refundId, trackingNumber: old.trackingNumber, carrier: old.trackingCarrier, status: refundStatus, at: nowIso, by });
        const finished = terminalOrder(order);
        const replaced = await db.runTransaction(async tx => {
          const [freshOrder, freshOps] = await Promise.all([tx.get(orderRef), tx.get(operationsRef)]);
          const current = freshOrder.data() || {};
          const ops = freshOps.data() || {};
          if (!current.labelUrl || current.labelUrl !== order.labelUrl || labelHandedOver(current) || ops.labelPurchasePending) return false;
          const del = admin.firestore.FieldValue.delete();
          const refunds = entry ? [...(Array.isArray(ops.labelRefunds) ? ops.labelRefunds : []), entry].slice(-20) : ops.labelRefunds;
          const words = entry ? (entry.state === "refunded" ? "refunded by Shippo" : "refund requested from Shippo") : "voided in Shippo by the owner";
          tx.update(orderRef, { labelUrl: del, trackingNumber: del, trackingCarrier: del, trackingUrl: del, updatedAt: nowIso,
            activity: admin.firestore.FieldValue.arrayUnion({ type: "note", createdAt: nowIso, message: `Label #${old.trackingNumber || ""} voided${finished ? "" : " so a new one can be bought"}.` }) });
          tx.set(operationsRef, { shippoTransactionId: del, labelTest: del, quotedShipmentId: del, quotedAddress: del, updatedAt: nowIso,
            ...(entry ? { labelRefunds: refunds, labelRefundOpen: openRefunds(refunds).length > 0 } : {}),
            labelHistory: admin.firestore.FieldValue.arrayUnion({ ...old, voidedAt: nowIso, voidedBy: by, refundStatus, refundId }),
            activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: nowIso, message: `Label #${old.trackingNumber || ""} voided (${words}).` }) }, { merge: true });
          return true;
        });
        if (!replaced) { res.status(409).json({ error: "The order changed. Reload it and try again." }); return; }
        res.status(200).json({ voided: true, refundStatus, refundState: entry ? entry.state : "elsewhere" });
        return;
      }
      const preparationProblem = labelProblem(order, operations);
      if (preparationProblem) { res.status(409).json({ error: preparationProblem }); return; }
      // A transaction claims any money-spending request. Uncertain failures remain
      // locked so retrying cannot silently buy a second label.
      const claimPurchase = async () => db.runTransaction(async tx => {
        const freshOrder = await tx.get(orderRef);
        const freshOperations = await tx.get(operationsRef);
        const current = freshOperations.data() || {};
        const problem = labelProblem(freshOrder.data() || {}, current);
        if (problem) throw new Error(problem);
        if (mode === "purchase" && (current.quotedShipmentId !== shipmentId || current.quotedAddress !== JSON.stringify(freshOrder.data().customer.address))) throw new Error("Label quote changed or expired. Refresh the rates.");
        tx.set(operationsRef, { labelPurchasePending: true, labelPurchaseStartedAt: new Date().toISOString() }, { merge: true });
      });
      const completePurchase = async () => operationsRef.set({ labelPurchasePending: false }, { merge: true });
      // Shippo answered with a definite refusal (status ERROR): no label was bought, so the
      // lock is released (with a history entry) and Shippo's own reasons reach the owner.
      // Anything uncertain (network errors, QUEUED/WAITING) keeps the lock for reconciliation.
      const failedPurchase = async transaction => {
        const outcome = shippoTransactionOutcome(transaction);
        if (outcome.definiteFailure) {
          const now = new Date().toISOString();
          await operationsRef.set({ labelPurchasePending: false, updatedAt: now,
            activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: now, message: `Shippo refused the label purchase; no label was bought. ${outcome.message}` }) }, { merge: true });
        }
        return new Error(outcome.message);
      };
      // Shippo answered with an HTTP 4xx (expired rate, invalid parcel, wrong key): a definite refusal,
      // nothing was bought, so the lock is released. 5xx and network errors stay uncertain.
      const refusedPurchase = async err => {
        const detail = String(err?.message || "").replace(/^Shippo API error: \d+ - /, "").slice(0, 400);
        const now = new Date().toISOString();
        await operationsRef.set({ labelPurchasePending: false, updatedAt: now,
          activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: now, message: `Shippo refused the label purchase (HTTP ${err.shippoStatus}); no label was bought. ${detail}` }) }, { merge: true });
        return new Error(`Shippo refused the label purchase${detail ? `: ${detail}` : "."} Nothing was bought. Fix the problem and try again.`);
      };
      const orderMetadata = `Order ${order.orderId || orderId}`.slice(0, 100);
      // Buys one rate. The Shippo transaction id is saved against the order (order-operations) BEFORE the
      // order itself is updated, so an interrupted purchase can be found and reconciled in Shippo.
      const buyRate = async (rateObjectId, shippoOrderId) => {
        const body = { rate: rateObjectId, async: false, metadata: orderMetadata, ...(shippoOrderId ? { order: shippoOrderId } : {}) };
        let transaction;
        try {
          transaction = await callShippo("transactions/", "POST", body, shippoToken, 45000);
        } catch (err) {
          if (!shippoDefiniteRefusal(err)) throw err;
          // A definite refusal bought nothing. If it may be about the linked Shippo Order, buy unlinked once.
          if (!shippoOrderId) throw await refusedPurchase(err);
          console.warn("Shippo refused the label linked to its order; retrying without the link:", err?.message || err);
          try {
            transaction = await callShippo("transactions/", "POST", { rate: rateObjectId, async: false, metadata: orderMetadata }, shippoToken, 45000);
          } catch (retryErr) {
            if (shippoDefiniteRefusal(retryErr)) throw await refusedPurchase(retryErr);
            throw retryErr;
          }
        }
        const save = () => operationsRef.set({ shippoTransactionId: transaction.object_id || null, shippoTransactionStatus: transaction.status || null,
          shippoRateId: rateObjectId, shippoTransactionAt: new Date().toISOString() }, { merge: true });
        try { await save(); } catch { await save(); }
        if (transaction.status !== "SUCCESS") throw await failedPurchase(transaction);
        if (!transaction.label_url || !transaction.tracking_number) {
          throw new Error(`Shippo bought the label (transaction ${transaction.object_id || "unknown"}) but did not return its tracking number and label link. Open it in Shippo; the transaction number is saved on this order.`);
        }
        return transaction;
      };
      // Order update + lock release in one transaction, so the label is never half recorded.
      const recordLabel = async (transaction, carrierFallback) => {
        const now = new Date().toISOString();
        const trackingNumber = transaction.tracking_number;
        const trackingCarrier = transaction.tracking_provider || carrierFallback || "Carrier";
        const labelUrl = transaction.label_url;
        await db.runTransaction(async tx => {
          tx.update(orderRef, { labelUrl, trackingNumber, trackingCarrier, updatedAt: now,
            activity: admin.firestore.FieldValue.arrayUnion({ type: "note", message: `Shipping Label #${trackingNumber} generated via dashboard. Carrier: ${trackingCarrier}.`, createdAt: now }) });
          // A test-mode key (or Shippo's own test flag) makes a sandbox label: no real postage, tracking never tracks.
          tx.set(operationsRef, { labelPurchasePending: false, shippoTransactionId: transaction.object_id || null, labelBoughtAt: now, labelTest: transaction.test === true || /^shippo_test_/.test(String(shippoToken || "")) }, { merge: true });
        });
        return { labelUrl, trackingNumber, trackingCarrier };
      };
      if (order.isTest === true) {
        res.status(400).json({ error: "Test orders are excluded from fulfillment." });
        return;
      }
      if (!order.customer || !order.customer.address) {
        res.status(400).json({ error: "Order has no customer address data" });
        return;
      }
      if (addressMissing(order.customer.address).length) {
        res.status(400).json({ error: "The shipping address is incomplete for this country. Correct it in the order first." });
        return;
      }

      // 1. Resolve Settings (API keys and Origin address)
      const settingsDoc = await db.collection("settings").doc("website").get();
      const settings = settingsDoc.data() || {};

      const shippoToken = await getShippoToken();

      if (!shippoToken) {
        if (!IS_EMULATOR) {
          // Never hand out fake tracking numbers on real orders.
          const reason = mode === "shippoOrder"
            ? "SHIPPO_API_TOKEN is not configured — cannot push the order to Shippo."
            : "SHIPPO_API_TOKEN is not configured — cannot generate a real shipping label.";
          res.status(500).json({ error: reason });
          return;
        }
        if (mode === "shippoOrder") {
          // Dev fallback: skip the API call, just hand back the dashboard URL.
          console.warn("Shippo token missing — skipping order push (Dev Fallback).");
          res.status(200).json({ dashboardUrl: SHIPPO_DASHBOARD_URL, shippoOrderId: null });
          return;
        }
        console.warn("Using dev label generation fallback (mock PDF and tracking).");
        const mockTracking = `MOCK-${Math.floor(10000000 + Math.random() * 90000000)}`;
        const mockLabelUrl = "https://goshippo.com/wp-content/uploads/2016/04/Shippo_Label.pdf";
        
        await claimPurchase();
        await orderRef.update({
          labelUrl: mockLabelUrl,
          trackingNumber: mockTracking,
          trackingCarrier: "USPS (Sandbox)",
          updatedAt: new Date().toISOString(),
          activity: admin.firestore.FieldValue.arrayUnion({ 
              type: "note", 
              message: `Shipping Label #${mockTracking} generated via dashboard (Dev Fallback).`, 
              createdAt: new Date().toISOString() 
            })
        });

        await completePurchase();
        res.status(200).json({
          labelUrl: mockLabelUrl,
          trackingNumber: mockTracking,
          trackingCarrier: "USPS (Sandbox)"
        });
        return;
      }

      const addressFrom = originAddress(settings);

      // 2. Resolve Destination Address
      const dest = order.customer.address;
      const addressTo = {
        name: order.customer.name || "Customer",
        street1: dest.street,
        street2: dest.unit || "",
        city: dest.city,
        state: getStateCode(dest.state),
        zip: dest.zip,
        country: getCountryCode(dest.country),
        phone: order.customer.phone || "",
        email: order.customer.email
      };

      // A Shippo Order for this website order. Labels bought through the API without one show up in the
      // Shippo dashboard with an empty Order column and can't be managed (refunded) from there, so every
      // purchase is linked to one. Reused while the address is unchanged; a new one after a correction.
      const shippoOrderBody = () => {
        const currency = (order.checkoutCurrency || order.currency || "CAD").toUpperCase();
        const orderItems = (order.items || []).filter(item => item && isPhysicalItem(item));
        const orderQty = orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
        return {
          to_address: addressTo,
          from_address: addressFrom,
          line_items: orderItems.map(item => {
            const qty = item.quantity || 1;
            return {
              title: String(item.title || "Item").slice(0, 200),
              quantity: qty,
              total_price: ((item.price || 0) * qty).toFixed(2),
              currency,
              weight: (1.5 * qty).toFixed(2),
              weight_unit: "lb",
              sku: String(item.id || item.sku || "")
            };
          }),
          placed_at: order.createdAt || new Date().toISOString(),
          order_number: order.orderId || orderId,
          order_status: "PAID",
          shipping_cost: (order.shipping || 0).toFixed(2),
          shipping_cost_currency: currency,
          subtotal_price: (order.subtotal || 0).toFixed(2),
          total_price: (order.total || 0).toFixed(2),
          total_tax: (order.tax || 0).toFixed(2),
          currency,
          weight: (1.5 * Math.max(1, orderQty)).toFixed(2),
          weight_unit: "lb"
        };
      };
      const addressKey = JSON.stringify(order.customer.address);
      const createShippoOrder = async () => {
        const shippoOrder = await callShippo("orders/", "POST", shippoOrderBody(), shippoToken);
        const id = shippoOrder.object_id || null;
        if (id) {
          const now = new Date().toISOString();
          await Promise.all([
            orderRef.update({ shippoOrderId: id, updatedAt: now }),
            operationsRef.set({ shippoOrderId: id, shippoOrderAddress: addressKey }, { merge: true }),
          ]);
        }
        return id;
      };
      // Never blocks a purchase: if Shippo won't create the Order, the label is still bought (unlinked).
      const linkedShippoOrder = async () => {
        if (order.shippoOrderId && operations.shippoOrderId === order.shippoOrderId && operations.shippoOrderAddress === addressKey) return order.shippoOrderId;
        try { return await createShippoOrder(); }
        catch (err) { console.warn("Could not create the Shippo order for the label:", err?.message || err); return null; }
      };

      if (mode === "purchase") {
        if (!shipmentId || !rateId) {
          res.status(400).json({ error: "Choose a Canada Post rate before buying the label." });
          return;
        }
        const quotedShipment = await callShippo(`shipments/${encodeURIComponent(shipmentId)}/`, "GET", null, shippoToken);
        const chosenRate = (quotedShipment.rates || []).find(rate => rate.object_id === rateId);
        if (!chosenRate || !isPurchasableRate(chosenRate, order)) {
          res.status(400).json({ error: "That rate is no longer available. Refresh the choices and try again." });
          return;
        }
        const shippoOrderId = await linkedShippoOrder();
        await claimPurchase();
        const transaction = await buyRate(chosenRate.object_id, shippoOrderId);
        res.status(200).json(await recordLabel(transaction, chosenRate.provider || "Canada Post"));
        return;
      }

      // Push-to-Shippo mode: stage a pre-filled Order in the Shippo dashboard
      // (no label purchased) and return the site URL for the admin to finish.
      if (mode === "shippoOrder") {
        const shippoOrderId = await createShippoOrder();
        await orderRef.update({
          updatedAt: new Date().toISOString(),
          activity: admin.firestore.FieldValue.arrayUnion({
              type: "note",
              message: "Order pushed to Shippo dashboard for label creation.",
              createdAt: new Date().toISOString()
            })
        });

        res.status(200).json({
          dashboardUrl: SHIPPO_DASHBOARD_URL,
          shippoOrderId,
          orderNumber: order.orderId || orderId
        });
        return;
      }

      // 3. Define Parcel (scale weight by quantity or use custom parameters from req.body)
      const totalQty = (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
      const customParcel = req.body.parcel || {};
      const parcel = {
        length: customParcel.length ? String(customParcel.length) : "10",
        width: customParcel.width ? String(customParcel.width) : "8",
        height: customParcel.height ? String(customParcel.height) : "2",
        distance_unit: customParcel.distance_unit || "in",
        weight: customParcel.weight ? String(customParcel.weight) : (1.5 * totalQty).toFixed(1),
        mass_unit: customParcel.mass_unit || "lb"
      };

      // 3b. Customs paperwork for a parcel that crosses a border (item description, tariff number,
      // value and origin per book; Books › edit › Details › Customs). No money is spent here.
      let customsDeclarationId;
      if (needsCustoms(addressFrom.country, addressTo.country)) {
        const lines = (order.items || []).filter(item => item && isPhysicalItem(item));
        const bookIds = [...new Set(lines.map(item => item.id).filter(Boolean))];
        const bookDocs = await Promise.all(bookIds.map(id => db.collection("books").doc(String(id)).get()));
        const booksById = Object.fromEntries(bookDocs.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
        const items = customsItems(order, booksById, addressFrom.country);
        if (items.length) {
          const itemIds = [];
          for (const item of items) itemIds.push((await callShippo("customs/items/", "POST", item, shippoToken)).object_id);
          const declaration = await callShippo("customs/declarations/", "POST",
            customsDeclaration(itemIds, order, addressFrom.name || addressFrom.company, addressFrom.country), shippoToken);
          if (String(declaration.object_status || declaration.object_state || "").toUpperCase() === "INVALID") {
            const why = (declaration.messages || []).map(m => m?.text || m).filter(Boolean).join("; ");
            throw new Error(`Shippo rejected the customs details${why ? `: ${why}` : "."} Check the book's customs fields in Books › edit › Details.`);
          }
          customsDeclarationId = declaration.object_id;
        }
      }

      // 4. Create Shipment on Shippo
      const shipment = await callShippo("shipments/", "POST", {
        address_from: addressFrom,
        address_to: addressTo,
        parcels: [parcel],
        ...(customsDeclarationId ? { customs_declaration: customsDeclarationId } : {}),
        metadata: orderMetadata,
        async: false
      }, shippoToken);

      const rates = shipment.rates || [];
      if (rates.length === 0) {
        throw new Error("No shipping rates returned by Shippo.");
      }

      if (mode === "rates") {
        await operationsRef.set({ quotedShipmentId: shipment.object_id, quotedAddress: JSON.stringify(order.customer.address) }, { merge: true });
        // Canada Post, plus the exact service the customer paid for when checkout sold another carrier's.
        const offered = labelRatesFor(rates, order);
        res.status(200).json({ shipmentId: shipment.object_id, customs: !!customsDeclarationId, rates: offered.map(rate => ({
          id: rate.object_id,
          name: isCanadaPostRateName(rate) ? (rate.servicelevel?.name || "Canada Post") : soldName(rate),
          carrier: rate.provider || "",
          soldService: isSoldRateName(rate, order),
          amount: Number(rate.amount),
          currency: rate.currency || "CAD",
          estimatedDays: Number.isFinite(Number(rate.estimated_days)) ? Number(rate.estimated_days) : null,
          durationTerms: rate.duration_terms || ""
        })) });
        return;
      }

      // 5. Select cheapest rate
      const cheapestRate = rates.reduce((min, rate) => {
        const rateVal = parseFloat(rate.amount);
        const minVal = parseFloat(min.amount);
        return rateVal < minVal ? rate : min;
      }, rates[0]);

      const shippoOrderId = await linkedShippoOrder();
      await claimPurchase();
      // 6. Purchase Rate to create Transaction (Label); its id is saved before the order is updated.
      const transaction = await buyRate(cheapestRate.object_id, shippoOrderId);
      // 7. Update the order and release the lock together
      res.status(200).json(await recordLabel(transaction, cheapestRate.provider));

    } catch (err) {
      console.error("createShippingLabel failed:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 9. HTTP Endpoint: Validate Discount Code (public checkout)
//    The discounts collection is admin-only in Firestore rules, so the
//    storefront validates codes through this endpoint instead.
// ──────────────────────────────────────────────────────────────
exports.validateDiscountCode = onBrowserRequest(async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // The storefront's starting currency: the visitor's country as Google's front end saw their IP
  // (serverGeoCountry). No database work and no third-party lookup; null when the platform sent none.
  if (req.body?.action === "visitorCountry") {
    res.set("Cache-Control", "private, no-store");
    res.status(200).json({ country: serverGeoCountry(req) || null });
    return;
  }

  // Checkout's automatic offers (no code): the conditions checkout needs to show the same saving
  // the server will charge. Customer lists and usage counts stay private.
  if (req.body?.action === "automaticDiscounts") {
    // Its own bucket (checkout asks on every cart change, which must not use up the code-guessing allowance),
    // and the discounts query is shared for 30 s so a loop of calls cannot turn into a loop of reads (#110).
    if (!(await hitLimit(db, "autodiscount", req, LIMITS.autoDiscount))) {
      res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    try {
      const offers = await cachedAutomaticDiscounts();
      res.status(200).json({ discounts: offers.map(d => ({
        id: d.id, title: String(d.title || ""), type: d.type, value: d.value ?? null,
        minOrderAmount: d.minOrderAmount ?? null, minQuantity: d.minQuantity ?? null, maxDiscountAmount: d.maxDiscountAmount ?? null,
        appliesTo: d.appliesTo ?? "all", selectedCategories: d.selectedCategories ?? [], selectedProducts: d.selectedProducts ?? [],
        buyQuantity: d.buyQuantity ?? null, getQuantity: d.getQuantity ?? null, getDiscountValue: d.getDiscountValue ?? null, tiers: d.tiers ?? null,
        giftBookId: d.giftBookId ?? null, giftVariantId: d.giftVariantId ?? null,
        // Offers limited to some customers may not apply to this shopper: checkout re-prices on the server.
        restricted: !!(String(d.allowedCustomerEmails || "").trim() || String(d.allowedEmailDomains || "").trim() || d.onePerCustomer),
      })) });
    } catch (err) {
      console.error("automaticDiscounts failed:", err);
      res.status(200).json({ discounts: [] });
    }
    return;
  }

  // Checkout's "Gift card" box: the card's balance, by code. Rate limited like discount codes.
  if (req.body?.action === "giftCardBalance") {
    if (!(await hitLimit(db, "discount", req, LIMITS.discount))) {
      res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    const id = giftCardId(req.body.code);
    if (!id) return res.status(400).json({ error: GIFT_CARD_MESSAGES.not_found, code: "gift_card_not_found" });
    const snap = await db.collection("giftCards").doc(id).get();
    const card = snap.exists ? snap.data() : null;
    const problem = giftCardProblem(card, { testMode: await shopTestMode() });
    if (problem) return res.status(400).json({ error: GIFT_CARD_MESSAGES[problem], code: `gift_card_${problem}` });
    return res.status(200).json({ last4: card.last4 || last4(req.body.code), balanceMinor: availableMinor(card, "", Date.now()), currency: "CAD", expiresOn: card.expiresOn || null });
  }

  const { code } = req.body;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing discount code" });
    return;
  }
  if (!(await hitLimit(db, "discount", req, LIMITS.discount))) {
    res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    return;
  }

  try {
    const d = await fetchValidDiscount(code);
    res.status(200).json({
      discount: {
        id: d.id,
        code: d.code,
        type: d.type,
        value: d.value,
        minOrderAmount: d.minOrderAmount ?? null,
        minQuantity: d.minQuantity ?? null,
        // Checkout shows the same "up to $X off" ceiling the server applies.
        maxDiscountAmount: d.maxDiscountAmount ?? null,
        onePerCustomer: d.onePerCustomer ?? false,
        appliesTo: d.appliesTo ?? "all",
        selectedCategories: d.selectedCategories ?? [],
        selectedProducts: d.selectedProducts ?? [],
        allowedEmailDomains: d.allowedEmailDomains ?? "",
        // The list itself stays private: checkout re-checks the shopper's email on the server.
        restrictedToCustomers: !!String(d.allowedCustomerEmails || "").trim(),
        buyQuantity: d.buyQuantity ?? null,
        getQuantity: d.getQuantity ?? null,
        getDiscountValue: d.getDiscountValue ?? null,
        tiers: d.tiers ?? null,
      },
    });
  } catch (err) {
    res.status(400).json({ error: publicErrorMessage(err, "That code could not be checked. Please try again.") });
  }
});

// ──────────────────────────────────────────────────────────────
// 10. Order Created Trigger (New Order Admin Alert / Customer Manual Order Confirmation)
// ──────────────────────────────────────────────────────────────
exports.onOrderCreated = onDocumentCreated(
  { document: "orders/{orderId}", secrets: [RESEND_API_KEY] },
  async event => {
    const order = event.data?.data() || {};
    const orderId = event.params.orderId;

    if (order.isTest === true) return;
    if (!order.customer?.email) return;

    const notificationSettings = await loadNotificationSettings();

    // 1. Admin Alert: Send email to ADMIN_TO about new order
    // Card/PayPal orders are created before payment (and many are never paid): the shop
    // hears about those once, when they're paid (onOrderUpdated). Only manual-payment
    // orders, which are paid later by e-Transfer/cash, are news when placed.
    if (notificationSettings.shopAlerts?.newOrder !== false && order.paymentStatus === "pending") {
      const itemsTable = `
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:13px;">
          ${orderRowsHtml(order.items)}
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Subtotal</td><td style="text-align:right;">${moneyFmt(order.subtotal)}</td></tr>
          <tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Shipping</td><td style="text-align:right;">${moneyFmt(order.shipping)}</td></tr>
          ${order.tax ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#666;">Tax</td><td style="text-align:right;">${moneyFmt(order.tax)}</td></tr>` : ""}
          ${order.discount ? `<tr><td colspan="2" style="padding:8px 0;text-align:right;color:#0a7;">Discount</td><td style="text-align:right;color:#0a7;">−${moneyFmt(order.discount)}</td></tr>` : ""}
          <tr><td colspan="2" style="padding:12px 0;text-align:right;font-weight:bold;">Total</td><td style="text-align:right;font-weight:bold;">${moneyFmt(order.total)}</td></tr>
        </table>
      `;

      const adminHtml = `
        <p>A new order has been placed: <strong>${escapeHtml(order.orderId || orderId)}</strong> · ${moneyFmt(order.total)}</p>
        <p>It's waiting for a manual payment (${escapeHtml(order.paymentMethod || "manual")}). Once the money arrives, confirm it in the order and ship it.</p>
        ${risoButton(siteLink(`/admin#orders/${encodeURIComponent(orderId)}`), "Open this order &rarr;", notificationSettings.brand?.brandColor, notificationSettings.brand?.emailTheme)}
        <p><strong>Customer:</strong> ${escapeHtml(order.customer.name)} &lt;${escapeHtml(order.customer.email)}&gt;</p>
        <p><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod || "Stripe")}</p>
        <p><strong>Shipping Method:</strong> ${escapeHtml(order.shippingMethod || "Standard")}</p>
        ${itemsTable}
      `;

      try {
        await sendEmail({
          queue: "shopPendingOrder",
          about: { orderId },
          to: ADMIN_TO,
          subject: `[NEW ORDER] ${order.orderId || orderId}`,
          html: adminHtml,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("New order admin email notification failed", err);
      }
    }

    // 2. Customer Email: Send "Order Received (Pending Payment)" confirmation email if order was placed via manual payment method (i.e. starts as "pending")
    if (order.paymentStatus === "pending" && notificationSettings.order_pending_payment?.enabled !== false) {
      const itemsTable = customerTotalsTable(order);

      // Instructions come from the shop's own settings, never from the order
      // document (which a browser can write), so nobody can make the shop email
      // someone "pay to this account" text.
      const websiteSettings = (await db.collection("settings").doc("website").get()).data() || {};
      const manualMethod = (websiteSettings.payments?.manualMethods || []).find(m => m && m.name === order.paymentMethod);
      const paymentInstructions = String(manualMethod?.instructions || "");
      if (!manualMethod) return; // not a payment method this shop offers: no customer email
      let additionalSection = "";
      if (paymentInstructions) {
        additionalSection = `
          <div style="margin-top:28px;padding:24px;background:#fffbeb;border-radius:16px;border:1px solid #d9770620;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#d97706;">Payment Instructions</h3>
            <p style="font-size:12px;color:#451a03;margin-bottom:0;line-height:1.6;white-space:pre-wrap;">${escapeHtml(paymentInstructions)}</p>
          </div>
        `;
      }

      // Not paid yet: its own template, so the customer isn't told the order is paid for.
      const compiled = compileEmailTemplate("order_pending_payment", notificationSettings, {
        customer_name: order.customer.name || "there",
        order_id: order.orderId || orderId,
        payment_method: order.paymentMethod || "",
        button_url: await orderTrackUrl(orderId, order),
        items_table: itemsTable,
        total_price: chargedTotalFmt(order)
      }, additionalSection);

      try {
        await sendEmail({
          queue: "orderPendingPayment",
          about: { orderId },
          to: order.customer.email,
          subject: compiled.subject,
          html: compiled.html,
          secret: RESEND_API_KEY.value(),
        });
      } catch (err) {
        console.error("Order pending payment customer email failed", err);
      }
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 11. Customer Welcome Trigger
// ──────────────────────────────────────────────────────────────
// Storefront contact form (ContactFormSection) → email the shop.
const escContact = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

exports.onContactMessage = onDocumentCreated(
  { document: "contactMessages/{messageId}", secrets: [RESEND_API_KEY] },
  async event => {
    const m = event.data?.data() || {};
    if (!m.email || !m.message) return;
    // Anyone can write this document: a "from" that isn't one plain address (a list, a name in
    // angle brackets, a header break) is never mailed to or counted against the budget.
    const senderOk = !!cleanRecipients(m.email) && cleanRecipients(m.email).length === 1;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">New message from your website</h2>
        <p><strong>From:</strong> ${escContact(m.name)} &lt;<a href="mailto:${escContact(m.email)}">${escContact(m.email)}</a>&gt;${m.phone ? ` · ${escContact(m.phone)}` : ""}</p>
        ${m.subject ? `<p><strong>Subject:</strong> ${escContact(m.subject)}</p>` : ""}
        <p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px;">${escContact(m.message)}</p>
        ${m.page ? `<p style="color:#888;font-size:12px;">Sent from ${escContact(m.page)}</p>` : ""}
      </div>`;
    // A flood from one sender can't burn the shop's sending quota: past the hourly cap the
    // message still waits in Messages (status stays "new"), it just isn't emailed.
    // The shop-wide hourly/daily budget (claimEmailSend) also applies, so rotating fake sender
    // addresses can't drain the Gmail quota either.
    const notifyOwner = await claimEmailSend(db, "ownerNotify", senderOk ? m.email : "invalid-sender", { failOpen: true });
    if (!notifyOwner) console.warn("Contact message not emailed to the shop: sender or shop-wide email limit reached");
    if (notifyOwner) try {
      await sendEmail({
        queue: "contactNotify",
        to: ADMIN_TO,
        subject: `[CONTACT] ${String(m.subject || m.name || "New message").slice(0, 120)}`,
        html,
        secret: RESEND_API_KEY.value(),
      });
      // Don't undo an admin who already opened/archived it in Messages.
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(event.data.ref);
        if (cur.exists && cur.get("status") === "new") tx.update(event.data.ref, { status: "emailed" });
      });
    } catch (err) {
      console.error("Contact message email failed", err);
    }

    // Confirmation to the visitor (Settings › Notifications › Contact form › Message received).
    const notificationSettings = await loadNotificationSettings();
    if (notificationSettings.contact_reply?.enabled === false) return;
    // Anyone can type any address into the form, so this email must not be a relay: at most
    // one per address per day, and none of the visitor's own text (subject/message) is echoed
    // back; only the name, escaped and shortened. Older saved templates that still use
    // {{subject}}/{{message}} get blanks.
    if (!senderOk || !(await claimEmailSend(db, "visitorReply", m.email))) return;
    // compileEmailTemplate escapes and keeps "$" literal itself.
    const safe = (v) => String(v == null ? "" : v);
    const compiled = compileEmailTemplate("contact_reply", notificationSettings, {
      customer_name: safe(m.name || "there").replace(/\s+/g, " ").trim().slice(0, 60) || "there",
      email: safe(m.email),
      subject: "",
      message: "",
    });
    try {
      await sendEmail({
        to: m.email,
        subject: compiled.subject.replace(/&lt;|&gt;|&amp;|&quot;/g, (x) => ({ "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"' }[x])),
        html: compiled.html,
        secret: RESEND_API_KEY.value(),
      });
    } catch (err) {
      console.error("Contact confirmation email failed", err);
    }
  }
);

exports.onCustomerCreated = onDocumentCreated(
  { document: "customers/{customerId}", secrets: [RESEND_API_KEY] },
  async event => {
    const customer = event.data?.data() || {};
    if (!customer.email) return;
    // Only welcome the signed-in account's own, verified address: a profile doc names any
    // email it likes, so the address must match the Auth user behind the uid (email-link
    // sign-in verifies it). Anything else would let anyone mail a stranger.
    let authUser = null;
    try {
      authUser = await admin.auth().getUser(event.params?.customerId);
    } catch (err) {
      console.warn("Welcome email skipped: no matching account", err?.code || "");
      return;
    }
    const authEmail = String(authUser?.email || "").trim().toLowerCase();
    if (!authUser?.emailVerified || !authEmail || authEmail !== String(customer.email).trim().toLowerCase()) {
      console.warn("Welcome email skipped: profile email is not the account's verified email");
      return;
    }

    const notificationSettings = await loadNotificationSettings();
    if (notificationSettings.customer_welcome?.enabled === false) {
      return;
    }
    if (!(await customerAccountsEnabled())) return;

    const compiled = compileEmailTemplate("customer_welcome", notificationSettings, {
      customer_name: customer.name || "there",
      email: customer.email,
      button_url: siteLink("/account"),
    });

    try {
      await sendEmail({
        queue: "welcome",
        to: customer.email,
        subject: compiled.subject,
        html: compiled.html,
        secret: RESEND_API_KEY.value(),
      });
      console.log("Welcome email sent to a new customer");
    } catch (err) {
      console.error("Welcome email failed", err);
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 11. HTTP Endpoint: Send Test Email (Admin Secure)
// ──────────────────────────────────────────────────────────────
exports.sendTestEmail = onBrowserRequest(
  { secrets: [RESEND_API_KEY] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const body = req.body || {};
    // Admin › Messages › Reply: answer a contact message (functions/messageReply.js).
    if (body.action === "replyToMessage") {
      try {
        const out = await require("./messageReply").handleMessageReply(body, {
          db, sendEmail, secret: RESEND_API_KEY.value(), adminEmail: adminUser.email || "",
        });
        res.status(out.status).json(out.json);
      } catch (err) {
        console.error("message reply failed:", err);
        res.status(500).json({ error: "The reply could not be sent. Check that the latest Cloud Functions are deployed." });
      }
      return;
    }
    // Settings › Notifications › Waiting to send: the retry queue (never its HTML, which can
    // hold gift-card codes and download links), Retry now and Stop retrying.
    if (body.action === "emailQueue" || body.action === "retryEmail" || body.action === "cancelEmail") {
      try {
        if (body.action === "emailQueue") {
          const snap = await db.collection("emailOutbox").orderBy("createdAt", "desc").limit(50).get();
          res.status(200).json({ entries: snap.docs.filter(d => d.data().status !== "sent").map(d => publicOutboxEntry(d.id, d.data())) });
          return;
        }
        const id = String(body.id || "");
        if (!/^[a-f0-9]{24}$/.test(id)) { res.status(400).json({ error: "Unknown queued email." }); return; }
        if (body.action === "cancelEmail") {
          const ref = db.collection("emailOutbox").doc(id);
          // Never claim "stopped" while a sweep is sending it right now (it holds the lease).
          const outcome = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists || snap.data().status === "sent") return { gone: true };
            const lease = Date.parse(snap.data().leaseUntil || "");
            if (Number.isFinite(lease) && lease > Date.now()) return { busy: true };
            tx.delete(ref);
            return { entry: snap.data() };
          });
          if (outcome.gone) { res.status(404).json({ error: "That email is no longer waiting — it was sent or already removed." }); return; }
          if (outcome.busy) { res.status(409).json({ error: "That email is being sent right now. Refresh in a minute to see whether it went." }); return; }
          const entry = outcome.entry;
          await logEmailAttempt({ to: Array.isArray(entry.to) ? entry.to.join(", ") : String(entry.to || ""), subject: entry.subject, kind: entry.kind || "", outboxId: id,
            status: "cancelled", error: `Stopped by ${adminUser.email || "the shop"} after ${Number(entry.attempts) || 1} tries. It will not be sent.` });
          res.status(200).json({ status: "cancelled" });
          return;
        }
        const result = await sendQueuedEmail(id, { force: true });
        if (result.status === "skipped") { res.status(409).json({ error: "That email is already being sent, or is no longer waiting. Refresh the list." }); return; }
        res.status(200).json(result);
      } catch (err) {
        console.error("email queue action failed:", err);
        res.status(500).json({ error: "The email queue could not be read. Check that the latest Cloud Functions are deployed." });
      }
      return;
    }

    // Settings › Notifications › Gmail sending › Check connection: signs in to Gmail without
    // sending anything, so a revoked or mistyped app password shows up before an order does.
    if (body.action === "verifyGmail") {
      let pass = "";
      try { pass = String((await db.collection("adminSecrets").doc("gmail").get()).data()?.appPassword || "").replace(/\s+/g, ""); }
      catch (err) { console.warn("verifyGmail: could not read the app password:", err.message); }
      if (!pass) { res.status(200).json({ ok: false, error: "No Gmail app password is saved yet." }); return; }
      try {
        const transport = nodemailer.createTransport({ service: "gmail", auth: { user: ADMIN_TO, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
        await transport.verify();
        res.status(200).json({ ok: true });
      } catch (err) {
        const raw = String(err?.message || err);
        const wrong = /535|invalid login|username and password not accepted|badcredentials/i.test(raw);
        res.status(200).json({ ok: false, error: wrong
          ? "Gmail refused this app password. Create a new one at myaccount.google.com › Security › App passwords and save it here."
          : `Gmail could not be reached (${raw.slice(0, 200)}). Try again in a minute.` });
      }
      return;
    }

    const { templateId, email } = body;
    if (!templateId || !email) {
      res.status(400).json({ error: "Missing templateId or email" });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_NOTIFICATIONS, templateId) || templateId === "brand") {
      res.status(400).json({ error: "Unknown email template." });
      return;
    }
    if (!cleanRecipients(email)) {
      res.status(400).json({ error: "Enter one valid email address for the test." });
      return;
    }

    try {
      const notificationSettings = await loadNotificationSettings();
      // Send test uses what the admin sees in the editor, saved or not (bounded, admin-only).
      const draft = body.template && typeof body.template === "object" ? body.template : null;
      if (draft) {
        const field = (value, max) => (typeof value === "string" ? value.slice(0, max) : undefined);
        const fields = { subject: field(draft.subject, 300), body: field(draft.body, 10000), buttonText: field(draft.buttonText, 80), signoff: field(draft.signoff, 500) };
        notificationSettings[templateId] = { ...notificationSettings[templateId], ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
      }
      const draftBrand = body.brand && typeof body.brand === "object" ? body.brand : null;
      if (draftBrand) {
        const brand = { ...notificationSettings.brand };
        if (typeof draftBrand.logoUrl === "string" && (draftBrand.logoUrl === "" || /^https:\/\/[^\s"'<>]{1,500}$/.test(draftBrand.logoUrl))) brand.logoUrl = draftBrand.logoUrl;
        if (typeof draftBrand.brandColor === "string" && /^#[0-9a-f]{3,8}$/i.test(draftBrand.brandColor)) brand.brandColor = draftBrand.brandColor;
        if (draftBrand.emailTheme === "light" || draftBrand.emailTheme === "dark") brand.emailTheme = draftBrand.emailTheme;
        notificationSettings.brand = brand;
      }

      const mockVars = {
        customer_name: "Julianne Smith",
        order_id: "LM-98241",
        tracking_carrier: "Canada Post",
        tracking_number: "123456789012",
        total_price: "CA$45.00",
        payment_method: "Interac e-Transfer",
        shipping_method: "Canada Post Expedited Parcel",
        delivery_estimate: "2-4 business days after dispatch",
        order_url: siteLink("/track"),
        email: "julianne.smith@gmail.com",
        status: "out for delivery",
        subject: "Stocking your books",
        message: "Hello! Do you sell wholesale to independent bookshops?",
        tracking_url: "https://www.canadapost-postescanada.ca/track-reperage/en",
        cart_url: siteLink("/checkout"),
        button_url: siteLink("/track"),
        // Gift card email (gift_card)
        recipient_name: "Sam",
        sender_name: "Julianne",
        amount: "CA$50.00",
        code: "ABCD-EFGH-JKMN-PQRS",
        expires: "",
        shop_url: siteLink("/"),
        items_table: `
          <div style="margin: 30px 0; border-top: 1px solid #eeeeee; padding-top: 20px;">
            <h4 style="margin-top: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #888888;">Order Details</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #eeeeee;">
                <td style="padding: 10px 0; font-weight: bold;">Visions of Toronto - Limited Edition (x1)</td>
                <td style="padding: 10px 0; text-align: right; font-family: monospace;">CA$35.00</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #666666;">Subtotal</td>
                <td style="padding: 10px 0; text-align: right; font-family: monospace;">CA$35.00</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #666666;">Shipping</td>
                <td style="padding: 5px 0; text-align: right; font-family: monospace;">CA$10.00</td>
              </tr>
              <tr style="font-size: 15px; font-weight: bold; border-top: 1px solid #dddddd;">
                <td style="padding: 15px 0;">Total</td>
                <td style="padding: 15px 0; text-align: right; font-family: monospace;">CA$45.00</td>
              </tr>
            </table>
          </div>
        `
      };

      let sampleDownloadSection = "";
      if (templateId === "order_confirmation") {
        sampleDownloadSection = `
          <div style="margin-top:28px;padding:24px;background:#f8f6ff;border-radius:16px;border:1px solid #7c3aed20;">
            <h3 style="margin-top:0;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#7c3aed;">Digital Library Access (Sample)</h3>
            <p style="font-size:11px;color:#666;margin-bottom:16px;line-height:1.5;">Click the links below to download your digital books. For security, these download links are active for 24 hours.</p>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #7c3aed10;"><strong>Visions of Toronto - PDF Edition</strong></td>
                <td style="padding:8px 0;text-align:right;border-bottom:1px solid #7c3aed10;">
                  <a href="#" style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:10px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;">Download File</a>
                </td>
              </tr>
            </table>
          </div>
        `;
      }

      const compiled = compileEmailTemplate(templateId, notificationSettings, mockVars, sampleDownloadSection);

      await sendEmail({
        to: email,
        subject: `[TEST] ${compiled.subject}`,
        html: compiled.html,
        secret: RESEND_API_KEY.value(),
      });

      res.status(200).json({ success: true, subject: `[TEST] ${compiled.subject}` });
    } catch (err) {
      console.error("sendTestEmail failed:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 12. HTTP Endpoint: Shippo Webhook Status Updates (Carrier Integration)
// ──────────────────────────────────────────────────────────────
exports.shippoWebhook = onRequest(
  { secrets: [RESEND_API_KEY, SHIPPO_API_TOKEN] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const payload = req.body || {};
    const trackingNum = payload.data?.tracking_number;
    const carrier = payload.data?.carrier;

    if (!trackingNum) {
      console.warn("Shippo webhook invoked without tracking number.");
      res.status(400).send("Missing tracking number");
      return;
    }

    try {
      const snap = await db.collection("orders").where("trackingNumber", "==", trackingNum).limit(1).get();
      if (snap.empty) {
        console.log(`Shippo webhook: No order matches tracking number ${trackingNum}`);
        res.status(200).json({ success: true, message: "No matching order found" });
        return;
      }

      const orderDoc = snap.docs[0];
      const order = orderDoc.data();
      const orderId = orderDoc.id;
      // Only paid orders move to delivered; a refunded or cancelled order stays as it is.
      if (order.paymentStatus !== "paid") {
        res.status(200).json({ success: true, message: "Order is not in a deliverable state" });
        return;
      }

      // The webhook body is unsigned, so the status is read back from Shippo itself:
      // a forged "DELIVERED" for a known tracking number changes nothing.
      let trackingStatus = null;
      try {
        const token = await getShippoToken();
        const carrierCode = String(carrier || order.trackingCarrier || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (token && carrierCode) {
          const track = await callShippo(`tracks/${encodeURIComponent(carrierCode)}/${encodeURIComponent(trackingNum)}`, "GET", null, token);
          trackingStatus = track?.tracking_status?.status || null;
        }
      } catch (err) {
        console.warn(`Shippo webhook: could not confirm tracking ${trackingNum}:`, err.message);
      }
      if (!trackingStatus) {
        res.status(200).json({ success: true, message: "Tracking status could not be confirmed with Shippo" });
        return;
      }

      const prevFulfillmentStatus = order.fulfillmentStatus;
      let nextFulfillmentStatus = null;
      let orderStatus = order.status;

      if (trackingStatus === "DELIVERED") {
        nextFulfillmentStatus = "delivered";
        orderStatus = "completed";
      } else if (trackingStatus === "OUT_FOR_DELIVERY") {
        nextFulfillmentStatus = "out_for_delivery";
      }

      // Forward only: "delivered" stays delivered, and nothing moves back to "out for delivery".
      // The check runs again inside the write so two quick updates cannot undo each other.
      let advanced = false;
      if (nextFulfillmentStatus && advancesTracking(prevFulfillmentStatus, nextFulfillmentStatus)) {
        advanced = await db.runTransaction(async tx => {
          const fresh = (await tx.get(orderDoc.ref)).data() || {};
          if (!advancesTracking(fresh.fulfillmentStatus, nextFulfillmentStatus)) return false;
          const newNote = {
            type: "event",
            message: `Shippo tracking update: ${trackingStatus.replace(/_/g, " ")}.`,
            createdAt: new Date().toISOString()
          };
          tx.update(orderDoc.ref, {
            fulfillmentStatus: nextFulfillmentStatus,
            status: orderStatus,
            activity: [...(fresh.activity || []), newNote],
            updatedAt: new Date().toISOString()
          });
          return true;
        });
      }
      // No customer email here: a shipped parcel's only email is the shipping one (see onOrderUpdated 2b).
      if (advanced) console.log(`Shippo tracking moved order ${orderId} to ${nextFulfillmentStatus}`);

      res.status(200).json({ success: true });
    } catch (err) {
      console.error("shippoWebhook error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ──────────────────────────────────────────────────────────────
// 12b. Back-in-stock alerts: email shoppers who signed up on a sold-out product
// ──────────────────────────────────────────────────────────────
function stockOf(item, fallback) {
  if (!item) return fallback;
  if (item.stockLevel !== undefined) return Number(item.stockLevel);
  if (item.stock !== undefined) return Number(item.stock);
  return fallback;
}

// Back-in-stock emails are sent a few at a time inside a time budget. Alerts a run could not reach keep
// `restockPending: true`, and backInStockSweep (every 15 minutes) finishes them, so a big list is never
// lost when the trigger runs out of time (the trigger only fires on the 0 -> available change).
const RESTOCK_BATCH = 5;
const RESTOCK_BUDGET_MS = 240 * 1000;

async function sendRestockAlerts({ bookId, book, docs, deadline, released = false }) {
  // released = the book just stopped being "Coming soon": signups made on that page get "Out now" wording.
  // (backInStockSweep can't see the switch any more; it reads the releasePending stamp set below.)
  const stuckBefore = Date.now() - 15 * 60 * 1000;
  const link = siteLink(`/books/${encodeURIComponent(book.slug || bookId)}`);
  const restockSettings = await loadNotificationSettings();
  const esc = t => String(t || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const keyOf = alert => `${String(alert.email || "").trim().toLowerCase()}|${String(alert.variantId || "")}`;
  // One email per address per book edition, however many signups exist for it: the first signup sends,
  // the repeats are closed once that send is done.
  const leaders = [];
  const repeats = [];
  const seen = new Set();
  for (const doc of docs) {
    const key = keyOf(doc.data());
    if (seen.has(key)) repeats.push(doc); else { seen.add(key); leaders.push(doc); }
  }
  const emailedThisRun = new Set();

  const sendOne = async doc => {
    const alert = doc.data();
    // Claim first so a duplicate trigger never double-sends.
    const claimed = await db.runTransaction(async tx => {
      const cur = await tx.get(doc.ref);
      if (!cur.exists) return false;
      const c = cur.data();
      const stuck = c.status === "sending" && Date.parse(c.sendingAt || 0) < stuckBefore;
      if (c.status !== "waiting" && !stuck) return false;
      tx.update(doc.ref, { status: "sending", sendingAt: new Date().toISOString() });
      return true;
    });
    if (!claimed) return;
    // Anyone can sign up (new guests included), so no proof is required, but every send takes
    // from the shop-wide budget. Over it, the signup keeps waiting for the next restock.
    if (!(await claimEmailSend(db, "backInStock", "", { failOpen: false }))) {
      await doc.ref.update({ status: "waiting" }).catch(() => {});
      return;
    }
    try {
      const title = esc(book.title || alert.bookTitle);
      const variant = alert.variantName ? ` (${esc(alert.variantName)})` : "";
      const isRelease = released || alert.releasePending === true;
      await sendEmail({
        // Both senders down: the retry queue delivers it later (this trigger won't run again).
        queue: "backInStock",
        to: alert.email,
        subject: isRelease ? `Out now: ${book.title || alert.bookTitle}` : `Back in stock: ${book.title || alert.bookTitle}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="margin-top:0;">${isRelease ? "It's here!" : "It's back!"}</h2>
            <p style="font-size:15px;line-height:1.6;"><strong>${title}</strong>${variant} ${isRelease ? "is out now and ready to order." : "is available again. Stock is limited, so grab your copy while you can."}</p>
            ${risoButton(link, "Shop now", restockSettings.brand?.brandColor, restockSettings.brand?.emailTheme)}
            <p style="font-size:12px;color:#888;">You received this because you asked to be notified. This is a one-time message.</p>
          </div>`,
        secret: RESEND_API_KEY.value(),
      });
      emailedThisRun.add(keyOf(alert));
    } catch (err) {
      console.error("Back-in-stock email failed:", err.message);
      // Queued for a retry: it counts as sent here, so it is never also sent again by a later restock.
      if (!err?.queued) {
        // Back to waiting, still pending: the next sweep tries again.
        await doc.ref.update({ status: "waiting" }).catch(() => {});
        return;
      }
      emailedThisRun.add(keyOf(alert));
    }
    // Sent: remove the signup (its id is per address + edition) so the shopper can ask again
    // next time; if that fails, mark it notified — never back to waiting, which would resend.
    await doc.ref.delete().catch(() => doc.ref.update({ status: "notified", notifiedAt: new Date().toISOString(), restockPending: false }).catch(() => {}));
  };

  const result = await runInBatches(leaders, RESTOCK_BATCH, sendOne, { deadline });
  for (const doc of repeats) {
    if (emailedThisRun.has(keyOf(doc.data()))) await doc.ref.update({ status: "notified", notifiedAt: new Date().toISOString(), restockPending: false }).catch(() => {});
  }
  if (result.skipped.length || result.failed) console.warn(`Back-in-stock for ${bookId}: ${result.skipped.length} left for the sweep, ${result.failed} failed`);
  return result;
}

exports.onBookRestocked = onDocumentUpdated(
  { document: "books/{bookId}", secrets: [RESEND_API_KEY], timeoutSeconds: 300 },
  async event => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const bookId = event.params.bookId;
    // Only books shoppers can actually buy: no "it's back" for drafts, archived or not-yet-released books.
    if (after.isTest === true) return;
    // (A future release date doesn't skip: the alert would otherwise wait for a second restock.)
    if (after.status && after.status !== "published") return;
    // Still "Coming soon": nothing can be bought yet, so no email (stock may be filled in ahead of release).
    if (after.comingSoon === true) return;

    // Which variant ids (and the base product, "") just went from 0 to available?
    const restocked = new Set();
    const afterVariants = Array.isArray(after.variants) ? after.variants : [];
    // Coming soon switched off = the book is out: everyone who asked on its page hears, for every edition
    // in stock. Signups there are for the book as a whole (""), so "" counts when any edition can be bought.
    const released = before.comingSoon === true;
    if (released) {
      const anyEdition = afterVariants.some(v => stockOf(v, 999) > 0);
      if (stockOf(after, 999) > 0 || anyEdition) restocked.add("");
      for (const v of afterVariants) if (stockOf(v, 999) > 0) restocked.add(String(v.id));
    }
    if (stockOf(before, 999) <= 0 && stockOf(after, 999) > 0) restocked.add("");
    const beforeVariants = Array.isArray(before.variants) ? before.variants : [];
    for (const v of afterVariants) {
      const prev = beforeVariants.find(x => x.id === v.id);
      if (prev && stockOf(prev, 999) <= 0 && stockOf(v, 999) > 0) restocked.add(String(v.id));
    }
    // A base restock also covers signups made before variants existed.
    if (restocked.size === 0) return;

    // Waiting alerts, plus any stuck in "sending" (a run that crashed mid-send) for over 15 minutes.
    const snap = await db
      .collection("stockAlerts")
      .where("bookId", "==", bookId)
      .where("status", "in", ["waiting", "sending"])
      .limit(500)
      .get();
    if (snap.empty) return;
    const docs = snap.docs.filter(doc => restocked.has(String(doc.data().variantId || "")));
    if (!docs.length) return;
    // Mark them pending first: whatever this run cannot reach is finished by backInStockSweep.
    await Promise.all(docs.map(doc => doc.ref.update({ restockPending: true, ...(released ? { releasePending: true } : {}) }).catch(() => {})));
    await sendRestockAlerts({ bookId, book: after, docs, deadline: Date.now() + RESTOCK_BUDGET_MS, released });
  },
);

/**
 * Finishes back-in-stock emails a restock run could not reach in time (every 15 minutes). A pending
 * alert is only sent while its book is still published and in stock; otherwise it simply waits for the next restock.
 */
// Website sales → inventory app (docs/INVENTORY_LINK.md): every write to a counted order (paid, refunded,
// shipped…) is sent to the inventory app's inbox. Only reads the order; inventoryLinkSweep retries failures.
let inventoryLinkStateCache = { at: 0, state: null };
exports.onOrderInventoryPush = onDocumentWritten({ document: "orders/{orderId}", timeoutSeconds: 60 }, async event => {
  if (!event.data?.after?.exists) return;
  const jobs = require("./inventoryLinkJobs");
  if (!inventoryLinkStateCache.state || Date.now() - inventoryLinkStateCache.at > 60 * 1000) {
    inventoryLinkStateCache = { at: Date.now(), state: await jobs.readState(db) };
  }
  const state = inventoryLinkStateCache.state;
  if (!jobs.salesOn(state)) return;
  const result = await jobs.pushOrder(inventoryLinkDeps(), event.params.orderId, state);
  if (result.status === "failed") console.warn(`inventory link: order ${event.params.orderId} not delivered yet (${result.error}); the sweep retries it.`);
});

// The link's regular check: labels bought in the inventory app, missed or failed pushes, past orders,
// and (every 15 minutes, once the owner switched it on) linked books' stock.
exports.inventoryLinkSweep = onSchedule({ schedule: "every 5 minutes", timeoutSeconds: 300 }, async () => {
  const out = await require("./inventoryLinkJobs").runSweep(inventoryLinkDeps(), { stock: "auto" });
  if (out.error) console.error("inventoryLinkSweep:", out.error);
});

exports.backInStockSweep = onSchedule(
  { schedule: "every 15 minutes", timeoutSeconds: 300, secrets: [RESEND_API_KEY] },
  async () => {
    const deadline = Date.now() + RESTOCK_BUDGET_MS;
    const snap = await db.collection("stockAlerts").where("restockPending", "==", true).limit(300).get();
    if (snap.empty) return;
    const byBook = new Map();
    for (const doc of snap.docs) {
      const bookId = String(doc.data().bookId || "");
      if (!byBook.has(bookId)) byBook.set(bookId, []);
      byBook.get(bookId).push(doc);
    }
    const clear = doc => doc.ref.update({ restockPending: false, releasePending: false }).catch(() => {});
    for (const [bookId, alerts] of byBook) {
      if (Date.now() >= deadline) break;
      const bookSnap = bookId && !bookId.includes("/") ? await db.collection("books").doc(bookId).get().catch(() => null) : null;
      const book = bookSnap?.exists ? bookSnap.data() : null;
      // Back to "Coming soon" before the sweep ran: wait for its next release.
      if (!book || book.isTest === true || (book.status && book.status !== "published") || book.comingSoon === true) { await Promise.all(alerts.map(clear)); continue; }
      const available = new Set();
      if (stockOf(book, 1) > 0) available.add("");
      // A release signup is for the whole book: any edition in stock will do.
      if (alerts.some(doc => doc.data().releasePending === true) && (Array.isArray(book.variants) ? book.variants : []).some(v => stockOf(v, 1) > 0)) available.add("");
      for (const v of Array.isArray(book.variants) ? book.variants : []) if (stockOf(v, 1) > 0) available.add(String(v.id));
      const due = alerts.filter(doc => available.has(String(doc.data().variantId || "")));
      await Promise.all(alerts.filter(doc => !due.includes(doc)).map(clear));
      if (due.length) await sendRestockAlerts({ bookId, book, docs: due, deadline }).catch(err => console.error("backInStockSweep:", err.message));
    }
  },
);

// ──────────────────────────────────────────────────────────────
// 12. Low Stock Alerts: Email admin when product or variant stock drops below 3 or hits 0
// ──────────────────────────────────────────────────────────────
exports.onBookUpdated = onDocumentUpdated(
  { document: "books/{bookId}", secrets: [RESEND_API_KEY] },
  async event => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    if (after.isTest === true) return;
    if (!after.trackInventory) return;

    // A missing stock field means "not counted" on both sides, so it never reads as a sale to 0.
    const stockBefore = stockOf(before.stockLevel !== undefined ? before : null, 999);
    const stockAfter = stockOf(after.stockLevel !== undefined ? after : null, 999);

    let shouldAlert = false;
    let alertLines = [];

    // Check parent product stock
    const parentBecameLowStock = (stockBefore > 3 && stockAfter <= 3 && stockAfter > 0);
    const parentBecameSoldOut = (stockBefore > 0 && stockAfter <= 0);

    if (parentBecameLowStock) {
      shouldAlert = true;
      alertLines.push(`Product "<strong>${escapeHtml(after.title)}</strong>" is running low on stock (${stockAfter} remaining).`);
    } else if (parentBecameSoldOut) {
      shouldAlert = true;
      alertLines.push(`Product "<strong>${escapeHtml(after.title)}</strong>" is now sold out!`);
    }

    // Check individual variants
    if (after.variants && Array.isArray(after.variants)) {
      const beforeVariants = before.variants || [];
      after.variants.forEach(vAfter => {
        const vBefore = beforeVariants.find(v => v.id === vAfter.id);
        // A newly added edition was never in stock: adding one with 0-3 copies is not a sale.
        if (!vBefore) return;
        const vStockBefore = stockOf(vBefore, 999);
        const vStockAfter = stockOf(vAfter, 999);

        const vBecameLowStock = (vStockBefore > 3 && vStockAfter <= 3 && vStockAfter > 0);
        const vBecameSoldOut = (vStockBefore > 0 && vStockAfter <= 0);

        if (vBecameLowStock) {
          shouldAlert = true;
          alertLines.push(`Variant "<strong>${escapeHtml(vAfter.name)}</strong>" of product "${escapeHtml(after.title)}" is running low on stock (${vStockAfter} remaining).`);
        } else if (vBecameSoldOut) {
          shouldAlert = true;
          alertLines.push(`Variant "<strong>${escapeHtml(vAfter.name)}</strong>" of product "${escapeHtml(after.title)}" is now sold out!`);
        }
      });
    }

    if (shouldAlert && alertLines.length > 0) {
      const alertHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #f3f4f6;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="margin-top:0;color:#dc2626;font-size:18px;">&#9888; Inventory Alert</h2>
          <p style="font-size:14px;color:#374151;line-height:1.6;">${alertLines.join("<br><br>")}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
          <p style="font-size:12px;color:#9ca3af;margin-bottom:0;">
            This email was sent automatically because inventory tracking is enabled for this item.
            You can update your catalog settings in the storefront dashboard.
          </p>
        </div>
      `;

      try {
        await sendEmail({
          queue: "inventoryAlert",
          to: ADMIN_TO,
          subject: `[INVENTORY ALERT] ${after.title}`,
          html: alertHtml,
          secret: RESEND_API_KEY.value(),
        });
        console.log(`Inventory alert email sent to admin for book ${after.title}`);
      } catch (err) {
        console.error("Failed to send inventory low stock email alert:", err);
      }
    }
  }
);

// (The second, weaker `refundOrder` definition that previously lived here was
// removed: it shadowed the robust idempotent implementation above — see the
// `exports.refundOrder` near the top of this file. The version above carries a
// Stripe idempotency key, partial-refund recording, restock-once guards, and
// manual-payment handling.)

// ──────────────────────────────────────────────────────────────
// 14. HTTP Endpoint: Mark Manual Order as Paid (Admin Secure)
//     Decrements stock, records analytics, flips status to paid.
//     onOrderUpdated fires the customer order-confirmation email automatically.
// ──────────────────────────────────────────────────────────────
// Marks an order paid when no card or PayPal payment is involved (manual payment confirmed
// by the admin, or a $0 order): stock out once, discount use counted once, revenue recorded.
async function completeOrderWithoutCard(orderId, message, { reserve = true, req = null } = {}) {
  const orderRef = db.collection("orders").doc(orderId);
  let paidTotal = null;
  const initial = await orderRef.get();
  // A free order checks the 30-minute stock hold like any checkout. A manual payment the owner
  // confirms days later is money already received: it is recorded even if the books have
  // since sold (the stock write below flags oversold for the owner).
  if (reserve && initial.exists && initial.data().paymentStatus !== "paid") {
    const pending = initial.data();
    await reserveCheckout(orderId, pending.items || [], pending, pending.giftCardRedemptions, (await shopTestMode()), req);
  }

  await db.runTransaction(async transaction => {
    paidTotal = null; // a retried attempt must not keep the last attempt's value
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists) return;
    const order = orderDoc.data();
    if (order.paymentStatus === "paid") return; // idempotent

    const itemList = order.items || [];
    const books = await readBooks(transaction, db, itemList);
    // Manual payments count toward a discount code's usage limit like card payments do.
    const discountRef = order.appliedDiscount?.id && order.discountUsageCountedAt == null
      ? db.collection("discounts").doc(order.appliedDiscount.id) : null;
    const discountDoc = discountRef ? await transaction.get(discountRef) : null;
    const giftCards = await readGiftCards(transaction, db, chargedRedemptions(order));
    if (!settleGiftCards(transaction, orderRef, orderId, order, giftCards, "Checkout", new Date().toISOString())) return;

    const downloadToken = crypto.randomBytes(32).toString("hex");

    transaction.update(orderRef, {
      paymentStatus: "paid",
      fulfillmentStatus: "paid",
      status: "open",
      downloadToken,
      paidAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [
        ...(order.activity || []),
        { type: "event", message, createdAt: new Date().toISOString() }
      ]
    });

    // Stock comes out here once; recording it stops onOrderUpdated taking it out again.
    const now = new Date().toISOString();
    const oversold = order.inventoryDecrementedAt == null && writeStock(transaction, db, itemList, books, -1, now);
    transaction.update(orderRef, { inventoryDecrementedAt: order.inventoryDecrementedAt || now, ...(oversold ? { oversold: true } : {}) });
    if (discountRef && discountDoc?.exists) {
      transaction.update(discountRef, { usageCount: (Number(discountDoc.data().usageCount) || 0) + 1, updatedAt: now });
      transaction.update(orderRef, { discountUsageCountedAt: now, ...(discountUsedUp(discountDoc.data()) ? { discountOverLimit: true } : {}) });
    }

    paidTotal = Number(order.total) || 0;
  });
  await releaseStockForOrder(db, orderId);

  if (paidTotal !== null) {
    const today = new Date().toISOString().split("T")[0];
    await db.collection("analytics").doc(today).set({
      date: today,
      orders: admin.firestore.FieldValue.increment(1),
      revenue: admin.firestore.FieldValue.increment(paidTotal),
    }, { merge: true });
  }
  // false when nothing was marked paid (a gift card could no longer cover its part).
  return paidTotal !== null || (await orderRef.get()).data()?.paymentStatus === "paid";
}

exports.markOrderPaid = onBrowserRequest(
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { orderId } = req.body;
    if (!orderId) { res.status(400).json({ error: "Missing orderId" }); return; }

    try {
      const snap = await db.collection("orders").doc(orderId).get();
      const refusal = manualPaidRefusal(snap.exists ? snap.data() : null);
      if (refusal === "missing") { res.status(404).json({ error: "Order not found" }); return; }
      if (refusal === "closed") { res.status(409).json({ error: "This order is cancelled or refunded, so it can't be marked paid." }); return; }
      if (refusal === "provider") { res.status(409).json({ error: "Card and PayPal orders are marked paid only when the payment provider confirms the payment. Use Check payment with Stripe, or check PayPal." }); return; }
      await completeOrderWithoutCard(orderId, `Payment confirmed manually by ${adminUser.email}.`, { reserve: false });
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("markOrderPaid failed:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * Safety net for the Stripe webhook (every 15 minutes): if Stripe says an order's
 * payment succeeded but the order is still unpaid, record reconciliation pending
 * without settling it, and email the shop so the
 * webhook setup gets fixed. Each order is looked up in the Stripe account (test or
 * live) it was created in, then the other one.
 */
const SWEEP_LOOKUP_BATCH = 5;           // Stripe lookups in flight at once
const SWEEP_LOOKUP_MS = 100 * 1000;     // stop starting payment lookups after this
const SWEEP_REVERSAL_MS = 190 * 1000;   // stop starting refund/dispute checks after this (function limit: 300 s)
// Follows label refunds asked for from Orders (mode "voidLabel"): Shippo takes up to ~14 business days and
// may reject one (the carrier scanned the label). Each pending row is re-read at most hourly; the result is
// saved on order-operations.labelRefunds and a rejection shows in the admin alerts (labelVoid.js).
async function checkLabelRefunds(now = Date.now()) {
  const token = await getShippoToken();
  if (!token) return { checked: 0 };
  const snap = await db.collection("order-operations").where("labelRefundOpen", "==", true).limit(40).get();
  let checked = 0, settled = 0;
  for (const doc of snap.docs) {
    const due = openRefunds(doc.data().labelRefunds).filter(e => now - (Date.parse(e.checkedAt || "") || 0) >= 60 * 60 * 1000);
    if (!due.length) continue;
    const results = {};
    for (const entry of due) {
      try {
        const found = entry.refundId
          ? await callShippo(`refunds/${encodeURIComponent(entry.refundId)}/`, "GET", null, token)
          : await callShippo(`transactions/${encodeURIComponent(entry.transactionId)}/`, "GET", null, token);
        const status = entry.refundId ? found?.status : (transactionRefundState(found) ? found?.status : "PENDING");
        if (status) results[entry.refundId || entry.transactionId] = status;
        checked++;
      } catch (err) { console.warn(`label refund check ${doc.id}:`, err.message); }
    }
    if (!Object.keys(results).length) continue;
    const at = new Date(now).toISOString();
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(doc.ref)).data() || {};
      const outcome = applyRefundChecks(fresh.labelRefunds, results, at);
      const done = outcome.entries.filter((e, i) => e?.state !== "pending" && fresh.labelRefunds?.[i]?.state === "pending");
      settled += done.length;
      tx.set(doc.ref, { labelRefunds: outcome.entries, labelRefundOpen: outcome.open, updatedAt: at,
        ...(done.length ? { activity: admin.firestore.FieldValue.arrayUnion(...done.map(e => ({ type: "event", createdAt: at,
          message: e.state === "refunded" ? `Shippo refunded label #${e.trackingNumber || ""}.` : `Shippo rejected the refund for label #${e.trackingNumber || ""} (the carrier scanned or used it).` }))) } : {}) }, { merge: true });
    });
  }
  return { checked, settled };
}

exports.unpaidPaymentSweep = onSchedule(
  { schedule: "every 15 minutes", timeoutSeconds: 300, secrets: [STRIPE_SECRET_KEY, RESEND_API_KEY, SHIPPO_API_TOKEN] },
  async () => {
    // Studio 3.5: scheduled theme publishes and campaigns ride on this sweep (own try/catch: never blocks payments).
    try { await require("./themeSchedule").runThemeSchedule(db); }
    catch (err) { console.error("unpaidPaymentSweep: theme schedule failed:", err.message); }
    const { suspectOrders, alertHtml } = require("./paymentSweep");
    // Newest unpaid orders first, within the 7-day window the sweep checks. Without an order
    // the 300 returned were an arbitrary slice, so new orders could be skipped for good.
    // Falls back to the old query while the composite index is still building.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection("orders").where("paymentStatus", "==", "unpaid").where("createdAt", ">=", since)
      .orderBy("createdAt", "desc").limit(300).get()
      .catch(err => { console.error("unpaidPaymentSweep: ordered query failed (deploy firestore:indexes), using unordered:", err.message); return db.collection("orders").where("paymentStatus", "==", "unpaid").limit(300).get(); });
    const candidates = suspectOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    const found = [];
    // Time budget (the function has 300 s): lookups run a few at a time and stop starting new ones after
    // SWEEP_LOOKUP_MS, so the owner alert, reversal checks and email queue below always get their turn.
    const sweepStartedAt = Date.now();
    await runInBatches(candidates, SWEEP_LOOKUP_BATCH, async order => {
      try {
        const usesIntent = typeof order.stripePaymentIntentId === "string" && order.stripePaymentIntentId.startsWith("pi_");
        const result = await retrieveOrderPayment(order.id, order, usesIntent
          ? { paymentIntentId: order.stripePaymentIntentId }
          : { sessionId: order.stripeCheckoutSessionId });
        if (result?.session && result.session.payment_status === "paid") {
          const session = result.session;
          await recordStripeReconciliation(order.id, session)
            .catch(err => { console.error(`unpaidPaymentSweep: could not flag order ${order.id}:`, err); return false; });
          found.push({ orderId: order.id, email: order.customer?.email, amount: session.amount_total, currency: session.currency, intentId: session.id, fixed: false });
          return;
        }
        const intent = result?.intent;
        if (intent && intent.status === "succeeded") {
          await recordStripeReconciliation(order.id, intentAsSession(intent))
            .catch(err => { console.error(`unpaidPaymentSweep: could not flag order ${order.id}:`, err); return false; });
          found.push({ orderId: order.id, email: order.customer?.email, amount: intent.amount, currency: intent.currency, intentId: intent.id, fixed: false });
        }
      } catch (err) {
        console.warn(`unpaidPaymentSweep: could not check order ${order.id}:`, err.message);
      }
    }, { deadline: sweepStartedAt + SWEEP_LOOKUP_MS });

    // The owner alert goes out right after the lookups, before the slower reversal checks, email queue and
    // review requests: the safety net for a broken Stripe webhook must not depend on those finishing.
    // Stamp only after the alert really went out: a failed send leaves the orders unstamped so the next
    // sweep (15 minutes later) tries the alert again.
    if (found.length) {
      try {
        await sendEmail({
          to: ADMIN_TO,
          subject: `⚠ Stripe webhook missed ${found.length} paid order${found.length === 1 ? "" : "s"}`,
          html: alertHtml(found),
          secret: RESEND_API_KEY.value(),
        });
        const at = new Date().toISOString();
        await Promise.all(found.map((f) => db.collection("orders").doc(f.orderId).update({ paymentAlertSentAt: at })
          .catch(err => console.error(`unpaidPaymentSweep: could not stamp ${f.orderId}:`, err.message))));
      } catch (err) {
        console.error("unpaidPaymentSweep: alert email failed; will retry on the next sweep:", err.message);
      }
    }

    // Safety net for refunds/disputes made in Stripe whose webhook never arrived.
    try {
      const { ordersDueReversalCheck } = require("./stripeRecovery");
      const paidSince = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      const paidStatuses = ["paid", "refund_pending", "refunded"];
      // Recent payments by paidAt, plus recent orders by createdAt (older records may lack paidAt).
      const parts = await Promise.all([
        db.collection("orders").where("paymentStatus", "in", paidStatuses).where("paidAt", ">=", paidSince).orderBy("paidAt", "desc").limit(500).get(),
        db.collection("orders").where("paymentStatus", "in", paidStatuses).where("createdAt", ">=", paidSince).orderBy("createdAt", "desc").limit(500).get(),
      ]).catch(async err => {
        console.error("unpaidPaymentSweep: ordered reversal query failed (deploy firestore:indexes); using an unordered slice:", err.message);
        return [await db.collection("orders").where("paymentStatus", "in", paidStatuses).limit(500).get()];
      });
      const paidById = new Map();
      for (const part of parts) for (const d of part.docs) paidById.set(d.id, { id: d.id, ...d.data() });
      await runInBatches(ordersDueReversalCheck([...paidById.values()]), SWEEP_LOOKUP_BATCH,
        order => checkStripeReversal(order.id, order, "automatic check").catch(err => console.warn(`reversal check ${order.id}:`, err.message)),
        { deadline: sweepStartedAt + SWEEP_REVERSAL_MS });
    } catch (err) {
      console.warn("unpaidPaymentSweep: reversal checks failed:", err.message);
    }

    // Shippo label refunds asked for from Orders (own try/catch: never blocks payments).
    try {
      const labels = await checkLabelRefunds();
      if (labels.settled) console.log("unpaidPaymentSweep: label refunds", labels);
    } catch (err) { console.warn("unpaidPaymentSweep: label refund checks failed:", err.message); }

    // Emails that every sender refused are retried here on a widening schedule, after the payment
    // checks and within a time budget so a backlog can't starve them (own try/catch).
    try {
      const outbox = await runEmailOutbox();
      if (outbox.tried || outbox.prunedLog || outbox.prunedOutbox) console.log("unpaidPaymentSweep: email queue", outbox);
    } catch (err) { console.error("unpaidPaymentSweep: email retry queue failed:", err.message); }

    // "How was your book?" emails N days after shipping, when switched on (own try/catch).
    try {
      const notificationSettings = await loadNotificationSettings();
      if (notificationSettings.review_request?.enabled === true) {
        const unsubscribeKey = await marketingUnsubscribeKey();
        const result = await runReviewRequests({
          db, notificationSettings, compileEmailTemplate, siteLink, escapeHtml, optOutId,
          unsubscribeUrl: email => siteLink(`/track?unsubscribe=1&e=${encodeURIComponent(normMarketingEmail(email))}&t=${unsubscribeToken(email, unsubscribeKey)}`),
          sendEmail: message => sendEmail({ ...message, secret: RESEND_API_KEY.value() }),
        });
        if (result.sent) console.log("unpaidPaymentSweep: review requests", result);
      }
    } catch (err) { console.error("unpaidPaymentSweep: review requests failed:", err.message); }
  }
);

/**
 * Nightly backup into the project's default Storage bucket, folder backups/YYYY-MM-DD/, done two ways:
 *  1. the managed Firestore export (restorable with `gcloud firestore import`). It needs the Functions
 *     service account to hold "Cloud Datastore Import Export Admin"; without it Google answers PERMISSION_DENIED.
 *  2. the Functions' own copy of every document (backupJson.js, backups/<day>/json/), which needs no extra
 *     role, so a refused export still leaves a complete, restorable backup (scripts/restore-json-backup.mjs).
 * The run succeeds when either works. The previous export's long-running operation is checked at the start
 * of each run, so an export that was accepted but failed later is reported too. Settings › General ›
 * Backups & export reads the result (systemStatus/backup) and has Back up now (action "backupNow").
 */
const BACKUP_KEEP_DAYS = 30;
const BACKUP_LOCK_MS = 10 * 60 * 1000;
const BACKUP_MANUAL_GAP_MS = 5 * 60 * 1000;

async function runFirestoreBackup({ trigger, budgetMs }) {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
  const day = new Date(startedAt).toISOString().slice(0, 10);
  const bucketName = admin.app().options.storageBucket || `${projectId}.firebasestorage.app`;
  const statusRef = db.collection("systemStatus").doc("backup");
  const at = new Date(startedAt).toISOString();

  // One backup at a time: a run holds `runningSince` for up to BACKUP_LOCK_MS.
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(statusRef);
    const prev = snap.exists ? snap.data() : null;
    const running = prev?.runningSince && startedAt - Date.parse(prev.runningSince) < BACKUP_LOCK_MS;
    if (running) return { busy: true, previous: prev };
    if (trigger === "manual" && prev?.lastAttemptAt && startedAt - Date.parse(prev.lastAttemptAt) < BACKUP_MANUAL_GAP_MS) return { tooSoon: true, previous: prev };
    tx.set(statusRef, { runningSince: at, runningTrigger: trigger }, { merge: true });
    return { previous: prev };
  });
  if (claim.busy || claim.tooSoon) return claim;
  const previous = claim.previous;

  const { serviceAccountEmail } = require("./inventoryLinkStore");
  const { runJsonBackup, exportRefusedForPermission } = require("./backupJson");
  const { backupOutcome } = require("./shopSettings");
  const extra = { trigger, serviceAccount: await serviceAccountEmail().catch(() => ""), bucket: bucketName };
  try {
    const client = new admin.firestore.v1.FirestoreAdminClient();

    // Did the previous export actually finish? (It runs after the function returns.)
    if (previous?.export?.operation) {
      try {
        const op = await client.checkExportDocumentsProgress(previous.export.operation);
        extra.previousExport = { operation: previous.export.operation, done: !!op.done, error: op.error ? String(op.error.message || op.error).slice(0, 300) : "" };
      } catch (err) {
        extra.previousExport = { operation: previous.export.operation, done: false, error: `Couldn't check: ${String(err.message || err).slice(0, 200)}` };
      }
    }

    let exportResult;
    try {
      const [operation] = await client.exportDocuments({
        name: client.databasePath(projectId, "(default)"),
        outputUriPrefix: `gs://${bucketName}/backups/${day}/export`,
        collectionIds: [],
      });
      console.log(`Firestore export started: ${operation.name}`);
      exportResult = { ok: true, operation: String(operation.name || "").slice(0, 300), error: "", permission: false };
    } catch (err) {
      const permission = exportRefusedForPermission(err);
      console.warn(`Firestore export refused (${permission ? "missing IAM role" : "error"}):`, err.message);
      exportResult = { ok: false, operation: "", error: String(err.message || err).slice(0, 300), permission };
    }
    extra.export = exportResult;

    let copyResult;
    try {
      const manifest = await runJsonBackup({
        db, bucket: admin.storage().bucket(bucketName), folder: `backups/${day}/json`,
        idField: admin.firestore.FieldPath.documentId(), deadline, at,
      });
      const failed = manifest.collections.filter(c => !c.complete);
      copyResult = {
        ok: manifest.complete, folder: manifest.folder, documents: manifest.documents, bytes: manifest.bytes,
        collections: manifest.collections.length, failed: failed.map(c => c.id).slice(0, 20),
        error: failed.length ? `${failed.length} collection(s) not copied: ${failed.slice(0, 3).map(c => `${c.id} (${c.error})`).join(", ")}` : "",
      };
    } catch (err) {
      console.error("Document copy backup failed:", err);
      copyResult = { ok: false, error: String(err.message || err).slice(0, 300) };
    }
    extra.copy = copyResult;

    const outcome = backupOutcome({ exportResult, copyResult });
    await statusRef.set(backupStatusRecord({ ok: outcome.ok, day, at, operation: exportResult.operation, error: outcome.error, previous, extra }))
      .catch(err => console.error("Could not record backup status:", err.message));

    // Keep 30 days: older day folders are deleted so storage cost cannot grow without limit. Only after a good
    // run, and a prune failure never fails the backup; it is recorded for Settings › General › Backups & export.
    if (outcome.ok) {
      try {
        const bucket = admin.storage().bucket(bucketName);
        const [, , api] = await bucket.getFiles({ prefix: "backups/", delimiter: "/", autoPaginate: false });
        const stale = backupFoldersToPrune(api?.prefixes || [], new Date(), BACKUP_KEEP_DAYS);
        for (const prefix of stale) await bucket.deleteFiles({ prefix, force: true });
        await statusRef.set({ prunedAt: new Date().toISOString(), prunedFolders: stale.length, pruneError: "" }, { merge: true });
      } catch (pruneErr) {
        console.error("Backup pruning failed:", pruneErr.message);
        await statusRef.set({ pruneError: String(pruneErr.message || pruneErr).slice(0, 300), prunedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      }
    }
    return { ok: outcome.ok, error: outcome.error, export: exportResult, copy: copyResult };
  } catch (err) {
    await statusRef.set(backupStatusRecord({ ok: false, day, at, error: err.message, previous, extra })).catch(e => console.error("Could not record backup status:", e.message));
    throw err;
  }
}

exports.nightlyFirestoreBackup = onSchedule(
  { schedule: "every day 03:17", timeZone: "America/Toronto", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const result = await runFirestoreBackup({ trigger: "nightly", budgetMs: 480 * 1000 });
    if (result.busy) { console.warn("nightlyFirestoreBackup: another backup is running; skipped."); return; }
    if (!result.ok) throw new Error(`Backup failed: ${result.error}`);
  }
);

/** Settings › General › Backups & export › the daily list (op "list") and Download (op "download", body.day). */
async function handleBackups(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  try {
    const { listBackups, backupDownloadUrl } = require("./backupAdmin");
    const projectId = process.env.GCLOUD_PROJECT || admin.app().options.projectId;
    const bucket = admin.storage().bucket(admin.app().options.storageBucket || `${projectId}.firebasestorage.app`);
    if (req.body?.op === "download") {
      const { status, body } = await backupDownloadUrl({ bucket, day: req.body.day });
      return res.status(status).json(body);
    }
    res.status(200).json({ backups: await listBackups({ bucket }) });
  } catch (err) {
    console.error("backups admin failed:", err);
    res.status(500).json({ error: "Couldn't read the backups. Try again in a minute." });
  }
}

// Admin AI writing assistant (Books › edit, Studio › Pages): Google Gemini with the key in adminSecrets/ai.
async function handleAiWriteRequest(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  try {
    const { status, body } = await handleAiWrite(req.body || {}, {
      readSettings: async () => {
        const saved = await readAdminSecret("ai");
        return { apiKey: saved.geminiKey, voice: saved.voice };
      },
      allow: () => hitLimit(db, "ai-write", req, LIMITS.aiWrite),
    });
    res.status(status).json(body);
  } catch (err) {
    console.error("aiWrite failed:", err?.message || err);
    res.status(500).json({ error: "The AI assistant couldn't answer just now. Try again in a minute." });
  }
}

/** Settings › General › Backups & export › Back up now (admin). Fits inside this endpoint's 60 s limit. */
// Order detail › Put the books back in stock: a refund that left its books out (Restock items unticked).
async function handleRestockRefunded(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  const orderId = req.body?.orderId;
  if (typeof orderId !== "string" || !orderId || orderId.includes("/")) return res.status(400).json({ error: "Missing orderId" });
  try {
    const result = await restockRefundedOrder(db, orderId, { actor: adminUser.email || adminUser.uid });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("restockRefunded failed:", err);
    res.status(500).json({ error: "The books couldn't be put back just now. Try again in a minute." });
  }
}

async function handleBackupNow(req, res) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;
  try {
    const result = await runFirestoreBackup({ trigger: "manual", budgetMs: 45 * 1000 });
    if (result.busy) return res.status(409).json({ error: "A backup is already running. Check back in a few minutes." });
    if (result.tooSoon) return res.status(429).json({ error: "A backup ran in the last 5 minutes. Try again shortly." });
    res.status(200).json({ ok: result.ok, error: result.error, copy: result.copy, export: result.export });
  } catch (err) {
    console.error("backupNow failed:", err);
    res.status(500).json({ error: "The backup didn't finish. Try again in a minute." });
  }
}

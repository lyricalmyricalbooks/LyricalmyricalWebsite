// Every Stripe call starts here (code plan item 1.11, LMB-PLATFORM docs/code-plan.md): which key a shop pays with,
// in which mode, and the Stripe client built from it. Today a shop pays with its own key (adminSecrets/stripe, legacy
// settings/website, then the STRIPE_SECRET_KEY secret). A platform shop will ask the platform payment service instead,
// and only this module will change. Moved out of index.js as is: index.js passes in its own db, Stripe wrapper, secret
// and readAdminSecret, so the vm-based handler tests' fakes still reach it (functions/CLAUDE.md › Action table).

function paymentKeys({ db, Stripe, STRIPE_SECRET_KEY, readAdminSecret }) {
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

  // The shop's Stripe mode and both secret keys, read once for a whole sweep (the sweep asks Stripe about
  // many orders; each call used to read settings/website and adminSecrets/stripe again). Same keys as
  // shopTestMode/stripeSecretFor. Throws when either read fails, so the caller falls back to per-call reads
  // instead of running a whole sweep on a fallback key.
  async function readStripeKeys() {
    const [settingsDoc, secretDoc] = await Promise.all([
      db.collection("settings").doc("website").get(),
      db.collection("adminSecrets").doc("stripe").get(),
    ]);
    const stripe = settingsDoc.exists ? settingsDoc.data()?.payments?.stripe || {} : {};
    const priv = secretDoc.exists ? secretDoc.data() || {} : {};
    let live = priv.secretKey || stripe.secretKey || "";
    if (!live) { try { live = STRIPE_SECRET_KEY.value() || ""; } catch { live = ""; } }
    return {
      testMode: !!(settingsDoc.exists && settingsDoc.data()?.payments?.testMode),
      secrets: { test: priv.testSecretKey || stripe.testSecretKey || "", live },
      // A slow Stripe answer must not run the sweep past its 300 s limit: give up sooner, retry next sweep.
      clientOptions: { timeout: 20 * 1000, maxNetworkRetries: 1 },
    };
  }

  return { withPrivateStripeKeys, getStripeClientForMode, stripeSecretFor, shopTestMode, readStripeKeys };
}

module.exports = { paymentKeys };

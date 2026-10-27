// The key choice every Stripe call starts from (functions/payments). Fakes only: no Stripe account is reached.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { paymentKeys } = createRequire(import.meta.url)("./index.js");

function setup({ website = {}, secrets = {}, envSecret = "sk_live_env" } = {}) {
  const doc = data => ({ exists: data !== undefined, data: () => data });
  const db = {
    collection: name => ({
      doc: id => ({ get: async () => doc(name === "settings" && id === "website" ? website : name === "adminSecrets" && id === "stripe" ? secrets : undefined) }),
    }),
  };
  const readAdminSecret = async id => (id === "stripe" ? secrets : {});
  const Stripe = function (key, options) { return { key, options }; };
  const STRIPE_SECRET_KEY = { value: () => envSecret };
  return paymentKeys({ db, Stripe, STRIPE_SECRET_KEY, readAdminSecret });
}

describe("payment keys", () => {
  it("pays live with the private key first, then the old settings copy, then the secret", async () => {
    expect((await setup({ secrets: { secretKey: "sk_live_private" }, website: { payments: { stripe: { secretKey: "sk_live_old" } } } }).getStripeClientForMode("live")).stripe.key).toBe("sk_live_private");
    expect((await setup({ website: { payments: { stripe: { secretKey: "sk_live_old" } } } }).getStripeClientForMode("live")).stripe.key).toBe("sk_live_old");
    expect((await setup().getStripeClientForMode("live")).stripe.key).toBe("sk_live_env");
  });

  it("pays in test mode only with a test key, never the live one", async () => {
    expect((await setup({ secrets: { testSecretKey: "sk_test_1" } }).getStripeClientForMode("test")).stripe.key).toBe("sk_test_1");
    await expect(setup().getStripeClientForMode("test")).rejects.toThrow("Stripe test secret key is not configured.");
  });

  it("charges a connected account only when one is named", async () => {
    const keys = setup();
    expect((await keys.getStripeClientForMode("live")).requestOptions).toEqual({});
    expect((await keys.getStripeClientForMode("live", "acct_123")).requestOptions).toEqual({ stripeAccount: "acct_123" });
  });

  it("reads the shop's mode and both keys once for a sweep", async () => {
    const keys = await setup({ website: { payments: { testMode: true } }, secrets: { testSecretKey: "sk_test_1" } }).readStripeKeys();
    expect(keys.testMode).toBe(true);
    expect(keys.secrets).toEqual({ test: "sk_test_1", live: "sk_live_env" });
    expect(keys.clientOptions).toEqual({ timeout: 20000, maxNetworkRetries: 1 });
  });

  it("answers with an empty key instead of throwing when none is set", async () => {
    const keys = setup({ envSecret: "" });
    expect(await keys.stripeSecretFor("test")).toBe("");
    expect(await keys.stripeSecretFor("live")).toBe("");
    expect(await keys.shopTestMode()).toBe(false);
  });
});

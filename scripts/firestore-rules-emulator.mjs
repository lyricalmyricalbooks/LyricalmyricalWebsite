// Behavioural check of firestore.rules against the real rules engine (Firestore emulator).
// Not part of `pnpm test` (it needs Java and the emulator). From the repo root:
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   npx firebase emulators:exec --only firestore --project demo-rules "node scripts/firestore-rules-emulator.mjs"
// It caught that an unrolled per-line order check exceeded the 1000-expression limit and
// refused every guest order, which the text checks in src/app/securityRules.test.ts can't see.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection, query, where, writeBatch, increment, serverTimestamp } from "firebase/firestore";

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const rulesPath = process.env.RULES_FILE || new URL("../firestore.rules", import.meta.url);
const env = await initializeTestEnvironment({ projectId: "demo-rules", firestore: { rules: readFileSync(rulesPath, "utf8"), host, port: Number(port) } });
let failures = 0;
async function check(name, p) { try { await p; console.log("ok  ", name); } catch (e) { failures++; console.log("FAIL", name, e.message); } }

await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, "pages/pub"), { status: "published", title: "About" });
  await setDoc(doc(db, "pages/draft"), { status: "draft", title: "Secret" });
  await setDoc(doc(db, "reviews/existing"), { status: "approved", createdAt: "x" });
});
const anon = env.unauthenticatedContext().firestore();
const today = new Date().toISOString().split("T")[0];

// pages
await check("anon reads published page", assertSucceeds(getDoc(doc(anon, "pages/pub"))));
await check("anon can't read draft page", assertFails(getDoc(doc(anon, "pages/draft"))));
await check("anon published query", assertSucceeds(getDocs(query(collection(anon, "pages"), where("status", "==", "published")))));
await check("anon unfiltered list refused", assertFails(getDocs(collection(anon, "pages"))));

// analytics
await check("visit today", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, visits: increment(1) }, { merge: true })));
await check("funnel today (update)", assertSucceeds(setDoc(doc(anon, "analytics", today), { date: today, funnel: { cart: increment(1) } }, { merge: true })));
await check("made-up day refused", assertFails(setDoc(doc(anon, "analytics", "1999-01-01"), { date: "1999-01-01", visits: increment(1) }, { merge: true })));
await check("bad id refused", assertFails(setDoc(doc(anon, "analytics", "spam-doc"), { date: "spam-doc" }, { merge: true })));
await check("mismatched date refused", assertFails(setDoc(doc(anon, "analytics", today), { date: "2020-01-01" }, { merge: true })));

// newsletter: double opt-in means browsers can't add (or read) subscribers at all
await check("anon can't add a newsletter signup", assertFails(setDoc(doc(anon, "newsletter/stranger@example.com"), { email: "stranger@example.com", subscribedAt: "x", source: "website" })));
await check("anon can't pre-confirm a signup", assertFails(setDoc(doc(anon, "newsletter/stranger@example.com"), { email: "stranger@example.com", status: "confirmed", subscribedAt: "x" })));
await check("anon can't read the newsletter list", assertFails(getDoc(doc(anon, "newsletter/stranger@example.com"))));

// reviews + contacts
{
  const createdAt = new Date().toISOString();
  const b = writeBatch(anon);
  b.set(doc(anon, "reviews/r1"), { bookId: "b", authorName: "A", rating: 5, title: "", body: "Nice", status: "pending", createdAt });
  b.set(doc(anon, "reviewContacts/r1"), { email: "a@b.co", createdAt });
  await check("review + contact batch", assertSucceeds(b.commit()));
}
await check("contact alone refused", assertFails(setDoc(doc(anon, "reviewContacts/r2"), { email: "a@b.co", createdAt: "x" })));
await check("contact on existing review refused", assertFails(setDoc(doc(anon, "reviewContacts/existing"), { email: "a@b.co", createdAt: "x" })));
{
  const createdAt = new Date().toISOString();
  const b = writeBatch(anon);
  b.set(doc(anon, "reviews/r3"), { bookId: "b", rating: 5, body: "Nice", status: "pending", createdAt });
  await check("review without email", assertSucceeds(b.commit()));
}

// customers
const user = env.authenticatedContext("u1", { email: "reader@example.com", email_verified: true }).firestore();
await check("own profile create", assertSucceeds(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "Reader" })));
await check("own profile address update", assertSucceeds(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "Reader", phone: "555", defaultAddress: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "Canada" } })));
await check("other email refused", assertFails(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "victim@example.com", name: "x" })));
await check("huge name refused", assertFails(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "x".repeat(500) })));
await check("extra key refused", assertFails(setDoc(doc(user, "customers/u1"), { uid: "u1", email: "reader@example.com", name: "x", junk: "y" })));
const noEmail = env.authenticatedContext("u2", {}).firestore();
await check("no-email account with blank email", assertSucceeds(setDoc(doc(noEmail, "customers/u2"), { uid: "u2", email: "", name: "" })));
await check("no-email account naming an email refused", assertFails(setDoc(doc(noEmail, "customers/u2"), { uid: "u2", email: "victim@example.com", name: "" })));

// orders
const key = "a".repeat(64);
const order = (over = {}) => ({
  customer: { name: "Reader", email: "reader@example.com", phone: "", address: { street: "1 Main", unit: "", city: "Toronto", state: "ON", zip: "M1M", country: "Canada" }, billingAddress: { state: "", country: "Canada" } },
  customerId: null, referralSource: "direct", addressVerified: true, addressError: "",
  items: [{ id: "b1", variantId: null, variantName: null, title: "Book", price: 10, quantity: 2, photoUrl: "", stripePriceId: null, shippingProfileId: null }],
  subtotal: 20, discount: 0, shipping: 0, shippingMethod: null, tax: 0, total: 20, status: "pending_payment", paymentStatus: "unpaid",
  paymentMethod: "Stripe", paymentInstructions: "", testMode: false, appliedDiscount: null, metadata: { userAgent: "Mozilla/5.0", platform: "web" },
  trackingKey: key, createdAt: "now", updatedAt: "now", activity: [], ...over,
});
await check("normal guest order", assertSucceeds(setDoc(doc(anon, "orders/AB-1"), { ...order(), orderId: "AB-1" })));
await check("50 good lines ok", assertSucceeds(setDoc(doc(anon, "orders/AB-4"), { ...order({ items: Array.from({ length: 50 }, () => ({ id: "b", quantity: 99 })) }), orderId: "AB-4" })));
await check("bloated metadata refused", assertFails(setDoc(doc(anon, "orders/AB-5"), { ...order({ metadata: { userAgent: "x".repeat(5000), platform: "web" } }), orderId: "AB-5" })));
await check("bloated customer refused", assertFails(setDoc(doc(anon, "orders/AB-6"), { ...order({ customer: { name: "x".repeat(1000), email: "a@b.co" } }), orderId: "AB-6" })));

// contactMessages unchanged
await check("server-only throttle closed", assertFails(getDoc(doc(anon, "contact-email-throttle/x"))));
await check("server-only hold owners closed", assertFails(getDoc(doc(anon, "stock-hold-owners/x"))));

// admin-only customer notes and marketing opt-outs
await check("anon can't read customer notes", assertFails(getDoc(doc(anon, "customerNotes/x"))));
await check("anon can't write customer notes", assertFails(setDoc(doc(anon, "customerNotes/x"), { email: "a@b.co", note: "", tags: [], updatedAt: "now" })));
await check("anon can't read opt-outs", assertFails(getDoc(doc(anon, "marketing-optout/x"))));
{
  const admin = env.authenticatedContext("admin", { email: "lyricalmyricalbooks@gmail.com", email_verified: true }).firestore();
  await check("admin writes a customer note", assertSucceeds(setDoc(doc(admin, "customerNotes/x"), { email: "a@b.co", note: "Likes poetry", tags: ["wholesale"], updatedAt: "now" })));
  await check("admin note extra key refused", assertFails(setDoc(doc(admin, "customerNotes/y"), { email: "a@b.co", note: "", tags: [], updatedAt: "now", junk: 1 })));
  await check("admin reads opt-outs", assertSucceeds(getDoc(doc(admin, "marketing-optout/x"))));
  await check("admin can't write opt-outs", assertFails(setDoc(doc(admin, "marketing-optout/x"), { at: "now" })));
}

// contactMessages: one plain sender address only (never a list the auto-reply could be sent to)
{
  const message = email => ({ name: "Ada", email, phone: "", subject: "Hi", message: "Hello", page: "/", status: "new", createdAt: serverTimestamp() });
  await check("contact form accepts one address", assertSucceeds(setDoc(doc(anon, "contactMessages/ok"), message("ada@example.com"))));
  for (const [name, email] of [["comma list", "a@x.com,b@y.com"], ["semicolon list", "a@x.com;b@y.com"], ["space list", "a@x.com b@y.com"], ["angle brackets", "Ada <a@x.com>"]]) {
    await check(`contact form refuses a ${name}`, assertFails(setDoc(doc(anon, `contactMessages/bad-${name.replace(/\W/g, "")}`), message(email))));
  }
}

await env.cleanup();
console.log(failures ? `${failures} FAILED` : "ALL OK");
process.exit(failures ? 1 : 0);

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { carryFragment } from "../../../../scripts/pagesRedirect.mjs";
import { decodeMovedState, takeMovedState, MOVED_PREFIX } from "./movedState";
import { savedOrderAccess } from "../../lib/orderAccessClient";
import { CART_KEY } from "../../CartContext";
import { WISHLIST_KEY } from "../../lib/wishlist";

const site = "https://lyricalmyrical-web-v2.web.app";
const line = { id: "b1", title: "Cream Show", price: 25, quantity: 2, photoUrl: "" };
const memory = (data: Record<string, string> = {}) => ({
  data, getItem: (k: string) => (k in data ? data[k] : null), setItem: (k: string, v: string) => { data[k] = String(v); },
});

function fakeWindow(href: string, local: Record<string, string> = {}) {
  const url = new URL(href);
  const replaced: string[] = [];
  const storage = {
    getItem: (k: string) => (k in local ? local[k] : null), setItem: (k: string, v: string) => { local[k] = v; },
  };
  const win = {
    location: { href, hash: url.hash },
    history: { state: null, replaceState: (_s: unknown, _t: string, to: string) => replaced.push(to) },
    localStorage: storage,
  } as unknown as Window;
  return { win, replaced, local };
}

describe("arriving from the old GitHub Pages address", () => {
  beforeEach(() => sessionStorage.clear());

  it("reads exactly what the old address's forwarding page wrote", () => {
    const fragment = carryFragment(memory({ fm_cart: JSON.stringify([line]), fm_wishlist_v1: '["b2"]' }), memory(), `${site}/`);
    const state = decodeMovedState(fragment);
    expect(state?.cart).toEqual([line]);
    expect(state?.wishlist).toEqual(["b2"]);
  });

  it("fills an empty bag, merges the wishlist and tidies the address", () => {
    const fragment = carryFragment(memory({ fm_cart: JSON.stringify([line]), fm_wishlist_v1: '["b2","b3"]' }), memory(), `${site}/books/x`);
    const { win, replaced, local } = fakeWindow(`${site}/books/x?ref=1${fragment}`, { [WISHLIST_KEY]: '["b3"]' });
    expect(takeMovedState(win)).toEqual({ cart: 1, wishlist: 1, access: false });
    expect(replaced).toEqual(["/books/x?ref=1"]);
    expect(JSON.parse(local[CART_KEY])[0]).toMatchObject({ id: "b1", quantity: 2 });
    expect(JSON.parse(local[WISHLIST_KEY])).toEqual(["b3", "b2"]);
  });

  it("never mixes with a bag the shopper already has here", () => {
    const fragment = carryFragment(memory({ fm_cart: JSON.stringify([line]) }), memory(), `${site}/`);
    const mine = JSON.stringify([{ ...line, id: "mine", quantity: 1 }]);
    const { win, local } = fakeWindow(`${site}/${fragment}`, { [CART_KEY]: mine });
    expect(takeMovedState(win)?.cart).toBe(0);
    expect(local[CART_KEY]).toBe(mine);
  });

  it("restores a payment return's order key only for that order", () => {
    const key = "a".repeat(64);
    const fragment = carryFragment(memory({ "lm:moved": "1" }), memory({ "order-access:AB12": key }), `${site}/checkout?success=true&order_id=AB12`);
    const { win } = fakeWindow(`${site}/checkout?success=true&order_id=AB12${fragment}`);
    expect(takeMovedState(win)?.access).toBe(true);
    expect(savedOrderAccess("AB12")).toBe(key);

    const other = fakeWindow(`${site}/checkout?success=true&order_id=ZZ99${fragment}`);
    expect(takeMovedState(other.win)?.access).toBe(false);
    expect(savedOrderAccess("ZZ99")).toBe("");
  });

  it("drops malformed or hostile hand-overs but still tidies the address", () => {
    for (const bad of ["@@@", "x".repeat(17000), btoa(JSON.stringify({ v: 2, cart: [line] })), btoa("not json")]) {
      const { win, replaced, local } = fakeWindow(`${site}/${MOVED_PREFIX}${bad}`);
      expect(takeMovedState(win)).toBeNull();
      expect(replaced).toEqual(["/"]);
      expect(local[CART_KEY]).toBeUndefined();
    }
    const weird = decodeMovedState(MOVED_PREFIX + Buffer.from(JSON.stringify({ v: 1, wishlist: [1, "", "ok"], access: { orderId: "../x", key: "short" } })).toString("base64url"));
    expect(weird).toEqual({ wishlist: ["ok"] });
  });

  it("does nothing on an ordinary visit", () => {
    const { win, replaced } = fakeWindow(`${site}/admin#orders/AB12`);
    expect(takeMovedState(win)).toBeNull();
    expect(replaced).toEqual([]);
  });
});

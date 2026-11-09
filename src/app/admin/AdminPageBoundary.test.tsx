// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AdminPageBoundary } from "./AdminPageBoundary";
import { ErrorBoundary } from "../components/ErrorBoundary";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let broken = true;
const Page = () => { if (broken) throw new Error("bad data"); return h("p", null, "Orders"); };
const Missing = () => { throw new Error("Failed to fetch dynamically imported module: https://x/assets/Orders-1.js"); };

let root: Root;
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ""; broken = true; vi.restoreAllMocks(); sessionStorage.clear(); });

async function mount(node: ReturnType<typeof h>) {
  const el = document.createElement("div");
  document.body.append(el);
  vi.spyOn(console, "error").mockImplementation(() => {});
  root = createRoot(el);
  await act(async () => { root.render(node); });
  return el;
}

it("keeps a crashed admin page inside the page, and Try again brings it back", async () => {
  const el = await mount(h("div", null, h("nav", null, "Side menu"), h(AdminPageBoundary, { resetKey: "orders" }, h(Page))));
  expect(el.textContent).toContain("Side menu");
  expect(el.querySelector("[role='alert']")?.textContent).toContain("This page didn't open");
  broken = false;
  await act(async () => { el.querySelector<HTMLButtonElement>("[role='alert'] button")!.click(); });
  expect(el.textContent).toContain("Orders");
});

it("clears the error when the owner opens another page", async () => {
  const el = await mount(h(AdminPageBoundary, { resetKey: "orders" }, h(Page)));
  broken = false;
  await act(async () => { root.render(h(AdminPageBoundary, { resetKey: "catalog" }, h(Page))); });
  expect(el.querySelector("[role='alert']")).toBeNull();
});

it("offers a way out of a full-screen view", async () => {
  const onClose = vi.fn();
  const el = await mount(h(AdminPageBoundary, { label: "The book editor", onClose }, h(Page)));
  const buttons = el.querySelectorAll<HTMLButtonElement>("[role='alert'] button");
  expect(el.textContent).toContain("The book editor didn't open");
  await act(async () => { buttons[1].click(); });
  expect(onClose).toHaveBeenCalledOnce();
});

it("asks for a reload when the page's code went missing in a deploy and the automatic reload already ran", async () => {
  sessionStorage.setItem("fm_stale_build_reload", String(Date.now()));
  const el = await mount(h(AdminPageBoundary, null, h(Missing)));
  expect(el.textContent).toContain("A newer admin is live");
  expect(el.querySelector("[role='alert'] button")?.textContent).toBe("Reload");
});

it("the shop's outermost guard shows a reload button without the saved design", async () => {
  sessionStorage.setItem("fm_stale_build_reload", String(Date.now()));
  const el = await mount(h(ErrorBoundary, { bare: true }, h(Page)));
  expect(el.querySelector("[role='alert'] button")).not.toBeNull();
  expect(el.querySelector("style")).toBeNull();
});

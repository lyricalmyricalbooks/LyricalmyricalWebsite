// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsAnchor, SettingsContents, SettingsGroup, friendlyError } from "./settingsLayout";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it("jumps to a card without touching the address bar, and marks unsaved cards", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const scrolled: string[] = [];
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); } as any;
  window.location.hash = "#settings/general";
  await act(async () => root.render(<>
    <SettingsContents groups={[{ id: "g1", title: "Shop details", items: [{ id: "c1", label: "Location", unsaved: true }, { id: "c2", label: "Store policies" }] }]} />
    <SettingsGroup id="g1" title="Shop details"><SettingsAnchor id="c1"><p>Location card</p></SettingsAnchor></SettingsGroup>
  </>));
  expect(container.textContent).toContain("1 unsaved");
  expect(container.textContent).toContain("(unsaved changes)");
  const location = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Location"))!;
  await act(async () => location.click());
  expect(scrolled).toEqual(["c1"]);
  expect(document.activeElement?.id).toBe("c1");
  expect(window.location.hash).toBe("#settings/general");
  await act(async () => root.unmount());
});

it("turns provider errors into plain sentences and keeps the shop's own words", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(friendlyError(new Error("Shippo refused this key"), "save the Shippo API key")).toBe("Couldn't save the Shippo API key. Shippo refused this key.");
  expect(friendlyError({ code: "permission-denied", message: "Missing or insufficient permissions." }, "remove the key")).toMatch(/^Couldn't remove the key\. The shop didn't allow that/);
  expect(friendlyError(new Error("FirebaseError: [code=internal] at x.js:1:2"), "make the export")).toBe("Couldn't make the export. Something went wrong. Try again in a moment.");
});

it("Settings pages never show a raw error message", () => {
  const files = ["ShopSettings.tsx", "TaxesSettings.tsx", "AddressFinderCard.tsx", "AiWriterCard.tsx", "BackupsExportCard.tsx", "ClarityCard.tsx", "GoogleAnalyticsCard.tsx",
    "OwnVisitsCard.tsx", "PrivacyRequestsCard.tsx", "RedirectsCard.tsx", "SearchConsoleCard.tsx", "StripeWebhookHealth.tsx", "LocalFulfillmentSettings.tsx"];
  for (const f of files) {
    const src = readFileSync(resolve(process.cwd(), "src/app/admin", f), "utf8");
    expect(src, f).not.toMatch(/(err|error)\??\.message/);
  }
});

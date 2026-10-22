import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Settings pages read like the Masthead: a heading and at most one short line, never a paragraph (owner, 22 October 2026).
const FILES = ["ShopSettings", "NotificationEditor", "TaxesSettings", "LocalFulfillmentSettings", "OwnVisitsCard", "GoogleAnalyticsCard",
  "ClarityCard", "SearchConsoleCard", "RedirectsCard", "AiWriterCard", "PrivacyRequestsCard", "BackupsExportCard", "GmailSendingCard", "AddressFinderCard"];
const MAX = 70;

describe("Settings card wording", () => {
  for (const f of FILES) {
    it(`${f}: card descriptions are one short line`, () => {
      const src = readFileSync(resolve(__dirname, `${f}.tsx`), "utf8");
      const long = [...src.matchAll(/<SectionCard\b[^>]*?\bdescription="([^"]*)"/gs)].map((m) => m[1]).filter((d) => d.length > MAX);
      expect(long).toEqual([]);
      expect(src).not.toMatch(/<SettingsGroup[^>]*subcopy=/);
      expect(src).not.toMatch(/className="rp-kicker"/);
    });
  }
  it("settings pages are drawn in the flat Masthead style", () => {
    expect(readFileSync(resolve(__dirname, "ShopSettings.tsx"), "utf8")).toContain('className="rp-settings ');
    const css = readFileSync(resolve(__dirname, "riso/riso.css"), "utf8");
    expect(css).toMatch(/\.rp-settings \.rp-card \{[^}]*box-shadow: none/);
    expect(css).toMatch(/\.rp-settings \.rp-btn \{[^}]*box-shadow: none/);
  });
});

import { useState, useEffect, useId, useMemo, useRef } from "react";
import { 
  ArrowLeft,
  Search,
  Edit,
  ExternalLink, 
  Globe, 
  Mail,
  Percent,
  Plus,
  Trash2,
  Check,
  Lock,
  Phone,
  Building,
  Hash,
  X,
  RefreshCw,
  Database,
  CheckCircle,
  AlertCircle as AlertCircleIcon,
  Clock,
  Link,
  MapPin,
  CreditCard,
  ShieldCheck,
  Package,
  Truck,
  History,
  TrendingUp,
  Map,
  DollarSign,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Save
} from "lucide-react";
import { adminApi } from "./api";
import toast from "react-hot-toast";
import { POLICY_KEYS, POLICY_TITLES, policySlug, type PolicyKey } from "../features/site/policyPages";
import { Checkbox, ConfirmDialog, DataTable, DestructiveButton, Dialog, EmptyState, ErrorState, MetricCard, PrimaryButton, SaveBar, SearchField, SecondaryButton, SectionCard, SectionHead, SelectField, StatusBadge, Tabs, TextArea, TextField, Toggle, useConfirm, type Column } from "./riso/components";
import { motion, AnimatePresence } from "motion/react";
import { NotificationEditor } from "./NotificationEditor";
import { COUNTRIES, CONTINENTS, describeZoneGeography } from "../features/site/shippingZones";
import { summarizeShipping, describeRatePrice, describeRateConditions, RATE_TYPES, starterZones } from "./shippingHealth";
import { quoteShipping } from "../features/site/shippingEngine";
import { LocalFulfillmentSettings, useLocalFulfillmentDraft } from "./LocalFulfillmentSettings";
import { paymentHealth } from "./paymentHealth";
import { stripeSecretKeyProblem } from "./privateKeys";
import { StripeWebhookHealth } from "./StripeWebhookHealth";
import { PrivacyRequestsCard } from "./PrivacyRequestsCard";
import { RedirectsCard } from "./RedirectsCard";
import { AddressFinderCard } from "./AddressFinderCard";
import { assignedCountryNames, countryName, groupedCountries, remainingCountryNames, toCountryCodes } from "./shippingCountries";
import { saveSectionsInOrder } from "./settingsSave";
import { TaxesSettings } from "./TaxesSettings";
import { BackupsExportCard } from "./BackupsExportCard";
import { useSettingsDirty } from "./settingsDirty";
import { testSaleSteps } from "./testSaleWalkthrough";
import { studioHash } from "../lib/studioLocation";

const PURPLE = "#A855F7";

export function ShopSettings({ 
  activeTab, 
  setActiveTab, 
  settings, 
  setSettings, 
  originalSettings, 
  setOriginalSettings,
  settingsLoading,
  saveSection,
  onUnderConstruction,
  onOpenOrders,
}: any) {
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [shippingProfiles, setShippingProfiles] = useState<any[]>([]);
  // A failed read must not look like "No shipping profiles".
  const [profilesError, setProfilesError] = useState(false);
  // Payments › Shippo opens Shipping straight on Carrier & labels.
  const [shippingStart, setShippingStart] = useState<"overview" | "carrier">("overview");

  useEffect(() => {
    loadShippingProfiles();
  }, []);

  async function loadShippingProfiles() {
    try {
      const b = await adminApi.getShippingProfiles();
      setShippingProfiles(b);
      setProfilesError(false);
    } catch (err) {
      console.error(err);
      setProfilesError(true);
    }
  }

  const handleSaveSection = async (section: string, data: any, options: any = {}): Promise<boolean> => {
    setSavingSection(section);
    try {
      return (await saveSection(section, data, options)) !== false;
    } finally {
      setSavingSection(null);
    }
  };

  const hasChanges = (section: string) => {
    if (!settings || !originalSettings) return false;
    return JSON.stringify(settings[section]) !== JSON.stringify(originalSettings[section]);
  };

  if (settingsLoading) return (
    <div className="h-96 flex flex-col items-center justify-center gap-6">
      <div className="w-12 h-12 border-2 border-violet-500/10 border-t-violet-500 rounded-full animate-spin" />
      <p className="text-[10px] tracking-[0.4em] text-slate-500 font-black uppercase">Retrieving System Config</p>
    </div>
  );

  if (!settings) return <ErrorState title="Settings unavailable" description="Store settings could not be loaded. Check your connection, then reload this page." />;

  // Designer tab — handled by Dashboard for full-screen takeover
  if (activeTab === "designer") {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto pb-32">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-12"
        >
          {activeTab === "general" && <GeneralSettings settings={settings} setSettings={setSettings} originalSettings={originalSettings} hasChanges={hasChanges} saveSection={handleSaveSection} savingSection={savingSection} onUnderConstruction={onUnderConstruction} />}
          {activeTab === "shipping" && <ShippingSettings profiles={shippingProfiles} profilesError={profilesError} refreshProfiles={loadShippingProfiles} initialView={shippingStart} />}
          {activeTab === "payments" && <PaymentsSettings settings={settings} setSettings={setSettings} originalSettings={originalSettings} setOriginalSettings={setOriginalSettings} hasChanges={hasChanges} saveSection={handleSaveSection} savingSection={savingSection}
            onOpenShipping={() => { setActiveTab("shipping"); setShippingStart("carrier"); }} onOpenOrders={onOpenOrders} onOpenNotifications={() => setActiveTab("notifications")} />}
          {activeTab === "taxes" && <TaxesSettings settings={settings} setSettings={setSettings} originalSettings={originalSettings} hasChanges={hasChanges} saveSection={handleSaveSection} savingSection={savingSection} />}
          {/* Communications was retired: its links open Notifications. */}
          {(activeTab === "notifications" || activeTab === "communications") && <NotificationEditor focus={activeTab === "communications" ? "sender" : undefined} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
const POLICY_STARTERS: Record<PolicyKey, string> = {
  shipping: "We process orders within 1–3 business days of payment. Carrier transit time is additional and shown at checkout for your destination and selected service.\n\nYou will receive an email with tracking once your order ships. Digital titles are available to download immediately after payment.",
  returns: "If your book arrives damaged or incorrect, contact us within 30 days of delivery and we will replace it or refund you.\n\nDigital downloads are non-refundable once accessed, unless the file is faulty.",
  privacy: "We collect only what we need to fulfil your order and, if you opt in, send you our newsletter: your name, email, shipping address and order details.\n\nPayments are processed by Stripe; we never see or store your card number. We do not sell your personal information. You can ask us to delete your data at any time.",
  terms: "By placing an order you agree that the details you provide are accurate and that you are authorised to use the payment method.\n\nPrices are shown in Canadian dollars unless stated otherwise. We may cancel and refund an order if a title is unavailable or a pricing error occurred.",
};

// SaveBar names the cards that have unsaved edits, not the settings keys behind them.
export const GENERAL_SECTION_TITLES: Record<string, string> = {
  maintenance: "Store status", stockHolds: "Checkout stock holds", info: "Store identity", domain: "Domain & visibility", location: "Location", policies: "Store policies",
};

function GeneralSettings({ settings, setSettings, originalSettings, hasChanges, saveSection, savingSection, onUnderConstruction }: any) {
  const SECTIONS = ["maintenance", "stockHolds", "domain", "info", "location", "policies"] as const;
  const dirty = SECTIONS.filter((k) => hasChanges(k));
  useSettingsDirty("general", dirty.length > 0);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  // Functional update: a set after an await (e.g. the store-status confirm) must not restore stale values.
  const set = (section: string, patch: any) => setSettings((prev: any) => ({ ...prev, [section]: { ...prev?.[section], ...patch } }));

  const saveAll = async () => {
    // A failed section already shows its own error; only announce success when all saved.
    if (await saveSectionsInOrder(dirty, (k) => saveSection(k, { [k]: settings[k] }))) toast.success("Store settings saved");
  };
  const discard = () => {
    const next = { ...settings };
    dirty.forEach((k) => { next[k] = JSON.parse(JSON.stringify(originalSettings?.[k] ?? {})); });
    setSettings(next);
  };

  const maintenanceOn = !!settings.maintenance?.enabled;
  const name = settings.info?.name || "";
  const desc = settings.info?.description || "";

  return (
    <div className="rp-stack">
      <SectionCard title="Store status" description="What shoppers can do right now. One choice covers both ways of closing the shop.">
        {(() => {
          const wall = !!settings.design?.showUnderConstruction;
          const status = wall ? "construction" : maintenanceOn ? "maintenance" : "open";
          const choose = async (next: string) => {
            if (next === status) return;
            // The wall is published straight away (same switch as the top bar); maintenance waits for Save.
            if (next === "construction") { await onUnderConstruction?.(true); return; }
            // `false` = the owner cancelled taking the wall down; stop without touching maintenance.
            if (wall && (await onUnderConstruction?.(false)) === false) return;
            if (next === "maintenance") setConfirmMaintenance(true);
            else set("maintenance", { enabled: false });
          };
          const options = [
            { id: "open", label: "Open", hint: "Shoppers can browse and buy." },
            { id: "maintenance", label: "Maintenance — checkout paused", hint: "Shoppers can browse, but the server refuses new checkouts and the storefront shows your message. Applies when you save." },
            { id: "construction", label: "Under construction wall", hint: "Shoppers see the “under construction” page instead of the shop. Applies straight away (same as the top-bar switch)." },
          ];
          return (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="rp-sr-only">Store status</legend>
              <div style={{ marginBottom: 12 }}>
                <StatusBadge tone={status === "open" ? "success" : "warning"}>{status === "open" ? "Storefront live" : status === "maintenance" ? "Checkout paused" : "Behind construction wall"}</StatusBadge>
                {settings.domain?.custom && <span className="rp-hint" style={{ marginLeft: 12 }}>Domain: {settings.domain.custom}</span>}
              </div>
              <div className="rp-stack" style={{ gap: 8 }}>
                {options.map((o) => (
                  <label key={o.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="radio" name="store-status" value={o.id} checked={status === o.id} onChange={() => void choose(o.id)} style={{ marginTop: 4, accentColor: "var(--rp-primary)" }} />
                    <span><strong>{o.label}</strong><span className="rp-hint" style={{ display: "block" }}>{o.hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })()}
        {maintenanceOn && (
          <div style={{ marginTop: 16 }}>
            <TextField label="Maintenance message" value={settings.maintenance?.message || ""}
              placeholder="We are updating our archive. Please check back soon." onChange={(e) => set("maintenance", { message: e.target.value })} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Checkout stock holds" description="While someone checks out, their copies are set aside for 30 minutes. These limits stop one person from tying up your whole catalogue. Raise them for a school, library or bookshop that orders in bulk.">
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {([
            { key: "perBook", label: "Most copies of one book", hint: "Per shopper, across their open checkouts. Default 10.", max: 99 },
            { key: "units", label: "Most copies in total", hint: "All books together. Default 50.", max: 2000 },
            { key: "orders", label: "Most open checkouts", hint: "Unpaid orders one shopper can have at once. Default 3.", max: 50 },
          ] as const).map((f) => (
            <TextField key={f.key} label={f.label} type="number" min={1} max={f.max} hint={f.hint}
              value={String(settings.stockHolds?.[f.key] ?? "")}
              onChange={(e) => set("stockHolds", { [f.key]: e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))) })} />
          ))}
        </div>
        <p className="rp-hint" style={{ marginTop: 12 }}>Shoppers over these limits see a warning in their bag before they pay. Copies of e-books and books you sell without tracking stock never count. A shared connection (a school or office) may hold about twice as many in total.</p>
      </SectionCard>

      <SectionCard title="Store identity" description="Your publisher name, description and contact details.">
        <div className="rp-stack" style={{ gap: 20 }}>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <TextField label="Publisher name" value={name} maxLength={100} hint={`${name.length} / 100 characters`} onChange={(e) => set("info", { name: e.target.value })} />
            <TextField label="Contact email" type="email" value={settings.info?.email || ""} placeholder="hello@lyricalmyricalbooks.com" onChange={(e) => set("info", { email: e.target.value })} />
          </div>
          <TextArea label="Publisher description" rows={4} value={desc} maxLength={150} hint={`${desc.length} / 150 characters — shown in search results and social previews`} onChange={(e) => set("info", { description: e.target.value })} />
        </div>
      </SectionCard>

      <SectionCard title="Domain & visibility" description="Where customers find the store.">
        <TextField label="Custom domain" value={settings.domain?.custom || ""} placeholder="www.yourdomain.com"
          hint="Adding a domain also requires updating the allowed origins for payments and sign-in — ask your developer before changing it."
          onChange={(e) => set("domain", { custom: e.target.value })} />
      </SectionCard>

      <SectionCard title="Location" description="Main office and shipping origin.">
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <TextField label="Street address" value={settings.location?.street || ""} placeholder="456 Montrose Avenue" onChange={(e) => set("location", { street: e.target.value })} />
          </div>
          <TextField label="City" value={settings.location?.city || ""} placeholder="Toronto" onChange={(e) => set("location", { city: e.target.value })} />
          <TextField label="State / province" value={settings.location?.state || ""} placeholder="Ontario" onChange={(e) => set("location", { state: e.target.value })} />
          <TextField label="Postal code" value={settings.location?.zip || ""} placeholder="M6G 3H1" autoComplete="postal-code" onChange={(e) => set("location", { zip: e.target.value })} />
          <SelectField label="Country" value={settings.location?.country || "Canada"} onChange={(e) => set("location", { country: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
          </SelectField>
          <TextField label="Phone" type="tel" value={settings.location?.phone || ""} placeholder="647 409 6863" autoComplete="tel"
            hint="Printed on shipping labels; carriers call it about delivery problems." onChange={(e) => set("location", { phone: e.target.value })} />
        </div>
        <p className="rp-hint" style={{ margin: "12px 0 0" }}>Shipping labels and live carrier rates use this as the “from” address. Blank fields keep the original Toronto address.</p>
      </SectionCard>

      <SectionCard title="Store policies" description="Shown in the storefront footer as links to public pages. A policy with no text is hidden. Card networks expect shipping and returns terms.">
        <div className="rp-stack" style={{ gap: 20 }}>
          {POLICY_KEYS.map((k) => {
            const text: string = settings.policies?.[k] || "";
            return (
              <div key={k}>
                <TextArea label={POLICY_TITLES[k]} rows={5} maxLength={20000} value={text}
                  hint={text.trim() ? `Public at /page/${policySlug(k)} · blank line = new paragraph` : "Not published yet. Leave blank to hide the footer link."}
                  onChange={(e) => set("policies", { [k]: e.target.value })} />
                {!text.trim() && (
                  <SecondaryButton size="sm" onClick={() => set("policies", { [k]: POLICY_STARTERS[k] })}>Insert starter text</SecondaryButton>
                )}
              </div>
            );
          })}
          <p className="rp-hint" style={{ margin: 0 }}>Starter text is a plain-language outline, not legal advice — edit it to match how you actually operate.</p>
        </div>
      </SectionCard>

      <RedirectsCard />

      <PrivacyRequestsCard />

      <BackupsExportCard />

      <SaveBar dirty={dirty.length > 0} saving={!!savingSection} onSave={saveAll} onDiscard={discard}
        message={`Unsaved changes in ${dirty.map((k) => GENERAL_SECTION_TITLES[k] || k).join(", ")}.`} />

      <ConfirmDialog open={confirmMaintenance} title="Turn on maintenance mode?" confirmLabel="Pause checkout"
        message="Shoppers can still browse, but checkout is refused (card, PayPal, e-Transfer and free orders) until you turn it off again. The change applies once you save."
        onConfirm={() => { setConfirmMaintenance(false); set("maintenance", { enabled: true }); }} onCancel={() => setConfirmMaintenance(false)} />
    </div>
  );
}

function RateTester({ profile }: { profile: any }) {
  const [country, setCountry] = useState("Canada");
  const [total, setTotal] = useState("40");
  const [count, setCount] = useState("2");
  const [grams, setGrams] = useState("");
  const qty = Math.max(1, Number(count) || 1);
  const each = (Number(total) || 0) / qty;
  const quotes = useMemo(() => quoteShipping(
    [{ price: each, quantity: qty, shippingProfileId: profile.id, weightGrams: grams === "" ? null : (Number(grams) || 0) / qty }],
    { country }, [profile]).filter((q) => q.type !== "pickup"), [profile, country, each, qty, grams]);
  return (
    <SectionCard title="Test this profile" description="See exactly what a customer would be offered — using your unsaved edits.">
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 12 }}>
        <SelectField label="Destination" value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
        </SelectField>
        <TextField label="Order total ($)" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
        <TextField label="Books in cart" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        <TextField label="Total weight (g)" type="number" min={0} placeholder="auto" value={grams} onChange={(e) => setGrams(e.target.value)} />
      </div>
      {quotes.length === 0 ? (
        <p role="status" className="rp-hint" style={{ margin: 0, padding: 12, background: "var(--rp-warning-tint)", border: "1px solid var(--rp-warning)" }}>
          ⚠ Nothing would be offered — this customer could not check out.
        </p>
      ) : (
        <ul className="rp-list" aria-label="Quotes a customer would see" style={{ margin: 0 }}>
          {quotes.map((q) => (
            <li key={q.id + q.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", gap: 12 }}>
              <span><strong>{q.name}</strong>{q.deliveryDays ? <span className="rp-hint"> · {q.type === "pickup" ? "ready in" : ""} {q.deliveryDays} days</span> : null}</span>
              <span className="rp-mono">{q.price === 0 ? "Free" : `$${q.price.toFixed(2)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const numOrNull = (v: any) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
function normalizeRate(r: any) {
  const type = r.type || "flat";
  return {
    ...r,
    name: String(r.name || "").trim(),
    type,
    enabled: r.enabled !== false,
    base: type === "free" || type === "pickup" ? 0 : Math.max(0, Number(r.base) || 0),
    additional: type === "flat" ? Math.max(0, Number(r.additional) || 0) : 0,
    perKg: type === "weight" ? Math.max(0, Number(r.perKg) || 0) : 0,
    percent: type === "percent" ? Math.max(0, Number(r.percent) || 0) : 0,
    handlingFee: numOrNull(r.handlingFee) ?? 0,
    freeOver: numOrNull(r.freeOver),
    minPrice: numOrNull(r.minPrice),
    maxPrice: numOrNull(r.maxPrice),
    minWeight: numOrNull(r.minWeight),
    maxWeight: numOrNull(r.maxWeight),
    minItems: numOrNull(r.minItems),
    maxItems: numOrNull(r.maxItems),
    note: String(r.note || "").trim(),
  };
}

function ShippingSettings({ profiles, profilesError = false, refreshProfiles, initialView = "overview" }: any) {
  const localFulfillmentDraft = useLocalFulfillmentDraft();
  const [askConfirm, confirmNode] = useConfirm();
  const [books, setBooks] = useState<any[]>([]);
  const [booksError, setBooksError] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<any | null>(null);
  const [shippingView, setShippingView] = useState<"overview" | "profiles" | "carrier" | "local">(initialView);
  
  // Modals visibility
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  
  // Creating Profile inline state
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [shippoApiKey, setShippoApiKey] = useState("");
  const [showShippoApiKey, setShowShippoApiKey] = useState(false);
  const [shippoConfig, setShippoConfig] = useState<any | null>(null);
  const [shippoLoading, setShippoLoading] = useState(true);
  const [shippoSaving, setShippoSaving] = useState(false);
  const [carrierCountrySearch, setCarrierCountrySearch] = useState("");
  // Latest live-rate country list, updated synchronously on each click.
  const liveCountriesRef = useRef<string[] | null>(null);
  // Saves run one after another so the server always ends on the latest list.
  const liveSaveChain = useRef<Promise<unknown>>(Promise.resolve());
  const [shippoMessage, setShippoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search/Filters
  const [productSearch, setProductSearch] = useState("");
  const [countrySearch, setCountrySearch] = useState("");

  // Sub-items active editing states
  const [activeZone, setActiveZone] = useState<any | null>(null);
  const [activeRate, setActiveRate] = useState<any | null>(null);
  const [parentZoneIdForRate, setParentZoneIdForRate] = useState<string | null>(null);

  // Checked products local state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  useEffect(() => {
    const initialize = async () => {
      await adminApi.migrateShippingProfiles();
      refreshProfiles();
      loadBooks();
      loadShippoConfig();
    };
    initialize();
  }, []);

  const loadShippoConfig = async () => {
    setShippoLoading(true);
    try {
      setShippoConfig(await adminApi.getShippoConfig());
    } catch (err: any) {
      setShippoMessage({ type: "error", text: err.message || "Could not load Shippo settings." });
    } finally {
      setShippoLoading(false);
    }
  };

  const handleSaveShippoApiKey = async () => {
    if (shippoSaving) return;
    const apiKey = shippoApiKey.trim();
    if (!apiKey) {
      setShippoMessage({ type: "error", text: "Enter your Shippo API key before saving." });
      return;
    }

    setShippoSaving(true);
    setShippoMessage(null);
    try {
      const config = await adminApi.saveShippoConfig(apiKey);
      setShippoConfig(config);
      setShippoApiKey("");
      setShowShippoApiKey(false);
      setShippoMessage({ type: "success", text: `Shippo accepted the key. Saved as a ${config?.mode === "test" ? "TEST" : "LIVE"} key.` });
    } catch (err: any) {
      setShippoMessage({ type: "error", text: err.message || "Could not save the Shippo API key." });
    } finally {
      setShippoSaving(false);
    }
  };

  const loadBooks = async () => {
    try {
      const b = await adminApi.getAllBooks();
      setBooks(b);
      setBooksError(false);
    } catch (err) {
      console.error(err);
      setBooksError(true);
    }
  };

  const handleSelectProfile = (profile: any) => {
    setSelectedProfileId(profile.id);
    setEditingProfile(JSON.parse(JSON.stringify(profile)));
  };

  const [creatingProfile, setCreatingProfile] = useState(false);
  const handleCreateProfile = async () => {
    // A double click must not create two profiles.
    if (!newProfileName.trim() || creatingProfile) return;
    setCreatingProfile(true);
    try {
      const newProf = await adminApi.createShippingProfile({ name: newProfileName, zones: [] });
      setNewProfileName("");
      setIsCreatingProfile(false);
      refreshProfiles();
      handleSelectProfile(newProf);
    } catch {
      toast.error("Error creating shipping profile");
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (id === "general-profile") {
      toast.error("Cannot delete the General Shipping Profile.");
      return;
    }
    if (!(await askConfirm({ title: "Delete this shipping profile?", message: "All assigned products will revert to the General Profile.", confirmLabel: "Delete profile" }))) return;
    try {
      await adminApi.deleteShippingProfile(id);
      refreshProfiles();
      await loadBooks(); // its books moved to General — refresh counts and health
      setSelectedProfileId(null);
      setEditingProfile(null);
    } catch {
      toast.error("Error deleting shipping profile");
    }
  };

  const [savingProfile, setSavingProfile] = useState(false);
  const handleSaveProfile = async () => {
    if (!editingProfile || savingProfile) return;
    // Check the edited profile the way the Overview does; blocking issues need an explicit yes.
    const blocking = summarizeShipping(profiles.map((p: any) => (p.id === editingProfile.id ? editingProfile : p)), books)
      .issues.filter((issue) => issue.profileId === editingProfile.id && issue.severity === "blocking");
    if (blocking.length && !(await askConfirm({
      title: `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"} — save anyway?`,
      message: `${blocking.map((i) => i.label).join(" · ")}. Some customers may not be able to check out until this is fixed.`,
      confirmLabel: "Save anyway",
    }))) return;
    setSavingProfile(true);
    try {
      await adminApi.updateShippingProfile(editingProfile.id, editingProfile);
      await refreshProfiles();
      toast.success(`“${editingProfile.name || "Profile"}” saved`);
      setSelectedProfileId(null);
      setEditingProfile(null);
    } catch {
      toast.error("Couldn't save the shipping profile — nothing was changed. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  // Product assignment helper
  const openProductModal = () => {
    const assigned = books
      .filter((b: any) => b.shippingProfileId === editingProfile.id)
      .map((b: any) => b.id);
    setSelectedProductIds(assigned);
    setProductSearch("");
    setIsProductModalOpen(true);
  };

  const [savingProducts, setSavingProducts] = useState(false);
  const handleSaveProducts = async () => {
    if (savingProducts) return;
    setSavingProducts(true);
    try {
      const wasAssigned = books.filter((b: any) => b.shippingProfileId === editingProfile.id).map((b: any) => b.id);
      const removed = wasAssigned.filter((id: string) => !selectedProductIds.includes(id));
      await adminApi.assignProductsToShippingProfile(editingProfile.id, selectedProductIds, removed);
      await loadBooks();
      refreshProfiles();
      setIsProductModalOpen(false);
    } catch {
      toast.error("Error updating product assignments");
    } finally {
      setSavingProducts(false);
    }
  };

  // Zones helper
  const openZoneModal = (zone: any = null) => {
    if (zone) {
      const copy = JSON.parse(JSON.stringify(zone));
      copy.countries = (copy.countries || []).map(countryName);
      setActiveZone(copy);
    } else {
      setActiveZone({
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        name: "",
        countries: [],
        rates: []
      });
    }
    setCountrySearch("");
    setIsZoneModalOpen(true);
  };

  const handleSaveZone = () => {
    // Older zones may be defined only by their region text (e.g. "Canada") — still valid.
    const hasGeography = activeZone.restOfWorld === true || activeZone.countries.length > 0 || (activeZone.continents || []).length > 0 || !!String(activeZone.region || "").trim();
    if (!activeZone.name.trim() || !hasGeography) {
      toast.error("Please enter a zone name and select at least one country (or make it the rest-of-world zone).");
      return;
    }
    // Checkout matches zones by ISO code: store codes, never display names.
    const saved = {
      ...activeZone,
      countries: activeZone.restOfWorld ? [] : toCountryCodes(activeZone.countries),
      continents: activeZone.restOfWorld ? [] : (activeZone.continents || []),
    };

    setEditingProfile((prev: any) => {
      const zones = [...(prev.zones || [])];
      const idx = zones.findIndex(z => z.id === saved.id);
      if (idx > -1) {
        zones[idx] = saved;
      } else {
        zones.push(saved);
      }
      return { ...prev, zones };
    });
    setIsZoneModalOpen(false);
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!(await askConfirm({ title: "Delete this zone?", message: "Its rates will be removed with it. Save the profile to apply.", confirmLabel: "Delete zone" }))) return;
    setEditingProfile((prev: any) => {
      const zones = (prev.zones || []).filter((z: any) => z.id !== zoneId);
      return { ...prev, zones };
    });
  };

  // Rates helper
  const openRateModal = (zoneId: string, rate: any = null) => {
    setParentZoneIdForRate(zoneId);
    if (rate) {
      setActiveRate(JSON.parse(JSON.stringify(rate)));
    } else {
      setActiveRate({
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        name: "Standard Shipping",
        base: 15,
        additional: 5,
        deliveryDays: "",
        type: "flat",
        enabled: true,
        minPrice: null,
        maxPrice: null
      });
    }
    setIsRateModalOpen(true);
  };

  const handleSaveRate = () => {
    if (!activeRate.name.trim()) {
      toast.error("Please enter a shipping rate name.");
      return;
    }

    setEditingProfile((prev: any) => {
      const zones = [...(prev.zones || [])];
      const zoneIdx = zones.findIndex(z => z.id === parentZoneIdForRate);
      if (zoneIdx === -1) return prev;

      const zone = { ...zones[zoneIdx] };
      const rates = [...(zone.rates || [])];
      const rateIdx = rates.findIndex(r => r.id === activeRate.id);

      const cleaned = normalizeRate(activeRate);
      if (rateIdx > -1) rates[rateIdx] = cleaned; else rates.push(cleaned);

      zone.rates = rates;
      zones[zoneIdx] = zone;
      return { ...prev, zones };
    });
    setIsRateModalOpen(false);
  };

  const handleDeleteRate = async (zoneId: string, rateId: string) => {
    if (!(await askConfirm({ title: "Delete this shipping rate?", message: "Save the profile to apply the change.", confirmLabel: "Delete rate" }))) return;
    setEditingProfile((prev: any) => {
      const zones = [...(prev.zones || [])];
      const zoneIdx = zones.findIndex(z => z.id === zoneId);
      if (zoneIdx === -1) return prev;

      const zone = { ...zones[zoneIdx] };
      zone.rates = (zone.rates || []).filter((r: any) => r.id !== rateId);
      zones[zoneIdx] = zone;
      return { ...prev, zones };
    });
  };

  const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
  const handleDuplicateRate = (zoneId: string, rate: any) => {
    setEditingProfile((prev: any) => {
      const zones = (prev.zones || []).map((z: any) => z.id !== zoneId ? z
        : { ...z, rates: [...(z.rates || []), { ...JSON.parse(JSON.stringify(rate)), id: newId(), name: `${rate.name} (copy)` }] });
      return { ...prev, zones };
    });
    toast.success("Rate copied — edit the copy, then save the profile.");
  };
  const handleDuplicateZone = (zone: any) => {
    setEditingProfile((prev: any) => ({
      ...prev,
      zones: [...(prev.zones || []), {
        ...JSON.parse(JSON.stringify(zone)), id: newId(), name: `${zone.name} (copy)`, countries: [], continents: [], restOfWorld: false,
        rates: (zone.rates || []).map((r: any) => ({ ...JSON.parse(JSON.stringify(r)), id: newId() })),
      }],
    }));
    toast.success("Zone copied with its rates — pick its countries, then save the profile.");
  };
  const handleAddStarterZones = () => {
    setEditingProfile((prev: any) => ({ ...prev, zones: [...(prev.zones || []), ...starterZones(newId)] }));
    toast.success("Starter zones added — adjust the prices, then save the profile.");
  };

  const getAssignedProducts = (profileId: string) => {
    return books.filter((b: any) => b.shippingProfileId === profileId);
  };

  const money = (n: any) => `$${Number(n || 0).toFixed(2)}`;
  const shippoConnected = !!shippoConfig?.configured;
  const shippingSummary = useMemo(() => summarizeShipping(profiles, books), [profiles, books]);
  const countriesAssignedElsewhere = activeZone
    ? assignedCountryNames(editingProfile?.zones || [], activeZone.id)
    : new Set<string>();
  const remainingCountries = activeZone
    ? remainingCountryNames(editingProfile?.zones || [], activeZone.id)
    : [];
  const countryGroups = groupedCountries(countrySearch);

  // Dialogs shared by the list and editor views
  const dialogs = editingProfile ? (
    <>
      <Dialog open={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} size="lg" badge="📦" title="Assign products"
        description={`Books that use the “${editingProfile.name}” shipping rates.`}
        footer={<>
          <SecondaryButton onClick={() => setIsProductModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveProducts} disabled={savingProducts}>{savingProducts ? "Saving…" : `Save assignments (${selectedProductIds.length})`}</PrimaryButton>
        </>}>
        <SearchField label="Search catalog" placeholder="Search catalog by title…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} data-autofocus />
        <ul className="rp-list" style={{ marginTop: 12, maxHeight: 360, overflowY: "auto", border: "1px solid var(--rp-border)" }} aria-label="Books">
          {books.filter((b) => String(b.title || "").toLowerCase().includes(productSearch.toLowerCase())).map((b) => {
            const isChecked = selectedProductIds.includes(b.id);
            const other = b.shippingProfileId && b.shippingProfileId !== editingProfile.id
              ? (profiles.find((pr: any) => pr.id === b.shippingProfileId)?.name || "another profile") : "";
            return (
              <li key={b.id} style={{ padding: "6px 12px" }}>
                <Checkbox label={b.title} checked={isChecked}
                  onChange={() => setSelectedProductIds((prev) => (isChecked ? prev.filter((id) => id !== b.id) : [...prev, b.id]))} />
                {other && <p className="rp-hint" style={{ margin: "0 0 4px 28px", color: "var(--rp-warning)" }}>⚠ Currently assigned to {other}; saving moves it here.</p>}
              </li>
            );
          })}
        </ul>
      </Dialog>

      <Dialog open={isZoneModalOpen && !!activeZone} onClose={() => setIsZoneModalOpen(false)} size="lg" badge="🌍" title="Shipping zone"
        description="Group countries and regions that share the same shipping rules."
        footer={<>
          <SecondaryButton onClick={() => setIsZoneModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveZone}>Save zone</PrimaryButton>
        </>}>
        {activeZone && (
          <div className="rp-stack" style={{ gap: 16 }}>
            <TextField label="Zone name" value={activeZone.name} placeholder="e.g. North America, Europe, Domestic…" data-autofocus
              onChange={(e) => setActiveZone({ ...activeZone, name: e.target.value })} />
            <Toggle label="Rest of world — everywhere not covered by another zone" checked={activeZone.restOfWorld === true}
              onChange={(on) => setActiveZone((prev: any) => ({ ...prev, restOfWorld: on, ...(on ? { countries: [], continents: [] } : {}) }))} />
            {!activeZone.restOfWorld && (<>
            <div>
              <div className="rp-sect">Regional presets</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CONTINENTS.map((continent) => (
                  <SecondaryButton key={continent} size="sm"
                    onClick={() => setActiveZone((prev: any) => ({
                      ...prev,
                      countries: Array.from(new Set([
                        ...prev.countries,
                        ...COUNTRIES.filter((country) => country.continent === continent && !countriesAssignedElsewhere.has(country.name)).map((country) => country.name),
                      ])),
                    }))}>
                    + {continent}
                  </SecondaryButton>
                ))}
                <PrimaryButton size="sm" disabled={remainingCountries.length === 0}
                  onClick={() => setActiveZone((prev: any) => ({ ...prev, countries: remainingCountries }))}>
                  Select all remaining worldwide ({remainingCountries.length})
                </PrimaryButton>
                <DestructiveButton size="sm" onClick={() => setActiveZone((prev: any) => ({ ...prev, countries: [] }))}>Clear selection</DestructiveButton>
              </div>
            </div>
            <SearchField label="Search countries" placeholder="Search countries…" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} />
            <p className="rp-hint" role="status" style={{ margin: 0 }}>{activeZone.countries.length} countr{activeZone.countries.length === 1 ? "y" : "ies"} selected</p>
            <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--rp-border)", padding: "4px 12px" }}>
              {countryGroups.map(({ continent, countries }) => (
                <section key={continent} aria-labelledby={`shipping-continent-${continent.replace(/\s/g, "-")}`} style={{ padding: "10px 0" }}>
                  <div className="rp-sect" id={`shipping-continent-${continent.replace(/\s/g, "-")}`} style={{ marginBottom: 6 }}>{continent}</div>
                  <div style={{ display: "grid", gap: 0, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                    {countries.map((country) => {
                      const unavailable = countriesAssignedElsewhere.has(country.name);
                      return (
                        <Checkbox key={country.code}
                          label={`${country.name}${unavailable ? " — in another zone" : ""}`}
                          checked={activeZone.countries.includes(country.name)} disabled={unavailable}
                          onChange={() => setActiveZone((prev: any) => ({
                            ...prev,
                            countries: prev.countries.includes(country.name)
                              ? prev.countries.filter((name: string) => name !== country.name)
                              : [...prev.countries, country.name],
                          }))} />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            </>)}
          </div>
        )}
      </Dialog>

      <Dialog open={isRateModalOpen && !!activeRate} onClose={() => setIsRateModalOpen(false)} badge="🚚" title="Shipping rate"
        description="What customers pay for this delivery option."
        footer={<>
          <SecondaryButton onClick={() => setIsRateModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveRate}>Save rate</PrimaryButton>
        </>}>
        {activeRate && (() => {
          const t = activeRate.type || "flat";
          const set = (k: string, v: any) => setActiveRate({ ...activeRate, [k]: v });
          const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" } as const;
          const priced = t !== "free" && t !== "pickup";
          return (
          <div className="rp-stack" style={{ gap: 16 }}>
            <TextField label="Rate / service name" value={activeRate.name} placeholder="e.g. Standard shipping, Express delivery" data-autofocus
              onChange={(e) => set("name", e.target.value)} />
            <SelectField label="How is this rate priced?" value={t} onChange={(e) => set("type", e.target.value)}
              hint={RATE_TYPES.find((x) => x.id === t)?.help}>
              {RATE_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </SelectField>
            {priced && (
              <div style={grid}>
                <TextField label="Base rate ($)" type="number" min={0} step="0.01" value={activeRate.base} placeholder="15.00" onChange={(e) => set("base", e.target.value)} />
                {t === "flat" && <TextField label="Each additional item ($)" type="number" min={0} step="0.01" value={activeRate.additional} placeholder="5.00" onChange={(e) => set("additional", e.target.value)} />}
                {t === "weight" && <TextField label="Per kg ($)" type="number" min={0} step="0.01" value={activeRate.perKg ?? ""} placeholder="8.00" onChange={(e) => set("perKg", e.target.value)} />}
                {t === "percent" && <TextField label="% of book subtotal" type="number" min={0} step="0.1" value={activeRate.percent ?? ""} placeholder="10" onChange={(e) => set("percent", e.target.value)} />}
                <TextField label="Handling fee ($)" type="number" min={0} step="0.01" value={activeRate.handlingFee ?? ""} placeholder="0.00" hint="Added once per order." onChange={(e) => set("handlingFee", e.target.value)} />
              </div>
            )}
            <div style={grid}>
              <TextField label={t === "pickup" ? "Ready in (days)" : "Carrier transit after dispatch (days)"} value={activeRate.deliveryDays || ""} placeholder="Only enter a carrier-backed estimate" onChange={(e) => set("deliveryDays", e.target.value)} />
              {priced && <TextField label="Free when order reaches ($)" type="number" min={0} step="0.01" value={activeRate.freeOver ?? ""} placeholder="e.g. 75.00" hint="This rate becomes free at or above this total." onChange={(e) => set("freeOver", e.target.value)} />}
            </div>
            <fieldset style={{ border: "var(--rp-hair) solid var(--rp-divider)", padding: 12, margin: 0 }}>
              <legend className="rp-label" style={{ padding: "0 6px" }}>Only offer this rate when… (leave blank for always)</legend>
              <div style={grid}>
                <TextField label="Order total at least ($)" type="number" min={0} value={activeRate.minPrice ?? ""} onChange={(e) => set("minPrice", e.target.value)} />
                <TextField label="Order total at most ($)" type="number" min={0} value={activeRate.maxPrice ?? ""} onChange={(e) => set("maxPrice", e.target.value)} />
                <TextField label="Cart weight at least (g)" type="number" min={0} value={activeRate.minWeight ?? ""} onChange={(e) => set("minWeight", e.target.value)} />
                <TextField label="Cart weight at most (g)" type="number" min={0} value={activeRate.maxWeight ?? ""} onChange={(e) => set("maxWeight", e.target.value)} />
                <TextField label="Items in cart at least" type="number" min={0} value={activeRate.minItems ?? ""} onChange={(e) => set("minItems", e.target.value)} />
                <TextField label="Items in cart at most" type="number" min={0} value={activeRate.maxItems ?? ""} onChange={(e) => set("maxItems", e.target.value)} />
              </div>
            </fieldset>
            <Toggle label="Rate is active (customers can choose it)" checked={activeRate.enabled !== false} onChange={(v: boolean) => set("enabled", v)} />
          </div>
          );
        })()}
      </Dialog>
    </>
  ) : null;

  // An open profile with unsaved zone/rate edits blocks leaving Settings (settingsDirty.ts).
  const savedProfile = editingProfile ? profiles.find((p: any) => p.id === editingProfile.id) : null;
  useSettingsDirty("shipping-profile", !!(savedProfile && editingProfile && JSON.stringify(savedProfile) !== JSON.stringify(editingProfile)));

  // ─── Profiles list ──────────────────────────────────────────────────────────
  if (selectedProfileId === null || !editingProfile) {
    return (
      <div className="rp-stack">
        <Tabs label="Shipping settings" value={shippingView} onChange={setShippingView} tabs={[
          { id: "overview", label: "Overview" },
          { id: "profiles", label: "Profiles", count: shippingSummary.profileCount },
          { id: "carrier", label: "Carrier & labels" },
          { id: "local", label: "Pickup & local delivery" },
        ]} />
        {shippingView === "local" && <LocalFulfillmentSettings draft={localFulfillmentDraft} />}
        {(shippingView === "overview" || shippingView === "profiles") && (profilesError || booksError) && (
          <ErrorState title="Couldn't load shipping details"
            description={profilesError ? "Your shipping profiles couldn't be read, so this page may look empty when it isn't. Check your connection and try again." : "Your catalog couldn't be read, so assigned-book counts and checks may be wrong. Check your connection and try again."}
            onRetry={() => { if (profilesError) refreshProfiles(); if (booksError) loadBooks(); }} />
        )}

        {shippingView === "overview" && (
          <>
            <div className="rp-kpi-grid">
              <MetricCard label="Shipping profiles" value={shippingSummary.profileCount} footer={`${shippingSummary.assignedProductCount} assigned products`} />
              <MetricCard label="Destination coverage" value={shippingSummary.coveredCountryCount} footer={`${shippingSummary.zoneCount} zones · ${shippingSummary.rateCount} rates`} tone="gold" />
              <MetricCard label="Configuration health" value={shippingSummary.issues.length === 0 ? "Ready" : `${shippingSummary.issues.length} issue${shippingSummary.issues.length === 1 ? "" : "s"}`} footer={shippoConnected ? "Shippo connected" : "Flat rates only"} tone={shippingSummary.issues.length === 0 ? undefined : "danger"} />
            </div>
            <SectionCard title="Checkout readiness" description="Resolve configuration gaps before they prevent a customer from choosing delivery.">
              {shippingSummary.issues.length === 0 ? (
                <div role="status" style={{ padding: 16, background: "var(--rp-success-tint)", border: "1px solid var(--rp-success)", color: "var(--rp-success)" }}>
                  <strong>✓ Shipping configuration is ready.</strong>
                  <p className="rp-hint" style={{ margin: "4px 0 0", color: "inherit" }}>Every profile has a zone and every zone has at least one rate.</p>
                </div>
              ) : (
                <ul className="rp-list" style={{ margin: -20 }} aria-label="Shipping configuration issues">
                  {shippingSummary.issues.map((issue) => (
                    <li key={issue.id} style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
                      <span><strong>{issue.label}</strong><span className="rp-hint" style={{ display: "block", marginTop: 3 }}>{issue.detail}</span></span>
                      {issue.profileId && <SecondaryButton size="sm" onClick={() => {
                        const profile = profiles.find((item: any) => item.id === issue.profileId);
                        if (profile) handleSelectProfile(profile);
                      }}>Fix profile</SecondaryButton>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="rp-card-actions">
                <SecondaryButton onClick={() => setShippingView("carrier")}>{shippoConnected ? "Manage Shippo" : "Connect Shippo"}</SecondaryButton>
                <PrimaryButton onClick={() => setShippingView("profiles")}>Manage profiles</PrimaryButton>
              </div>
            </SectionCard>
          </>
        )}

        {shippingView === "carrier" && (
        <SectionCard title="Shippo connection" description="Address verification, live carrier rates and shipping labels."
          actions={!shippoLoading && <StatusBadge tone={!shippoConnected ? "warning" : shippoConfig?.mode === "test" ? "warning" : "success"}>{!shippoConnected ? "Not connected" : shippoConfig?.mode === "test" ? "Connected · TEST key" : shippoConfig?.mode === "live" ? "Connected · LIVE" : "Connected"}</StatusBadge>}>
          {!shippoLoading && !shippoConnected && (
            <p role="alert" style={{ margin: "0 0 16px", padding: 12, background: "var(--rp-warning-tint)", border: "1px solid var(--rp-warning)", color: "var(--rp-warning)" }}>
              ⚠ Shippo isn't connected, so customer addresses aren't verified and live carrier rates are unavailable. Flat profile rates still apply.
            </p>
          )}
          {shippoConnected && shippoConfig?.mode === "test" && (
            <p role="alert" style={{ margin: "0 0 16px", padding: 12, background: "var(--rp-warning-tint)", border: "1px solid var(--rp-warning)", color: "var(--rp-warning)" }}>
              ⚠ This is a Shippo TEST key. Sandbox labels have no real postage and their tracking numbers never track, so labels bought now are marked TEST and can't be used on a real parcel. Save your live key (it starts with shippo_live_) before shipping real orders.
            </p>
          )}
          {shippoConnected && (
            <div className="rp-stack" style={{ gap: 12, marginBottom: 16 }}>
              <p className="rp-hint" style={{ margin: 0 }}>Active {shippoConfig.mode ? `${shippoConfig.mode} ` : ""}key ending in <span className="rp-mono">••••{shippoConfig.lastFour}</span>{shippoConfig.source === "environment" && " (Firebase secret)"}{shippoConfig.verifiedAt ? ` · checked with Shippo ${new Date(shippoConfig.verifiedAt).toLocaleDateString()}` : ""}</p>
              <Toggle label="Live carrier rates at checkout" checked={shippoConfig?.dynamicRatesEnabled ?? false}
                onChange={async (enabled) => {
                  try {
                    await adminApi.setShippoDynamicRates(enabled, shippoConfig?.dynamicRateCountries || []);
                    setShippoConfig((prev: any) => ({ ...prev, dynamicRatesEnabled: enabled }));
                    toast.success(enabled ? "Dynamic shipping rates enabled" : "Dynamic shipping rates disabled");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to update Shippo settings");
                  }
                }} />
              {shippoConfig?.dynamicRatesEnabled && (
                <div className="rp-stack" style={{ gap: 10, padding: 16, border: "1px solid var(--rp-border)", background: "var(--rp-canvas)" }}>
                  <div>
                    <strong>Countries using live rates</strong>
                    <p className="rp-hint" style={{ margin: "4px 0 0" }}>Only checked countries request Shippo rates. Every other country uses your regular shipping profiles and zones.</p>
                  </div>
                  <SearchField label="Search live-rate countries" value={carrierCountrySearch} onChange={(e) => setCarrierCountrySearch(e.target.value)} placeholder="Search countries…" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto", padding: 4 }}>
                    {COUNTRIES.filter((country) => country.name.toLowerCase().includes(carrierCountrySearch.trim().toLowerCase())).map((country) => {
                      const selected = (shippoConfig?.dynamicRateCountries || []).includes(country.code);
                      return (
                        <Checkbox key={country.code} label={country.name} checked={selected} onChange={async () => {
                          // Build from the latest list (not this render's), so quick clicks don't drop a country.
                          const current = liveCountriesRef.current ?? (shippoConfig?.dynamicRateCountries || []);
                          const countries = current.includes(country.code)
                            ? current.filter((code: string) => code !== country.code)
                            : [...current, country.code];
                          liveCountriesRef.current = countries;
                          setShippoConfig((prev: any) => ({ ...prev, dynamicRateCountries: countries }));
                          try {
                            const save = liveSaveChain.current.catch(() => {}).then(() => adminApi.setShippoDynamicRates(true, countries));
                            liveSaveChain.current = save;
                            await save;
                            toast.success(`${country.name} ${selected ? "removed from" : "added to"} live rates`);
                          } catch (err: any) {
                            liveCountriesRef.current = current;
                            setShippoConfig((prev: any) => ({ ...prev, dynamicRateCountries: current }));
                            toast.error(err.message || "Failed to update live-rate countries");
                          }
                        }} />
                      );
                    })}
                  </div>
                  {(shippoConfig?.dynamicRateCountries || []).length === 0 && <p role="status" className="rp-hint" style={{ margin: 0 }}>No countries selected — all destinations currently use regular shipping rates.</p>}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 280px" }}>
              <TextField label="Shippo API key" type={showShippoApiKey ? "text" : "password"} value={shippoApiKey} autoComplete="new-password" spellCheck={false}
                placeholder={shippoConnected ? "Paste a new key to replace the current one" : "Paste your Shippo API key"}
                hint="Saved to the protected backend; the full key is never loaded back into this page."
                onChange={(e) => { setShippoApiKey(e.target.value); if (shippoMessage) setShippoMessage(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !shippoSaving) handleSaveShippoApiKey(); }} />
            </div>
            <SecondaryButton onClick={() => setShowShippoApiKey((v) => !v)} aria-pressed={showShippoApiKey}>{showShippoApiKey ? "Hide key" : "Show key"}</SecondaryButton>
            <PrimaryButton onClick={handleSaveShippoApiKey} disabled={shippoSaving || !shippoApiKey.trim()}>{shippoSaving ? "Saving…" : "Save & sync"}</PrimaryButton>
          </div>
          {shippoMessage && (
            <p role="status" style={{ margin: "12px 0 0", color: shippoMessage.type === "success" ? "var(--rp-success)" : "var(--rp-danger)", fontWeight: 600 }}>
              {shippoMessage.type === "success" ? "✓ " : "✕ "}{shippoMessage.text}
            </p>
          )}
        </SectionCard>
        )}
        {shippingView === "carrier" && <AddressFinderCard />}

        {shippingView === "profiles" && (
        <>
        <SectionHead kicker="Shipping" title="Profiles, zones & rates" subcopy="A profile is a set of zones and rates. Books use the General profile unless you assign them to another."
          actions={!isCreatingProfile && <PrimaryButton onClick={() => setIsCreatingProfile(true)}>+ Create profile</PrimaryButton>} />

        {isCreatingProfile && (
          <SectionCard title="New shipping profile" description="Define a set of rules for special items, like heavy or fragile books.">
            <TextField label="Profile name" value={newProfileName} placeholder="e.g. Heavy items, Fragile prints…" data-autofocus onChange={(e) => setNewProfileName(e.target.value)} />
            <div className="rp-card-actions">
              <span />
              <span style={{ display: "flex", gap: 8 }}>
                <SecondaryButton onClick={() => { setIsCreatingProfile(false); setNewProfileName(""); }}>Cancel</SecondaryButton>
                <PrimaryButton onClick={handleCreateProfile} disabled={!newProfileName.trim() || creatingProfile}>{creatingProfile ? "Creating…" : "Create profile"}</PrimaryButton>
              </span>
            </div>
          </SectionCard>
        )}

        {profiles.length === 0 && profilesError ? null : profiles.length === 0 ? (
          <SectionCard><EmptyState icon="🚚" title="No shipping profiles" description="Create a profile with at least one zone and rate so customers can check out." /></SectionCard>
        ) : (
          <ul className="rp-stack" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Shipping profiles">
            {profiles.map((p: any) => {
              const assigned = getAssignedProducts(p.id);
              const zonesCount = p.zones?.length || 0;
              const noRates = zonesCount === 0 || (p.zones || []).every((z: any) => !z.rates?.length);
              return (
                <li key={p.id}>
                  <SectionCard>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 className="rp-card-title" style={{ display: "inline", overflowWrap: "anywhere" }}>{p.name || "Untitled profile"}</h3>{" "}
                        {p.id === "general-profile" && <StatusBadge tone="primary">Default</StatusBadge>}{" "}
                        {noRates && <StatusBadge tone="warning">No rates yet</StatusBadge>}
                        <p className="rp-hint" style={{ margin: "6px 0 0" }}>{zonesCount} zone{zonesCount === 1 ? "" : "s"} · {assigned.length} product{assigned.length === 1 ? "" : "s"} assigned</p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <SecondaryButton onClick={() => handleSelectProfile(p)}>Manage rates</SecondaryButton>
                        {p.id !== "general-profile" && <DestructiveButton onClick={() => handleDeleteProfile(p.id)} aria-label={`Delete ${p.name} shipping profile`}>Delete</DestructiveButton>}
                      </div>
                    </div>
                  </SectionCard>
                </li>
              );
            })}
          </ul>
        )}
        </>
        )}
        {confirmNode}
      </div>
    );
  }

  // ─── Profile editor ─────────────────────────────────────────────────────────
  const assignedBooks = getAssignedProducts(editingProfile.id);
  const zones = editingProfile.zones || [];

  return (
    <div className="rp-stack">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
        <SecondaryButton onClick={async () => {
          const saved = profiles.find((p: any) => p.id === editingProfile?.id);
          const dirty = saved && JSON.stringify(saved) !== JSON.stringify(editingProfile);
          if (dirty && !(await askConfirm({ title: "Leave without saving?", message: "Your zone and rate changes to this profile haven't been saved.", confirmLabel: "Discard changes" }))) return;
          setSelectedProfileId(null); setEditingProfile(null);
        }}>← Back to profiles</SecondaryButton>
        <PrimaryButton onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile changes"}</PrimaryButton>
      </div>
      <SectionHead kicker="Profile" title={editingProfile.name || "Untitled profile"} subcopy="Zone and rate edits are applied to the profile when you save." />

      {editingProfile.id !== "general-profile" && (
        <SectionCard title="Profile name">
          <TextField label="Profile name" value={editingProfile.name} onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })} />
        </SectionCard>
      )}

      <SectionCard title="Assigned products" description="Books that use this profile's rates."
        actions={<SecondaryButton onClick={openProductModal}>Manage products ({assignedBooks.length})</SecondaryButton>}>
        {assignedBooks.length === 0 ? (
          <EmptyState icon="📦" title="No books assigned" description={editingProfile.id === "general-profile" ? "Books without another profile use these rates." : "Assign books so they use this profile's rates."} />
        ) : (
          <ul className="rp-list" style={{ margin: -20 }} aria-label="Assigned books">
            {assignedBooks.slice(0, 6).map((b: any) => <li key={b.id} style={{ padding: "10px 20px", overflowWrap: "anywhere" }}>{b.title}</li>)}
            {assignedBooks.length > 6 && <li className="rp-hint">+ {assignedBooks.length - 6} more</li>}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Profile rules" description="Apply to every rate in this profile.">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <TextField label="Free shipping over ($)" type="number" min={0} step="0.01" placeholder="e.g. 100.00"
            hint="Every rate in this profile becomes free at or above this order total."
            value={editingProfile.freeShippingOver ?? ""} onChange={(e) => setEditingProfile({ ...editingProfile, freeShippingOver: e.target.value === "" ? null : Number(e.target.value) })} />
          <TextField label="Handling / packing fee ($)" type="number" min={0} step="0.01" placeholder="0.00"
            hint="Added once per order for items in this profile."
            value={editingProfile.handlingFee ?? ""} onChange={(e) => setEditingProfile({ ...editingProfile, handlingFee: e.target.value === "" ? null : Number(e.target.value) })} />
          <TextField label="Assumed weight per book (g)" type="number" min={0} placeholder="e.g. 350"
            hint="Used for weight-based rates when a book has no weight set."
            value={editingProfile.defaultItemWeightG ?? ""} onChange={(e) => setEditingProfile({ ...editingProfile, defaultItemWeightG: e.target.value === "" ? null : Number(e.target.value) })} />
        </div>
      </SectionCard>

      <RateTester profile={editingProfile} />

      <SectionHead kicker="Zones" title="Geographic shipping zones" subcopy="A zone groups countries that share the same rates."
        actions={<span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zones.length === 0 && <SecondaryButton onClick={handleAddStarterZones}>Add starter zones</SecondaryButton>}
          <PrimaryButton onClick={() => openZoneModal()}>+ Add shipping zone</PrimaryButton>
        </span>} />

      {zones.length === 0 ? (
        <SectionCard><EmptyState icon="🌍" title="No shipping zones" description="Customers can't check out without a zone that covers their country. Add one, then give it a rate." /></SectionCard>
      ) : zones.map((z: any) => (
        <SectionCard key={z.id} title={z.name} description={`${z.countries.length} countr${z.countries.length === 1 ? "y" : "ies"}`}
          actions={
            <span style={{ display: "flex", gap: 8 }}>
              <SecondaryButton size="sm" onClick={() => openZoneModal(z)}>Edit zone</SecondaryButton>
              <SecondaryButton size="sm" onClick={() => handleDuplicateZone(z)} aria-label={`Duplicate zone ${z.name}`}>Copy</SecondaryButton>
              <DestructiveButton size="sm" onClick={() => handleDeleteZone(z.id)} aria-label={`Delete zone ${z.name}`}>Delete</DestructiveButton>
            </span>
          }>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }} aria-label={`Countries in ${z.name}`}>
            {z.countries.map((c: string) => <StatusBadge key={c}>{c}</StatusBadge>)}
          </div>
          <div className="rp-sect">Rates</div>
          {(!z.rates || z.rates.length === 0) ? (
            <p role="alert" className="rp-hint" style={{ margin: 0, padding: 12, background: "var(--rp-warning-tint)", color: "var(--rp-warning)", border: "1px solid var(--rp-warning)" }}>
              ⚠ No rates configured — customers in this zone won't have a way to ship.
            </p>
          ) : (
            <div className="rp-table-wrap" role="region" aria-label={`Rates for ${z.name}`} tabIndex={0} style={{ boxShadow: "none" }}>
              <table className="rp-table">
                <caption className="rp-sr-only">Shipping rates for {z.name}</caption>
                <thead><tr><th scope="col">Rate</th><th scope="col">Pricing</th><th scope="col">Offered when</th><th scope="col">Delivery</th><th scope="col">Actions</th></tr></thead>
                <tbody>
                  {z.rates.map((r: any) => (
                    <tr key={r.id} style={r.enabled === false ? { opacity: 0.55 } : undefined}>
                      <td className="rp-lead">{r.name}{r.enabled === false && <> <StatusBadge>Off</StatusBadge></>}</td>
                      <td>{describeRatePrice(r)}</td>
                      <td>{describeRateConditions(r) || "Always"}</td>
                      <td>{r.type === "pickup" ? "Pickup" : `${r.deliveryDays || "—"} days`}</td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                          <SecondaryButton size="sm" onClick={() => openRateModal(z.id, r)} aria-label={`Edit rate ${r.name}`}>Edit</SecondaryButton>
                          <SecondaryButton size="sm" onClick={() => handleDuplicateRate(z.id, r)} aria-label={`Duplicate rate ${r.name}`}>Copy</SecondaryButton>
                          <DestructiveButton size="sm" onClick={() => handleDeleteRate(z.id, r.id)} aria-label={`Delete rate ${r.name}`}>Delete</DestructiveButton>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="rp-card-actions"><span /><SecondaryButton size="sm" onClick={() => openRateModal(z.id)}>+ Add rate</SecondaryButton></div>
        </SectionCard>
      ))}

      {dialogs}
      {confirmNode}
    </div>
  );
}

function TestSaleWalkthrough({ payments, onOpenOrders, onOpenNotifications }: any) {
  const [data, setData] = useState<{ orders: any[]; webhook: any; emailLog: any[] } | null>(null);
  // Reads that failed: their steps are unknown, not "not done".
  const [failed, setFailed] = useState<string[]>([]);
  const load = async () => {
    const missed: string[] = [];
    const soft = <T,>(p: Promise<T>, label: string, fallback: T) => p.catch(() => { missed.push(label); return fallback; });
    const [orders, webhook, emailLog] = await Promise.all([
      soft(adminApi.getOrders(50), "orders", [] as any[]), soft(adminApi.getStripeWebhookStatus(), "Stripe webhook status", null as any), soft(adminApi.getRecentEmailLog(100), "email log", [] as any[]),
    ]);
    setFailed(missed);
    setData({ orders, webhook, emailLog });
  };
  useEffect(() => { load(); }, []);
  const steps = testSaleSteps({ payments, ...(data || { orders: [], webhook: null, emailLog: [] }) });
  const doneCount = steps.filter((st) => st.done).length;
  const go = (link: string) => {
    if (link === "orders") onOpenOrders?.();
    else if (link === "notifications") onOpenNotifications?.();
    else if (link === "storefront") window.open(`${window.location.origin}${import.meta.env.BASE_URL || "/"}`, "_blank", "noopener");
    else document.getElementById("payments-top")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <SectionCard title="Test sale walkthrough" description="Rehearse one complete sale before taking real money. Steps tick themselves from your saved settings, orders, Stripe and the email log."
      actions={<SecondaryButton size="sm" onClick={load}>Check again</SecondaryButton>}>
      <p className="rp-hint" style={{ marginTop: 0 }}>{data ? `${doneCount} of ${steps.length} done.` : "Checking…"}</p>
      {failed.length > 0 && <p role="alert" className="rp-hint" style={{ marginTop: 0, color: "var(--rp-danger)" }}>Couldn't read the {failed.join(", ")} — steps that depend on {failed.length === 1 ? "it" : "them"} are unknown, not necessarily undone. Press Check again.</p>}
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }} aria-label="Test sale steps">
        {steps.map((st, i) => (
          <li key={st.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: i ? "1px solid var(--rp-divider)" : undefined }}>
            <StatusBadge tone={st.done ? "success" : "neutral"}>{st.done ? "✓ Done" : `Step ${i + 1}`}</StatusBadge>
            <span style={{ flex: 1, minWidth: 0 }}><strong>{st.label}</strong><span className="rp-hint" style={{ display: "block" }}>{st.howTo}</span></span>
            {!st.done && <SecondaryButton size="sm" onClick={() => go(st.link)}>{st.link === "orders" ? "Open Orders" : st.link === "notifications" ? "Open Email sender" : st.link === "storefront" ? "Open shop ↗" : "Show me"}</SecondaryButton>}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

function PaymentsSettings({ settings, setSettings, originalSettings, setOriginalSettings, hasChanges, saveSection, savingSection, onOpenShipping, onOpenOrders, onOpenNotifications }: any) {
  const [askConfirm, confirmNode] = useConfirm();
  const stripe = settings.payments?.stripe || {};
  const paypal = settings.payments?.paypal || {};
  const testMode = settings.payments?.testMode || false;
  const manualMethods = settings.payments?.manualMethods || [];
  const footerBadges = settings.payments?.footerBadges || [];

  // Manual payment modal state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any | null>(null);
  const [methodName, setMethodName] = useState("");
  const [methodInstructions, setMethodInstructions] = useState("");
  const [methodType, setMethodType] = useState<"bank" | "cod" | "custom">("bank");
  const [methodEnabled, setMethodEnabled] = useState(true);

  // Bumped on save/discard so the write-only key boxes clear with the state.
  const [secretFieldsKey, setSecretFieldsKey] = useState(0);
  const [removingKey, setRemovingKey] = useState<null | "live" | "test">(null);
  const [registeringDomain, setRegisteringDomain] = useState(false);
  const removeStoredKey = async (mode: "live" | "test") => {
    if (!(await askConfirm({ title: `Remove the stored ${mode} secret key?`, message: mode === "live" ? "Live checkout will use the key set in Firebase Functions (if any) until you enter a new one." : "Test (sandbox) checkout won't work until you enter a new test key.", confirmLabel: "Remove key" }))) return;
    setRemovingKey(mode);
    try {
      await adminApi.removeStripeSecretKey(mode);
      const flag = mode === "live" ? "secretKeyStored" : "testSecretKeyStored";
      const field = mode === "live" ? "secretKey" : "testSecretKey";
      const patchOf = (prev: any) => ({ ...prev, payments: { ...prev?.payments, stripe: { ...prev?.payments?.stripe, [flag]: false, [field]: "" } } });
      setSettings(patchOf);
      setOriginalSettings?.(patchOf);
      setSecretFieldsKey((k) => k + 1);
      toast.success(`Stored ${mode} secret key removed`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't remove the key");
    } finally {
      setRemovingKey(null);
    }
  };

  const [removingPaypal, setRemovingPaypal] = useState<null | "live" | "test">(null);
  const removePaypalSecret = async (mode: "live" | "test") => {
    if (!(await askConfirm({ title: `Remove the stored ${mode} PayPal client secret?`, message: mode === "live" ? "Live PayPal will use the credentials set in Firebase Functions (if any) until you enter a new secret." : "Test (sandbox) PayPal won't work until you enter a new sandbox secret.", confirmLabel: "Remove secret" }))) return;
    setRemovingPaypal(mode);
    try {
      await adminApi.removePaypalSecret(mode);
      const flag = mode === "live" ? "clientSecretStored" : "testClientSecretStored";
      const field = mode === "live" ? "clientSecret" : "testClientSecret";
      const patchOf = (prev: any) => ({ ...prev, payments: { ...prev?.payments, paypal: { ...prev?.payments?.paypal, [flag]: false, [field]: "" } } });
      setSettings(patchOf);
      setOriginalSettings?.(patchOf);
      setSecretFieldsKey((k) => k + 1);
      toast.success(`Stored ${mode} PayPal secret removed`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't remove the secret");
    } finally {
      setRemovingPaypal(null);
    }
  };

  const updateStripe = (patch: any) => {
    setSettings({
      ...settings,
      payments: { ...settings.payments, stripe: { ...stripe, ...patch } }
    });
  };

  const updatePaypal = (patch: any) => {
    setSettings({
      ...settings,
      payments: { ...settings.payments, paypal: { ...paypal, ...patch } }
    });
  };

  const updateTestMode = async (val: boolean) => {
    const ok = await askConfirm(val
      ? { title: "Switch on test mode?", message: "Once you save, checkout only accepts Stripe and PayPal test payments (card 4242 4242 4242 4242). Real cards are refused and new orders are marked as tests that never touch stock or revenue. An alert shows on every admin page while it's on.", confirmLabel: "Use test mode" }
      : { title: "Switch off test mode?", message: "Once you save, checkout takes real payments with your live keys. Make sure the live publishable and secret keys are filled in and the webhook check passes.", confirmLabel: "Take real payments" });
    if (!ok) return;
    setSettings({
      ...settings,
      payments: { ...settings.payments, testMode: val }
    });
  };

  const openAddMethod = (type: "bank" | "cod" | "custom") => {
    let defaultName = "";
    let defaultInstructions = "";
    if (type === "bank") {
      defaultName = "Bank Deposit / e-Transfer";
      defaultInstructions = `Please send your Interac e-Transfer to ${settings.info?.email || "lyricalmyricalbooks@gmail.com"}. Use your order number as the transaction message.`;
    } else if (type === "cod") {
      defaultName = "Cash on Delivery (COD)";
      defaultInstructions = "Please prepare the exact amount of cash for your order. Our delivery agent will collect it upon delivery.";
    } else {
      defaultName = "Custom Payment Method";
      defaultInstructions = "Please follow these instructions to complete payment for your order.";
    }
    setEditingMethod(null);
    setMethodType(type);
    setMethodName(defaultName);
    setMethodInstructions(defaultInstructions);
    // Cash on delivery starts off: switch it on once you're ready to collect cash.
    setMethodEnabled(type !== "cod");
    setIsManualModalOpen(true);
  };

  const openEditMethod = (method: any) => {
    setEditingMethod(method);
    setMethodType(method.type);
    setMethodName(method.name);
    setMethodInstructions(method.instructions);
    setMethodEnabled(method.enabled);
    setIsManualModalOpen(true);
  };

  const handleSaveMethod = () => {
    if (!methodName.trim()) {
      toast.error("Please enter a payment method name.");
      return;
    }

    let updatedMethods = [];
    if (editingMethod) {
      updatedMethods = manualMethods.map((m: any) =>
        m.id === editingMethod.id
          ? { ...m, name: methodName, instructions: methodInstructions, enabled: methodEnabled }
          : m
      );
    } else {
      const newMethod = {
        id: `manual_${Date.now()}`,
        type: methodType,
        name: methodName,
        instructions: methodInstructions,
        enabled: methodEnabled
      };
      updatedMethods = [...manualMethods, newMethod];
    }

    setSettings({
      ...settings,
      payments: {
        ...settings.payments,
        manualMethods: updatedMethods
      }
    });
    setIsManualModalOpen(false);
  };

  const handleDeleteMethod = (id: string) => {
    const updatedMethods = manualMethods.filter((m: any) => m.id !== id);
    setSettings({
      ...settings,
      payments: {
        ...settings.payments,
        manualMethods: updatedMethods
      }
    });
  };

  const handleToggleMethodStatus = (id: string, enabled: boolean) => {
    const updatedMethods = manualMethods.map((m: any) =>
      m.id === id ? { ...m, enabled } : m
    );
    setSettings({
      ...settings,
      payments: {
        ...settings.payments,
        manualMethods: updatedMethods
      }
    });
  };

  const enabledManual = manualMethods.filter((m: any) => m.enabled);
  const dirty = hasChanges("payments");
  useSettingsDirty("payments", dirty);
  const stripeLive = !!stripe.connected;
  const paypalLive = !!paypal.connected;
  const secretStored = !!(stripe.secretKey || stripe.testSecretKey || stripe.secretKeyStored || stripe.testSecretKeyStored);
  const paymentIssues = useMemo(() => paymentHealth(settings.payments), [settings.payments]);

  const removeMethod = async (m: any) => {
    if (!(await askConfirm({ title: "Delete this payment method?", message: `“${m.name}” will no longer be offered at checkout once you save.`, confirmLabel: "Delete method" }))) return;
    handleDeleteMethod(m.id);
  };

  return (
    <div className="rp-stack" id="payments-top">
      <SectionCard title="Payment overview" description="What customers can pay with right now.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <StatusBadge tone={testMode ? "warning" : "success"}>{testMode ? "Test mode — no real charges" : "Live mode"}</StatusBadge>
          <StatusBadge tone={stripeLive ? "success" : "neutral"}>Stripe {stripeLive ? "on" : "off"}</StatusBadge>
          <StatusBadge tone={paypalLive ? "success" : "neutral"}>PayPal {paypalLive ? "on" : "off"}</StatusBadge>
          <StatusBadge tone={enabledManual.length ? "info" : "neutral"}>{enabledManual.length} manual method{enabledManual.length === 1 ? "" : "s"}</StatusBadge>
          {!stripeLive && !paypalLive && enabledManual.length === 0 && <StatusBadge tone="danger">No way to pay is enabled</StatusBadge>}
        </div>
        <p className="rp-hint" style={{ margin: "12px 0 0" }}>
          The amount charged is always calculated by the payment server, never in the browser. Orders are created unpaid and are marked paid only when the Stripe webhook confirms the payment.
        </p>
        {paymentIssues.length === 0 ? (
          <p role="status" style={{ padding: 12, background: "var(--rp-success-tint)", color: "var(--rp-success)", border: "1px solid var(--rp-success)" }}><strong>✓ Payment configuration is launch-ready.</strong></p>
        ) : (
          <ul className="rp-list" aria-label="Payment readiness issues" style={{ marginTop: 16, border: "1px solid var(--rp-border)" }}>
            {paymentIssues.map((issue) => <li key={issue.id} style={{ padding: 12 }}><StatusBadge tone={issue.severity === "blocking" ? "danger" : "warning"}>{issue.severity}</StatusBadge> <strong style={{ marginLeft: 8 }}>{issue.label}</strong><span className="rp-hint" style={{ display: "block", marginTop: 4 }}>{issue.detail}</span></li>)}
          </ul>
        )}
        <div className="rp-card-actions">
          <Toggle label="Test (sandbox) mode" checked={!!testMode} onChange={updateTestMode} />
          <span className="rp-hint">In test mode Stripe and PayPal process test charges and orders are flagged as test orders.</span>
        </div>
      </SectionCard>

      <TestSaleWalkthrough payments={originalSettings?.payments} onOpenOrders={onOpenOrders} onOpenNotifications={onOpenNotifications} />

      <SectionCard title="Stripe" description="Accept credit and debit cards, Apple Pay and Google Pay."
        actions={<SecondaryButton size="sm" onClick={() => window.open("https://dashboard.stripe.com", "_blank", "noopener")}>Stripe dashboard ↗</SecondaryButton>}>
        <div className="rp-stack" style={{ gap: 20 }}>
          <Toggle label="Stripe checkout" checked={!!stripe.connected} onChange={(v) => updateStripe({ connected: v })} />
          {stripe.connected && (
            <>
              {secretStored && (
                <div style={{ padding: 16, background: "var(--rp-warning-tint)", border: "2px solid var(--rp-border-strong)" }}>
                  <strong>🔒 Secret key stored privately.</strong>{" "}
                  Secret keys are kept in an admin-only store the storefront cannot read.
                  {stripe.keysWerePublic && " A key was once saved where the storefront could read it and has since been moved — rotate it in the Stripe Dashboard to be safe."}
                </div>
              )}
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 0.75 : 1 }}>
                  <div className="rp-sect">Live keys {!testMode && "· in use"}</div>
                  <div className="rp-stack" style={{ gap: 12 }}>
                    <TextField label="Publishable key" placeholder="pk_live_…" spellCheck={false} value={stripe.publicKey || ""} onChange={(e) => updateStripe({ publicKey: e.target.value })} />
                    <SecretField key={`live-${secretFieldsKey}`} label="Secret key" placeholder="sk_live_…" stored={!!stripe.secretKeyStored}
                      validate={(v) => stripeSecretKeyProblem(v, "live")} onCommit={(v) => updateStripe({ secretKey: v })}
                      onRemove={stripe.secretKeyStored ? () => removeStoredKey("live") : undefined} removing={removingKey === "live"} />
                  </div>
                </div>
                <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 1 : 0.75 }}>
                  <div className="rp-sect">Test keys {testMode && "· in use"}</div>
                  <div className="rp-stack" style={{ gap: 12 }}>
                    <TextField label="Test publishable key" placeholder="pk_test_…" spellCheck={false} value={stripe.testPublicKey || ""} onChange={(e) => updateStripe({ testPublicKey: e.target.value })} />
                    <SecretField key={`test-${secretFieldsKey}`} label="Test secret key" placeholder="sk_test_…" stored={!!stripe.testSecretKeyStored}
                      validate={(v) => stripeSecretKeyProblem(v, "test")} onCommit={(v) => updateStripe({ testSecretKey: v })}
                      onRemove={stripe.testSecretKeyStored ? () => removeStoredKey("test") : undefined} removing={removingKey === "test"} />
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <Toggle label="Apple Pay" checked={!!stripe.applePay} onChange={(v) => updateStripe({ applePay: v })} />
                <Toggle label="Google Pay" checked={!!stripe.googlePay} onChange={(v) => updateStripe({ googlePay: v })} />
              </div>
              <div className="rp-card" style={{ padding: 16, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
                <div className="rp-sect">Apple Pay &amp; Google Pay</div>
                <p className="rp-hint" style={{ marginTop: 0 }}>
                  Wallet buttons only show in the card form once this site's address is registered with Stripe. Save your Stripe keys first.
                </p>
                <SecondaryButton size="sm" disabled={registeringDomain} onClick={async () => {
                  if (registeringDomain) return;
                  setRegisteringDomain(true);
                  try {
                    const r = await adminApi.registerStripePaymentDomain(window.location.origin);
                    toast.success(`${r.domain}: Apple Pay ${r.applePay}, Google Pay ${r.googlePay}`);
                  } catch (err: any) {
                    toast.error(err.message || "Couldn't register this site with Stripe");
                  } finally {
                    setRegisteringDomain(false);
                  }
                }}>{registeringDomain ? "Registering…" : "Register this site with Stripe"}</SecondaryButton>
              </div>
              <StripeWebhookHealth unsaved={dirty} />
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="PayPal" description="Let customers pay with PayPal.">
        <div className="rp-stack" style={{ gap: 20 }}>
          <Toggle label="PayPal checkout" checked={!!paypal.connected} onChange={(v) => updatePaypal({ connected: v })} />
          {paypal.connected && (
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 0.75 : 1 }}>
                <div className="rp-sect">Live credentials {!testMode && "· in use"}</div>
                <div className="rp-stack" style={{ gap: 12 }}>
                  <TextField label="Live client ID" placeholder="Client ID…" spellCheck={false} value={paypal.clientId || ""} onChange={(e) => updatePaypal({ clientId: e.target.value })} />
                  <SecretField key={`pp-live-${secretFieldsKey}`} label="Live client secret" placeholder="Client secret…" stored={!!paypal.clientSecretStored}
                    onCommit={(v) => updatePaypal({ clientSecret: v })}
                    onRemove={paypal.clientSecretStored ? () => removePaypalSecret("live") : undefined} removing={removingPaypal === "live"} />
                  <p className="rp-hint" style={{ margin: 0 }}>Live PayPal uses the ID and secret saved here. If either is blank it uses the PayPal credentials set in Firebase Functions.</p>
                </div>
              </div>
              <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 1 : 0.75 }}>
                <div className="rp-sect">Test (sandbox) credentials {testMode && "· in use"}</div>
                <div className="rp-stack" style={{ gap: 12 }}>
                  <TextField label="Test client ID" placeholder="Sandbox client ID…" spellCheck={false} value={paypal.testClientId || ""} onChange={(e) => updatePaypal({ testClientId: e.target.value })} />
                  <SecretField key={`pp-test-${secretFieldsKey}`} label="Test client secret" placeholder="Sandbox client secret…" stored={!!paypal.testClientSecretStored}
                    onCommit={(v) => updatePaypal({ testClientSecret: v })}
                    onRemove={paypal.testClientSecretStored ? () => removePaypalSecret("test") : undefined} removing={removingPaypal === "test"} />
                  <p className="rp-hint" style={{ margin: 0 }}>Test mode never uses live PayPal credentials. Without both sandbox values, PayPal checkout is refused while test mode is on.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Shippo" description="Address checks, live carrier rates and shipping labels are set up with your shipping rules."
        actions={<SecondaryButton size="sm" onClick={() => onOpenShipping?.()}>Open Shipping › Carrier &amp; labels</SecondaryButton>}>
        <p className="rp-hint" style={{ margin: 0 }}>The Shippo key and the countries that use live rates live in one place, so live rates can't be switched on without choosing countries.</p>
      </SectionCard>

      <SectionCard title="Manual payment methods" description="Bank e-Transfer, cash on delivery or your own instructions."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <SecondaryButton size="sm" onClick={() => openAddMethod("bank")}>+ e-Transfer</SecondaryButton>
            <SecondaryButton size="sm" onClick={() => openAddMethod("cod")}>+ Cash on delivery</SecondaryButton>
            <SecondaryButton size="sm" onClick={() => openAddMethod("custom")}>+ Custom</SecondaryButton>
          </div>
        }>
        {manualMethods.length === 0 ? (
          <EmptyState icon="💳" title="No manual methods" description="Add an e-Transfer or cash-on-delivery option for customers who don't pay by card." />
        ) : (
          <ul className="rp-list" style={{ margin: -20 }} aria-label="Manual payment methods">
            {manualMethods.map((method: any) => (
              <li key={method.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <strong>{method.name}</strong> <StatusBadge tone={method.enabled ? "success" : "neutral"}>{method.enabled ? "Enabled" : "Off"}</StatusBadge>
                  <p className="rp-hint" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>{method.instructions}</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Toggle label={`${method.name} enabled`} checked={!!method.enabled} onChange={(v) => handleToggleMethodStatus(method.id, v)} />
                  <SecondaryButton size="sm" onClick={() => openEditMethod(method)} aria-label={`Edit ${method.name}`}>Edit</SecondaryButton>
                  <DestructiveButton size="sm" onClick={() => removeMethod(method)} aria-label={`Delete ${method.name}`}>Delete</DestructiveButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Footer payment icons" description="Default icons for the storefront footer. Studio › Theme settings › Payment icons overrides this list once you change it there."
        actions={<SecondaryButton size="sm" onClick={() => { window.location.hash = studioHash({ leftTab: "style" }); }}>Open Studio</SecondaryButton>}>
        <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {[
            { id: "visa", label: "Visa" }, { id: "mastercard", label: "Mastercard" }, { id: "amex", label: "American Express" },
            { id: "paypal", label: "PayPal" }, { id: "applepay", label: "Apple Pay" }, { id: "googlepay", label: "Google Pay" },
            // Afterpay / Klarna aren't offered at checkout; shown only if an older save picked them.
            ...[{ id: "afterpay", label: "Afterpay" }, { id: "klarna", label: "Klarna" }].filter((b) => footerBadges.includes(b.id)),
          ].map((badge) => (
            <Checkbox key={badge.id} label={badge.label} checked={footerBadges.includes(badge.id)}
              onChange={() => {
                const next = footerBadges.includes(badge.id) ? footerBadges.filter((b: string) => b !== badge.id) : [...footerBadges, badge.id];
                setSettings({ ...settings, payments: { ...settings.payments, footerBadges: next } });
              }} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Currency" description="How prices are shown and charged.">
        <p className="rp-hint" style={{ margin: 0 }}>Prices are set and charged in your store currency (CA$). Any currency selector on the storefront is a display convenience; the amount charged is always calculated by the payment server.</p>
      </SectionCard>

      <SaveBar dirty={dirty} saving={savingSection === "payments"} message="You have unsaved payment settings."
        onSave={async () => { if (await saveSection("payments", { payments: settings.payments })) { setSecretFieldsKey((k) => k + 1); toast.success("Payment settings saved"); } }}
        onDiscard={() => { setSettings({ ...settings, payments: JSON.parse(JSON.stringify(originalSettings?.payments ?? {})) }); setSecretFieldsKey((k) => k + 1); }} />

      <Dialog open={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} title={editingMethod ? "Edit payment method" : "Add payment method"} badge="💳"
        footer={<>
          <SecondaryButton onClick={() => setIsManualModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveMethod}>{editingMethod ? "Update method" : "Add method"}</PrimaryButton>
        </>}>
        <div className="rp-stack" style={{ gap: 16 }}>
          <TextField label="Payment method title" value={methodName} placeholder="e.g. Bank deposit, Interac e-Transfer" onChange={(e) => setMethodName(e.target.value)} data-autofocus />
          <TextArea label="Customer instructions" rows={5} value={methodInstructions} onChange={(e) => setMethodInstructions(e.target.value)}
            placeholder="e.g. Send your e-Transfer to payments@example.com and use your order number as the message." hint="Shown to the customer after they place the order." />
          <Toggle label="Offer this method at checkout" checked={methodEnabled} onChange={setMethodEnabled} />
        </div>
      </Dialog>
      {confirmNode}
    </div>
  );
}

/** Write-only field for secrets: never echoes the stored value back into the page. */
// Write-only key box. Every edit is passed up (clearing the box cancels the change),
// a key that fails `validate` is never passed up, and a stored key can be removed.
export function SecretField({ label, placeholder, stored, onCommit, validate, onRemove, removing }: {
  label: string; placeholder: string; stored: boolean; onCommit: (v: string) => void;
  validate?: (v: string) => string; onRemove?: () => void; removing?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const problem = validate ? validate(draft) : "";
  return (
    <div>
      <TextField label={label} type="password" autoComplete="new-password" spellCheck={false} value={draft} placeholder={stored ? "Stored — enter a new key to replace it" : placeholder}
        error={problem || undefined}
        hint={!problem && stored ? "✓ A key is stored. It is never shown here." : undefined}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          const trimmed = value.trim();
          onCommit(validate && validate(trimmed) ? "" : trimmed);
        }} />
      {stored && onRemove && (
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" style={{ marginTop: 6 }} disabled={removing} onClick={onRemove}>
          {removing ? "Removing…" : "Remove stored key"}
        </button>
      )}
    </div>
  );
}


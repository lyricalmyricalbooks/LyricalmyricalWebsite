import { useEffect, useState, type ReactNode } from "react";
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../../lib/firebase";
import { HowTo, friendlyError } from "./settingsLayout";
import { CLAUDE_CAPS, DEFAULT_CLAUDE_CAP, DEFAULT_OPENROUTER_MODEL, aiKeyProblem, checkAiKey, claudeKeyProblem, claudeMeter, openRouterKeyProblem, openRouterModelProblem, usd, type AiProvider, type ClaudeChoice } from "./aiWriter";
import { Checkbox, GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField, useConfirm } from "./riso/components";

type Check = { ok: boolean; message: string } | null;
const VOICE_MAX = 1000;
const NAMES: Record<AiProvider, string> = { openrouter: "OpenRouter", gemini: "Google Gemini", claude: "Claude" };
const FIELDS: Record<AiProvider, string> = { openrouter: "openrouterKey", gemini: "geminiKey", claude: "claudeKey" };
const NONE: Record<AiProvider, boolean> = { gemini: false, openrouter: false, claude: false };
const REST_TEXT = {
  credits: "Paused: your Claude credits ran out. Add credits, then try again.",
  limit: "Paused: your Anthropic monthly spending limit was reached.",
  cap: "Paused until next month: this month's limit is used up.",
};
const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");
const aiDoc = () => doc(db, "adminSecrets", "ai");
const usageDoc = () => doc(db, "adminSecrets", "claudeUsage");

// Keys for the admin's Write with AI buttons: Google Gemini (free), OpenRouter and/or Claude (prepaid credits). Stored
// in the admin-only adminSecrets/ai doc (firestore.rules) and used only by the createStripeCheckoutSession `aiWrite`
// action; never sent to shoppers. With several saved, `provider` says which one writes (functions/aiWriter.js
// pickProvider). Claude's spend this month and any pause are in adminSecrets/claudeUsage (functions/aiClaude.js).
export function AiWriterCard() {
  const [stored, setStored] = useState<Record<AiProvider, boolean> | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [provider, setProvider] = useState<AiProvider | "">("");
  const [model, setModel] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const [voice, setVoice] = useState("");
  const [savedVoice, setSavedVoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [claudeModel, setClaudeModel] = useState<ClaudeChoice>("quick");
  const [claudeCap, setClaudeCap] = useState(DEFAULT_CLAUDE_CAP);
  const [claudeBackup, setClaudeBackup] = useState(true);
  const [usage, setUsage] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryNote, setRetryNote] = useState<Check>(null);

  const load = () => {
    setReadFailed(false);
    setStored(null);
    getDoc(aiDoc())
      .then((snap) => {
        const data = snap.exists() ? snap.data() || {} : {};
        setStored({ gemini: Boolean(data.geminiKey), openrouter: Boolean(data.openrouterKey), claude: Boolean(data.claudeKey) });
        setProvider(data.provider === "gemini" || data.provider === "openrouter" || data.provider === "claude" ? data.provider : "");
        setClaudeModel(data.claudeModel === "best" ? "best" : "quick");
        setClaudeCap(CLAUDE_CAPS.includes(Number(data.claudeCap)) && data.claudeCap !== "" && data.claudeCap != null ? Number(data.claudeCap) : DEFAULT_CLAUDE_CAP);
        setClaudeBackup(data.claudeBackup !== false);
        setModel(String(data.openrouterModel || ""));
        setSavedModel(String(data.openrouterModel || ""));
        setVoice(String(data.voice || ""));
        setSavedVoice(String(data.voice || ""));
      })
      .catch(() => setReadFailed(true));
    loadUsage();
  };
  const loadUsage = () => getDoc(usageDoc()).then((snap) => setUsage(snap.exists() ? snap.data() || {} : {})).catch(() => setUsage({}));
  useEffect(() => { load(); }, []);

  // Same order as the server: the owner's choice when that key is saved, else OpenRouter, else Gemini, else Claude.
  const active: AiProvider | null = !stored ? null
    : provider && stored[provider] ? provider : stored.openrouter ? "openrouter" : stored.gemini ? "gemini" : stored.claude ? "claude" : null;
  const savedCount = stored ? (Object.keys(stored) as AiProvider[]).filter((k) => stored[k]).length : 0;
  const meter = claudeMeter(usage, claudeCap);

  const save = async (fields: Record<string, unknown>, done: string) => {
    setSaving(true);
    try {
      await setDoc(aiDoc(), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
      toast.success(done);
      return true;
    } catch (err: any) {
      toast.error(friendlyError(err, "save the AI settings"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async (which: AiProvider, value: string) => {
    // A first Claude key also makes Claude the one that writes (the owner can switch back below).
    const pickClaude = which === "claude" && value && !stored?.claude;
    const ok = await save({ [FIELDS[which]]: value || deleteField(), ...(pickClaude ? { provider: "claude" } : {}) },
      value ? (pickClaude ? "Claude key saved. Claude writes the drafts now" : `${NAMES[which]} key saved`) : `${NAMES[which]} key removed`);
    if (ok) {
      setStored((s) => ({ ...(s || NONE), [which]: Boolean(value) }));
      if (pickClaude) setProvider("claude");
    }
    return ok;
  };

  const saveClaude = async (fields: Record<string, unknown>, done: string, undo: () => void) => {
    if (!(await save(fields, done))) undo();
  };

  // Try again after adding credits: clears the pause, then asks Claude once (the server pauses it again if still empty).
  const retryClaude = async () => {
    setRetrying(true);
    setRetryNote(null);
    try {
      await setDoc(usageDoc(), { paused: deleteField() }, { merge: true });
    } catch { /* the server clears it too */ }
    const result = await checkAiKey("claude");
    setRetryNote(result.ok ? { ok: true, message: "Claude is back. The Write with AI buttons use it again." } : result);
    await loadUsage();
    setRetrying(false);
  };

  const saveProvider = async (next: AiProvider) => {
    const before = provider;
    setProvider(next);
    if (!(await save({ provider: next }, `${NAMES[next]} writes the drafts now`))) setProvider(before);
  };

  const saveModel = async () => {
    const next = model.trim();
    if (await save({ openrouterModel: next || deleteField() }, next ? "OpenRouter model saved" : "OpenRouter uses Google's newest Gemini Flash again")) {
      setModel(next);
      setSavedModel(next);
    }
  };

  const saveVoice = async () => {
    const next = voice.trim().slice(0, VOICE_MAX);
    if (await save({ voice: next }, "House style saved")) {
      setVoice(next);
      setSavedVoice(next);
    }
  };

  const modelProblem = openRouterModelProblem(model);

  return (
    <SectionCard title="AI writing assistant"
      description="Drafts titles, blurbs and photo text. You approve."
      actions={stored !== null && <StatusBadge tone={active ? "success" : "neutral"}>{active ? `On · ${NAMES[active]}` : "Off"}</StatusBadge>}>
      <p className="rp-hint" style={{ margin: "0 0 12px" }}>Only public catalog facts go out. Never customers, orders or costs.</p>
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "0 0 12px", color: "var(--rp-danger)" }}>
          ✕ Couldn't read which keys are saved. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={load}>Try again</button>
        </p>
      )}
      {savedCount > 1 && (
        <div style={{ marginBottom: 16 }}>
          <SelectField label="Which AI writes the drafts" value={active || "openrouter"} disabled={saving}
            hint="If this one runs dry, another saved one takes over."
            onChange={(e) => saveProvider(e.target.value as AiProvider)}>
            {stored?.claude && <option value="claude">Claude</option>}
            {stored?.openrouter && <option value="openrouter">OpenRouter</option>}
            {stored?.gemini && <option value="gemini">Google Gemini</option>}
          </SelectField>
        </div>
      )}

      <KeySlot which="claude" stored={stored?.claude ?? null} saving={saving} problem={claudeKeyProblem} placeholder="sk-ant-…"
        steps={<>
          <li>Open <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com</a> and sign in.</li>
          <li>In <strong>Billing</strong>, buy credits ($5 is plenty to start) and make sure <strong>Auto reload is off</strong>. Then you are never charged more than you bought.</li>
          <li>In <strong>Limits</strong>, set a monthly spend limit as a second safety catch.</li>
          <li>In <strong>API keys</strong>, choose <strong>Create key</strong>, name it "Shop", copy it (it starts with sk-ant-) and paste it here.</li>
        </>}
        onSave={(v) => saveKey("claude", v)} />
      {stored?.claude && (
        <div className="ai-claude" style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div role="status" className="rp-hint" style={{ margin: 0, padding: 12, border: "1px solid var(--rp-line, currentColor)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <span>
              <strong>This month:</strong> {usage === null ? "…" : `${usd(meter.spentMicros)}${claudeCap > 0 ? ` of $${claudeCap}` : ""} · ${meter.drafts} ${meter.drafts === 1 ? "draft" : "drafts"}`}
            </span>
            {meter.rest && <StatusBadge tone="danger">Paused</StatusBadge>}
          </div>
          {meter.rest && (
            <div role="alert" className="rp-hint" style={{ margin: 0, padding: 12, border: "1px solid var(--rp-danger)", color: "var(--rp-danger)", background: "var(--rp-danger-tint)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 240px" }}>{REST_TEXT[meter.rest]}</span>
              {meter.rest !== "cap" && <SecondaryButton disabled={retrying} onClick={retryClaude}>{retrying ? "Trying…" : "Try again"}</SecondaryButton>}
            </div>
          )}
          {retryNote && (
            <p role="status" className="rp-hint" style={{ margin: 0, padding: 12, border: `1px solid var(${tone(retryNote.ok)})`, color: `var(${tone(retryNote.ok)})`, background: `var(${tone(retryNote.ok)}-tint)` }}>
              {retryNote.ok ? "✓ " : "✕ "}{retryNote.message}
            </p>
          )}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <SelectField label="Claude model" value={claudeModel} disabled={saving}
              hint={claudeModel === "best" ? "Up to about 1¢ a draft." : "About 3¢ per 100 drafts."}
              onChange={(e) => { const before = claudeModel; const next = e.target.value as ClaudeChoice; setClaudeModel(next); saveClaude({ claudeModel: next }, next === "best" ? "Claude uses Best writing" : "Claude uses Quick", () => setClaudeModel(before)); }}>
              <option value="quick">Quick (cheapest)</option>
              <option value="best">Best writing</option>
            </SelectField>
            <SelectField label="Monthly limit" value={String(claudeCap)} disabled={saving}
              hint="Claude pauses when it's reached."
              onChange={(e) => { const before = claudeCap; const next = Number(e.target.value); setClaudeCap(next); saveClaude({ claudeCap: next }, next ? `Claude stops at $${next} a month` : "No monthly limit. Your credits still cap it", () => setClaudeCap(before)); }}>
              {CLAUDE_CAPS.map((c) => <option key={c} value={String(c)}>{c ? `$${c} a month` : "No limit (credits still cap it)"}</option>)}
            </SelectField>
          </div>
          {savedCount > 1 && (
            <Checkbox label="While Claude is paused, let another saved AI write" checked={claudeBackup} disabled={saving}
              onChange={(e) => { const next = e.target.checked; setClaudeBackup(next); saveClaude({ claudeBackup: next }, next ? "Another AI writes while Claude is paused" : "Nothing writes while Claude is paused", () => setClaudeBackup(!next)); }} />
          )}
        </div>
      )}

      <KeySlot which="openrouter" stored={stored?.openrouter ?? null} saving={saving} problem={openRouterKeyProblem} placeholder="sk-or-…"
        steps={<>
          <li>Open <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a> and sign in (a Google account works).</li>
          <li>Choose <strong>Create API key</strong>, give it a name such as "Shop", and copy the key (it starts with sk-or-). You can set a spending limit on the key there.</li>
          <li>Paste it here and choose Save key. Paid models need credits at <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer">openrouter.ai/credits</a>; models whose name ends in <strong>:free</strong> cost nothing but allow only a few drafts a minute.</li>
        </>}
        onSave={(v) => saveKey("openrouter", v)} />
      {stored?.openrouter && (
        <div style={{ marginTop: 12 }}>
          <TextField label="OpenRouter model (optional)" value={model} autoComplete="off" spellCheck={false}
            placeholder={DEFAULT_OPENROUTER_MODEL}
            hint={`Leave blank for Google's newest Gemini Flash (${DEFAULT_OPENROUTER_MODEL}). Copy any model's name from openrouter.ai/models. Describe with AI needs a model that can read images.`}
            error={modelProblem || undefined}
            onChange={(e) => setModel(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <SecondaryButton disabled={saving || readFailed || Boolean(modelProblem) || model.trim() === savedModel} onClick={saveModel}>Save model</SecondaryButton>
          </div>
        </div>
      )}

      <KeySlot which="gemini" stored={stored?.gemini ?? null} saving={saving} problem={aiKeyProblem} placeholder="AIza…"
        steps={<>
          <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> and sign in with the shop's Google account.</li>
          <li>Choose <strong>Create API key</strong> (pick or create any Google Cloud project). The free tier needs no card.</li>
          <li>Paste the key here and choose Save key. The free tier allows about 10 drafts a minute and a few hundred a day.</li>
        </>}
        onSave={(v) => saveKey("gemini", v)} />
      <p className="rp-hint" style={{ margin: "12px 0 0" }}>Capped at 40 drafts per 10 minutes.</p>

      <div style={{ marginTop: 16 }}>
        <TextArea label="House style (optional)" rows={3} maxLength={VOICE_MAX} value={voice}
          placeholder="e.g. Warm and plain-spoken. Canadian spelling. Mention that our books are risograph-printed in Toronto when it's true."
          hint={`Guidance the AI follows for every draft. ${voice.length}/${VOICE_MAX} characters.`}
          onChange={(e) => setVoice(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <SecondaryButton disabled={saving || readFailed || voice.trim() === savedVoice} onClick={saveVoice}>Save house style</SecondaryButton>
        </div>
      </div>
    </SectionCard>
  );
}

/** One service's key: how to get it, the password box, Save / Check / Remove and the check result. */
function KeySlot({ which, stored, saving, problem, placeholder, steps, onSave }: {
  which: AiProvider; stored: boolean | null; saving: boolean; problem: (v: string) => string; placeholder: string;
  steps: ReactNode; onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<Check>(null);
  const [confirm, confirmNode] = useConfirm();
  const name = NAMES[which];
  const cleaned = draft.trim();
  const error = problem(cleaned);

  const verify = async () => {
    setChecking(true);
    setCheck(null);
    setCheck(await checkAiKey(which));
    setChecking(false);
  };
  const save = async (value: string) => {
    if (!(await onSave(value))) return;
    setDraft("");
    setCheck(null);
    if (value) await verify();
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Remove the ${name} key?`,
      message: `The shop stops using ${name}. If the other key is saved, it writes the drafts instead; with no key the Write with AI buttons ask you to add one. Auto-fill (without AI) keeps working.`,
      confirmLabel: "Remove key",
    });
    if (ok) await save("");
  };

  return (
    <section aria-label={`${name} key`} style={{ marginTop: 20 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: "var(--rp-text-base)", fontWeight: 800 }}>{name}</h3>
      <HowTo summary={`Get ${which === "openrouter" ? "an" : "a"} ${name} key`} open={stored === false}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>{steps}</ol>
      </HowTo>
      <TextField label={`${name} API key`} type="password" value={draft} autoComplete="off"
        placeholder={stored ? "Stored — enter a new key to replace it" : placeholder}
        hint={stored === null ? "Checking…" : stored ? "✓ A key is stored. It is never shown here." : "No key yet."}
        error={error || undefined}
        onChange={(e) => setDraft(e.target.value)} />
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <PrimaryButton disabled={!cleaned || Boolean(error) || saving} onClick={() => save(cleaned)}>
          {saving ? "Saving…" : "Save key"}
        </PrimaryButton>
        {stored && <SecondaryButton disabled={checking || saving} onClick={verify}>{checking ? "Checking…" : "Check key"}</SecondaryButton>}
        {stored && <GhostButton disabled={saving} onClick={remove}>Remove</GhostButton>}
      </div>
      {check && (
        <p role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${tone(check.ok)})`, color: `var(${tone(check.ok)})`, background: `var(${tone(check.ok)}-tint)` }}>
          {check.ok ? "✓ " : "✕ "}{check.message}
        </p>
      )}
      {confirmNode}
    </section>
  );
}

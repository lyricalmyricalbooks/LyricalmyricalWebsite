import { useEffect, useState } from "react";
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../../lib/firebase";
import { aiKeyProblem, checkAiKey } from "./aiWriter";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextArea, TextField, useConfirm } from "./riso/components";

type Check = { ok: boolean; message: string } | null;
const VOICE_MAX = 1000;

// Google Gemini key for the admin's Write with AI buttons. Stored in the admin-only adminSecrets/ai doc
// (firestore.rules) and used only by the createStripeCheckoutSession `aiWrite` action; never sent to shoppers.
export function AiWriterCard() {
  const [stored, setStored] = useState<boolean | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [voice, setVoice] = useState("");
  const [savedVoice, setSavedVoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<Check>(null);
  const [confirm, confirmNode] = useConfirm();

  const load = () => {
    setReadFailed(false);
    setStored(null);
    getDoc(doc(db, "adminSecrets", "ai"))
      .then((snap) => {
        const data = snap.exists() ? snap.data() || {} : {};
        setStored(Boolean(data.geminiKey));
        setVoice(String(data.voice || ""));
        setSavedVoice(String(data.voice || ""));
      })
      .catch(() => setReadFailed(true));
  };
  useEffect(() => { load(); }, []);

  const cleaned = draft.trim();
  const problem = aiKeyProblem(cleaned);

  const verify = async () => {
    setChecking(true);
    setCheck(null);
    setCheck(await checkAiKey());
    setChecking(false);
  };

  const saveKey = async (value: string) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "adminSecrets", "ai"), { geminiKey: value || deleteField(), updatedAt: serverTimestamp() }, { merge: true });
      setStored(Boolean(value));
      setDraft("");
      setCheck(null);
      toast.success(value ? "Google AI key saved" : "Google AI key removed");
      if (value) await verify();
    } catch (err: any) {
      toast.error(`Could not save: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const saveVoice = async () => {
    setSaving(true);
    try {
      const next = voice.trim().slice(0, VOICE_MAX);
      await setDoc(doc(db, "adminSecrets", "ai"), { voice: next, updatedAt: serverTimestamp() }, { merge: true });
      setVoice(next);
      setSavedVoice(next);
      toast.success("House style saved");
    } catch (err: any) {
      toast.error(`Could not save: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove the Google AI key?",
      message: "The Write with AI buttons stop working until you add a key again. Auto-fill (without AI) keeps working.",
      confirmLabel: "Remove key",
    });
    if (ok) await saveKey("");
  };

  const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");

  return (
    <SectionCard title="AI writing assistant"
      description="Adds Write with AI buttons that draft search titles and descriptions (Books › edit › Search (SEO), Studio › Pages) book descriptions (Books › edit › Details) and photo descriptions (Books › edit › Images › Describe with AI, which shows Gemini the photo), using Google's Gemini with a free key. You always see the draft first; nothing is saved until you save the book or page."
      actions={stored !== null && <StatusBadge tone={stored ? "success" : "neutral"}>{stored ? "On" : "Off"}</StatusBadge>}>
      <ol className="rp-hint" style={{ margin: "0 0 12px", paddingLeft: 20, lineHeight: 1.6 }}>
        <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> and sign in with the shop's Google account.</li>
        <li>Choose <strong>Create API key</strong> (pick or create any Google Cloud project). The free tier needs no card.</li>
        <li>Paste the key here and choose Save key. The free tier allows about 10 drafts a minute and a few hundred a day; the shop also stops at 40 drafts per 10 minutes.</li>
      </ol>
      <p className="rp-hint" style={{ margin: "0 0 12px" }}>
        On the free tier Google may use what is sent to improve its products. The shop only sends public catalog facts (title, author, format, categories, description) — never customers, orders, costs or stock.
      </p>
      <TextField label="Google AI Studio API key" type="password" value={draft} autoComplete="off"
        placeholder={stored ? "Stored — enter a new key to replace it" : "AIza…"}
        hint={readFailed ? "Couldn't check whether a key is stored." : stored === null ? "Checking…" : stored ? "✓ A key is stored. It is never shown here." : "No key yet: the Write with AI buttons ask you to add one."}
        error={problem || undefined}
        onChange={(e) => setDraft(e.target.value)} />
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "8px 0 0", color: "var(--rp-danger)" }}>
          ✕ Couldn't read the saved key status. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={load}>Try again</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <PrimaryButton disabled={!cleaned || Boolean(problem) || saving} onClick={() => saveKey(cleaned)}>
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
      <div style={{ marginTop: 16 }}>
        <TextArea label="House style (optional)" rows={3} maxLength={VOICE_MAX} value={voice}
          placeholder="e.g. Warm and plain-spoken. Canadian spelling. Mention that our books are risograph-printed in Toronto when it's true."
          hint={`Guidance the AI follows for every draft. ${voice.length}/${VOICE_MAX} characters.`}
          onChange={(e) => setVoice(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <SecondaryButton disabled={saving || readFailed || voice.trim() === savedVoice} onClick={saveVoice}>Save house style</SecondaryButton>
        </div>
      </div>
      {confirmNode}
    </SectionCard>
  );
}

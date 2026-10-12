// Book editor inputs: weight (number + unit) and the media-library picker for product photos.
import { useEffect, useState } from "react";
import { joinWeight, splitWeight, WEIGHT_UNITS, type WeightUnit } from "./bookEditorState";
import { isMediaDenied, mediaApi } from "./mediaApi";
import { mainUrl, type MediaItem } from "./studio/mediaLibrary";
import { Dialog, SelectField, TextField } from "./riso/components";
import { safeHref } from "../features/site/descriptionLinks";

/** Stored as "450 g" / "0.5 kg" / "1 lb" / "8 oz" — the format shippingEngine.parseWeightGrams (client and server) reads. */
export function WeightField({ label, value, onChange, hint }: { label: string; value: string; onChange: (weight: string) => void; hint?: string }) {
  const parsed = splitWeight(value);
  const [unit, setUnit] = useState<WeightUnit>(parsed.unit);
  const shownUnit = parsed.amount ? parsed.unit : unit;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
      <TextField label={label} type="number" min={0} step="any" value={parsed.amount} placeholder="0"
        onChange={(e) => onChange(joinWeight(e.target.value, shownUnit))}
        hint={parsed.unreadable ? `Saved as “${parsed.unreadable}”, which shipping can't read — enter a number.` : hint} />
      <SelectField label={`${label} unit`} hideLabel value={shownUnit}
        onChange={(e) => { const u = e.target.value as WeightUnit; setUnit(u); if (parsed.amount) onChange(joinWeight(parsed.amount, u)); }}>
        {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </SelectField>
    </div>
  );
}

/** Images › Choose from library: Studio's media records read directly (no Studio context needed). */
export function MediaLibraryDialog({ onClose, onChoose }: { onClose: () => void; onChoose: (url: string, alt: string) => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    mediaApi.list().then((list) => { if (live) setItems(list); })
      .catch((err) => { if (live) { setItems([]); setError(isMediaDenied(err) ? "The media library isn't switched on yet (deploy the Firestore rules)." : "The media library couldn't be loaded. Try again."); } });
    return () => { live = false; };
  }, []);
  const shown = (items || []).filter((m) => `${m.name} ${m.alt}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Dialog open onClose={onClose} size="lg" title="Choose from library" description="Pictures uploaded in Design › Media. Click one to add it to this book."
      footer={<button type="button" className="rp-btn rp-btn-secondary" onClick={onClose}>Cancel</button>}>
      <div className="rp-stack">
        <TextField label="Search pictures" value={q} onChange={(e) => setQ(e.target.value)} />
        {items === null && <p className="be-note">Loading…</p>}
        {error && <p role="alert" className="rp-error-text">{error}</p>}
        {items && !error && !shown.length && <p className="be-note">No pictures found.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
          {shown.map((m) => (
            <button key={m.id} type="button" className="rp-btn rp-btn-ghost" style={{ display: "block", padding: 4, height: "auto" }}
              aria-label={`Add ${m.alt || m.name}`} onClick={() => onChoose(mainUrl(m), m.alt || "")}>
              <img src={mainUrl(m)} alt="" loading="lazy" decoding="async" width={100} height={130} style={{ width: "100%", height: 130, objectFit: "cover" }} />
              <span className="rp-hint" style={{ display: "block", overflowWrap: "anywhere" }}>{m.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** "macleans.ca/…" → "https://macleans.ca/…"; shop paths and mailto: stay as typed. */
export function normalizeLinkInput(value: string): string {
  const v = value.trim();
  if (!v || v.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

/** Books › edit › Details › Description › Add link: link text + web address, inserted as [text](url). */
export function DescriptionLinkDialog({ open, initialText, onClose, onInsert }: { open: boolean; initialText: string; onClose: () => void; onInsert: (text: string, href: string) => void }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setText(initialText); setUrl(""); setError(""); } }, [open, initialText]);
  const submit = () => {
    const href = safeHref(normalizeLinkInput(url));
    if (!href) { setError("Enter a full web address, e.g. https://macleans.ca/…"); return; }
    onInsert(text.trim(), href);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add link" description="Shoppers see the link text, underlined; clicking it opens the web address in a new tab."
      footer={<>
        <button type="button" className="rp-btn rp-btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="rp-btn rp-btn-primary" onClick={submit}>Insert link</button>
      </>}>
      <form className="rp-stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Link text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Maclean's Magazine article" hint="Leave blank to show the web address itself." />
        <TextField label="Web address" value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} placeholder="https://…" inputMode="url" autoFocus error={error || undefined} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

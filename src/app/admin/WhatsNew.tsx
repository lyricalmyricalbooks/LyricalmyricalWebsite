import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import { Dialog } from "./riso/components";
import { APP_UPDATES, type AppUpdate } from "./appUpdates";

type UpdateLink = AppUpdate["links"][number];
const SEEN_KEY = "lm:whats-new-seen";

function seenId(): string {
  try { return localStorage.getItem(SEEN_KEY) || ""; } catch { return ""; }
}

/** A small sidebar button (latest title + a dot while unread); the notes open in a pop-up window. */
export function WhatsNew({ onNavigate, onHistoryOpen, appearance }: { onNavigate: (link: UpdateLink) => void; onHistoryOpen: () => void; appearance: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const latest = APP_UPDATES[0];
  const [unread, setUnread] = useState(() => !!latest && seenId() !== latest.id);
  const navigate = (link: UpdateLink) => { setOpen(false); onNavigate(link); };
  const show = () => {
    onHistoryOpen();
    setOpen(true);
    setUnread(false);
    try { if (latest) localStorage.setItem(SEEN_KEY, latest.id); } catch { /* private window: the dot just comes back */ }
  };
  const entry = (update: AppUpdate) => (
    <article className="rp-update-entry" key={update.id}>
      <time dateTime={update.date}>{update.date}</time>
      <h3>{update.title}</h3>
      <p>{update.summary}</p>
      <div className="rp-update-links">
        {update.links.map((link) => <button type="button" key={link.label} onClick={() => navigate(link)}>{link.label} →</button>)}
      </div>
    </article>
  );
  return <>
    <button type="button" className="rp-whats-new" onClick={show} aria-haspopup="dialog"
      aria-label={`What's new${unread ? " (new update)" : ""}${latest ? `: ${latest.title}` : ""}`}>
      <Sparkles size={16} aria-hidden />
      <span className="rp-whats-new-text">
        <span className="rp-whats-new-label">What's new{unread && <span className="rp-whats-new-dot" aria-hidden />}</span>
        {latest && <span className="rp-whats-new-title">{latest.title}</span>}
      </span>
      <ChevronRight size={14} aria-hidden />
    </button>
    {createPortal(<Dialog appearance={appearance} open={open} onClose={() => setOpen(false)} title="What's new" description="App changes and shortcuts to try them.">
      {APP_UPDATES.map(entry)}
    </Dialog>, document.body)}
  </>;
}

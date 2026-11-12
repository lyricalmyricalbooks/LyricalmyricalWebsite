import { useEffect, useMemo, useState } from "react";
import {
  collection, deleteDoc, doc, getCountFromServer, getDocs, limit, orderBy, query, startAfter, updateDoc, where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Archive, ArchiveRestore, Mail, MailOpen, Send, Trash2 } from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { plainError } from "./plainError";
import { RAILS } from "./riso/nav";
import {
  Checkbox, ConfirmDialog, EmptyState, ErrorState, FilterBar, GhostButton, IconButton, LoadingState,
  SearchField, SecondaryButton, StatusBadge, Tabs, TextArea, ToastProvider, useRisoToast,
} from "./riso/components";

// Messages sent from the storefront Contact Form section (collection `contactMessages`).
export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  page?: string;
  status?: "new" | "emailed" | "read" | "archived" | "replied";
  replies?: Array<{ at: string; body: string; by?: string }>;
  createdAt?: any;
};
export type Filter = "inbox" | "unread" | "replied" | "archived";

const PAGE = 100;
export const isUnread = (m: ContactMessage) => m.status === "new" || m.status === "emailed" || !m.status;
export const hasReplied = (m: ContactMessage) => m.status === "replied" || (Array.isArray(m.replies) && m.replies.length > 0);
const toDate = (v: any): Date | null => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

export function filterMessages(list: ContactMessage[], filter: Filter, q: string) {
  const needle = q.trim().toLowerCase();
  return list.filter((m) => {
    if (filter === "archived" ? m.status !== "archived" : m.status === "archived") return false;
    if (filter === "unread" && !isUnread(m)) return false;
    if (filter === "replied" && !hasReplied(m)) return false;
    if (!needle) return true;
    return [m.name, m.email, m.subject, m.message].some((s) => (s || "").toLowerCase().includes(needle));
  });
}

/** Status a message returns to when it leaves the archive (or after undoing an archive). */
export const restoredStatus = (m: ContactMessage): ContactMessage["status"] => (hasReplied(m) ? "replied" : "read");

async function replyCall(messageId: string, body: string) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  const response = await functionFetch("sendTestEmail", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "replyToMessage", messageId, body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The email service answered ${response.status}. Check that Cloud Functions are deployed.`);
  return data.reply as { at: string; body: string; by?: string };
}

type OrderSummary = { count: number; latestId: string | null; more: boolean };

function Inbox({ onOpenOrder, onOpenCustomers }: { onOpenOrder?: (id: string) => void; onOpenCustomers?: (email: string) => void }) {
  const toast = useRisoToast();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totals, setTotals] = useState<{ all: number; unread: number; archived: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("inbox");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContactMessage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, OrderSummary | "loading" | "error">>({});

  const loadTotals = async () => {
    const col = collection(db, "contactMessages");
    try {
      const [all, unread, archived] = await Promise.all([
        getCountFromServer(col), getCountFromServer(query(col, where("status", "in", ["new", "emailed"]))),
        getCountFromServer(query(col, where("status", "==", "archived"))),
      ]);
      setTotals({ all: all.data().count, unread: unread.data().count, archived: archived.data().count });
    } catch { setTotals(null); }
  };

  async function load() {
    setLoading(true); setError(false); setSelected(new Set());
    try {
      const snap = await getDocs(query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), limit(PAGE)));
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setCursor(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE);
    } catch { setError(true); } finally { setLoading(false); }
    loadTotals();
  }
  useEffect(() => { load(); }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), startAfter(cursor), limit(PAGE)));
      setMessages((cur) => [...cur, ...snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))]);
      setCursor(snap.docs[snap.docs.length - 1] || cursor);
      setHasMore(snap.docs.length === PAGE);
    } catch { toast("Could not load more messages.", { tone: "err" }); } finally { setLoadingMore(false); }
  };

  const setStatuses = async (list: ContactMessage[], status: ContactMessage["status"] | ((m: ContactMessage) => ContactMessage["status"])) => {
    const next = (m: ContactMessage) => (typeof status === "function" ? status(m) : status);
    const ids = new Map(list.map((m) => [m.id, next(m)]));
    setMessages((all) => all.map((x) => (ids.has(x.id) ? { ...x, status: ids.get(x.id) } : x)));
    const results = await Promise.allSettled(list.map((m) => updateDoc(doc(db, "contactMessages", m.id), { status: next(m) })));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) { toast(`Could not update ${failed} message${failed === 1 ? "" : "s"}.`, { tone: "err" }); load(); }
    else loadTotals();
    return failed === 0;
  };

  const archive = async (list: ContactMessage[]) => {
    const before = list.map((m) => ({ ...m }));
    if (!(await setStatuses(list, "archived"))) return;
    setSelected(new Set());
    toast(list.length === 1 ? "Message archived" : `${list.length} messages archived`, {
      actionLabel: "Undo",
      onAction: () => { void setStatuses(before, (m) => before.find((b) => b.id === m.id)?.status || "read"); },
    });
  };

  const lookUpOrders = async (email: string) => {
    const key = email.trim().toLowerCase();
    if (!key || orders[key]) return;
    setOrders((o) => ({ ...o, [key]: "loading" }));
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("customer.email", "==", key), limit(50)));
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((o) => o.isTest !== true);
      const latest = docs.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))[0];
      setOrders((o) => ({ ...o, [key]: { count: docs.length, latestId: latest?.id || null, more: snap.docs.length === 50 } }));
    } catch { setOrders((o) => ({ ...o, [key]: "error" })); }
  };


  const sendReply = async (m: ContactMessage) => {
    const body = (drafts[m.id] || "").trim();
    if (!body) { toast("Write a reply first.", { tone: "err" }); return; }
    setSending(m.id);
    try {
      const reply = await replyCall(m.id, body);
      setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, status: "replied", replies: [...(x.replies || []), reply] } : x)));
      setDrafts((d) => { const { [m.id]: _, ...rest } = d; return rest; });
      toast(`Reply sent to ${m.email}`, { tone: "ok" });
      loadTotals();
    } catch (e: any) {
      // The server may have sent it before the answer was lost: keep the draft and say so, so it isn't sent twice blindly.
      toast(`${plainError(e, "The reply may not have been sent")} Open the message and check its replies before sending again.`, { tone: "err" });
    }
    finally { setSending(null); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const list = deleting;
    setDeleting(null);
    const results = await Promise.allSettled(list.map((m) => deleteDoc(doc(db, "contactMessages", m.id))));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `Could not delete ${failed} message${failed === 1 ? "" : "s"}.` : list.length === 1 ? "Message deleted" : `${list.length} messages deleted`, { tone: failed ? "err" : undefined });
    load();
  };

  const loadedCounts = useMemo(() => ({
    inbox: messages.filter((m) => m.status !== "archived").length,
    unread: messages.filter(isUnread).length,
    replied: messages.filter((m) => m.status !== "archived" && hasReplied(m)).length,
    archived: messages.filter((m) => m.status === "archived").length,
  }), [messages]);
  const list = useMemo(() => filterMessages(messages, filter, q), [messages, filter, q]);
  // The message on the right: the one picked, else the newest in this view (shown, not marked read).
  const current = useMemo(() => list.find((m) => m.id === open) || list[0] || null, [list, open]);
  useEffect(() => { if (current) lookUpOrders(current.email); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (m: ContactMessage) => {
    setOpen(m.id);
    if (isUnread(m)) setStatuses([m], "read");
  };

  const unread = totals?.unread ?? loadedCounts.unread;
  const chosen = list.filter((m) => selected.has(m.id));
  const allChosen = list.length > 0 && chosen.length === list.length;
  const tabCounts: Record<Filter, number | undefined> = {
    inbox: totals ? totals.all - totals.archived : loadedCounts.inbox, unread, replied: hasMore ? undefined : loadedCounts.replied,
    archived: totals?.archived ?? loadedCounts.archived,
  };

  return (
    <div className="rp-stack">
      <Tabs<Filter> label="Message folder" rail={RAILS.messages} value={filter} onChange={(f) => { setFilter(f); setSelected(new Set()); }}
        tabs={([["inbox", "Inbox"], ["unread", "Unread"], ["replied", "Replied"], ["archived", "Archived"]] as const).map(([id, label]) => ({ id, label, count: tabCounts[id] }))} />
      <FilterBar>
        <div className="rp-grow"><SearchField label="Search messages" placeholder="Search name, email or text…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </FilterBar>

      <section className="rp-card ms-card" aria-label={`Messages: ${list.length} in this view${hasMore ? ", older ones not loaded yet" : ""}`}>
        {loading ? <LoadingState label="Loading messages…" />
          : error ? <ErrorState description="Messages could not be loaded." onRetry={load} />
          : list.length === 0 ? (
            q.trim() ? (
              <EmptyState title="No messages match" description={`Nothing in this folder mentions “${q.trim()}”.`}
                action={<SecondaryButton onClick={() => setQ("")}>Clear search</SecondaryButton>} />
            ) : (
              <EmptyState title={filter === "archived" ? "Nothing archived" : filter === "replied" ? "No replies yet" : filter === "unread" ? "All caught up" : "No messages yet"}
                description={filter === "unread" ? "Every message has been opened." : filter === "archived" ? "Archived messages land here. Nothing is deleted when you archive." : "Messages sent from the Contact Form section on your website appear here (and in your email)."} />
            )
          ) : (
            <>
              <div className="ms-bar">
                <Checkbox label={chosen.length ? `${chosen.length} selected` : "Select all"} checked={allChosen}
                  onChange={(e) => setSelected(e.target.checked ? new Set(list.map((m) => m.id)) : new Set())} />
                {chosen.length > 0 && <>
                  {filter !== "archived" && <SecondaryButton size="sm" onClick={async () => { if (await setStatuses(chosen, (m) => (hasReplied(m) ? "replied" : "read"))) setSelected(new Set()); }}>Mark read</SecondaryButton>}
                  {filter === "archived"
                    ? <SecondaryButton size="sm" onClick={async () => { if (await setStatuses(chosen, restoredStatus)) setSelected(new Set()); }}>Move to inbox</SecondaryButton>
                    : <SecondaryButton size="sm" onClick={() => archive(chosen)}>Archive</SecondaryButton>}
                  <GhostButton size="sm" onClick={() => setDeleting(chosen)}>Delete…</GhostButton>
                </>}
              </div>
              <div className="ms-panes">
              <ul className="ms-list" aria-label="Messages">
                {list.map((m) => {
                  const when = toDate(m.createdAt);
                  const on = current?.id === m.id;
                  return (
                    <li key={m.id} className="ms-row" data-selected={on || undefined} data-unread={isUnread(m) ? "true" : undefined}>
                      <input type="checkbox" aria-label={`Select message from ${m.name}`} className="ms-check"
                        checked={selected.has(m.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} />
                      <button type="button" className="ms-pick" aria-current={on || undefined} aria-controls="ms-reader" onClick={() => pick(m)}>
                        <span className="ms-line">
                          <span className="ms-from">{m.name || m.email}</span>
                          {when && <time className="ms-when" dateTime={when.toISOString()}>{shortWhen(when)}</time>}
                        </span>
                        <span className="ms-subject">{m.subject || m.message}</span>
                        <span className="ms-tags">
                          {isUnread(m) && <StatusBadge tone="warning" glyph={false}>New</StatusBadge>}
                          {hasReplied(m) && <StatusBadge tone="success" glyph={false}>Replied</StatusBadge>}
                          {m.status === "archived" && <StatusBadge tone="neutral" glyph={false}>Handled</StatusBadge>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {current && (() => {
                const m = current;
                const when = toDate(m.createdAt);
                const ord = orders[m.email.trim().toLowerCase()];
                return (
                  <article id="ms-reader" className="ms-reader" aria-label={`Message from ${m.name}`}>
                    <header className="ms-reader-head">
                      <h2 className="ms-reader-subject">{m.subject || "Message"}</h2>
                      <p className="ms-reader-from"><strong>{m.name}</strong> · {m.email}{m.phone ? ` · ${m.phone}` : ""}{when ? ` · ${when.toLocaleString()}` : ""}</p>
                      {m.page && <p className="rp-hint" style={{ margin: 0 }}>Sent from {m.page}</p>}
                    </header>
                    <p className="ms-reader-body">{m.message}</p>
                    <div className="ms-reader-actions">
                      <a className="rp-btn rp-btn-primary" aria-label={`Reply to ${m.name} by email`}
                        href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject || "your message"}`)}`}>
                        <Mail size={16} aria-hidden /> Reply by email
                      </a>
                      {m.status === "archived"
                        ? <SecondaryButton onClick={() => setStatuses([m], restoredStatus(m))}><ArchiveRestore size={16} aria-hidden /> Move to inbox</SecondaryButton>
                        : <SecondaryButton onClick={() => archive([m])}><Archive size={16} aria-hidden /> Mark handled</SecondaryButton>}
                      {!isUnread(m) && m.status !== "archived" && (
                        <IconButton label={`Mark message from ${m.name} unread`} onClick={() => setStatuses([m], "new")}><MailOpen size={18} aria-hidden /></IconButton>)}
                      <IconButton tone="danger" label={`Delete message from ${m.name}`} onClick={() => setDeleting([m])}><Trash2 size={18} aria-hidden /></IconButton>
                    </div>
                    {ord && ord !== "loading" && ord !== "error" && ord.count > 0 && (
                      <p className="rp-hint" style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <span>{ord.count}{ord.more ? "+" : ""} order{ord.count === 1 ? "" : "s"} from this customer</span>
                        {ord.latestId && onOpenOrder && <GhostButton size="sm" onClick={() => onOpenOrder(ord.latestId!)}>Open latest order</GhostButton>}
                        {onOpenCustomers && <GhostButton size="sm" onClick={() => onOpenCustomers(m.email)}>Open Customers</GhostButton>}
                      </p>
                    )}
                    {(m.replies || []).map((r, i) => (
                      <div key={i} className="ms-sent">
                        <div className="rp-hint">You replied · {new Date(r.at).toLocaleString()}</div>
                        <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body}</p>
                      </div>
                    ))}
                    <details className="ms-compose" open={!!drafts[m.id]}>
                      <summary>Reply from the shop’s email instead</summary>
                      <div className="rp-stack" style={{ marginTop: 10 }}>
                        <TextArea label={`Reply to ${m.name}`} rows={4} maxLength={5000} value={drafts[m.id] || ""} disabled={sending === m.id}
                          hint="Sent to the address above and saved with the message. Ctrl/⌘ + Enter sends."
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && sending !== m.id && (drafts[m.id] || "").trim()) { e.preventDefault(); void sendReply(m); }
                          }}
                          onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))} />
                        <div>
                          <SecondaryButton icon={<Send size={16} aria-hidden />} disabled={sending === m.id || !(drafts[m.id] || "").trim()} onClick={() => sendReply(m)}>
                            {sending === m.id ? "Sending…" : "Send reply"}
                          </SecondaryButton>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })()}
              </div>
              {hasMore && (
                <div style={{ padding: 16 }}>
                  <SecondaryButton onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older messages"}</SecondaryButton>
                </div>
              )}
            </>
          )}
      </section>

      <ConfirmDialog open={!!deleting} title={deleting && deleting.length > 1 ? `Delete ${deleting.length} messages?` : "Delete this message?"}
        confirmLabel={deleting && deleting.length > 1 ? "Delete messages" : "Delete message"}
        message="This permanently removes them. Archive instead if you may need them later."
        onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}

/** "10:02" today, "Yesterday", else "Nov 6". */
function shortWhen(d: Date, now = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Messages(props: { onOpenOrder?: (id: string) => void; onOpenCustomers?: (email: string) => void } = {}) {
  return <ToastProvider><Inbox {...props} /></ToastProvider>;
}

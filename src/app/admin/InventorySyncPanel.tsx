// Inventory › Advanced: copy stock counts from the old shop's inventory system (moved here from
// Settings › General). Behaviour is unchanged: adminApi.syncInventoryFromLegacy.
import { useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { ConfirmDialog, DataTable, PrimaryButton, StatusBadge, type Column } from "./riso/components";

export function InventorySyncPanel({ lastSync }: { lastSync?: string }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | undefined>(lastSync);
  const [confirming, setConfirming] = useState(false);

  const handleSync = async () => {
    setConfirming(false); setSyncing(true); setError(null); setResult(null);
    try {
      const res = await adminApi.syncInventoryFromLegacy();
      setResult(res);
      setLastSyncTime(new Date().toISOString());
      toast.success("Stock copied from the old shop");
    } catch (err: any) {
      setError(err.message || "Sync failed");
    } finally { setSyncing(false); }
  };

  const fmtTime = (iso?: string) => (iso
    ? new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Never");

  const columns: Column<any>[] = [
    { key: "title", header: "Book", lead: true, render: (r) => (<div><div style={{ overflowWrap: "anywhere" }}>{r.title || "(untitled)"}</div><div className="rp-hint rp-mono">{r.slug || "no web address"}</div></div>) },
    { key: "key", header: "Old shop name", render: (r) => <span className="rp-mono">{r.matched ? r.legacyKey : "—"}</span> },
    { key: "stock", header: "Copies", numeric: true, render: (r) => r.stock },
    { key: "status", header: "Status", render: (r) => <StatusBadge tone={r.matched ? "success" : "warning"}>{r.matched ? "Copied" : "No match"}</StatusBadge> },
  ];

  return (
    <div className="rp-stack">
      <p className="rp-hint" style={{ margin: 0 }}>
        Copies each book's stock count from the old shop's inventory into this shop. Last copied: <span className="rp-mono">{fmtTime(lastSyncTime)}</span>.
        Books are matched exactly by their web address (slug) or the old-shop name saved on them, so a book's web address must equal its name in the old shop. Books sold in editions, ambiguous names and unreadable old records are skipped and listed here.
      </p>
      <div><PrimaryButton onClick={() => setConfirming(true)} disabled={syncing}>{syncing ? "Copying…" : "Copy stock from the old shop"}</PrimaryButton></div>
      {error && (
        <div role="alert" style={{ padding: 16, background: "var(--rp-danger-tint)", color: "var(--rp-danger)", border: "2px solid var(--rp-danger)" }}>
          <strong>✕ Could not copy stock.</strong> {error}
        </div>
      )}
      {result && (
        <div className="rp-stack">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusBadge tone="success">{result.synced} books updated</StatusBadge>
            {result.unmatched > 0 && <StatusBadge tone="warning">{result.unmatched} not matched</StatusBadge>}
            {(result.skipped?.length || 0) > 0 && <StatusBadge tone="warning">{result.skipped.length} skipped</StatusBadge>}
            {(result.invalid?.length || 0) > 0 && <StatusBadge tone="warning">{result.invalid.length} unreadable in the old shop</StatusBadge>}
            <StatusBadge>{result.legacyTotal} books in the old shop</StatusBadge>
          </div>
          <DataTable caption="Stock copy results" columns={columns} rows={result.results} rowKey={(r: any) => r.id} />
          {(result.skipped?.length || 0) > 0 && <ul className="rp-hint" style={{ margin: 0 }}>{result.skipped.map((x: any) => <li key={x.bookId}>{x.title}: {x.reason}</li>)}</ul>}
          {(result.invalid?.length || 0) > 0 && <ul className="rp-hint" style={{ margin: 0 }}>{result.invalid.map((x: any) => <li key={x.key}>Old shop “{x.key}”: {x.reason} — left unchanged</li>)}</ul>}
          {result.unmatched > 0 && <p className="rp-hint" style={{ margin: 0 }}>For a book that didn't match, change its web address in Books to its name in the old shop, then copy again.</p>}
        </div>
      )}
      <ConfirmDialog open={confirming} title="Copy stock from the old shop?" confirmLabel="Copy stock"
        message="This replaces the stock count of every matched book with the old shop's number. Books that don't match are left unchanged."
        onConfirm={handleSync} onCancel={() => setConfirming(false)} />
    </div>
  );
}

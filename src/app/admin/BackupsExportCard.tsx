import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { adminApi } from "./api";
import { catalogToCsv } from "./bulkPricing";
import { buildCustomers, customersToCsv } from "./customerInsights";
import { exportOrdersCsv } from "./orderCsv";
import { describeBackup, type BackupRecord } from "./backupStatus";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";

const IAM_URL = "https://console.cloud.google.com/iam-admin/iam?project=lyricalmyrical-web-v2";

// Back up now: the same backup as the nightly run (createStripeCheckoutSession action "backupNow", admin only).
async function backupNow(): Promise<{ ok: boolean; error?: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "backupNow" }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The backup didn't finish. Try again in a minute.");
  return result;
}

const today = () => new Date().toISOString().slice(0, 10);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// Settings › General › Backups & export: the nightly backup's last result, Back up now, and one-click
// downloads of the catalog, customers and orders (built in the browser from admin reads).
export function BackupsExportCard() {
  const [record, setRecord] = useState<BackupRecord | undefined>(undefined);
  const [busy, setBusy] = useState("");

  const [loadFailed, setLoadFailed] = useState(false);
  const load = () => getDoc(doc(db, "systemStatus", "backup"))
    .then((snap) => { setRecord(snap.exists() ? (snap.data() as BackupRecord) : null); setLoadFailed(false); })
    .catch(() => { setLoadFailed(true); setRecord(null); });
  useEffect(() => { load(); }, []);

  const runBackup = async () => {
    setBusy("backup");
    try {
      const result = await backupNow();
      if (result.ok) toast.success("Backup finished.");
      else toast.error(result.error || "The backup didn't finish.");
    } catch (err: any) {
      toast.error(err?.message || "The backup didn't finish.");
    } finally {
      await load();
      setBusy("");
    }
  };

  const run = async (kind: string, make: () => Promise<[string, string, string] | null>) => {
    setBusy(kind);
    try {
      const file = await make();
      if (!file) { toast.error("Nothing to export yet."); return; }
      download(...file);
      toast.success("Download ready.");
    } catch (err: any) {
      toast.error(err?.message || "Export failed.");
    } finally { setBusy(""); }
  };
  const realOrders = async () => (await adminApi.getAllOrders()).filter((o: any) => o.isTest !== true);

  const view = record === undefined ? null : describeBackup(record);
  return (
    <SectionCard title="Backups & export" description="Every document is copied to your storage bucket every night at 3:17 am and kept for 30 days. You can also back up now or download your own copies at any time.">
      <p style={{ margin: "0 0 8px" }}>
        {loadFailed ? <><StatusBadge tone="warning">Couldn't read the backup status</StatusBadge> <span className="rp-hint">Check your connection and reload this page.</span></>
          : view ? <><StatusBadge tone={view.tone}>{view.running ? "Backing up…" : view.label}</StatusBadge> <span className="rp-hint">{view.detail}</span></>
          : <span className="rp-hint">Checking the last backup…</span>}
      </p>
      {view?.notes.map((note) => <p key={note} className="rp-hint" style={{ margin: "0 0 8px" }}>{note}</p>)}
      {view?.exportNeedsRole && (
        <details style={{ margin: "0 0 12px" }}>
          <summary className="rp-label" style={{ cursor: "pointer" }}>How to switch on the full Firestore export</summary>
          <ol className="rp-hint" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>Open <a href={IAM_URL} target="_blank" rel="noreferrer">Google Cloud › IAM</a> for this project (sign in as the shop's Google account).</li>
            <li>Find {view.serviceAccount ? <><code>{view.serviceAccount}</code> <GhostButton size="sm" onClick={() => navigator.clipboard?.writeText(view.serviceAccount).then(() => toast.success("Address copied."), () => toast.error("Couldn't copy. Select the address instead."))}>Copy</GhostButton></> : <>the <strong>Default compute service account</strong> (ends in <code>-compute@developer.gserviceaccount.com</code>)</>} and press its pencil (Edit).</li>
            <li>Press <strong>Add another role</strong>, choose <strong>Cloud Datastore Import Export Admin</strong>, then <strong>Save</strong>.</li>
            <li>Come back here and press <strong>Back up now</strong>.</li>
          </ol>
        </details>
      )}
      <div style={{ margin: "0 0 16px" }}>
        <PrimaryButton size="sm" disabled={!!busy || view?.running} onClick={runBackup}>{busy === "backup" ? "Backing up…" : "Back up now"}</PrimaryButton>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("books-csv", async () => {
          const books = await adminApi.getAllBooks();
          return books.length ? [`catalog-${today()}.csv`, catalogToCsv(books), "text/csv;charset=utf-8"] : null;
        })}>{busy === "books-csv" ? "Preparing…" : "Catalog (CSV)"}</SecondaryButton>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("books-json", async () => {
          const books = await adminApi.getAllBooks();
          return books.length ? [`catalog-${today()}.json`, JSON.stringify(books.map(({ _lastDoc, ...b }: any) => b), null, 2), "application/json"] : null;
        })}>{busy === "books-json" ? "Preparing…" : "Catalog (JSON)"}</SecondaryButton>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("customers", async () => {
          const rows = buildCustomers(await realOrders());
          return rows.length ? [`customers-${today()}.csv`, customersToCsv(rows), "text/csv;charset=utf-8"] : null;
        })}>{busy === "customers" ? "Preparing…" : "Customers (CSV)"}</SecondaryButton>
        <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("orders", async () => {
          const orders = await realOrders();
          return orders.length ? [`orders-${today()}.csv`, exportOrdersCsv(orders, { paidOnly: false }), "text/csv;charset=utf-8"] : null;
        })}>{busy === "orders" ? "Preparing…" : "Orders (CSV)"}</SecondaryButton>
      </div>
      <p className="rp-hint" style={{ margin: "12px 0 0" }}>Exports leave out test orders. Orders include unpaid and cancelled ones; Orders › Table view exports only paid and refunded orders.</p>
    </SectionCard>
  );
}

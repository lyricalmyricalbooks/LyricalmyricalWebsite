import { useState } from "react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { alertSignature, type AdminAlert } from "./adminAlerts";

const KEY = "admin-dismissed-alerts";
const readDismissed = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { return []; }
};

// Alerts shown above every admin page. Dismissing hides an alert for this browser
// session until a new order joins it.
export function AdminAlerts({ alerts, onOpenOrder, onOpenOrders, onOpenWebhook, onOpenNotifications, onOpenGeneral, onRetry }: {
  alerts: AdminAlert[];
  onOpenOrder: (id: string) => void;
  onOpenOrders: () => void;
  onOpenWebhook: () => void;
  onOpenNotifications: () => void;
  onOpenGeneral?: () => void;
  onRetry?: () => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const visible = alerts.filter((a) => !dismissed.includes(alertSignature(a)));
  if (!visible.length) return null;

  const dismiss = (a: AdminAlert) => {
    const next = [...dismissed, alertSignature(a)];
    setDismissed(next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  return (
    <section aria-label="Alerts" role="region" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      {visible.map((a) => (
        <div key={a.id} role={a.tone === "danger" ? "alert" : "status"} className="rp-card"
          style={{ padding: "12px 16px", boxShadow: "none", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
            borderColor: a.tone === "danger" ? "var(--rp-danger)" : a.tone === "warning" ? "var(--rp-warning)" : "var(--rp-border)",
            background: a.tone === "danger" ? "var(--rp-danger-tint)" : a.tone === "warning" ? "var(--rp-warning-tint)" : "var(--rp-surface)" }}>
          <StatusBadge tone={a.tone}>{a.tone === "danger" ? "Urgent" : a.tone === "warning" ? "Attention" : "Reminder"}</StatusBadge>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <strong>{a.title}</strong>
            <span className="rp-hint" style={{ display: "block", marginTop: 2 }}>{a.detail}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton size="sm" onClick={() => (a.action === "retry" ? onRetry?.() : a.action === "general" ? onOpenGeneral?.() : a.action === "notifications" ? onOpenNotifications() : a.action === "webhook" || a.action === "payments" ? onOpenWebhook() : a.action === "order" ? onOpenOrder(a.orderIds[0]) : onOpenOrders())}>
              {a.action === "retry" ? "Try again" : a.action === "general" ? "Open Backups" : a.action === "notifications" ? "Open Email sender" : a.action === "payments" ? "Open Payments" : a.action === "webhook" ? "Open webhook health" : a.action === "order" ? "Open order" : "Review orders"}
            </PrimaryButton>
            <SecondaryButton size="sm" onClick={() => dismiss(a)}>Dismiss</SecondaryButton>
          </div>
        </div>
      ))}
    </section>
  );
}

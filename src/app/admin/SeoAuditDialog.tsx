import { useEffect, useMemo, useState } from "react";
import { adminApi } from "./api";
import { auditStorefrontSeo } from "./seoAudit";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge, Tabs } from "./riso/components";

interface SeoAuditDialogProps {
  open: boolean;
  onClose: () => void;
  books: any[];
  onEditBook: (book: any) => void;
}

/**
 * Books › SEO Audit: flags live books and published pages with short/long search snippets,
 * thin descriptions, missing photo alt text, missing ISBN-13s, or missing artist website links.
 */
export function SeoAuditDialog({ open, onClose, books, onEditBook }: SeoAuditDialogProps) {
  const [tab, setTab] = useState<"books" | "pages">("books");
  const [pages, setPages] = useState<any[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPages(true);
    adminApi.getPages()
      .then((list) => { if (!cancelled) setPages(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setPages([]); })
      .finally(() => { if (!cancelled) setLoadingPages(false); });
    return () => { cancelled = true; };
  }, [open]);

  const audit = useMemo(
    () => (open ? auditStorefrontSeo(books, pages) : { bookResults: [], pageResults: [], booksWithIssues: 0, pagesWithIssues: 0 }),
    [open, books, pages],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="SEO Audit"
      description="Live books and published pages checked for Google snippet length, copy depth, photo descriptions, ISBN-13, and artist links."
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
    >
      <div className="rp-stack">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <StatusBadge tone={audit.booksWithIssues === 0 ? "success" : "warning"}>
            {audit.booksWithIssues} of {audit.bookResults.length} live book{audit.bookResults.length === 1 ? "" : "s"} need attention
          </StatusBadge>
          <StatusBadge tone={loadingPages ? "neutral" : audit.pagesWithIssues === 0 ? "success" : "warning"}>
            {loadingPages
              ? "Checking pages…"
              : `${audit.pagesWithIssues} of ${audit.pageResults.length} published page${audit.pageResults.length === 1 ? "" : "s"} need attention`}
          </StatusBadge>
        </div>

        <Tabs
          label="SEO audit scope"
          idPrefix="seo-audit-"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "books", label: `Books (${audit.bookResults.length})` },
            { id: "pages", label: `Pages (${audit.pageResults.length})` },
          ]}
        />

        {tab === "books" ? (
          <ul className="rp-stack" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 380, overflow: "auto", gap: 10 }} aria-label="Book SEO audit results">
            {audit.bookResults.length === 0 ? (
              <li className="rp-hint">No published, indexable books to audit.</li>
            ) : (
              audit.bookResults.map((item) => (
                <li key={item.id} style={{ borderBottom: "1px solid var(--rp-border)", paddingBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <strong>{item.title}</strong>
                      <StatusBadge tone={item.issues.length === 0 ? "success" : "warning"}>
                        {item.issues.length === 0 ? "Healthy" : `${item.issues.length} issue${item.issues.length === 1 ? "" : "s"}`}
                      </StatusBadge>
                    </span>
                    <SecondaryButton size="sm" onClick={() => { onClose(); onEditBook(item.book); }}>
                      Edit book
                    </SecondaryButton>
                  </div>
                  {item.issues.length > 0 && (
                    <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
                      {item.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                    </ul>
                  )}
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="rp-stack" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 380, overflow: "auto", gap: 10 }} aria-label="Page SEO audit results">
            {loadingPages ? (
              <li className="rp-hint">Loading published pages…</li>
            ) : audit.pageResults.length === 0 ? (
              <li className="rp-hint">No published, indexable custom pages to audit.</li>
            ) : (
              audit.pageResults.map((item) => (
                <li key={item.id} style={{ borderBottom: "1px solid var(--rp-border)", paddingBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <strong>{item.title}</strong>
                      <code className="rp-mono">/page/{item.slug}</code>
                      <StatusBadge tone={item.issues.length === 0 ? "success" : "warning"}>
                        {item.issues.length === 0 ? "Healthy" : `${item.issues.length} issue${item.issues.length === 1 ? "" : "s"}`}
                      </StatusBadge>
                    </span>
                  </div>
                  {item.issues.length > 0 && (
                    <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
                      {item.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                    </ul>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

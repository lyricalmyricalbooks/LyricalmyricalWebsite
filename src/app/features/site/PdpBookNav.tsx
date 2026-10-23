import { Link } from "react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { bookLinkSlug, type BookNeighbours } from "./bookNeighbours";

// Previous / next book row at the foot of the book page (Studio › Style › Book page · photos & layout ›
// showPdpBookNav, off by default), like Shopify themes' product navigation. Display only.
// Words: Text & labels › Product page (`pdpBookNav*`).
export default function PdpBookNav({ neighbours, design }: { neighbours: BookNeighbours<any>; design: any }) {
  const { prev, next } = neighbours;
  if (!prev && !next) return null;
  const side = (book: any, dir: "prev" | "next") => {
    const label = getCopy(design, dir === "prev" ? "pdpBookNavPrev" : "pdpBookNavNext");
    return (
      <Link
        to={`/books/${encodeURIComponent(bookLinkSlug(book))}`}
        rel={dir}
        className={`fm-pdp-booknav-link group flex min-w-0 items-center gap-3 ${dir === "next" ? "justify-end text-right" : "text-left"}`}
      >
        {dir === "prev" && <ArrowLeft size={14} aria-hidden="true" className="shrink-0" />}
        <span className="min-w-0">
          {String(label).trim() && <span className="fm-pdp-meta block opacity-70">{label}</span>}
          <span className="block truncate underline-offset-2 group-hover:underline">{book.title}</span>
        </span>
        {dir === "next" && <ArrowRight size={14} aria-hidden="true" className="shrink-0" />}
      </Link>
    );
  };
  return (
    <nav
      {...regionProps("productBookNav")}
      aria-label={getCopy(design, "pdpBookNavAria")}
      className="fm-pdp-booknav mt-12 lg:mt-16 grid grid-cols-2 gap-6 border-t pt-6"
      style={{ borderColor: "var(--border-color, currentColor)" }}
    >
      <div className="min-w-0">{prev && side(prev, "prev")}</div>
      <div className="min-w-0">{next && side(next, "next")}</div>
    </nav>
  );
}

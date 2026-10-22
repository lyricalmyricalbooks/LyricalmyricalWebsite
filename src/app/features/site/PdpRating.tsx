import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { ratingCountKey, ratingLine } from "./pdpRating";

const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z";

function Star({ fill }: { fill: number }) {
  return (
    <span className="fm-pdp-rating-star relative inline-block w-[1em] h-[1em]" style={{ color: "var(--accent)" }} aria-hidden="true">
      <svg className="block" viewBox="0 0 24 24" width="1em" height="1em"><path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      {fill > 0 && (
        <span className="fm-pdp-rating-fill absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <svg className="block" viewBox="0 0 24 24" width="1em" height="1em"><path d={STAR} fill="currentColor" stroke="currentColor" strokeWidth="1.5" /></svg>
        </span>
      )}
    </span>
  );
}

// "★★★★½ 4.3 (12 reviews)" under the book page title (Studio › Style › Book page · photos & layout ›
// showPdpRatingStars). Approved reviews only; nothing when there are none. `onOpen` jumps to the reviews.
export default function PdpRating({ summary, design, onOpen }: {
  summary: { count: number; average: number } | null | undefined; design: any; onOpen?: () => void;
}) {
  const line = ratingLine(summary);
  if (!line) return null;
  const countText = getCopy(design, ratingCountKey(line.count), { count: line.count });
  const label = getCopy(design, "pdpRatingAria", { average: line.shown, count: line.count });
  const body = (
    <>
      <span className="fm-pdp-rating-stars inline-flex gap-[0.12em] text-[1.15em] leading-none">{line.stars.map((f, i) => <Star key={i} fill={f} />)}</span>
      <span className="fm-pdp-rating-average">{line.shown}</span>
      {String(countText).trim() && <span className="fm-pdp-rating-count underline-offset-2 group-hover:underline group-focus-visible:underline">({countText})</span>}
    </>
  );
  return onOpen ? (
    <button {...regionProps("productRating")} type="button" className="fm-pdp-meta fm-pdp-rating group inline-flex items-center gap-2 flex-wrap cursor-pointer text-left" aria-label={label} onClick={onOpen}>{body}</button>
  ) : (
    <p {...regionProps("productRating")} className="fm-pdp-meta fm-pdp-rating inline-flex items-center gap-2 flex-wrap" role="img" aria-label={label}>{body}</p>
  );
}


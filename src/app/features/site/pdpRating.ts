// Star rating under the book page title (Studio › Style › Book page · photos & layout › showPdpRatingStars, off by
// default). Built only from the approved-review summary the page already reads (`reviewsApi.summary`), so a book with
// no approved reviews shows nothing — never a made-up rating.

export type RatingLine = { average: number; shown: string; count: number; stars: number[] };

/** The line to draw, or null when there is nothing honest to show. `stars` = five fills from 0 to 1 (half steps). */
export function ratingLine(summary: { count?: unknown; average?: unknown } | null | undefined): RatingLine | null {
  const count = Math.floor(Number(summary?.count));
  const average = Number(summary?.average);
  if (!Number.isFinite(count) || count < 1 || !Number.isFinite(average) || average <= 0) return null;
  const clamped = Math.min(5, Math.max(0, average));
  const halves = Math.round(clamped * 2) / 2;
  const stars = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, halves - i)));
  return { average: clamped, shown: clamped.toFixed(1), count, stars };
}

/** Text & labels key for the review count ("1 review" / "12 reviews"). */
export const ratingCountKey = (count: number) => (count === 1 ? "pdpRatingCountOne" : "pdpRatingCount");

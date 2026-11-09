// Orders list: each row ends with its next step as a button (Pressroom refreshed, 9 November 2026). The button opens
// the order, where that step's controls live; it never packs, ships or charges anything by itself. Pure, tested.

const STEP: Record<string, string> = {
  "Needs attention": "Review",
  "Ready to pack": "Pack",
  "Ready to ship": "Ship",
  "Ready for pickup": "Hand over",
  "Ready for local delivery": "Deliver",
  "Awaiting release": "Check release",
  "In transit": "Track",
  "Unpaid": "Check payment",
};

/** The next step's button word for an order's work queue, or null when nothing is left to do (Completed). */
export const nextStepFor = (queue: string): string | null => STEP[queue] ?? null;

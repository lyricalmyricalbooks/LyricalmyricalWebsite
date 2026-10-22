// The Studio control baseline: one small file per control in scripts/studio-control-baseline/ (file name = the
// control id with ":" written as "~", content = visible | css-only | dom-only | "none: <reason>"). One file per
// control, not one shared list, so PRs that add different controls never conflict with each other.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

export const BASELINE_DIR = new URL("./studio-control-baseline/", import.meta.url);
const fileOf = (id) => id.replace(/:/g, "~");
const idOf = (file) => file.replace(/~/g, ":");

/** { controlId: expectation } for every control in the baseline. */
export function readBaseline(dir = BASELINE_DIR) {
  return Object.fromEntries(readdirSync(dir).filter(f => !f.startsWith("."))
    .map(f => [idOf(f), readFileSync(new URL(f, dir), "utf8").trim()]));
}

/** Writes the baseline, touching only the files whose expectation changed (and removing dropped controls). */
export function writeBaseline(controls, dir = BASELINE_DIR) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const old = readBaseline(dir);
  for (const [id, value] of Object.entries(controls)) {
    if (/[~/\\]/.test(id)) throw new Error(`Control id can't be a file name: ${id}`);
    if (old[id] !== value) writeFileSync(new URL(fileOf(id), dir), `${value}\n`);
  }
  for (const id of Object.keys(old)) if (!(id in controls)) unlinkSync(new URL(fileOf(id), dir));
}

import { describe, expect, it } from "vitest";
import { WORK_QUEUES } from "./fulfillment";
import { nextStepFor } from "./orderNextStep";

describe("next step on each order row", () => {
  it("names the job for every working queue", () => {
    expect(nextStepFor("Ready to pack")).toBe("Pack");
    expect(nextStepFor("Ready to ship")).toBe("Ship");
    expect(nextStepFor("Needs attention")).toBe("Review");
    for (const q of WORK_QUEUES.filter(q => q !== "Completed" && q !== "All orders")) expect(nextStepFor(q)).toBeTruthy();
  });
  it("shows no button once an order is done", () => {
    expect(nextStepFor("Completed")).toBeNull();
    expect(nextStepFor("Something new")).toBeNull();
  });
});

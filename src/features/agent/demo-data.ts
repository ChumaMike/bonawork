import type { ChecklistRequest } from "./contracts";

/** The sample review on the demo page: the recorded toilet invoice and its price flags. */
export const DEMO_REVIEW_REQUEST: ChecklistRequest = {
  milestone: "Replace two cracked cisterns and both flush valves in the girls' block, and clear the sewer pipe.",
  stage: "completion",
  lines: [
    { lineId: "CIST-9L", description: "Toilet cistern 9 litre white", quantity: 2, unitPriceCents: 185_000 },
    { lineId: "FLUSH-DUAL", description: "Dual flush valve", quantity: 2, unitPriceCents: 32_000 },
    { lineId: "PVC-110", description: "PVC sewer pipe 110mm x 6m", quantity: 1, unitPriceCents: 56_000 },
  ],
  priceFlags: [
    { lineId: "CIST-9L", level: "high", percentAbove: 95 },
    { lineId: "FLUSH-DUAL", level: "ok", percentAbove: 0 },
    { lineId: "PVC-110", level: "check", percentAbove: 22 },
  ],
};

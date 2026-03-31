import { describe, it, expect } from "vitest";
import { parseActions } from "./action-parser";

const VALID_OUTPUT = `## Plan
Here is the implementation plan...

---

Details about the plan phases.

\`\`\`actions
[
  {"type":"run_skill","skill":"/hack","label":"Implement Phase 1","risk":"medium","params":{"phase":1}},
  {"type":"update_linear","ticket":"VEC-50","field":"status","value":"In Progress","label":"Move VEC-50 to In Progress","risk":"medium"}
]
\`\`\``;

const NO_ACTIONS_OUTPUT = `## Plan
Here is the plan with no actions block.

---

Just markdown, nothing else.`;

const MALFORMED_JSON = `Some text

\`\`\`actions
[{"type":"run_skill", broken json here
\`\`\``;

const MIXED_VALID_INVALID = `Text

\`\`\`actions
[
  {"type":"run_skill","skill":"/hack","label":"Good action","risk":"medium"},
  {"type":"unknown_type","label":"Bad action","risk":"low"},
  {"label":"Missing type"},
  {"type":"no_action","label":"Nothing to do"}
]
\`\`\``;

const JSON_ACTIONS_FENCE = `Text

\`\`\`json actions
[{"type":"open_url","url":"https://example.com","label":"View PR","risk":"low"}]
\`\`\``;

describe("parseActions", () => {
  it("should parse valid actions from agent output", () => {
    const actions = parseActions(VALID_OUTPUT);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("run_skill");
    expect(actions[0].label).toBe("Implement Phase 1");
    expect(actions[1].type).toBe("update_linear");
  });

  it("should return empty array for output without actions block", () => {
    expect(parseActions(NO_ACTIONS_OUTPUT)).toEqual([]);
  });

  it("should return empty array for malformed JSON", () => {
    expect(parseActions(MALFORMED_JSON)).toEqual([]);
  });

  it("should filter out invalid actions and keep valid ones", () => {
    const actions = parseActions(MIXED_VALID_INVALID);
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe("Good action");
    expect(actions[1].label).toBe("Nothing to do");
  });

  it("should handle json actions fence variant", () => {
    const actions = parseActions(JSON_ACTIONS_FENCE);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("open_url");
  });

  it("should return empty array for null/empty input", () => {
    expect(parseActions("")).toEqual([]);
    expect(parseActions(null as unknown as string)).toEqual([]);
  });
});

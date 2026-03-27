/** Tests for shared UI constants — ensures consistency and completeness. */

import { describe, it, expect } from "vitest";
import {
  STAGE_META,
  SOURCE_COLORS,
  PRIORITY_COLORS,
  PRIORITY_BG_TINTS,
  TASK_TYPE_LABELS,
} from "./ui-constants";
import { VALID_STAGES, type Priority } from "./task-utils";

describe("STAGE_META", () => {
  it("should have an entry for every valid stage", () => {
    for (const stage of VALID_STAGES) {
      expect(STAGE_META[stage]).toBeDefined();
      expect(STAGE_META[stage].label).toBeTruthy();
      expect(STAGE_META[stage].color).toBeTruthy();
    }
  });

  it("should have unique labels for each stage", () => {
    const labels = Object.values(STAGE_META).map(m => m.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("should have hex colors for all stages", () => {
    for (const meta of Object.values(STAGE_META)) {
      expect(meta.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("SOURCE_COLORS", () => {
  it("should have colors for all standard sources", () => {
    expect(SOURCE_COLORS.linear).toBeDefined();
    expect(SOURCE_COLORS.slack).toBeDefined();
    expect(SOURCE_COLORS.github).toBeDefined();
    expect(SOURCE_COLORS.notion).toBeDefined();
    expect(SOURCE_COLORS.email).toBeDefined();
  });

  it("should have hex colors", () => {
    for (const color of Object.values(SOURCE_COLORS)) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("PRIORITY_COLORS", () => {
  const priorities: Priority[] = ["critical", "high", "medium", "low", "backlog"];

  it("should have colors for all priority levels", () => {
    for (const p of priorities) {
      expect(PRIORITY_COLORS[p]).toBeDefined();
    }
  });

  it("should have hex colors", () => {
    for (const color of Object.values(PRIORITY_COLORS)) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("PRIORITY_BG_TINTS", () => {
  it("should have tints for all priority levels", () => {
    for (const p of ["critical", "high", "medium", "low", "backlog"]) {
      expect(PRIORITY_BG_TINTS[p]).toBeDefined();
    }
  });
});

describe("TASK_TYPE_LABELS", () => {
  it("should have labels for all task types", () => {
    const types = ["implementation", "investigation", "review", "meeting_prep", "response", "planning"];
    for (const t of types) {
      expect(TASK_TYPE_LABELS[t]).toBeDefined();
      expect(TASK_TYPE_LABELS[t].length).toBeGreaterThan(0);
    }
  });
});

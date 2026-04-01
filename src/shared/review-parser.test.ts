import { describe, it, expect } from "vitest";
import { parseReviewMd, type ReviewFinding, type Severity } from "./review-parser";

const SAMPLE_REVIEW = `# Code Review

## Findings

### [x] F1 — BLOCKER — security
**File:** src/api/auth.ts:45
**Reviewer:** security
**Description:** SQL injection in query parameter
**Why it matters:** User input directly interpolated into SQL query
**Suggestion:** Use parameterized queries
**Confidence:** 95%

### [x] F2 — ISSUE — correctness
**File:** src/utils/parse.ts:12
**Reviewer:** correctness
**Description:** Off-by-one error in pagination
**Why it matters:** Last page shows duplicate items
**Suggestion:** Change <= to <
**Confidence:** 85%

### [ ] F3 — NIT — architecture
**File:** src/components/Header.tsx:8
**Reviewer:** architecture
**Description:** Component does too much
**Why it matters:** Hard to test
**Suggestion:** Extract navigation into separate component
**Confidence:** 70%
`;

describe("Review Parser", () => {
  it("should parse findings with severity", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    expect(review.findings).toHaveLength(3);
    expect(review.findings[0].severity).toBe("BLOCKER");
    expect(review.findings[1].severity).toBe("ISSUE");
    expect(review.findings[2].severity).toBe("NIT");
  });

  it("should extract finding details", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    const f1 = review.findings[0];
    expect(f1.id).toBe("F1");
    expect(f1.file).toBe("src/api/auth.ts:45");
    expect(f1.reviewer).toBe("security");
    expect(f1.description).toContain("SQL injection");
    expect(f1.suggestion).toContain("parameterized");
    expect(f1.confidence).toBe(95);
  });

  it("should track checked/unchecked status", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    expect(review.findings[0].checked).toBe(true);
    expect(review.findings[2].checked).toBe(false);
  });

  it("should count by severity", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    expect(review.blockerCount).toBe(1);
    expect(review.issueCount).toBe(1);
    expect(review.nitCount).toBe(1);
  });

  it("should handle empty review", () => {
    const review = parseReviewMd("");
    expect(review.findings).toHaveLength(0);
  });
});

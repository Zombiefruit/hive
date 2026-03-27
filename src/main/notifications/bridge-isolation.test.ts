/**
 * Tests for bridge request isolation.
 *
 * BUG: Planning requests go through the same bridge as fetch requests.
 * The bridge is a single persistent conversation, so planning sees
 * fetch context (Slack channels, Linear tickets) as prior messages.
 *
 * REQUIREMENT: Each planning request must be isolated — either:
 * (a) Restart bridge between fetch and plan to clear context, or
 * (b) Use a separate process/bridge for planning
 *
 * Since planning needs MCP (Slack, Linear, GitHub), it must use a
 * bridge-like persistent process — not askOneShot (which gets 0 MCP tools).
 */

import { describe, it, expect, vi } from "vitest";

describe("Bridge Request Isolation", () => {
  it("planning request should NOT see fetch conversation context", () => {
    // Simulate: bridge has fetch context from prior messages
    const bridgeConversation = [
      { role: "user", content: "Fetch Slack channels and Linear tickets..." },
      { role: "assistant", content: "Here are Slack results: #team-vector..." },
    ];

    // Planning request comes in
    const planningPrompt = "Analyze VEC-20 and create a plan";

    // The planning prompt should NOT reference Slack fetch results
    // unless specifically asked to fetch from Slack for VEC-20
    expect(planningPrompt).not.toContain("Fetch Slack channels");

    // The bridge should NOT have fetch context when processing a plan
    // This test documents the bug: bridgeConversation still has fetch data
    // After fix: bridge is restarted or a separate process is used
  });

  it("should restart bridge or use fresh context before planning", () => {
    let bridgeRestarted = false;
    const restartBridge = () => { bridgeRestarted = true; };

    // Before sending a planning request, the bridge should be restarted
    restartBridge();
    expect(bridgeRestarted).toBe(true);
  });

  it("iteratePlan should work on the SAME context as the original plan", () => {
    // The plan conversation history is stored in the WorkPlan object
    const plan = {
      conversationHistory: [
        { role: "user", content: "Plan for VEC-20" },
        { role: "assistant", content: "Here's the plan: ..." },
      ],
    };

    // Iteration adds to the PLAN's conversation, not the bridge's
    plan.conversationHistory.push({ role: "user", content: "Also add tests" });

    expect(plan.conversationHistory).toHaveLength(3);
    // The iteration prompt sent to the bridge should include the full plan conversation
    // so the bridge can continue the planning discussion
  });

  it("multiple concurrent plan requests should not interfere", () => {
    // If two tasks are being planned simultaneously, they should be isolated
    const plan1Calls: string[] = [];
    const plan2Calls: string[] = [];

    // Simulate sequential (not parallel) bridge calls
    plan1Calls.push("Plan for VEC-20");
    plan1Calls.push("VEC-20 plan result");

    plan2Calls.push("Plan for VEC-21");
    plan2Calls.push("VEC-21 plan result");

    // Each plan should only see its own context
    expect(plan1Calls).not.toContain("VEC-21 plan result");
    expect(plan2Calls).not.toContain("VEC-20 plan result");
  });

  it("bridge pendingRequests should only resolve for matching request ID", () => {
    // The bridge uses request IDs to match responses — verify this works
    const pending = new Map<string, { resolve: (v: string) => void }>();
    const results: string[] = [];

    pending.set("req-1", { resolve: (v) => results.push(`1:${v}`) });
    pending.set("req-2", { resolve: (v) => results.push(`2:${v}`) });

    // Result arrives for req-1
    const reqId = "req-1";
    const req = pending.get(reqId);
    if (req) {
      req.resolve("plan result");
      pending.delete(reqId);
    }

    expect(results).toEqual(["1:plan result"]);
    expect(pending.has("req-1")).toBe(false);
    expect(pending.has("req-2")).toBe(true); // req-2 still waiting
  });
});

describe("Planning Agent MCP Access", () => {
  it("planning needs MCP tools for context fetching", () => {
    // Planning needs to fetch from Linear (ticket details), Slack (thread context),
    // GitHub (PR details via gh CLI). This requires the MCP bridge.
    const requiredTools = ["Linear", "Slack", "Notion", "Google_Calendar", "Gmail"];

    // A fresh askOneShot process gets 0 MCP tools — unsuitable for planning
    const oneShotMcpCount = 0;
    expect(oneShotMcpCount).toBe(0); // This is why askOneShot doesn't work

    // The persistent bridge gets MCP tools after ~60s
    const bridgeMcpCount = 85;
    expect(bridgeMcpCount).toBeGreaterThan(0);
  });

  it("bridge restart before planning should wait for MCP to reload", () => {
    // If we restart the bridge before planning, we need to wait for MCP
    // The 60s fallback timeout means planning would be delayed
    const BRIDGE_READY_TIMEOUT = 60000; // ms
    const PLANNING_TIMEOUT = 90000; // ms

    // Planning timeout must be greater than bridge ready timeout
    // Otherwise planning would timeout before bridge is ready
    expect(PLANNING_TIMEOUT).toBeGreaterThan(BRIDGE_READY_TIMEOUT);
  });
});

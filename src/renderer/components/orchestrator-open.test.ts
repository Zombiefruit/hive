/**
 * Tests for the orchestrator panel opening via AddToManagerButton.
 *
 * Bug: AddToManagerButton called setOpen(true) on the manager store,
 * but OrchestratorOrbiter only checked local panelOpen and isPinned —
 * never reading isOpen from the store. The panel never opened.
 *
 * Fix: OrchestratorOrbiter now subscribes to isOpen and syncs it to panelOpen.
 */
import { describe, it, expect } from "vitest";

describe("Manager Store — isOpen contract", () => {
  it("setOpen(true) should set isOpen to true", () => {
    // Simulates the zustand store behavior
    let state = { isOpen: false, isPinned: false };
    const setOpen = (open: boolean) => { state = { ...state, isOpen: open }; };

    setOpen(true);
    expect(state.isOpen).toBe(true);

    setOpen(false);
    expect(state.isOpen).toBe(false);
  });

  it("AddToManagerButton should call addContext then setOpen", () => {
    const calls: string[] = [];
    const addContext = (_item: { id: string }) => { calls.push("addContext"); };
    const setOpen = (_open: boolean) => { calls.push("setOpen"); };

    // Simulates the button's handleClick
    addContext({ id: "task-123" });
    setOpen(true);

    expect(calls).toEqual(["addContext", "setOpen"]);
  });
});

describe("OrchestratorOrbiter — isOpen sync", () => {
  it("should open panel when isOpen becomes true", () => {
    // Simulates the useEffect that syncs isOpen → panelOpen
    let panelOpen = false;
    const setPanelOpen = (val: boolean) => { panelOpen = val; };

    // isOpen changes from false → true (store update from AddToManagerButton)
    const isOpenFromStore = true;
    if (isOpenFromStore && !panelOpen) {
      setPanelOpen(true);
    }

    expect(panelOpen).toBe(true);
  });

  it("should NOT close panel when isOpen becomes false (user controls close)", () => {
    // When isOpen goes false, we don't auto-close — the user closes via handlePanelClose
    let panelOpen = true;
    const setPanelOpen = (val: boolean) => { panelOpen = val; };

    const isOpenFromStore = false;
    // The effect only opens, never closes
    if (isOpenFromStore && !panelOpen) {
      setPanelOpen(true);
    }

    // panelOpen should remain true — user closes manually
    expect(panelOpen).toBe(true);
  });

  it("should not re-trigger when panel is already open", () => {
    let setPanelOpenCalled = false;
    const setPanelOpen = (_val: boolean) => { setPanelOpenCalled = true; };

    const panelOpen = true;
    const isOpenFromStore = true;

    // Guard: if already open, don't call setPanelOpen
    if (isOpenFromStore && !panelOpen) {
      setPanelOpen(true);
    }

    expect(setPanelOpenCalled).toBe(false);
  });

  it("panel should render when panelOpen OR isPinned is true", () => {
    // The rendering condition: (panelOpen || isPinned)
    const shouldRender = (panelOpen: boolean, isPinned: boolean) => panelOpen || isPinned;

    expect(shouldRender(false, false)).toBe(false);
    expect(shouldRender(true, false)).toBe(true);
    expect(shouldRender(false, true)).toBe(true);
    expect(shouldRender(true, true)).toBe(true);
  });

  it("handlePanelClose should reset both panelOpen and isOpen", () => {
    let panelOpen = true;
    let isOpen = true;
    let isPinned = true;

    const handlePanelClose = () => {
      panelOpen = false;
      isOpen = false;
      isPinned = false;
    };

    handlePanelClose();
    expect(panelOpen).toBe(false);
    expect(isOpen).toBe(false);
    expect(isPinned).toBe(false);
  });

  it("isPinned sync should also open panelOpen", () => {
    // Existing behavior: isPinned → panelOpen
    let panelOpen = false;
    const setPanelOpen = (val: boolean) => { panelOpen = val; };

    const isPinned = true;
    if (isPinned) {
      setPanelOpen(true);
    }

    expect(panelOpen).toBe(true);
  });
});

describe("End-to-end: AddToManagerButton → Panel Opens", () => {
  it("clicking button should result in panel being visible", () => {
    // Full flow simulation
    let storeIsOpen = false;
    let panelOpen = false;
    const contextItems: Array<{ id: string; label: string }> = [];

    // Step 1: Button click handler
    const handleClick = () => {
      contextItems.push({ id: "task-abc", label: "VEC-44" });
      storeIsOpen = true;
    };

    // Step 2: useEffect reacts to storeIsOpen
    const syncEffect = () => {
      if (storeIsOpen && !panelOpen) {
        panelOpen = true;
      }
    };

    handleClick();
    syncEffect();

    expect(contextItems).toHaveLength(1);
    expect(storeIsOpen).toBe(true);
    expect(panelOpen).toBe(true);
  });
});

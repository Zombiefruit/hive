/**
 * OrchestratorOrbiter — the living AI orb that shows orchestrator thoughts.
 * Wired to orchestrator:thought IPC events. Floats bottom-right.
 * Click toggles the unified OrchestratorPanel (chat + thoughts).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AiOrb from "./AiOrb";
import { OrchestratorPanel } from "./OrchestratorPanel";
import type { ThoughtEntry } from "./OrchestratorPanel";
import { useManagerStore } from "../../stores/manager-store";

interface ThoughtSlot {
  left: number;
  top: number;
  width: number;
  attachAngle: number;
}

const CONTAINER_WIDTH = 500;
const CONTAINER_HEIGHT = 420;
const ORB_SIZE = 110;
const ORB_RADIUS = ORB_SIZE / 2;
const ORB_CENTER_X = CONTAINER_WIDTH - ORB_RADIUS;
const ORB_CENTER_Y = CONTAINER_HEIGHT - ORB_RADIUS;
const CONNECTOR_RADIUS = ORB_RADIUS + 13;

const THOUGHT_SLOTS: ThoughtSlot[] = [
  { left: 210, top: 260, width: 190, attachAngle: 220 },
  { left: 198, top: 300, width: 195, attachAngle: 210 },
  { left: 192, top: 335, width: 185, attachAngle: 200 },
  { left: 220, top: 230, width: 180, attachAngle: 232 },
];

const BUBBLE_MIDLINE_Y = 30;

const getOrbAttachPoint = (angle: number) => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: ORB_CENTER_X + Math.cos(radians) * CONNECTOR_RADIUS,
    y: ORB_CENTER_Y + Math.sin(radians) * CONNECTOR_RADIUS,
  };
};

const getConnectorGeometry = (slot: ThoughtSlot) => {
  const attach = getOrbAttachPoint(slot.attachAngle);
  const startX = slot.width - 8;
  const startY = BUBBLE_MIDLINE_Y;
  const endX = attach.x - slot.left;
  const endY = attach.y - slot.top;
  const svgLeft = Math.min(startX, endX) - 10;
  const svgTop = Math.min(startY, endY) - 10;
  const width = Math.max(Math.abs(endX - startX) + 20, 28);
  const height = Math.max(Math.abs(endY - startY) + 20, 24);
  const pathStartX = startX - svgLeft;
  const pathStartY = startY - svgTop;
  const pathEndX = endX - svgLeft;
  const pathEndY = endY - svgTop;
  const control1X = pathStartX + (pathEndX - pathStartX) * 0.35;
  const control1Y = pathStartY;
  const control2X = pathStartX + (pathEndX - pathStartX) * 0.78;
  const control2Y = pathEndY;
  return {
    style: { position: "absolute" as const, left: svgLeft, top: svgTop, width, height },
    path: `M ${pathStartX} ${pathStartY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${pathEndX} ${pathEndY}`,
  };
};

export function OrchestratorOrbiter({ hidden }: { hidden?: boolean } = {}) {
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [floatingThought, setFloatingThought] = useState<{ id: string; text: string; slot: ThoughtSlot } | null>(null);
  const [intensity, setIntensity] = useState(0);
  const [isEscalation, setIsEscalation] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const isPinned = useManagerStore((s) => s.isPinned);
  const isOpenFromStore = useManagerStore((s) => s.isOpen);
  const slotIndex = useRef(0);
  const [prevCount, setPrevCount] = useState(0);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intensityTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Show a floating thought bubble — matches the demo's proven pattern
  const addFloatingThought = useCallback((text: string) => {
    const slot = THOUGHT_SLOTS[slotIndex.current % THOUGHT_SLOTS.length];
    slotIndex.current += 1;
    setFloatingThought({ id: `${Date.now()}-${Math.random()}`, text, slot });
    hideTimerRef.current = setTimeout(() => setFloatingThought(null), 4300);
  }, []);

  // React to new thoughts arriving (prevCount pattern from demo)
  useEffect(() => {
    if (thoughts.length > prevCount) {
      const latest = thoughts[thoughts.length - 1];
      setPrevCount(thoughts.length);
      // Spike intensity high so breathing visibly quickens
      setIntensity(1.8);

      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      clearTimeout(intensityTimerRef.current);
      setFloatingThought(null);

      showTimerRef.current = setTimeout(() => {
        addFloatingThought(latest.thought);
        if (latest.isEscalation) {
          setIntensity(2.5);
        } else {
          // Gradually step down: 1.8 → 0.6 → 0
          intensityTimerRef.current = setTimeout(() => {
            setIntensity(0.6);
            intensityTimerRef.current = setTimeout(() => setIntensity(0), 2000);
          }, 2500);
        }
      }, 320);
    } else if (thoughts.length < prevCount) {
      setPrevCount(thoughts.length);
    }
  }, [thoughts, prevCount, addFloatingThought]);

  // Wire to IPC
  useEffect(() => {
    const unsubThought = window.deck?.onOrchestratorThought?.((entry: ThoughtEntry) => {
      setThoughts((prev) => [...prev.slice(-49), entry]);
    });

    const unsubEscalation = window.deck?.onOrchestratorEscalation?.(() => {
      setIsEscalation(true);
      setIntensity(2);
      setThoughts((prev) => {
        if (prev.length === 0) return prev;
        const last = { ...prev[prev.length - 1], isEscalation: true };
        return [...prev.slice(0, -1), last];
      });
      setTimeout(() => setIsEscalation(false), 10000);
    });

    // Load initial thoughts
    window.deck
      ?.getOrchestratorThoughts?.(20)
      .then((t: ThoughtEntry[]) => {
        if (Array.isArray(t) && t.length > 0) setThoughts(t);
      })
      .catch(() => {});

    // Polling fallback every 10s
    const pollInterval = setInterval(() => {
      window.deck
        ?.getOrchestratorThoughts?.(20)
        .then((t: ThoughtEntry[]) => {
          if (Array.isArray(t)) {
            setThoughts((prev) => (t.length > prev.length ? t : prev));
          }
        })
        .catch(() => {});
    }, 10000);

    return () => {
      unsubThought?.();
      unsubEscalation?.();
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      clearTimeout(intensityTimerRef.current);
      clearInterval(pollInterval);
    };
  }, []);

  // Also respond to manager streaming state — pulse orb during responses
  const isStreaming = useManagerStore((s) => s.isStreaming);
  // Orb glows orange when panel is open, pulses during streaming
  const effectiveIntensity = panelOpen ? 0.8 : isStreaming && intensity < 0.5 ? 0.5 : intensity;
  const orbIsOpen = panelOpen || isPinned;

  const connector = floatingThought ? getConnectorGeometry(floatingThought.slot) : null;

  const handleOrbClick = () => {
    // Pulse on click
    setIntensity(1.5);
    setTimeout(() => setIntensity(panelOpen ? 0 : 0.8), 600);

    setPanelOpen((prev) => !prev);
    const store = useManagerStore.getState();
    if (!panelOpen) {
      store.setOpen(true);
    } else {
      store.setOpen(false);
    }
  };

  const handlePanelClose = () => {
    setPanelOpen(false);
    useManagerStore.getState().setOpen(false);
    useManagerStore.getState().setPinned(false);
  };

  // Keep panelOpen in sync with isPinned
  useEffect(() => {
    if (isPinned) setPanelOpen(true);
  }, [isPinned]);

  // Open panel when isOpen is set externally (e.g. AddToManagerButton)
  useEffect(() => {
    if (isOpenFromStore && !panelOpen) setPanelOpen(true);
  }, [isOpenFromStore]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden) return null;

  return (
    <>
      {/* Floating container — only render when NOT pinned */}
      {!isPinned && (
        <div
          style={{
            position: "fixed",
            bottom: 40,
            right: 32,
            zIndex: 50,
            pointerEvents: "none",
            width: CONTAINER_WIDTH,
            height: CONTAINER_HEIGHT,
          }}
        >
          {/* Floating thought bubble */}
          <AnimatePresence mode="wait" initial={false}>
            {floatingThought && connector && (
              <motion.div
                key={floatingThought.id}
                style={{
                  position: "absolute",
                  pointerEvents: "none",
                  left: floatingThought.slot.left,
                  top: floatingThought.slot.top,
                  width: floatingThought.slot.width,
                }}
                initial={{ opacity: 0, scale: 0.92, x: 10, y: 4 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, x: 6, y: 2, transition: { duration: 0.38, ease: "easeOut" } }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                {/* Connector line */}
                <svg style={{ ...connector.style, pointerEvents: "none", overflow: "visible" }}>
                  <defs>
                    <linearGradient id={`tendril-${floatingThought.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop
                        offset="0%"
                        stopColor={isEscalation ? "hsl(15 90% 55%)" : "hsl(220 70% 70%)"}
                        stopOpacity="0.55"
                      />
                      <stop
                        offset="100%"
                        stopColor={isEscalation ? "hsl(15 90% 55%)" : "hsl(220 70% 70%)"}
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d={connector.path}
                    fill="none"
                    stroke={`url(#tendril-${floatingThought.id})`}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>

                {/* Thought card */}
                <div
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 12,
                    padding: "10px 12px",
                    width: floatingThought.slot.width,
                    background: "var(--aegen-gradient-surface)",
                    backdropFilter: "var(--aegen-glass-blur)",
                    border: `1px solid ${isEscalation ? "var(--aegen-alert-warm)" : "var(--aegen-cosmic-blue)"}`,
                    borderColor: isEscalation ? "rgba(255, 107, 61, 0.3)" : "rgba(74, 125, 255, 0.3)",
                    boxShadow: "var(--aegen-glass-shadow-elevated)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      color: isEscalation ? "var(--aegen-alert-warm)" : "var(--aegen-star-white)",
                    }}
                  >
                    {floatingThought.text}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Orb */}
          <motion.div
            style={{ position: "absolute", bottom: 0, right: 0, cursor: "pointer", pointerEvents: "auto" }}
            onClick={handleOrbClick}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
          >
            <AiOrb intensity={effectiveIntensity} isEscalation={isEscalation || orbIsOpen} size={ORB_SIZE} />
          </motion.div>
        </div>
      )}

      {/* Panel (floating or pinned) */}
      <AnimatePresence>
        {(panelOpen || isPinned) && (
          <OrchestratorPanel thoughts={thoughts} isEscalation={isEscalation} onClose={handlePanelClose} />
        )}
      </AnimatePresence>
    </>
  );
}

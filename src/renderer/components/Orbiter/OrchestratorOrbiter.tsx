/**
 * OrchestratorOrbiter — the living AI orb that shows orchestrator thoughts.
 * Wired to orchestrator:thought IPC events. Floats bottom-right.
 * Click toggles the unified OrchestratorPanel (chat + thoughts).
 */

import { useState, useEffect, useRef } from "react";
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
  { left: 100, top: 160, width: 195, attachAngle: 225 },
  { left: 88, top: 214, width: 200, attachAngle: 212 },
  { left: 82, top: 264, width: 190, attachAngle: 198 },
  { left: 112, top: 126, width: 185, attachAngle: 238 },
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

export function OrchestratorOrbiter() {
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [floatingThought, setFloatingThought] = useState<{ id: string; text: string; slot: ThoughtSlot } | null>(null);
  const [intensity, setIntensity] = useState(0);
  const [isEscalation, setIsEscalation] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const isPinned = useManagerStore((s) => s.isPinned);
  const slotIndex = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Wire to IPC
  useEffect(() => {
    const unsubThought = window.deck?.onOrchestratorThought?.((entry: ThoughtEntry) => {
      setThoughts((prev) => [...prev.slice(-49), entry]);
      setIntensity(1);

      // Show floating bubble
      clearTimeout(hideTimer.current);
      const slot = THOUGHT_SLOTS[slotIndex.current % THOUGHT_SLOTS.length];
      slotIndex.current += 1;
      setFloatingThought(null);
      setTimeout(() => {
        setFloatingThought({ id: `${Date.now()}`, text: entry.thought, slot });
        hideTimer.current = setTimeout(() => {
          setFloatingThought(null);
          setIntensity(0);
        }, 4300);
      }, 320);
    });

    const unsubEscalation = window.deck?.onOrchestratorEscalation?.(() => {
      setIsEscalation(true);
      setIntensity(2);
      // Mark the most recent thought as an escalation
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
        if (Array.isArray(t)) setThoughts(t);
      })
      .catch(() => {});

    return () => {
      unsubThought?.();
      unsubEscalation?.();
      clearTimeout(hideTimer.current);
    };
  }, []);

  // Also respond to manager streaming state — pulse orb during responses
  const isStreaming = useManagerStore((s) => s.isStreaming);
  const effectiveIntensity = isStreaming && intensity < 0.5 ? 0.5 : intensity;

  const connector = floatingThought ? getConnectorGeometry(floatingThought.slot) : null;

  const handleOrbClick = () => {
    setPanelOpen((prev) => !prev);
    // Also sync with manager-store isOpen
    const store = useManagerStore.getState();
    if (!panelOpen) {
      store.setOpen(true);
    } else {
      store.setOpen(false);
    }
  };

  const handlePanelClose = () => {
    setPanelOpen(false);
  };

  // Keep panelOpen in sync with isPinned
  useEffect(() => {
    if (isPinned) setPanelOpen(true);
  }, [isPinned]);

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
                    background: "linear-gradient(135deg, hsl(228 36% 7% / 0.9), hsl(248 34% 11% / 0.82))",
                    backdropFilter: "blur(16px) saturate(1.3)",
                    border: `1px solid ${isEscalation ? "hsl(15 80% 50% / 0.32)" : "hsl(220 70% 60% / 0.28)"}`,
                    boxShadow: isEscalation
                      ? "0 0 18px hsl(15 90% 50% / 0.18), inset 0 0 16px hsl(15 90% 50% / 0.05)"
                      : "0 0 20px hsl(220 90% 60% / 0.14), inset 0 0 16px hsl(220 90% 65% / 0.05)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      color: isEscalation ? "hsl(18 75% 88%)" : "hsl(214 100% 91%)",
                      textShadow: isEscalation
                        ? "0 0 10px hsl(15 90% 55% / 0.25)"
                        : "0 0 10px hsl(220 90% 75% / 0.18)",
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
            <AiOrb intensity={effectiveIntensity} isEscalation={isEscalation} size={ORB_SIZE} />
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

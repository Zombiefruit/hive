/**
 * OrchestratorOrbiter — the living AI orb that shows orchestrator thoughts.
 * Wired to orchestrator:thought IPC events. Floats bottom-right.
 * Click to open chat panel with thought history.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AiOrb from "./AiOrb";

interface ThoughtEntry {
  timestamp: string;
  thought: string;
}

interface ThoughtSlot {
  left: number;
  top: number;
  width: number;
  attachAngle: number;
}

const CONTAINER_WIDTH = 440;
const CONTAINER_HEIGHT = 390;
const ORB_SIZE = 110;
const ORB_RADIUS = ORB_SIZE / 2;
const ORB_CENTER_X = CONTAINER_WIDTH - ORB_RADIUS;
const ORB_CENTER_Y = CONTAINER_HEIGHT - ORB_RADIUS;
const CONNECTOR_RADIUS = ORB_RADIUS + 13;
const BUBBLE_MIDLINE_Y = 30;

const THOUGHT_SLOTS: ThoughtSlot[] = [
  { left: 100, top: 160, width: 195, attachAngle: 225 },
  { left: 88, top: 214, width: 200, attachAngle: 212 },
  { left: 82, top: 264, width: 190, attachAngle: 198 },
  { left: 112, top: 126, width: 185, attachAngle: 238 },
];

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

function ThoughtsBubbleList({ thoughts, onClose }: { thoughts: ThoughtEntry[]; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thoughts.length]);

  return (
    <motion.div
      style={{
        position: "fixed", bottom: 20, right: 32, zIndex: 60, pointerEvents: "auto",
        width: 360, maxHeight: 420,
        display: "flex", flexDirection: "column",
        borderRadius: 16, overflow: "hidden",
        background: "linear-gradient(180deg, hsl(228 36% 7% / 0.96), hsl(248 34% 9% / 0.98))",
        backdropFilter: "blur(24px) saturate(1.4)",
        border: "1px solid hsl(220 60% 50% / 0.2)",
        boxShadow: "0 8px 40px hsl(220 90% 10% / 0.6), 0 0 1px hsl(220 80% 60% / 0.3)",
      }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: "1px solid hsl(220 40% 20% / 0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32 }}><AiOrb intensity={0} isEscalation={false} size={32} /></div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(214 100% 91%)", fontFamily: "Inter, sans-serif" }}>
            Orchestrator Thoughts
          </span>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "hsl(220 20% 55%)",
        }}>✕</button>
      </div>

      {/* Thought list */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        scrollbarWidth: "thin", scrollbarColor: "hsl(220 30% 25%) transparent",
      }}>
        {thoughts.length === 0 ? (
          <p style={{ textAlign: "center", fontSize: 12, padding: "32px 0", color: "hsl(220 20% 40%)" }}>
            No thoughts yet…
          </p>
        ) : (
          thoughts.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{
                marginTop: 6, width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: "hsl(220 70% 65% / 0.6)",
              }} />
              <div>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: "hsl(220 30% 75%)", margin: 0 }}>{t.thought}</p>
                <p style={{ fontSize: 10, color: "hsl(220 15% 38%)", margin: "2px 0 0" }}>
                  {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

export function OrchestratorOrbiter() {
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [floatingThought, setFloatingThought] = useState<{ id: string; text: string; slot: ThoughtSlot } | null>(null);
  const [intensity, setIntensity] = useState(0);
  const [isEscalation, setIsEscalation] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const slotIndex = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Wire to IPC
  useEffect(() => {
    const unsubThought = window.deck?.onOrchestratorThought?.((entry: ThoughtEntry) => {
      setThoughts(prev => [...prev.slice(-49), entry]);
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
      setTimeout(() => setIsEscalation(false), 10000);
    });

    // Load initial thoughts
    window.deck?.getOrchestratorThoughts?.(20).then((t: ThoughtEntry[]) => {
      if (Array.isArray(t)) setThoughts(t);
    }).catch(() => {});

    return () => { unsubThought?.(); unsubEscalation?.(); clearTimeout(hideTimer.current); };
  }, []);

  const connector = floatingThought ? getConnectorGeometry(floatingThought.slot) : null;

  return (
    <>
      {/* Floating container */}
      <div style={{
        position: "fixed", bottom: 20, right: 32, zIndex: 50, pointerEvents: "none",
        width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT,
      }}>
        {/* Floating thought bubble */}
        <AnimatePresence mode="wait" initial={false}>
          {floatingThought && connector && (
            <motion.div
              key={floatingThought.id}
              style={{
                position: "absolute", pointerEvents: "none",
                left: floatingThought.slot.left, top: floatingThought.slot.top,
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
                    <stop offset="0%" stopColor={isEscalation ? "hsl(15 90% 55%)" : "hsl(220 70% 70%)"} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={isEscalation ? "hsl(15 90% 55%)" : "hsl(220 70% 70%)"} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={connector.path} fill="none" stroke={`url(#tendril-${floatingThought.id})`} strokeWidth="1.2" strokeLinecap="round" />
              </svg>

              {/* Thought card */}
              <div style={{
                position: "relative", overflow: "hidden", borderRadius: 12, padding: "10px 12px",
                width: floatingThought.slot.width,
                background: "linear-gradient(135deg, hsl(228 36% 7% / 0.9), hsl(248 34% 11% / 0.82))",
                backdropFilter: "blur(16px) saturate(1.3)",
                border: `1px solid ${isEscalation ? "hsl(15 80% 50% / 0.32)" : "hsl(220 70% 60% / 0.28)"}`,
                boxShadow: isEscalation
                  ? "0 0 18px hsl(15 90% 50% / 0.18), inset 0 0 16px hsl(15 90% 50% / 0.05)"
                  : "0 0 20px hsl(220 90% 60% / 0.14), inset 0 0 16px hsl(220 90% 65% / 0.05)",
              }}>
                <p style={{
                  margin: 0, fontSize: 11.5, lineHeight: 1.5,
                  color: isEscalation ? "hsl(18 75% 88%)" : "hsl(214 100% 91%)",
                  textShadow: isEscalation ? "0 0 10px hsl(15 90% 55% / 0.25)" : "0 0 10px hsl(220 90% 75% / 0.18)",
                }}>
                  {floatingThought.text}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Orb */}
        <motion.div
          style={{ position: "absolute", bottom: 0, right: 0, cursor: "pointer", pointerEvents: "auto" }}
          onClick={() => setPanelOpen(prev => !prev)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
        >
          <AiOrb intensity={intensity} isEscalation={isEscalation} size={ORB_SIZE} />
        </motion.div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {panelOpen && (
          <ThoughtsBubbleList thoughts={thoughts} onClose={() => setPanelOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

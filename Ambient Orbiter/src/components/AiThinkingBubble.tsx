import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AiOrb from "./AiOrb";
import AiChatPanel from "./AiChatPanel";

export interface ThoughtEntry {
  timestamp: string;
  thought: string;
}

interface AiThinkingBubbleProps {
  thoughts: ThoughtEntry[];
  isEscalation: boolean;
  onDismiss: () => void;
}

interface ThoughtSlot {
  left: number;
  top: number;
  width: number;
  attachAngle: number;
}

interface FloatingThought {
  id: string;
  text: string;
  slot: ThoughtSlot;
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
    style: {
      left: svgLeft,
      top: svgTop,
      width,
      height,
    },
    path: `M ${pathStartX} ${pathStartY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${pathEndX} ${pathEndY}`,
  };
};

const AiThinkingBubble: React.FC<AiThinkingBubbleProps> = ({ thoughts, isEscalation, onDismiss }) => {
  const [floatingThought, setFloatingThought] = useState<FloatingThought | null>(null);
  const [prevCount, setPrevCount] = useState(thoughts.length);
  const [intensity, setIntensity] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const slotIndex = useRef(0);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const intensityTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearThoughtTimers = useCallback(() => {
    clearTimeout(showTimerRef.current);
    clearTimeout(hideTimerRef.current);
  }, []);

  const addFloatingThought = useCallback((text: string) => {
    const slot = THOUGHT_SLOTS[slotIndex.current % THOUGHT_SLOTS.length];
    slotIndex.current += 1;

    setFloatingThought({
      id: `${Date.now()}-${Math.random()}`,
      text,
      slot,
    });

    hideTimerRef.current = setTimeout(() => {
      setFloatingThought(null);
    }, 4300);
  }, []);

  useEffect(() => {
    if (thoughts.length > prevCount) {
      const latest = thoughts[thoughts.length - 1];
      setPrevCount(thoughts.length);
      setIntensity(1);

      clearThoughtTimers();
      clearTimeout(intensityTimerRef.current);
      setFloatingThought(null);

      showTimerRef.current = setTimeout(() => {
        addFloatingThought(latest.thought);

        if (isEscalation) {
          setIntensity(2);
        } else {
          intensityTimerRef.current = setTimeout(() => setIntensity(0), 2800);
        }
      }, 320);
    } else if (thoughts.length < prevCount) {
      setPrevCount(thoughts.length);
    }
  }, [thoughts, prevCount, isEscalation, addFloatingThought, clearThoughtTimers]);

  useEffect(() => {
    if (!isEscalation && intensity === 2) {
      setIntensity(0);
    }
  }, [isEscalation, intensity]);

  useEffect(() => {
    return () => {
      clearThoughtTimers();
      clearTimeout(intensityTimerRef.current);
    };
  }, [clearThoughtTimers]);

  const orbSize = 110;
  const connector = floatingThought ? getConnectorGeometry(floatingThought.slot) : null;

  return (
    <div
      className="fixed bottom-5 right-8 z-50 pointer-events-none"
      style={{ width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {floatingThought && connector && (
          <motion.div
            key={floatingThought.id}
            className="absolute pointer-events-none"
            style={{
              left: floatingThought.slot.left,
              top: floatingThought.slot.top,
              width: floatingThought.slot.width,
            }}
            initial={{ opacity: 0, scale: 0.92, x: 10, y: 4 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.97,
              x: 6,
              y: 2,
              transition: { duration: 0.38, ease: "easeOut" },
            }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <svg
              className="absolute pointer-events-none overflow-visible"
              style={connector.style}
            >
              <defs>
                <linearGradient id={`tendril-${floatingThought.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={isEscalation ? "hsl(15 90% 55%)" : "hsl(220 70% 70%)"} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={isEscalation ? "hsl(15 90% 55%)" : "hsl(220 70% 70%)"} stopOpacity="0" />
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

            <div
              className="relative overflow-hidden rounded-xl px-3 py-2.5"
              style={{
                width: floatingThought.slot.width,
                background: "linear-gradient(135deg, hsl(228 36% 7% / 0.9), hsl(248 34% 11% / 0.82))",
                backdropFilter: "blur(16px) saturate(1.3)",
                border: `1px solid ${isEscalation ? "hsl(15 80% 50% / 0.32)" : "hsl(220 70% 60% / 0.28)"}`,
                boxShadow: isEscalation
                  ? "0 0 18px hsl(15 90% 50% / 0.18), inset 0 0 16px hsl(15 90% 50% / 0.05)"
                  : "0 0 20px hsl(220 90% 60% / 0.14), inset 0 0 16px hsl(220 90% 65% / 0.05)",
              }}
            >
              <div
                className="absolute inset-x-3 top-0 h-px"
                style={{
                  background: isEscalation
                    ? "linear-gradient(90deg, transparent, hsl(15 90% 60% / 0.65), transparent)"
                    : "linear-gradient(90deg, transparent, hsl(220 100% 80% / 0.75), transparent)",
                }}
              />
              <div
                className="absolute right-0 top-0 h-12 w-12 rounded-full"
                style={{
                  background: isEscalation
                    ? "radial-gradient(circle, hsl(15 90% 55% / 0.2) 0%, transparent 72%)"
                    : "radial-gradient(circle, hsl(215 100% 82% / 0.16) 0%, transparent 72%)",
                  transform: "translate(28%, -30%)",
                }}
              />
              <p
                className="relative z-10 text-[11.5px] leading-relaxed"
                style={{
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

      <motion.div
        className="absolute bottom-0 right-0 cursor-pointer pointer-events-auto"
        onClick={() => setChatOpen(prev => !prev)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 18 }}
      >
        <AiOrb intensity={intensity} isEscalation={isEscalation} size={orbSize} />
      </motion.div>

      <AnimatePresence>
        {chatOpen && (
          <AiChatPanel
            thoughts={thoughts}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AiThinkingBubble;

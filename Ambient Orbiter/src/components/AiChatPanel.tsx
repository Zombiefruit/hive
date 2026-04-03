import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Send } from "lucide-react";
import type { ThoughtEntry } from "./AiThinkingBubble";
import AiOrb from "./AiOrb";

interface AiChatPanelProps {
  thoughts: ThoughtEntry[];
  isOpen: boolean;
  onClose: () => void;
}

const MOCK_MESSAGES = [
  { role: "assistant" as const, content: "I'm monitoring 12 active tasks across 3 sprints. Everything is on track." },
  { role: "user" as const, content: "What's the status on VEC-42?" },
  { role: "assistant" as const, content: "VEC-42 is blocked on a code review. I pinged the assignee 8 minutes ago. If no response in 7 more minutes, I'll escalate to the team lead." },
  { role: "user" as const, content: "Good. Any risks for this sprint?" },
  { role: "assistant" as const, content: "Two items to watch:\n\n1. **VEC-55** has a dependency on the API team — their branch hasn't merged yet.\n2. **VEC-61** was larger than estimated. I've spawned 3 subtasks to parallelize the work.\n\nOverall sprint velocity is up 12% from last week." },
];

const AiChatPanel: React.FC<AiChatPanelProps> = ({ thoughts, isOpen, onClose }) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "thoughts">("chat");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, activeTab, thoughts.length]);

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed bottom-5 right-8 z-[60] pointer-events-auto"
      style={{ width: 380, height: 520 }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div
        className="flex flex-col h-full rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, hsl(228 36% 7% / 0.96), hsl(248 34% 9% / 0.98))",
          backdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid hsl(220 60% 50% / 0.2)",
          boxShadow: "0 8px 40px hsl(220 90% 10% / 0.6), 0 0 1px hsl(220 80% 60% / 0.3)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: "hsl(220 40% 20% / 0.4)" }}>
          <div className="shrink-0 -ml-1 mr-2" style={{ width: 36, height: 36 }}>
            <AiOrb intensity={0} isEscalation={false} size={36} />
          </div>
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "hsl(220 30% 12% / 0.6)" }}>
            <button
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
              style={{
                background: activeTab === "chat" ? "hsl(220 60% 50% / 0.25)" : "transparent",
                color: activeTab === "chat" ? "hsl(214 100% 91%)" : "hsl(220 20% 50%)",
              }}
              onClick={() => setActiveTab("chat")}
            >
              Chat
            </button>
            <button
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
              style={{
                background: activeTab === "thoughts" ? "hsl(220 60% 50% / 0.25)" : "transparent",
                color: activeTab === "thoughts" ? "hsl(214 100% 91%)" : "hsl(220 20% 50%)",
              }}
              onClick={() => setActiveTab("thoughts")}
            >
              Thoughts
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
          >
            <X size={16} style={{ color: "hsl(220 20% 55%)" }} />
          </button>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(220 30% 25%) transparent" }}>
          {activeTab === "chat" ? (
            MOCK_MESSAGES.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed"
                  style={msg.role === "user" ? {
                    background: "hsl(220 60% 45% / 0.3)",
                    color: "hsl(214 100% 91%)",
                    border: "1px solid hsl(220 60% 50% / 0.2)",
                  } : {
                    background: "hsl(228 30% 12% / 0.6)",
                    color: "hsl(220 30% 78%)",
                    border: "1px solid hsl(220 30% 20% / 0.3)",
                  }}
                >
                  {msg.content.split("\n").map((line, j) => (
                    <span key={j}>
                      {line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
                        part.startsWith("**") && part.endsWith("**")
                          ? <strong key={k} style={{ color: "hsl(214 100% 88%)" }}>{part.slice(2, -2)}</strong>
                          : part
                      )}
                      {j < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            thoughts.length === 0 ? (
              <p className="text-center text-xs py-8" style={{ color: "hsl(220 20% 40%)" }}>
                No thoughts yet…
              </p>
            ) : (
              thoughts.map((t, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "hsl(220 70% 65% / 0.6)" }}
                  />
                  <div>
                    <p className="text-[12px] leading-relaxed" style={{ color: "hsl(220 30% 75%)" }}>
                      {t.thought}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "hsl(220 15% 38%)" }}>
                      {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Input area */}
        {activeTab === "chat" && (
          <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "hsl(220 40% 20% / 0.3)" }}>
            <div className="flex gap-2 items-center rounded-xl px-3 py-2"
              style={{
                background: "hsl(228 30% 10% / 0.7)",
                border: "1px solid hsl(220 40% 25% / 0.3)",
              }}>
              <input
                type="text"
                placeholder="Ask the orchestrator…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && setInput("")}
                className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[hsl(220,15%,35%)]"
                style={{ color: "hsl(214 100% 91%)" }}
              />
              <button
                className="p-1 rounded-md transition-colors hover:bg-white/5"
                onClick={() => setInput("")}
              >
                <Send size={14} style={{ color: "hsl(220 60% 60%)" }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AiChatPanel;

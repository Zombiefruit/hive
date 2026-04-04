/**
 * OrchestratorPanel — unified floating/pinnable panel that merges Manager Chat
 * into the Orchestrator Orbiter. Two tabs: Chat and Thoughts.
 *
 * - Chat tab: reuses ManagerMessages, ManagerInput, ContextChips, ConversationSidebar
 * - Thoughts tab: scrollable orchestrator thought stream with timestamps
 * - Supports floating (bottom-right) and pinned (full-height right sidebar) modes
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  IconX, IconPin, IconPinFilled, IconMessageCircle, IconBrain,
} from "@tabler/icons-react";
import AiOrb from "./AiOrb";
import { ManagerMessages } from "../ManagerChat/ManagerMessages";
import { ManagerInput } from "../ManagerChat/ManagerInput";
import { ConversationSidebar } from "../ManagerChat/ConversationSidebar";
import { ContextChips } from "../ManagerChat/ContextChips";
import { useManagerStore } from "../../stores/manager-store";
import type { ManagerMessage, ManagerConversation } from "../../stores/manager-store";

export interface ThoughtEntry {
  timestamp: string;
  thought: string;
  isEscalation?: boolean;
}

type Tab = "chat" | "thoughts";

const PANEL_WIDTH = 420;
const PINNED_WIDTH = 480;

// ---- Tab button ----
function TabButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        background: active ? "rgba(74, 125, 255, 0.15)" : "transparent",
        border: "none",
        borderRadius: 8,
        padding: "4px 12px",
        cursor: "pointer",
        color: active ? "var(--aegen-star-white)" : "var(--aegen-dust-gray)",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        fontFamily: "var(--aegen-font-primary)",
        transition: "all 0.2s ease",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ---- Thoughts list ----
function ThoughtsList({ thoughts }: { thoughts: ThoughtEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thoughts.length]);

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px",
      }}
    >
      {thoughts.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            padding: "32px 0",
            color: "var(--aegen-dust-gray)",
            fontFamily: "var(--aegen-font-primary)",
          }}
        >
          No thoughts yet...
        </p>
      ) : (
        thoughts.map((t, i) => {
          const isEsc = t.isEscalation;
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <div
                style={{
                  marginTop: 6,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isEsc ? "var(--aegen-alert-warm)" : "var(--aegen-cosmic-blue)",
                  opacity: isEsc ? 1 : 0.6,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: isEsc ? "var(--aegen-alert-warm)" : "var(--aegen-star-white)",
                    margin: 0,
                    fontFamily: "var(--aegen-font-primary)",
                    opacity: isEsc ? 1 : 0.8,
                  }}
                >
                  {t.thought}
                </p>
                <p
                  style={{
                    fontSize: 9,
                    color: "var(--aegen-dust-gray)",
                    margin: "2px 0 0",
                    fontFamily: "var(--aegen-font-mono)",
                    letterSpacing: "0.05em",
                    opacity: 0.6,
                  }}
                >
                  {new Date(t.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---- Chat content (wired to manager IPC) ----
function ChatContent() {
  const setStreaming = useManagerStore((s) => s.setStreaming);
  const appendStreamingText = useManagerStore((s) => s.appendStreamingText);
  const clearStreamingText = useManagerStore((s) => s.clearStreamingText);
  const addMessage = useManagerStore((s) => s.addMessage);
  const setConversations = useManagerStore((s) => s.setConversations);
  const setMessages = useManagerStore((s) => s.setMessages);
  const contextItems = useManagerStore((s) => s.contextItems);

  // Load conversations + messages on mount
  useEffect(() => {
    (async () => {
      try {
        const convos = await window.deck.getManagerConversations?.();
        if (convos) setConversations(convos);
        const msgs = await window.deck.getManagerMessages?.();
        if (msgs) setMessages(msgs);
      } catch {
        /* noop */
      }
    })();
  }, [setConversations, setMessages]);

  // Wire streaming IPC
  useEffect(() => {
    const unsub = window.deck.onManagerStream((event: unknown) => {
      const evt = event as { type: string; text?: string; message?: ManagerMessage; error?: string };
      switch (evt.type) {
        case "message_start":
          setStreaming(true);
          clearStreamingText();
          break;
        case "text_delta":
          appendStreamingText(evt.text ?? "");
          break;
        case "message_complete":
          setStreaming(false);
          clearStreamingText();
          if (evt.message) addMessage(evt.message);
          window.deck.getManagerConversations().then((convos: ManagerConversation[]) => {
            if (convos) setConversations(convos);
          });
          break;
        case "error":
          setStreaming(false);
          clearStreamingText();
          break;
      }
    });
    return unsub;
  }, [setStreaming, appendStreamingText, clearStreamingText, addMessage, setConversations]);

  const handleSend = useCallback(
    async (message: string) => {
      let fullMessage = message;
      if (contextItems.length > 0) {
        const contextStr = contextItems
          .map((c) => `[${c.type}: ${c.label}${c.data ? ` — ${JSON.stringify(c.data)}` : ""}]`)
          .join(", ");
        fullMessage = `[Context: ${contextStr}]\n\n${message}`;
      }
      addMessage({ id: crypto.randomUUID(), role: "user", content: message, timestamp: new Date().toISOString() });
      setStreaming(true);
      try {
        await window.deck.sendManagerMessage(fullMessage);
      } catch {
        setStreaming(false);
      }
    },
    [contextItems, addMessage, setStreaming],
  );

  const handleNewConversation = async () => {
    const conv = await window.deck.newManagerConversation();
    if (conv) {
      useManagerStore.getState().setActiveConversation(conv.id);
      useManagerStore.getState().setMessages([]);
      const convos = await window.deck.getManagerConversations();
      if (convos) setConversations(convos);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "row", minWidth: 0, overflow: "hidden" }}>
      <ConversationSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Chat header with new-conversation button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "2px 12px",
            borderBottom: "1px solid var(--aegen-glass-border)",
          }}
        >
          <button
            onClick={handleNewConversation}
            title="New conversation"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
              borderRadius: 6,
              color: "var(--aegen-dust-gray)",
              fontSize: 12,
              fontFamily: "var(--aegen-font-primary)",
            }}
          >
            + New
          </button>
        </div>
        <ContextChips />
        <ManagerMessages onSuggestedPrompt={handleSend} />
        <ManagerInput onSend={handleSend} />
      </div>
    </div>
  );
}

// ---- Main OrchestratorPanel ----
interface OrchestratorPanelProps {
  thoughts: ThoughtEntry[];
  isEscalation: boolean;
  onClose: () => void;
}

export function OrchestratorPanel({ thoughts, isEscalation, onClose }: OrchestratorPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const isPinned = useManagerStore((s) => s.isPinned);
  const setPinned = useManagerStore((s) => s.setPinned);
  const setOpen = useManagerStore((s) => s.setOpen);

  const handleTogglePin = () => {
    if (isPinned) {
      setPinned(false);
    } else {
      setPinned(true);
      setOpen(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setPinned(false);
    onClose();
  };

  const panelContent = (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--aegen-glass-border)",
          flexShrink: 0,
        }}
      >
        {/* Mini orb */}
        <div style={{ width: 32, height: 32, flexShrink: 0 }}>
          <AiOrb intensity={isEscalation ? 1.5 : 0} isEscalation={isEscalation} size={32} />
        </div>

        {/* Tab toggle */}
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "var(--aegen-glass-bg)",
            borderRadius: 10,
            padding: 2,
          }}
        >
          <TabButton label="Chat" icon={<IconMessageCircle size={13} />} active={activeTab === "chat"} onClick={() => setActiveTab("chat")} />
          <TabButton label="Thoughts" icon={<IconBrain size={13} />} active={activeTab === "thoughts"} onClick={() => setActiveTab("thoughts")} />
        </div>

        <div style={{ flex: 1 }} />

        {/* Pin button */}
        <button
          onClick={handleTogglePin}
          title={isPinned ? "Unpin from sidebar" : "Pin to sidebar"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isPinned ? "rgba(74, 125, 255, 0.2)" : "none",
            border: "none",
            cursor: "pointer",
            padding: 5,
            borderRadius: 6,
            color: isPinned ? "var(--aegen-cosmic-blue)" : "var(--aegen-dust-gray)",
            transition: "all 0.15s ease",
          }}
        >
          {isPinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
        </button>

        {/* Close button */}
        <button
          onClick={handleClose}
          title="Close panel"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 5,
            borderRadius: 6,
            color: "var(--aegen-dust-gray)",
            transition: "color 0.15s ease",
          }}
        >
          <IconX size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {activeTab === "chat" ? <ChatContent /> : <ThoughtsList thoughts={thoughts} />}
      </div>
    </>
  );

  // ---- Pinned mode: full-height right sidebar ----
  if (isPinned) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: PINNED_WIDTH,
          zIndex: 90,
          display: "flex",
          flexDirection: "column",
          background: "var(--aegen-gradient-surface)",
          borderLeft: "1px solid var(--aegen-glass-border)",
          boxShadow: "var(--aegen-glass-shadow-elevated)",
        }}
      >
        {panelContent}
      </div>
    );
  }

  // ---- Floating mode: animated panel above the orb ----
  return (
    <motion.div
      style={{
        position: "fixed",
        bottom: 20,
        right: 32,
        zIndex: 60,
        pointerEvents: "auto",
        width: PANEL_WIDTH,
        height: 560,
        maxHeight: "calc(100vh - 80px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        overflow: "hidden",
        background: "var(--aegen-gradient-surface)",
        backdropFilter: "var(--aegen-glass-blur)",
        border: "1px solid var(--aegen-glass-border)",
        boxShadow: "var(--aegen-glass-shadow-elevated)",
      }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {panelContent}
    </motion.div>
  );
}

/**
 * Mock implementation of window.deck for browser-only dev mode.
 * Provides no-op stubs so the UI renders without the Electron main process.
 */
const noop = () => Promise.resolve(undefined as never);
const noopUnsub = () => () => {};

if (!window.deck) {
  console.warn("[Claude Deck] Running in browser mode — IPC calls are mocked");
  (window as unknown as { deck: unknown }).deck = {
    spawnAgent: noop,
    killAgent: noop,
    sendMessage: noop,
    interruptAgent: noop,
    respondToApproval: noop,
    addContextUrl: noop,
    sendManagerMessage: noop,
    getManagerConversations: () => Promise.resolve([]),
    switchManagerConversation: noop,
    newManagerConversation: () => Promise.resolve({ id: "mock", title: "Mock", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    deleteManagerConversation: noop,
    getManagerMessages: () => Promise.resolve([]),
    onStoreUpdate: noopUnsub,
    onAgentStream: noopUnsub,
    onApprovalRequest: noopUnsub,
    onManagerStream: noopUnsub,
  };
}

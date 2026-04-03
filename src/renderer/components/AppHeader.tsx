import { Group, Text } from "@mantine/core";
import { useState, useEffect } from "react";

// Shared constants — match HEADER_HEIGHT in src/main/index.ts
export const TITLEBAR_HEIGHT = 36;
export const TITLEBAR_PADDING_LEFT = 90; // Clears traffic lights in windowed mode
export const TITLEBAR_PADDING_LEFT_FULLSCREEN = 16;

interface AppHeaderProps {
  /** Optional page title shown in the header */
  title?: string;
  /** Extra content to render on the right side of the header */
  rightContent?: React.ReactNode;
}

export function useIsFullscreen(): boolean {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const unsub = window.deck?.onFullscreenChange?.((isFullscreen: boolean) => setFs(isFullscreen));
    return () => { unsub?.(); };
  }, []);
  return fs;
}

export function AppHeader({ title, rightContent }: AppHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: TITLEBAR_HEIGHT,
        padding: "0 16px",
        gap: 12,
        borderBottom: "1px solid rgba(68, 73, 85, 0.12)",
        background: "rgba(16, 21, 32, 0.6)",
        backdropFilter: "blur(12px) saturate(1.1)",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      }}
    >
      {/* Page title */}
      {title && (
        <Text
          size="sm"
          fw={600}
          style={{
            color: "var(--aegen-star-white)",
            WebkitAppRegion: "no-drag",
          }}
        >
          {title}
        </Text>
      )}

      {/* Right side */}
      <Group gap={8} style={{ WebkitAppRegion: "no-drag", marginLeft: "auto" }}>
        {rightContent}
      </Group>
    </div>
  );
}

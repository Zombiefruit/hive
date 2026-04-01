interface StatusDotProps {
  status: string;
  size?: number;
  pulse?: boolean;
}

const statusColors: Record<string, string> = {
  active: "var(--mantine-color-green-filled)",
  running: "var(--mantine-color-green-filled)",
  idle: "var(--mantine-color-yellow-filled)",
  errored: "var(--mantine-color-red-filled)",
  completed: "var(--mantine-color-dimmed)",
  done: "var(--mantine-color-dimmed)",
};

export function StatusDot({ status, size = 8, pulse }: StatusDotProps) {
  const color = statusColors[status] ?? "var(--mantine-color-dimmed)";
  const shouldPulse = pulse ?? (status === "active" || status === "running");

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {shouldPulse && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundColor: color,
            opacity: 0.4,
            animation: "pulse-dot 2s ease-in-out infinite",
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </span>
  );
}

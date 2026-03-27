import { UnstyledButton, Loader, Text, Group } from "@mantine/core";

interface ActionButtonProps {
  label: string;
  description: string;
  onClick: () => void;
  color?: string;          // default "#3b82f6"
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "outline";
}

export function ActionButton({ label, description, onClick, color = "#3b82f6", icon, disabled, loading, variant = "primary" }: ActionButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <div>
      <UnstyledButton
        onClick={onClick}
        disabled={disabled || loading}
        style={{
          padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          backgroundColor: isPrimary ? color : "transparent",
          color: isPrimary ? "white" : "var(--mantine-color-text)",
          border: isPrimary ? "none" : "1px solid var(--mantine-color-default-border)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {loading ? <Loader size={14} color="white" /> : icon}
        {label}
      </UnstyledButton>
      <Text size="xs" c="dimmed" mt={4} style={{ fontSize: "0.6rem", maxWidth: 300 }}>
        {description}
      </Text>
    </div>
  );
}

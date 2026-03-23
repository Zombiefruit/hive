import { ActionIcon, Tooltip } from "@mantine/core";
import { IconMessageChatbot } from "@tabler/icons-react";
import { useManagerStore } from "../stores/manager-store";

interface AddToManagerButtonProps {
  id: string;
  label: string;
  type: "agent" | "notification" | "ticket" | "pr" | "thread" | "custom";
  data?: Record<string, unknown>;
  size?: number;
}

/**
 * Button that adds any item as context to the Manager chat.
 * Click to add → opens the Manager with this item as a context chip.
 */
export function AddToManagerButton({ id, label, type, data, size = 14 }: AddToManagerButtonProps) {
  const addContext = useManagerStore((s) => s.addContext);
  const setOpen = useManagerStore((s) => s.setOpen);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger parent click handlers
    addContext({ id, label, type, data });
    setOpen(true); // Open the Manager chat
  };

  return (
    <Tooltip label={`Ask Manager about "${label.slice(0, 30)}"`} position="left">
      <ActionIcon
        variant="subtle"
        size="xs"
        onClick={handleClick}
        style={{ opacity: 0.5, transition: "opacity 0.1s" }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
      >
        <IconMessageChatbot size={size} />
      </ActionIcon>
    </Tooltip>
  );
}

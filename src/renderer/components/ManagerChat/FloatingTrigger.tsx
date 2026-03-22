import { ActionIcon, Badge, Transition } from "@mantine/core";
import { useManagerStore } from "../../stores/manager-store";
import { usePendingApprovals } from "../../stores/agent-store";

export function FloatingTrigger() {
  const isOpen = useManagerStore((s) => s.isOpen);
  const isPinned = useManagerStore((s) => s.isPinned);
  const toggleOpen = useManagerStore((s) => s.toggleOpen);
  const pendingCount = usePendingApprovals().length;

  const visible = !isOpen && !isPinned;

  return (
    <Transition mounted={visible} transition="scale" duration={200}>
      {(styles) => (
        <div
          style={{
            ...styles,
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
        >
          <ActionIcon
            size={48}
            radius="xl"
            variant="gradient"
            gradient={{ from: "blue", to: "violet", deg: 135 }}
            onClick={toggleOpen}
            aria-label="Open Manager"
            style={{
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.08)";
              e.currentTarget.style.boxShadow = "0 6px 28px rgba(0, 0, 0, 0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.25)";
            }}
          >
            <span style={{ fontSize: 20 }}>&#10024;</span>
          </ActionIcon>
          {pendingCount > 0 && (
            <Badge
              size="sm"
              variant="filled"
              color="red"
              circle
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                pointerEvents: "none",
              }}
            >
              {pendingCount}
            </Badge>
          )}
        </div>
      )}
    </Transition>
  );
}

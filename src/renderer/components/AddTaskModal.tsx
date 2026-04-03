import { Button, Group, Modal, NumberInput, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useState } from "react";

interface AddTaskModalProps {
  opened: boolean;
  onClose: () => void;
}

const TASK_TYPES = [
  { value: "implementation", label: "Implementation" },
  { value: "investigation", label: "Investigation" },
  { value: "review", label: "Review" },
  { value: "response", label: "Response" },
  { value: "meeting_prep", label: "Meeting Prep" },
];

const PRIORITIES = [
  { value: "critical", label: "Critical — do it now" },
  { value: "high", label: "High — today" },
  { value: "medium", label: "Medium — this week" },
  { value: "low", label: "Low — when free" },
  { value: "backlog", label: "Backlog — someday" },
];

export function AddTaskModal({ opened, onClose }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<string>("implementation");
  const [priority, setPriority] = useState<string>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | string>(30);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setTaskType("implementation");
    setPriority("medium");
    setEstimatedMinutes(30);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await window.deck.createManualNotification({
        title: title.trim(),
        summary: description.trim(),
        taskType,
        priority,
        estimatedMinutes: typeof estimatedMinutes === "number" ? estimatedMinutes : 30,
      });
      reset();
      onClose();
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text fw={600} size="sm">
          Add Task
        </Text>
      }
      size="md"
      centered
      overlayProps={{ backgroundOpacity: 0.4, blur: 4 }}
      styles={{
        content: { background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)" },
        header: {
          background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
          borderBottom: "1px solid rgba(74, 125, 255, 0.08)",
        },
      }}
    >
      <Stack gap="sm" mt="xs">
        <TextInput
          label="Title"
          placeholder="What needs to be done?"
          required
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          autoFocus
          styles={{
            input: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
          }}
        />

        <Textarea
          label="Description"
          placeholder="Optional details..."
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={3}
          maxRows={6}
          autosize
          styles={{
            input: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
          }}
        />

        <Group grow>
          <Select
            label="Task type"
            data={TASK_TYPES}
            value={taskType}
            onChange={(val) => val && setTaskType(val)}
            allowDeselect={false}
            styles={{
              input: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
              dropdown: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
            }}
          />

          <Select
            label="Priority"
            data={PRIORITIES}
            value={priority}
            onChange={(val) => val && setPriority(val)}
            allowDeselect={false}
            styles={{
              input: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
              dropdown: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
            }}
          />
        </Group>

        <NumberInput
          label="Estimated time (minutes)"
          value={estimatedMinutes}
          onChange={setEstimatedMinutes}
          min={5}
          max={480}
          step={5}
          w={200}
          styles={{
            input: { backgroundColor: "rgba(74, 125, 255, 0.08)" },
          }}
        />

        <Group justify="space-between" mt="sm">
          <Text size="xs" c="dimmed">
            Source: manual
          </Text>
          <Group gap="xs">
            <Button variant="subtle" color="gray" size="xs" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!title.trim()}
            >
              Add Task
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

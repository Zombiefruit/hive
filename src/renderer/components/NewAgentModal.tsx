import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";

interface NewAgentModalProps {
  opened: boolean;
  onClose: () => void;
}

export function NewAgentModal({ opened, onClose }: NewAgentModalProps) {
  const [task, setTask] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [cwd, setCwd] = useState("");
  const [branch, setBranch] = useState("");
  const [permissionMode, setPermissionMode] = useState("default");
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number | string>(1);
  const [submitting, setSubmitting] = useState(false);

  const handleSpawn = async () => {
    if (!task.trim() || !cwd.trim()) return;
    setSubmitting(true);
    try {
      await window.deck.spawnAgent({
        task: task.trim(),
        model,
        cwd: cwd.trim(),
        branch: branch.trim() || undefined,
        permissionMode,
        maxBudgetUsd: Number(maxBudgetUsd) || undefined,
      });
      // Reset form and close
      setTask("");
      setCwd("");
      setBranch("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New Agent" size="lg">
      <Stack gap="md">
        <Textarea
          label="Task"
          placeholder="Describe what this agent should do..."
          minRows={3}
          value={task}
          onChange={(e) => setTask(e.currentTarget.value)}
          autoFocus
        />

        <TextInput
          label="Working directory"
          placeholder="/Users/kieranwilliams/Documents/GitHub/..."
          value={cwd}
          onChange={(e) => setCwd(e.currentTarget.value)}
        />

        <Group grow>
          <Select
            label="Model"
            data={[
              { value: "claude-opus-4-6", label: "Opus 4" },
              { value: "claude-sonnet-4-6", label: "Sonnet 4" },
              { value: "claude-haiku-4-5-20251001", label: "Haiku" },
            ]}
            value={model}
            onChange={(v) => v && setModel(v)}
          />
          <TextInput
            label="Branch (optional)"
            placeholder="feature/my-branch"
            value={branch}
            onChange={(e) => setBranch(e.currentTarget.value)}
          />
        </Group>

        <Stack gap="xs">
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Permission mode
          </label>
          <SegmentedControl
            data={[
              { value: "default", label: "Require approval" },
              { value: "acceptEdits", label: "Auto-approve edits" },
              { value: "bypassPermissions", label: "Auto-approve all" },
            ]}
            value={permissionMode}
            onChange={setPermissionMode}
          />
        </Stack>

        <NumberInput
          label="Budget limit (USD)"
          placeholder="1.00"
          min={0.01}
          max={100}
          step={0.5}
          decimalScale={2}
          value={maxBudgetUsd}
          onChange={setMaxBudgetUsd}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSpawn}
            loading={submitting}
            disabled={!task.trim() || !cwd.trim()}
          >
            Spawn Agent
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

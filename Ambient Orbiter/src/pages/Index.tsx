import { useState, useEffect, useCallback } from "react";
import AiThinkingBubble, { ThoughtEntry } from "@/components/AiThinkingBubble";

const sampleThoughts = [
  "Parent 'VEC-50' advanced to hack",
  "Task stalled 15min — escalating",
  "All subtasks done — advancing parent",
  "Checking dependency graph for VEC-42",
  "Spawned 3 subtasks for VEC-61",
  "Blocked on review — pinging assignee",
  "VEC-55 merged — closing subtasks",
  "Sprint velocity updated: +12%",
  "Rebalancing workload across agents",
  "Escalation resolved — resuming normal ops",
];

const Index = () => {
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [isEscalation, setIsEscalation] = useState(false);
  const [thoughtIndex, setThoughtIndex] = useState(0);

  const addThought = useCallback(() => {
    const thought = sampleThoughts[thoughtIndex % sampleThoughts.length];
    const escalation = thought.toLowerCase().includes("escalat");
    setIsEscalation(escalation);
    setThoughts(prev => [...prev, { timestamp: new Date().toISOString(), thought }]);
    setThoughtIndex(i => i + 1);
  }, [thoughtIndex]);

  useEffect(() => {
    const initial = setTimeout(() => addThought(), 1500);
    const interval = setInterval(() => addThought(), 6000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [addThought]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Orchestrator Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Watch the thinking bubble in the bottom-right corner
        </p>
      </div>
      <AiThinkingBubble
        thoughts={thoughts}
        isEscalation={isEscalation}
        onDismiss={() => setIsEscalation(false)}
      />
    </div>
  );
};

export default Index;

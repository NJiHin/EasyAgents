import { useRef, useState, useEffect, useCallback } from "react";
import { useGraphStore } from "../../store/graphStore";
import { useRunStore } from "../../store/runStore";
import { TEMPLATES } from "../../templates";

const VALIDATION_LABELS: Record<string, string> = {
  ready: "Ready",
  no_orchestrator: "No orchestrator",
  disconnected_nodes: "Disconnected nodes",
  cycle_detected: "Cycle detected",
};

const VALIDATION_CLASSES: Record<string, string> = {
  ready: "topbar-pill topbar-pill--success",
  no_orchestrator: "topbar-pill topbar-pill--warning",
  disconnected_nodes: "topbar-pill topbar-pill--warning",
  cycle_detected: "topbar-pill topbar-pill--error",
};

interface CostDelta {
  id: number;
  amount: number;
}

function CostBox() {
  const sessionCost = useRunStore((s) => s.sessionCost);
  const prevCostRef = useRef(sessionCost);
  const [deltas, setDeltas] = useState<CostDelta[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const diff = sessionCost - prevCostRef.current;
    if (diff > 0) {
      const id = ++counterRef.current;
      setDeltas((d) => [...d, { id, amount: diff }]);
      setTimeout(() => setDeltas((d) => d.filter((x) => x.id !== id)), 1850);
    }
    prevCostRef.current = sessionCost;
  }, [sessionCost]);

  return (
    <div className="cost-box">
      <span className="cost-box__label">Cost</span>
      <span className="cost-box__value">${sessionCost.toFixed(6)}</span>
      {deltas.map((d) => (
        <span key={d.id} className="cost-box__delta">
          +${d.amount.toFixed(6)}
        </span>
      ))}
    </div>
  );
}

const HELP_STEPS = [
  {
    num: "01",
    title: "Add Agents",
    body: "Click + Add Agent to place nodes on the canvas. Every graph needs exactly one Orchestrator node.",
  },
  {
    num: "02",
    title: "Connect Agents",
    body: "Drag from a node's handle to another to create a delegation edge. The Orchestrator routes tasks to sub-agents.",
  },
  {
    num: "03",
    title: "Configure",
    body: "Click a node to open the sidebar. Set a name (no spaces), role, system prompt, and tools.",
  },
  {
    num: "04",
    title: "Run",
    body: "Type a task in the bar at the bottom and click RUN. Watch agents execute in real time.",
  },
  {
    num: "!",
    title: "Tips",
    body: "Mention tools that the agent has access to in the system prompt for better tool use hit rate. If using evaluator, mention to pass it's output to the evaluator agent.",
  },
];

function HelpModal({ onClose, onLoadTemplate }: { onClose: () => void; onLoadTemplate: (id: string) => void }) {
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="help-backdrop" onClick={handleBackdrop}>
      <div className="help-modal">
        <div className="help-modal__header">
          <span className="help-modal__title">How to Use</span>
          <button className="help-modal__close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="help-modal__body">
          {HELP_STEPS.map((step) => (
            <div key={step.num} className="help-step">
              <span className="help-step__num">{step.num}</span>
              <div className="help-step__content">
                <span className="help-step__title">{step.title}</span>
                <p className="help-step__body">{step.body}</p>
              </div>
            </div>
          ))}
          <div className="help-step help-step--templates">
            <span className="help-step__num"> </span>
            <div className="help-step__content">
              <span className="help-step__title">Templates</span>
              <p className="help-step__body">Load a pre-made agent system onto the canvas:</p>
              <div className="help-templates">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    className="help-template-btn"
                    onClick={() => { onLoadTemplate(t.id); onClose(); }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopBar() {
  const validationStatus = useGraphStore((s) => s.validationStatus);
  const addNode = useGraphStore((s) => s.addNode);
  const loadTemplate = useGraphStore((s) => s.loadTemplate);
  const [helpOpen, setHelpOpen] = useState(false);

  const handleLoadTemplate = useCallback((id: string) => {
    const t = TEMPLATES.find((t) => t.id === id);
    if (t) loadTemplate(t);
  }, [loadTemplate]);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo">
          <div className="topbar-logo-mark" />
          <span className="topbar-wordmark">EasyAgents</span>
        </div>
        <button className="topbar-btn topbar-btn--add" onClick={addNode}>
          + Add Agent
        </button>
        <CostBox />
      </div>
      <div className="topbar-right">
        <button
          className="topbar-btn topbar-btn--help"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
        <span className={VALIDATION_CLASSES[validationStatus]}>
          {VALIDATION_LABELS[validationStatus]}
        </span>
      </div>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} onLoadTemplate={handleLoadTemplate} />}
    </div>
  );
}

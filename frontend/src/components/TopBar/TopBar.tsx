import { useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { useRunStore } from '../../store/runStore';

const VALIDATION_LABELS: Record<string, string> = {
  ready: 'Ready',
  no_orchestrator: 'No orchestrator',
  disconnected_nodes: 'Disconnected nodes',
  cycle_detected: 'Cycle detected',
};

const VALIDATION_CLASSES: Record<string, string> = {
  ready: 'topbar-pill topbar-pill--success',
  no_orchestrator: 'topbar-pill topbar-pill--warning',
  disconnected_nodes: 'topbar-pill topbar-pill--warning',
  cycle_detected: 'topbar-pill topbar-pill--error',
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

export function TopBar() {
  const validationStatus = useGraphStore((s) => s.validationStatus);
  const addNode = useGraphStore((s) => s.addNode);

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
        <span className={VALIDATION_CLASSES[validationStatus]}>
          {VALIDATION_LABELS[validationStatus]}
        </span>
      </div>
    </div>
  );
}
import { useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { useRunStore } from '../../store/runStore';

export function RunBar() {
  const [task, setTask] = useState('');

  const validationStatus = useGraphStore((s) => s.validationStatus);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const status = useRunStore((s) => s.status);
  const startRun = useRunStore((s) => s.startRun);
  const cancelRun = useRunStore((s) => s.cancelRun);

  const isReady = validationStatus === 'ready';
  const isRunning = status === 'running';

  const validationMessages: Record<string, string> = {
    no_orchestrator: 'No orchestrator node — set one node as Orchestrator.',
    disconnected_nodes: 'All nodes must be connected to the graph.',
    cycle_detected: 'Cycle detected — agent graphs must be acyclic.',
  };

  const graph = {
    nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };

  const handleRun = () => startRun(graph, task);

  const statusColors: Record<string, string> = {
    idle: 'var(--text-muted)',
    running: 'var(--warning)',
    completed: 'var(--success)',
    error: 'var(--error)',
  };

  return (
    <>
      <div className="runbar">
        <input
          type="text"
          className="runbar__input"
          placeholder="Describe the task for the orchestrator..."
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={isRunning}
        />
        <button
          className="runbar__btn"
          onClick={handleRun}
          disabled={!isReady || isRunning || !task.trim()}
        >
          {isRunning ? 'Running...' : 'Run ▶'}
        </button>
        {isRunning && (
          <button className="runbar__btn runbar__btn--stop" onClick={cancelRun}>
            Stop ■
          </button>
        )}
        <span
          className="runbar__status"
          style={{ color: statusColors[status] ?? 'var(--text-muted)' }}
        >
          {status}
        </span>
        {!isReady && !isRunning && validationMessages[validationStatus] && (
          <span className="runbar__validation-hint">
            {validationMessages[validationStatus]}
          </span>
        )}
      </div>
    </>
  );
}

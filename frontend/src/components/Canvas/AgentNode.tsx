import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { AgentNodeData } from '../../types';
import { useGraphStore } from '../../store/graphStore';
import { useRunStore } from '../../store/runStore';
import type { AgentStatus } from '../../store/runStore';

const STATUS_COLORS: Record<AgentStatus, string | null> = {
  idle: null,
  thinking: 'var(--accent)',
  tool_call: 'var(--warning)',
  waiting: 'var(--text-muted)',
  done: 'var(--success)',
  error: 'var(--error)',
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: '',
  thinking: 'thinking',
  tool_call: 'tool call',
  waiting: 'waiting',
  done: 'done',
  error: 'error',
};

export function AgentNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const isOrchestrator = nodeData?.role === 'orchestrator';
  const isEvaluator = nodeData?.role === 'evaluator';
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const agentStatuses = useRunStore((s) => s.agentStatuses);
  const status: AgentStatus = agentStatuses.get(id) ?? 'idle';
  const isActive = status !== 'idle';
  const statusColor = STATUS_COLORS[status];

  const roleLabel = isOrchestrator ? 'Orchestrator' : isEvaluator ? 'Evaluator' : 'Sub-agent';
  const nodeClass = [
    'agent-node',
    isOrchestrator ? 'agent-node--orchestrator' : '',
    isEvaluator ? 'agent-node--evaluator' : '',
    selected ? 'agent-node--selected' : '',
    isActive ? 'agent-node--active' : '',
  ].filter(Boolean).join(' ');

  const activeBorderColor = isEvaluator ? 'var(--warning)' : 'var(--accent)';

  return (
    <div
      className={nodeClass}
      style={isActive ? {
        border: `2px solid ${activeBorderColor}`,
        boxShadow: `0 0 8px ${activeBorderColor}40`,
      } : undefined}
      onClick={() => setSelectedNode(id)}
    >
      <Handle type="target" position={Position.Top} className="agent-node__handle" />
      <div className="agent-node__header">
        <div className="agent-node__name">{nodeData?.name || 'Agent'}</div>
        <button
          className="agent-node__delete"
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
          title="Delete node"
        >
          ×
        </button>
      </div>
      <div
        className={[
          'agent-node__role',
          isOrchestrator ? 'agent-node__role--orchestrator' : '',
          isEvaluator ? 'agent-node__role--evaluator' : '',
        ].filter(Boolean).join(' ')}
      >
        {roleLabel}
      </div>
      {status !== 'idle' && statusColor && (
        <div className="agent-node__status" style={{ color: statusColor }}>
          {status === 'thinking' && (
            <span className="agent-node__status-dot" style={{ background: statusColor }} />
          )}
          {STATUS_LABELS[status]}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="agent-node__handle" />
    </div>
  );
}

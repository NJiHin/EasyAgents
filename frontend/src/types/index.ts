export type AgentRole = 'orchestrator' | 'subagent' | 'evaluator';

export interface AgentNodeData {
  name: string;
  role: AgentRole;
  maxIterations?: number;
  systemPrompt: string;
  enabledTools: string[];
}

export interface GraphDefinition {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: AgentNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data?: { edgeType?: 'delegation' | 'feedback' };
  }>;
}

export type RunStatus = 'idle' | 'running' | 'cancelling' | 'completed' | 'error';

export type EventType =
  | 'agent_message'
  | 'tool_call'
  | 'tool_result'
  | 'handoff'
  | 'response'
  | 'run_complete'
  | 'evaluator_feedback'
  | 'error';

export interface RunEvent {
  event: EventType;
  agent_id: string;
  agent_name: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
}

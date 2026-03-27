import { create } from 'zustand';
import type { GraphDefinition, RunEvent, RunStatus } from '../types';

const GEMINI_FLASH_INPUT_COST_PER_M = 0.10;   // $ per 1M input tokens
const GEMINI_FLASH_OUTPUT_COST_PER_M = 0.40;  // $ per 1M output tokens

function calcEventCost(payload: Record<string, unknown>): number {
  const inputTokens = typeof payload.input_tokens === 'number' ? payload.input_tokens : 0;
  const outputTokens = typeof payload.output_tokens === 'number' ? payload.output_tokens : 0;
  return (inputTokens / 1_000_000) * GEMINI_FLASH_INPUT_COST_PER_M
       + (outputTokens / 1_000_000) * GEMINI_FLASH_OUTPUT_COST_PER_M;
}

export type AgentStatus = 'idle' | 'thinking' | 'tool_call' | 'waiting' | 'done' | 'error';

export interface RunRecord {
  runId: string;
  task: string;
  startedAt: string;
  events: RunEvent[];
  status: 'completed' | 'error';
}

interface RunState {
  runId: string | null;
  task: string;
  status: RunStatus;
  events: RunEvent[];
  agentStatuses: Map<string, AgentStatus>;
  activeEdgeIds: Set<string>;
  ws: WebSocket | null;
  history: RunRecord[];
  selectedHistoryIndex: number | null;

  startRun: (graph: GraphDefinition, task: string) => Promise<void>;
  cancelRun: () => void;
  appendEvent: (event: RunEvent) => void;
  reset: () => void;
  selectHistory: (index: number | null) => void;
  sessionCost: number;
  addCost: (delta: number) => void;
}

function applyEventToState(
  event: RunEvent,
  statuses: Map<string, AgentStatus>,
  edgeIds: Set<string>,
  edgeByEndpoints: Map<string, string>,
): void {
  const { event: type, agent_id } = event;
  if (type === 'agent_message' || type === 'tool_result') {
    statuses.set(agent_id, 'thinking');
  } else if (type === 'tool_call') {
    statuses.set(agent_id, 'tool_call');
  } else if (type === 'handoff') {
    statuses.set(agent_id, 'waiting');
    const toId = event.payload.to_agent_id as string;
    if (toId) {
      const edgeId = edgeByEndpoints.get(`${agent_id}:${toId}`);
      if (edgeId) edgeIds.add(edgeId);
    }
  } else if (type === 'response') {
    statuses.set(agent_id, 'done');
  } else if (type === 'evaluator_feedback') {
    const verdict = event.payload.verdict as string;
    if (verdict === 'pass') {
      statuses.set(agent_id, 'done');
    } else {
      // FAIL: evaluator active, animate feedback edge, wake worker back to thinking
      statuses.set(agent_id, 'thinking');
      // The worker id is the target of the evaluator's outgoing feedback edge
      // We find it via edgeByEndpoints by scanning for an edge from agent_id
      for (const [key, edgeId] of edgeByEndpoints) {
        const [src] = key.split(':');
        if (src === agent_id) {
          edgeIds.add(edgeId);
          const workerId = key.split(':')[1];
          if (workerId) statuses.set(workerId, 'thinking');
          break;
        }
      }
    }
  } else if (type === 'error') {
    statuses.set(agent_id, 'error');
  }
}

export const useRunStore = create<RunState>((set, get) => ({
  runId: null,
  task: '',
  status: 'idle',
  events: [],
  agentStatuses: new Map(),
  activeEdgeIds: new Set(),
  ws: null,
  history: [],
  selectedHistoryIndex: null,
  sessionCost: 0,

  reset: () => set({ runId: null, task: '', status: 'idle', events: [], agentStatuses: new Map(), activeEdgeIds: new Set(), ws: null }),

  addCost: (delta) => set((s) => ({ sessionCost: s.sessionCost + delta })),

  appendEvent: (event) => {
    const delta = calcEventCost(event.payload);
    if (delta > 0) get().addCost(delta);
    set((s) => ({ events: [...s.events, event] }));
  },

  selectHistory: (index) => set({ selectedHistoryIndex: index }),

  cancelRun: () => {
    fetch('/api/runs', { method: 'DELETE' }).catch(() => {});
    get().ws?.close();
    set({ status: 'cancelling', ws: null, agentStatuses: new Map(), activeEdgeIds: new Set() });
    setTimeout(() => set({ status: 'idle' }), 1500);
  },

  startRun: async (graph, task) => {
    const prev = get();
    if (prev.events.length > 0 && prev.runId && (prev.status === 'completed' || prev.status === 'error')) {
      const record: RunRecord = {
        runId: prev.runId,
        task: prev.task,
        startedAt: prev.events[0]?.timestamp ?? new Date().toISOString(),
        events: prev.events,
        status: prev.status,
      };
      set((s) => ({ history: [record, ...s.history] }));
    }

    const runId = crypto.randomUUID();
    const orchestratorId = graph.nodes.find((n) => n.data.role === 'orchestrator')!.id;
    set({ status: 'running', runId, events: [], agentStatuses: new Map([[orchestratorId, 'thinking']]), activeEdgeIds: new Set(), task, selectedHistoryIndex: null });

    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph, task }),
    });

    if (!res.ok) {
      const err = await res.json();
      set({ status: 'error' });
      get().appendEvent({
        event: 'error', agent_id: '', agent_name: '', timestamp: new Date().toISOString(),
        payload: { message: JSON.stringify(err.detail) }
      });
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws/runs`);
    set({ ws });

    // Build edge lookup from graph so we can track active edges incrementally
    const edgeByEndpoints = new Map(
      graph.edges.map((e) => [`${e.source}:${e.target}`, e.id])
    );

    ws.onmessage = (msg) => {
      const event: RunEvent = JSON.parse(msg.data);
      get().appendEvent(event);

      set((s) => {
        const statuses = new Map(s.agentStatuses);
        const edgeIds = new Set(s.activeEdgeIds);
        applyEventToState(event, statuses, edgeIds, edgeByEndpoints);
        return { agentStatuses: statuses, activeEdgeIds: edgeIds };
      });

      if (event.event === 'run_complete' || event.event === 'error') {
        set({ status: event.event === 'run_complete' ? 'completed' : 'error', ws: null });
        ws.close();
        setTimeout(() => set({ agentStatuses: new Map(), activeEdgeIds: new Set() }), 1500);
      }
    };

    ws.onerror = () => {
      set({ status: 'error', ws: null });
      get().appendEvent({
        event: 'error', agent_id: '', agent_name: '', timestamp: new Date().toISOString(),
        payload: { message: 'WebSocket connection failed' }
      });
    };
  },
}));

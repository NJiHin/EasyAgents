import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Node, Edge, Connection, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import type { AgentNodeData } from '../types/index';
import type { Template } from '../templates';

type ValidationStatus =
  | 'ready'
  | 'no_orchestrator'
  | 'disconnected_nodes'
  | 'cycle_detected'
  | 'invalid_evaluator';

interface GraphState {
  nodes: Node<AgentNodeData & Record<string, unknown>>[];
  edges: Edge[];
  selectedNodeId: string | null;
  validationStatus: ValidationStatus;
  cycleRejected: boolean;

  addNode: () => void;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<AgentNodeData>) => void;
  setSelectedNode: (id: string | null) => void;
  setEdges: (edges: Edge[]) => void;
  onConnect: (connection: Connection) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  loadTemplate: (template: Template) => void;
}

function hasCycle(nodes: Node[], edges: Edge[], exemptedEdges?: { source: string; target: string }[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (exemptedEdges?.some((ex) => ex.source === e.source && ex.target === e.target)) continue;
    adj.get(e.source)?.push(e.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    visited.add(id);
    inStack.add(id);
    for (const neighbour of adj.get(id) ?? []) {
      if (!visited.has(neighbour) && dfs(neighbour)) return true;
      if (inStack.has(neighbour)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n.id) && dfs(n.id)) return true;
  }
  return false;
}

function getEvaluatorFeedbackEdges(
  nodes: Node<AgentNodeData & Record<string, unknown>>[],
  edges: Edge[]
): { source: string; target: string }[] {
  const evaluatorNodes = nodes.filter((n) => (n.data as AgentNodeData).role === 'evaluator');
  return evaluatorNodes.flatMap((ev) => {
    const outgoing = edges.find((e) => e.source === ev.id);
    return outgoing ? [{ source: ev.id, target: outgoing.target }] : [];
  });
}

function recalcValidation(
  nodes: Node<AgentNodeData & Record<string, unknown>>[],
  edges: Edge[]
): ValidationStatus {
  const hasOrchestrator = nodes.some((n) => (n.data as AgentNodeData).role === 'orchestrator');
  if (!hasOrchestrator) return 'no_orchestrator';

  // Evaluator topology check
  const evaluators = nodes.filter((n) => (n.data as AgentNodeData).role === 'evaluator');
  if (evaluators.length > 0) {
    const ev = evaluators[0];
    const incoming = edges.filter((e) => e.target === ev.id);
    const outgoing = edges.filter((e) => e.source === ev.id);
    if (
      incoming.length !== 1 ||
      outgoing.length !== 1 ||
      incoming[0].source !== outgoing[0].target
    ) {
      return 'invalid_evaluator';
    }
  }

  // Disconnected check — evaluator nodes are exempt (they get their "incoming" from worker)
  const nonOrchestrators = nodes.filter(
    (n) => (n.data as AgentNodeData).role !== 'orchestrator' && (n.data as AgentNodeData).role !== 'evaluator'
  );
  const hasDisconnected = nonOrchestrators.some((n) => !edges.some((e) => e.target === n.id));
  if (hasDisconnected) return 'disconnected_nodes';

  // Cycle check, exempting all evaluator→worker feedback edges
  const feedbackEdges = getEvaluatorFeedbackEdges(nodes, edges);
  if (hasCycle(nodes, edges, feedbackEdges.length ? feedbackEdges : undefined)) return 'cycle_detected';

  return 'ready';
}

let cycleRejectedTimer: ReturnType<typeof setTimeout> | null = null;

export const useGraphStore = create<GraphState>()(persist((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  validationStatus: 'no_orchestrator',
  cycleRejected: false,

  addNode: () => {
    const { nodes } = get();
    const n = nodes.length;
    const isFirst = n === 0;
    const hasOrchestrator = nodes.some((node) => (node.data as AgentNodeData).role === 'orchestrator');

    const newNode: Node<AgentNodeData & Record<string, unknown>> = {
      id: `node-${Date.now()}`,
      type: 'agentNode',
      position: { x: 100 + n * 40, y: 100 + n * 40 },
      data: {
        name: `Agent_${n + 1}`,
        role: isFirst && !hasOrchestrator ? 'orchestrator' : 'subagent',
        systemPrompt: '',
        enabledTools: [],
      },
    };

    const newNodes = [...nodes, newNode];
    set({
      nodes: newNodes,
      validationStatus: recalcValidation(newNodes, get().edges),
    });
  },

  deleteNode: (id: string) => {
    const { nodes, edges } = get();
    const newNodes = nodes.filter((n) => n.id !== id);
    const newEdges = edges.filter((e) => e.source !== id && e.target !== id);
    set({
      nodes: newNodes,
      edges: newEdges,
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
      validationStatus: recalcValidation(newNodes, newEdges),
    });
  },

  updateNodeData: (id: string, patch: Partial<AgentNodeData>) => {
    const { nodes, edges } = get();
    const newNodes = nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
    );
    set({ nodes: newNodes, validationStatus: recalcValidation(newNodes, edges) });
  },

  setSelectedNode: (id: string | null) => set({ selectedNodeId: id }),

  setEdges: (edges: Edge[]) => {
    const { nodes } = get();
    set({ edges, validationStatus: recalcValidation(nodes, edges) });
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges } = get();

    // Determine if this connection is an evaluator→worker feedback edge
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const isEvaluatorFeedback = sourceNode && (sourceNode.data as AgentNodeData).role === 'evaluator';

    const tentativeEdges = addEdge(
      {
        ...connection,
        data: { edgeType: isEvaluatorFeedback ? 'feedback' : 'delegation' },
      },
      edges
    );

    // Always exempt all evaluator→worker feedback edges from cycle detection.
    const feedbackEdges = getEvaluatorFeedbackEdges(nodes, tentativeEdges);
    if (hasCycle(nodes, tentativeEdges, feedbackEdges.length ? feedbackEdges : undefined)) {
      if (cycleRejectedTimer) clearTimeout(cycleRejectedTimer);
      set({ cycleRejected: true });
      cycleRejectedTimer = setTimeout(() => {
        set({ cycleRejected: false });
        cycleRejectedTimer = null;
      }, 2000);
      return;
    }

    set({
      edges: tentativeEdges,
      validationStatus: recalcValidation(nodes, tentativeEdges),
    });
  },

  onNodesChange: (changes) => {
    const { nodes, edges } = get();
    const newNodes = applyNodeChanges(changes, nodes) as Node<AgentNodeData & Record<string, unknown>>[];
    set({ nodes: newNodes, validationStatus: recalcValidation(newNodes, edges) });
  },

  onEdgesChange: (changes) => {
    const { nodes, edges } = get();
    const newEdges = applyEdgeChanges(changes, edges);
    set({ edges: newEdges, validationStatus: recalcValidation(nodes, newEdges) });
  },

  loadTemplate: (template: Template) => {
    set({
      nodes: template.nodes,
      edges: template.edges,
      selectedNodeId: null,
      validationStatus: recalcValidation(template.nodes, template.edges),
    });
  },
}), {
  name: 'easyagents-graph',
  partialize: (s) => ({ nodes: s.nodes, edges: s.edges }),
  onRehydrateStorage: () => (state) => {
    if (state) {
      state.validationStatus = recalcValidation(state.nodes, state.edges);
    }
  },
}));

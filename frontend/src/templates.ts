import type { Node, Edge } from '@xyflow/react';
import type { AgentNodeData } from './types/index';

export interface Template {
  id: string;
  label: string;
  nodes: Node<AgentNodeData & Record<string, unknown>>[];
  edges: Edge[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'research-agent',
    label: 'Research Agent',
    nodes: [
      {
        id: 'tpl-orchestrator',
        type: 'agentNode',
        position: { x: 500, y: 80 },
        data: {
          name: 'Orchestrator',
          role: 'orchestrator',
          systemPrompt:
            'You are an orchestrator. When given a task, first call list_agents to see what agents are available. Then delegate the research task to the Researcher agent using invoke_agent. Return the final answer to the user once the researcher has completed the task.',
          enabledTools: [],
        },
      },
      {
        id: 'tpl-researcher',
        type: 'agentNode',
        position: { x: 500, y: 280 },
        data: {
          name: 'Researcher',
          role: 'subagent',
          systemPrompt:
            'You are a research agent. Use the web_search tool to find accurate, up-to-date information about the given topic. Search multiple times if needed to gather comprehensive results. Summarise your findings clearly and cite your sources.',
          enabledTools: ['web_search', 'read_url'],
        },
      },
      {
        id: 'tpl-evaluator',
        type: 'agentNode',
        position: { x: 180, y: 280 },
        data: {
          name: 'Evaluator',
          role: 'evaluator',
          maxIterations: 3,
          systemPrompt:
            'You are a quality evaluator. Review the researcher\'s output. If it is thorough, accurate, and well-cited, respond with PASS. Otherwise respond with FAIL: followed by a specific critique explaining what is missing or incorrect so the researcher can improve.',
          enabledTools: [],
        },
      },
    ],
    edges: [
      {
        id: 'tpl-edge-orch-researcher',
        source: 'tpl-orchestrator',
        target: 'tpl-researcher',
        data: { edgeType: 'delegation' },
      },
      {
        id: 'tpl-edge-researcher-eval',
        source: 'tpl-researcher',
        target: 'tpl-evaluator',
        data: { edgeType: 'delegation' },
      },
      {
        id: 'tpl-edge-eval-researcher',
        source: 'tpl-evaluator',
        target: 'tpl-researcher',
        data: { edgeType: 'feedback' },
      },
    ],
  },
];

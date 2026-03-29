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
  {
    id: 'code-reviewer',
    label: 'Code Reviewer',
    nodes: [
      {
        id: 'cr-orchestrator',
        type: 'agentNode',
        position: { x: 500, y: 80 },
        data: {
          name: 'Orchestrator',
          role: 'orchestrator',
          systemPrompt:
            'You are an orchestrator for a code writing system. When given a coding problem, call list_agents to discover available agents, then delegate the full problem description to the CodeWriter agent using invoke_agent. Once the writer returns its solution, present it to the user.',
          enabledTools: [],
        },
      },
      {
        id: 'cr-writer',
        type: 'agentNode',
        position: { x: 500, y: 280 },
        data: {
          name: 'Code_Writer',
          role: 'subagent',
          systemPrompt:
            'You are an expert software engineer. When given a coding problem, write a clean, correct, and efficient solution. After writing your solution, pass your solution to the evaluator to review it. Only pass pure python code to the evaluator.\n\nIf the evaluator provides PASS, return the code to the orchestrator.\n\nIf the evaluator provides FAIL, read the critique and update the code accordingly before passing back to the evaluator.',
          enabledTools: [],
        },
      },
      {
        id: 'cr-evaluator',
        type: 'agentNode',
        position: { x: 180, y: 280 },
        data: {
          name: 'Code_Reviewer',
          role: 'evaluator',
          maxIterations: 2,
          systemPrompt:
            'You are a senior code reviewer. You will receive a code solution. Use the python_repl tool to actually execute the code and verify it produces correct output for several test cases before making your verdict. A passing solution must: (1) produce correct output for all test cases you run; (2) have optimal or near-optimal time and space complexity; (3) handle edge cases. If the solution passes all your tests and meets the above criteria, respond with PASS. Otherwise respond with FAIL: followed by a specific critique — include which test cases failed, what the output was vs expected, or what complexity issues you found.',
          enabledTools: ['python_repl'],
        },
      },
    ],
    edges: [
      {
        id: 'cr-edge-orch-writer',
        source: 'cr-orchestrator',
        target: 'cr-writer',
        data: { edgeType: 'delegation' },
      },
      {
        id: 'cr-edge-writer-eval',
        source: 'cr-writer',
        target: 'cr-evaluator',
        data: { edgeType: 'delegation' },
      },
      {
        id: 'cr-edge-eval-writer',
        source: 'cr-evaluator',
        target: 'cr-writer',
        data: { edgeType: 'feedback' },
      },
    ],
  },
];

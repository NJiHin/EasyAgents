import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGraphStore } from "../../store/graphStore";
import type { AgentNodeData } from "../../types";
import { useTools } from "../../hooks/useTools";

const PREAMBLES: Record<string, string> = {
  orchestrator:
    "You are an orchestrator. When given a task:\n1. Call list_agents to discover available agents and their capabilities.\n2. Decompose the task into independent subtasks, one per agent.\n3. Call invoke_agent for each subtask — pass only what that agent needs, nothing else.\n4. Once all invoke_agent calls complete and you have all results, compile a final response.\nNever call a sub-agent's tools directly. Only use list_agents and invoke_agent.",
  subagent:
    "When you start working on a task:\n1. ALWAYS call list_tools tool FIRST to discover what tools are available to you.\n2. Use only the tools listed — do not attempt to call any tool not returned by list_tools.\n3. If the evaluator responds with an issue unrelated to your response, return the EXACT issue verbatim to the orchestrator.",
  evaluator:
    "You are an evaluator. You will receive a result produced by another agent.\nWhen you begin:\n1. ALWAYS call list_tools tool FIRST to discover what tools are available to you.\n2. Use only tools returned from list_tools as needed to verify the result before making your verdict.\n3. Once your assessment is complete, your final response must be exactly one of:\n  PASS — if the result is satisfactory.\n  FAIL: <concise critique> — if it is not.",
};

function PreambleHint({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setVisible(true);
  };

  return (
    <>
      <span
        ref={ref}
        className="node-panel__preamble-hint"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
      >?</span>
      {visible && createPortal(
        <div
          className="node-panel__preamble-tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="node-panel__preamble-tooltip-header">Preamble</div>
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

export function NodePanel() {
  const { tools, evaluatorTools } = useTools();
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const data = node?.data as AgentNodeData | undefined;

  const isOrchestrator = data?.role === "orchestrator";
  const isEvaluator = data?.role === "evaluator";
  const hasOrchestrator = nodes.some(
    (n) => (n.data as AgentNodeData).role === "orchestrator",
  );

  // Determine if this subagent is connected to an evaluator
  const hasEvaluatorChild = useMemo(() => {
    if (!selectedNodeId) return false;
    return edges.some((e) => {
      if (e.source !== selectedNodeId) return false;
      const target = nodes.find((n) => n.id === e.target);
      return target && (target.data as AgentNodeData).role === "evaluator";
    });
  }, [edges, nodes, selectedNodeId]);

  const { parentNames, childNames } = useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const parents: string[] = [];
    const children: string[] = [];
    for (const e of edges) {
      if (e.target === selectedNodeId) {
        const name = (nodeById.get(e.source)?.data as AgentNodeData)?.name;
        if (name) parents.push(name);
      }
      if (e.source === selectedNodeId) {
        const name = (nodeById.get(e.target)?.data as AgentNodeData)?.name;
        if (name) children.push(name);
      }
    }
    return { parentNames: parents, childNames: children };
  }, [edges, nodes, selectedNodeId]);

  function handleMakeOrchestrator() {
    if (!selectedNodeId) return;
    nodes.forEach((n) => {
      if (n.id === selectedNodeId) {
        updateNodeData(n.id, { role: "orchestrator" });
      } else if ((n.data as AgentNodeData).role === "orchestrator") {
        updateNodeData(n.id, { role: "subagent" });
      }
    });
  }

  function handleMakeEvaluator() {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, { role: "evaluator", enabledTools: [], maxIterations: 3 });
  }

  function handleMakeSubagent() {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, { role: "subagent" });
  }

  const isOpen = selectedNodeId !== null && data !== undefined;

  const roleBadgeClass = [
    "node-panel__badge",
    isOrchestrator ? "node-panel__badge--orchestrator" : "",
    isEvaluator ? "node-panel__badge--evaluator" : "",
  ].filter(Boolean).join(" ");

  const roleLabel = isOrchestrator ? "Orchestrator" : isEvaluator ? "Evaluator" : "Sub-Agent";

  return (
    <div className={`node-panel${isOpen ? " node-panel--open" : ""}`}>
      {isOpen && (
        <>
          <div className="node-panel__header">
            <span className="node-panel__title">Agent Configuration</span>
            <button
              className="node-panel__close"
              onClick={() => setSelectedNode(null)}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>

          <div className="node-panel__body">
            <div className="node-panel__role-badge">
              <span className={roleBadgeClass}>{roleLabel}</span>
            </div>

            <div className="node-panel__field">
              <label className="node-panel__label">Name</label>
              <input
                className="node-panel__input"
                type="text"
                value={data.name}
                onChange={(e) =>
                  updateNodeData(selectedNodeId, { name: e.target.value })
                }
              />
            </div>

            <div className="node-panel__field">
              <label className="node-panel__label">
                System Prompt
                <PreambleHint text={PREAMBLES[data.role]} />
              </label>
              <textarea
                className="node-panel__textarea"
                value={data.systemPrompt}
                onChange={(e) =>
                  updateNodeData(selectedNodeId, { systemPrompt: e.target.value })
                }
                placeholder={
                  isEvaluator
                    ? "e.g. Check that the response is factual, concise, and cites sources."
                    : "e.g. You are a research specialist. Find accurate, cited information on any topic."
                }
              />
            </div>

            {/* Role action buttons */}
            <div className="node-panel__field">
              {isOrchestrator ? (
                <p className="node-panel__hint node-panel__hint--note">
                  This agent is the orchestrator. It receives the task and
                  coordinates the run.
                </p>
              ) : isEvaluator ? (
                <button
                  className="node-panel__make-orchestrator"
                  onClick={handleMakeSubagent}
                >
                  Demote to Sub-Agent
                </button>
              ) : (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    className="node-panel__make-orchestrator"
                    onClick={handleMakeOrchestrator}
                  >
                    {hasOrchestrator ? "Reassign as Orchestrator" : "Make Orchestrator"}
                  </button>
                  <button
                    className="node-panel__make-orchestrator"
                    onClick={handleMakeEvaluator}
                  >
                    Make Evaluator
                  </button>
                </div>
              )}
            </div>

            {/* maxIterations — only for evaluator */}
            {isEvaluator && (
              <div className="node-panel__field">
                <label className="node-panel__label">Max Iterations</label>
                <input
                  className="node-panel__input"
                  type="number"
                  min={1}
                  max={10}
                  value={data.maxIterations ?? 3}
                  onChange={(e) =>
                    updateNodeData(selectedNodeId, {
                      maxIterations: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                    })
                  }
                />
              </div>
            )}

            {(parentNames.length > 0 || childNames.length > 0) && (
              <div className="node-panel__field">
                <label className="node-panel__label">Connections</label>
                {parentNames.length > 0 && (
                  <div className="node-panel__connections">
                    <span className="node-panel__conn-label">Parent</span>
                    {parentNames.map((name) => (
                      <span key={name} className="node-panel__conn-tag">{name}</span>
                    ))}
                  </div>
                )}
                {childNames.length > 0 && (
                  <div className="node-panel__connections">
                    <span className="node-panel__conn-label">Sub-agents</span>
                    {childNames.map((name) => (
                      <span key={name} className="node-panel__conn-tag">{name}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="node-panel__field">
              <label className="node-panel__label node-panel__label--section">Tools</label>
              <div className="node-panel__tools">
                {isOrchestrator ? (
                  <label className="node-panel__tool-row node-panel__tool-row--last">
                    <input
                      type="checkbox"
                      className="node-panel__tool-checkbox"
                      checked
                      disabled
                    />
                    <span className="node-panel__tool-info">
                      <span className="node-panel__tool-name">Invoke Agent</span>
                      <span className="node-panel__tool-desc">Dispatch tasks to sub-agents</span>
                    </span>
                  </label>
                ) : isEvaluator ? (
                  <>
                    {evaluatorTools.length === 0 ? (
                      <label className="node-panel__tool-row node-panel__tool-row--last">
                        <input
                          type="checkbox"
                          className="node-panel__tool-checkbox"
                          checked
                          disabled
                        />
                        <span className="node-panel__tool-info">
                          <span className="node-panel__tool-name">Judge Output</span>
                          <span className="node-panel__tool-desc">No optional tools available</span>
                        </span>
                      </label>
                    ) : (
                      evaluatorTools.map((tool, idx) => {
                        const enabled = data.enabledTools ?? [];
                        const checked = enabled.includes(tool.id);
                        return (
                          <label
                            key={tool.id}
                            className={`node-panel__tool-row${idx === evaluatorTools.length - 1 ? " node-panel__tool-row--last" : ""}`}
                          >
                            <input
                              type="checkbox"
                              className="node-panel__tool-checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? enabled.filter((t) => t !== tool.id)
                                  : [...enabled, tool.id];
                                updateNodeData(selectedNodeId, { enabledTools: next });
                              }}
                            />
                            <span className="node-panel__tool-info">
                              <span className="node-panel__tool-name">{tool.name}</span>
                              <span className="node-panel__tool-desc">{tool.description}</span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </>
                ) : (
                  <>
                    {hasEvaluatorChild && (
                      <label className="node-panel__tool-row">
                        <input
                          type="checkbox"
                          className="node-panel__tool-checkbox"
                          checked
                          disabled
                        />
                        <span className="node-panel__tool-info">
                          <span className="node-panel__tool-name">Invoke Evaluator</span>
                          <span className="node-panel__tool-desc">Auto-injected — submit result for review</span>
                        </span>
                      </label>
                    )}
                    {tools.map((tool, idx) => {
                      const enabled = data.enabledTools ?? [];
                      const checked = enabled.includes(tool.id);
                      return (
                        <label
                          key={tool.id}
                          className={`node-panel__tool-row${idx === tools.length - 1 ? " node-panel__tool-row--last" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="node-panel__tool-checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? enabled.filter((t) => t !== tool.id)
                                : [...enabled, tool.id];
                              updateNodeData(selectedNodeId, { enabledTools: next });
                            }}
                          />
                          <span className="node-panel__tool-info">
                            <span className="node-panel__tool-name">{tool.name}</span>
                            <span className="node-panel__tool-desc">{tool.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

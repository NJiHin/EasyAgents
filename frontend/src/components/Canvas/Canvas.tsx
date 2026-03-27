import { ReactFlow, Background, BackgroundVariant, Controls } from '@xyflow/react';
import type { NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode } from './AgentNode';
import { AgentEdge } from './AgentEdge';
import { useGraphStore } from '../../store/graphStore';
import { useRunStore } from '../../store/runStore';
import { useMemo, useState } from 'react';

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { agentEdge: AgentEdge };

export function Canvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const deleteNode = useGraphStore((s) => s.deleteNode);
  const cycleRejected = useGraphStore((s) => s.cycleRejected);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

  const activeEdgeIds = useRunStore((s) => s.activeEdgeIds);

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const displayEdges = useMemo(
    () => edges.map((e) => ({
      ...e,
      type: 'agentEdge',
      animated: activeEdgeIds.has(e.id),
      style: { stroke: activeEdgeIds.has(e.id) ? 'var(--accent)' : 'var(--border)' },
      data: { selected: selectedEdgeId === e.id, onSelect: setSelectedEdgeId },
    })),
    [edges, activeEdgeIds, selectedEdgeId]
  );

  function handleNodesChange(changes: NodeChange[]) {
    const nonRemoveChanges = changes.filter((c) => c.type !== 'remove');
    if (nonRemoveChanges.length > 0) onNodesChange(nonRemoveChanges);

    for (const change of changes) {
      if (change.type === 'remove') {
        deleteNode(change.id);
      }
    }
  }

  return (
    <div className="canvas-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => { setSelectedNode(null); setSelectedEdgeId(null); }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        fitView
        style={{ background: 'var(--bg)' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#ccc8be"
          gap={24}
          size={1.5}
        />
        <Controls position="bottom-left" />
      </ReactFlow>

      {cycleRejected && (
        <div className="cycle-tooltip">
          Cycles are not allowed — this would create a loop.
        </div>
      )}
    </div>
  );
}

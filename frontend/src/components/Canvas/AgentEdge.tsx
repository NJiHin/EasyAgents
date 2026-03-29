import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

interface AgentEdgeData {
  selected: boolean;
  onSelect: (id: string | null) => void;
  edgeType?: "delegation" | "feedback";
}

export function AgentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  animated,
  style,
  data,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const edgeData = data as unknown as AgentEdgeData;
  const isSelected = edgeData?.selected ?? false;
  const onSelect = edgeData?.onSelect;
  const isFeedback = edgeData?.edgeType === "feedback";

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: isFeedback ? 0.8 : 0.25,
  });

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect?.(isSelected ? null : id);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setEdges((eds) => eds.filter((ed) => ed.id !== id));
    onSelect?.(null);
  }

  const isAnimated = animated || isSelected;
  const strokeColor = isFeedback ? "var(--warning, #f59e0b)" : undefined;
  const arrowColor = isFeedback
    ? "var(--warning, #f59e0b)"
    : "var(--border, #111111)";

  // Angle of the edge at midpoint, approximated from source → target
  const angle =
    Math.atan2(targetY - sourceY, targetX - sourceX) * (180 / Math.PI);

  return (
    <>
      {/* Invisible wide hit area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: "pointer" }}
        onClick={handleClick}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeDasharray: isFeedback ? "6 3" : isAnimated ? "6 3" : undefined,
          animation: isAnimated
            ? "edge-march 400ms linear infinite"
            : undefined,
          strokeWidth: isSelected ? 2.5 : 2,
        }}
        interactionWidth={0}
      />
      <EdgeLabelRenderer>
        {/* Centre direction arrow */}
        <div
          className="edge-arrow"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${angle}deg)`,
            color: arrowColor,
          }}
          onClick={handleClick}
        >
          ▶
        </div>
        {isSelected && (
          <div
            className="edge-delete-btn"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onClick={handleDelete}
          >
            ×
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

from pydantic import BaseModel
from typing import Literal


class AgentNodeData(BaseModel):
    name: str
    role: Literal["orchestrator", "subagent", "evaluator"]
    maxIterations: int = 3
    systemPrompt: str
    enabledTools: list[str]


class NodeDefinition(BaseModel):
    id: str
    data: AgentNodeData


class EdgeDefinition(BaseModel):
    id: str
    source: str
    target: str


class GraphDefinition(BaseModel):
    nodes: list[NodeDefinition]
    edges: list[EdgeDefinition]


class RunRequest(BaseModel):
    graph: GraphDefinition
    task: str

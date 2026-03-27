import pytest
from app.models import AgentNodeData


def test_evaluator_role_accepted():
    node = AgentNodeData(name="Eval", role="evaluator", systemPrompt="", enabledTools=[])
    assert node.role == "evaluator"


def test_max_iterations_default():
    node = AgentNodeData(name="Eval", role="evaluator", systemPrompt="", enabledTools=[])
    assert node.maxIterations == 3


def test_max_iterations_custom():
    node = AgentNodeData(name="Eval", role="evaluator", systemPrompt="", enabledTools=[], maxIterations=5)
    assert node.maxIterations == 5


def test_agent_type_field_removed():
    from app.models import AgentNodeData
    fields = AgentNodeData.model_fields
    assert "agentType" not in fields

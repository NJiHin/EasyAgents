"""
Tests for validate_graph covering orchestrator/subagent/evaluator topology rules.
"""

import pytest
from app.models import GraphDefinition, NodeDefinition, EdgeDefinition, AgentNodeData
from app.graph.validator import validate_graph


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_node(id: str, role: str, name: str | None = None) -> NodeDefinition:
    return NodeDefinition(
        id=id,
        data=AgentNodeData(
            name=name or id,
            role=role,
            systemPrompt="",
            enabledTools=[],
        ),
    )


def make_edge(source: str, target: str) -> EdgeDefinition:
    return EdgeDefinition(id=f"{source}->{target}", source=source, target=target)


def make_graph(nodes, edges) -> GraphDefinition:
    return GraphDefinition(nodes=nodes, edges=edges)


def valid(result: dict) -> bool:
    return result["valid"]


def errors(result: dict) -> list[str]:
    return result["errors"]


# ---------------------------------------------------------------------------
# Orchestrator rules
# ---------------------------------------------------------------------------

class TestOrchestratorRules:
    def test_no_orchestrator_is_invalid(self):
        graph = make_graph(
            nodes=[make_node("a", "subagent")],
            edges=[],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("no orchestrator" in e for e in errors(result))

    def test_two_orchestrators_is_invalid(self):
        graph = make_graph(
            nodes=[make_node("o1", "orchestrator"), make_node("o2", "orchestrator")],
            edges=[],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("more than one orchestrator" in e for e in errors(result))

    def test_orchestrator_connected_to_one_subagent(self):
        graph = make_graph(
            nodes=[make_node("o", "orchestrator"), make_node("a", "subagent")],
            edges=[make_edge("o", "a")],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

    def test_orchestrator_connected_to_two_subagents(self):
        """Core regression: orchestrator → agent_a + agent_b must not produce a cycle error."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "b"),
            ],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

    def test_orchestrator_connected_to_many_subagents(self):
        nodes = [make_node("o", "orchestrator")] + [
            make_node(f"a{i}", "subagent") for i in range(5)
        ]
        edges = [make_edge("o", f"a{i}") for i in range(5)]
        result = validate_graph(make_graph(nodes, edges))
        assert valid(result), errors(result)

    def test_orchestrator_cannot_connect_directly_to_evaluator(self):
        """Orchestrator → evaluator directly must be invalid (evaluator must only attach to a subagent)."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "ev"),   # direct orchestrator→evaluator — not allowed
                make_edge("a", "ev"),
                make_edge("ev", "a"),
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)


# ---------------------------------------------------------------------------
# Evaluator rules
# ---------------------------------------------------------------------------

class TestEvaluatorRules:
    def test_two_evaluators_on_same_subagent_is_invalid(self):
        """Two evaluators attached to the same subagent must be rejected."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev1", "evaluator"),
                make_node("ev2", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "ev1"),
                make_edge("ev1", "a"),
                make_edge("a", "ev2"),
                make_edge("ev2", "a"),
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("more than one evaluator" in e for e in errors(result))

    def test_two_evaluators_on_different_subagents_is_valid(self):
        """Each subagent may have its own evaluator."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
                make_node("ev1", "evaluator"),
                make_node("ev2", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "b"),
                make_edge("a", "ev1"),
                make_edge("ev1", "a"),
                make_edge("b", "ev2"),
                make_edge("ev2", "b"),
            ],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

    def test_evaluator_with_no_incoming_is_invalid(self):
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("ev", "a"),  # outgoing but no incoming
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("must have exactly one incoming" in e for e in errors(result))

    def test_evaluator_with_no_outgoing_is_invalid(self):
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "ev"),  # incoming but no outgoing
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("must have exactly one incoming" in e for e in errors(result))

    def test_evaluator_outgoing_to_different_node_is_invalid(self):
        """Evaluator must loop back to the same subagent it receives from."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "b"),
                make_edge("a", "ev"),
                make_edge("ev", "b"),  # wrong target — must go back to "a"
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("same worker" in e for e in errors(result))

    def test_valid_evaluator_loop(self):
        """Subagent → evaluator → subagent (same node) is valid."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "ev"),
                make_edge("ev", "a"),
            ],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

    def test_evaluator_feedback_edge_not_flagged_as_cycle(self):
        """The eval→subagent back-edge must be exempted from cycle detection."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "ev"),
                make_edge("ev", "a"),
            ],
        )
        result = validate_graph(graph)
        assert "Graph contains a cycle." not in errors(result)
        assert valid(result), errors(result)


# ---------------------------------------------------------------------------
# Core regression: orchestrator → 2 subagents, one with evaluator
# ---------------------------------------------------------------------------

class TestOrchestratorTwoSubagentsOneEvaluator:
    """
    Regression for: connecting orchestrator to 2 sub-agents while one of them
    already has an evaluator attached causes a false cycle error.

    Topology:
        orchestrator → agent_a → evaluator → agent_a  (feedback loop, exempted)
        orchestrator → agent_b
    """

    def _make_graph(self):
        return make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "b"),
                make_edge("a", "ev"),
                make_edge("ev", "a"),
            ],
        )

    def test_no_cycle_error(self):
        result = validate_graph(self._make_graph())
        assert "Graph contains a cycle." not in errors(result), (
            "False positive: evaluator feedback edge incorrectly detected as a cycle "
            "when orchestrator has two subagents."
        )

    def test_graph_is_valid(self):
        result = validate_graph(self._make_graph())
        assert valid(result), errors(result)

    def test_three_subagents_one_with_evaluator(self):
        """Scale up: orchestrator → 3 subagents, middle one has evaluator."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
                make_node("c", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "b"),
                make_edge("o", "c"),
                make_edge("b", "ev"),
                make_edge("ev", "b"),
            ],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

    def test_two_subagents_each_with_evaluator(self):
        """Regression for image scenario: AGENT_1→AGENT_3+AGENT_4, each with their own evaluator."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a3", "subagent"),
                make_node("a4", "subagent"),
                make_node("ev2", "evaluator"),
                make_node("ev5", "evaluator"),
            ],
            edges=[
                make_edge("o", "a3"),
                make_edge("o", "a4"),
                make_edge("a3", "ev2"),
                make_edge("ev2", "a3"),
                make_edge("a4", "ev5"),
                make_edge("ev5", "a4"),
            ],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)


# ---------------------------------------------------------------------------
# Disconnected node rules
# ---------------------------------------------------------------------------

class TestDisconnectedNodes:
    def test_disconnected_subagent_is_invalid(self):
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),  # not connected to anything
            ],
            edges=[make_edge("o", "a")],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert any("b" in e and "no incoming" in e for e in errors(result))

    def test_orchestrator_needs_no_incoming(self):
        """Orchestrator is exempt from the incoming-edge requirement."""
        graph = make_graph(
            nodes=[make_node("o", "orchestrator"), make_node("a", "subagent")],
            edges=[make_edge("o", "a")],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

    def test_evaluator_exempt_from_incoming_check(self):
        """Evaluator's incoming edge comes from its subagent, not from orchestrator."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("ev", "evaluator"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "ev"),
                make_edge("ev", "a"),
            ],
        )
        result = validate_graph(graph)
        # evaluator DOES have an incoming edge here, but even if not, the
        # disconnected-node check must not flag it
        assert "ev" not in " ".join(e for e in errors(result) if "no incoming" in e)


# ---------------------------------------------------------------------------
# Cycle detection
# ---------------------------------------------------------------------------

class TestCycleDetection:
    def test_simple_cycle_detected(self):
        """a → b → a is a real cycle and must be flagged."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("o", "b"),
                make_edge("a", "b"),
                make_edge("b", "a"),
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert "Graph contains a cycle." in errors(result)

    def test_self_loop_detected(self):
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "a"),  # self loop
            ],
        )
        result = validate_graph(graph)
        assert not valid(result)
        assert "Graph contains a cycle." in errors(result)

    def test_linear_chain_no_cycle(self):
        """o → a → b is a valid DAG."""
        graph = make_graph(
            nodes=[
                make_node("o", "orchestrator"),
                make_node("a", "subagent"),
                make_node("b", "subagent"),
            ],
            edges=[
                make_edge("o", "a"),
                make_edge("a", "b"),
            ],
        )
        result = validate_graph(graph)
        assert valid(result), errors(result)

def validate_graph(graph) -> dict:
    nodes = graph.nodes
    edges = graph.edges

    errors = []

    # Exactly one orchestrator
    orchestrators = [n for n in nodes if n.data.role == "orchestrator"]
    if len(orchestrators) == 0:
        errors.append("Graph has no orchestrator node.")
    elif len(orchestrators) > 1:
        errors.append("Graph has more than one orchestrator node.")

    # At most one evaluator
    evaluators = [n for n in nodes if n.data.role == "evaluator"]
    if len(evaluators) > 1:
        errors.append("Graph has more than one evaluator node.")

    # Evaluator topology: exactly one in-edge and one out-edge, both to/from the same worker
    exempted_edge: tuple[str, str] | None = None  # (source, target) of the feedback edge to exempt
    if len(evaluators) == 1:
        ev = evaluators[0]
        incoming = [e for e in edges if e.target == ev.id]
        outgoing = [e for e in edges if e.source == ev.id]
        if len(incoming) != 1 or len(outgoing) != 1:
            errors.append(
                "Evaluator must have exactly one incoming edge (from its worker) "
                "and one outgoing edge (back to that worker)."
            )
        elif incoming[0].source != outgoing[0].target:
            errors.append(
                "Evaluator's outgoing edge must point back to the same worker "
                "that its incoming edge comes from."
            )
        else:
            # Valid topology — record the feedback edge to exempt from cycle detection
            exempted_edge = (ev.id, outgoing[0].target)

    # Disconnected non-orchestrator, non-evaluator nodes
    node_ids_with_incoming = {e.target for e in edges}
    for node in nodes:
        if node.data.role not in ("orchestrator", "evaluator") and node.id not in node_ids_with_incoming:
            errors.append(f"Node '{node.data.name}' ({node.id}) has no incoming edges.")

    # Cycle detection (DFS) — exempt the evaluator→worker feedback edge
    adj: dict[str, list[str]] = {n.id: [] for n in nodes}
    for e in edges:
        if exempted_edge and (e.source, e.target) == exempted_edge:
            continue  # skip feedback edge
        adj[e.source].append(e.target)

    visited: set[str] = set()
    in_stack: set[str] = set()

    def has_cycle(node_id: str) -> bool:
        visited.add(node_id)
        in_stack.add(node_id)
        for neighbour in adj.get(node_id, []):
            if neighbour not in visited:
                if has_cycle(neighbour):
                    return True
            elif neighbour in in_stack:
                return True
        in_stack.discard(node_id)
        return False

    for node in nodes:
        if node.id not in visited:
            if has_cycle(node.id):
                errors.append("Graph contains a cycle.")
                break

    return {"valid": len(errors) == 0, "errors": errors}

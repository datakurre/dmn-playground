/**
 * Decision Requirements Graph (DRG) resolver.
 *
 * Determines the evaluation order of decisions by performing a topological
 * sort of the decision dependency graph. This ensures that required decisions
 * are evaluated before the decisions that depend on them.
 */

/**
 * Resolve the evaluation order for a set of decisions using topological sort.
 *
 * @param {import('../parser/parse.js').DmnModel} model - Parsed DMN model
 * @param {string} [targetDecisionId] - If provided, only include decisions needed for this one
 * @returns {string[]} Decision IDs in evaluation order (dependencies first)
 * @throws {Error} If there is a circular dependency
 */
export function resolveEvaluationOrder(model, targetDecisionId) {
  if (targetDecisionId) {
    return resolveForDecision(model, targetDecisionId);
  }
  return resolveAll(model);
}

/**
 * Resolve evaluation order for a specific target decision and its transitive dependencies.
 *
 * @param {import('../parser/parse.js').DmnModel} model
 * @param {string} targetId
 * @returns {string[]}
 */
function resolveForDecision(model, targetId) {
  const visited = new Set();
  const visiting = new Set(); // For cycle detection
  const order = [];

  function visit(decisionId) {
    if (visited.has(decisionId)) return;

    if (visiting.has(decisionId)) {
      throw new Error(`Circular dependency detected involving decision: ${decisionId}`);
    }

    visiting.add(decisionId);

    const decision = model.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    // Visit dependencies first
    for (const requiredId of decision.informationRequirements) {
      visit(requiredId);
    }

    visiting.delete(decisionId);
    visited.add(decisionId);
    order.push(decisionId);
  }

  visit(targetId);
  return order;
}

/**
 * Resolve evaluation order for all decisions in the model (full topological sort).
 *
 * @param {import('../parser/parse.js').DmnModel} model
 * @returns {string[]}
 */
function resolveAll(model) {
  const visited = new Set();
  const visiting = new Set();
  const order = [];

  function visit(decisionId) {
    if (visited.has(decisionId)) return;

    if (visiting.has(decisionId)) {
      throw new Error(`Circular dependency detected involving decision: ${decisionId}`);
    }

    visiting.add(decisionId);

    const decision = model.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    for (const requiredId of decision.informationRequirements) {
      visit(requiredId);
    }

    visiting.delete(decisionId);
    visited.add(decisionId);
    order.push(decisionId);
  }

  for (const decisionId of model.decisions.keys()) {
    visit(decisionId);
  }

  return order;
}

/**
 * Get all decisions that a given decision depends on (transitive closure).
 *
 * @param {import('../parser/parse.js').DmnModel} model
 * @param {string} decisionId
 * @returns {string[]} IDs of all required decisions (not including the target itself)
 */
export function getDependencies(model, decisionId) {
  const order = resolveForDecision(model, decisionId);
  // Remove the target itself — it's always the last element
  return order.slice(0, -1);
}

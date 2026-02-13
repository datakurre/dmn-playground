/**
 * Hit-policy handlers for DMN decision tables.
 *
 * Each hit policy determines how matched rules are collected/filtered/aggregated
 * to produce the final decision table result.
 *
 * Modeled after Operaton's engine-dmn hit-policy behavior.
 */

/**
 * @typedef {Object} MatchedRule
 * @property {string} id - Rule ID
 * @property {number} index - Rule index (0-based, table order)
 * @property {Object} outputs - Map of output name → value
 */

/**
 * @typedef {Object} HitPolicyResult
 * @property {Object[]|Object|null} result - The decision table result(s)
 * @property {MatchedRule[]} matchedRules - All rules that matched
 * @property {string} [error] - Error message if hit policy is violated
 */

/**
 * Apply a hit policy to a set of matched rules.
 *
 * @param {string} hitPolicy - UNIQUE, ANY, FIRST, RULE ORDER, COLLECT
 * @param {string} [aggregation] - SUM, MIN, MAX, COUNT (only for COLLECT)
 * @param {MatchedRule[]} matchedRules - Rules that matched, in table order
 * @param {string[]} outputNames - Names of the output columns
 * @returns {HitPolicyResult}
 */
export function applyHitPolicy(hitPolicy, aggregation, matchedRules, outputNames) {
  switch (hitPolicy) {
    case 'UNIQUE':
      return applyUnique(matchedRules);
    case 'ANY':
      return applyAny(matchedRules);
    case 'FIRST':
      return applyFirst(matchedRules);
    case 'RULE ORDER':
      return applyRuleOrder(matchedRules);
    case 'COLLECT':
      return applyCollect(aggregation, matchedRules, outputNames);
    default:
      return {
        result: null,
        matchedRules,
        error: `Unknown hit policy: ${hitPolicy}`,
      };
  }
}

/**
 * UNIQUE — at most one rule may match.
 * If more than one matches, it's an error.
 */
function applyUnique(matchedRules) {
  if (matchedRules.length > 1) {
    return {
      result: null,
      matchedRules,
      error: `UNIQUE hit policy violated: ${matchedRules.length} rules matched (expected at most 1)`,
    };
  }

  return {
    result: matchedRules.length === 1 ? matchedRules[0].outputs : null,
    matchedRules,
  };
}

/**
 * ANY — multiple rules may match, but all must produce the same output.
 * If outputs differ, it's an error.
 */
function applyAny(matchedRules) {
  if (matchedRules.length === 0) {
    return { result: null, matchedRules };
  }

  const firstOutput = matchedRules[0].outputs;

  for (let i = 1; i < matchedRules.length; i++) {
    if (!outputsEqual(firstOutput, matchedRules[i].outputs)) {
      return {
        result: null,
        matchedRules,
        error: `ANY hit policy violated: matched rules produce different outputs`,
      };
    }
  }

  return {
    result: firstOutput,
    matchedRules,
  };
}

/**
 * FIRST — return the first matching rule's output (in table order).
 */
function applyFirst(matchedRules) {
  return {
    result: matchedRules.length > 0 ? matchedRules[0].outputs : null,
    matchedRules,
  };
}

/**
 * RULE ORDER — return all matching outputs in rule (table) order.
 * matchedRules are already in table order.
 */
function applyRuleOrder(matchedRules) {
  return {
    result: matchedRules.map((r) => r.outputs),
    matchedRules,
  };
}

/**
 * COLLECT — return all matching outputs, optionally with aggregation.
 */
function applyCollect(aggregation, matchedRules, outputNames) {
  if (!aggregation) {
    // Plain COLLECT: return list of all matched outputs
    return {
      result: matchedRules.map((r) => r.outputs),
      matchedRules,
    };
  }

  switch (aggregation) {
    case 'SUM':
      return applyCollectSum(matchedRules, outputNames);
    case 'MIN':
      return applyCollectMin(matchedRules, outputNames);
    case 'MAX':
      return applyCollectMax(matchedRules, outputNames);
    case 'COUNT':
      return applyCollectCount(matchedRules);
    default:
      return {
        result: null,
        matchedRules,
        error: `Unknown COLLECT aggregation: ${aggregation}`,
      };
  }
}

/**
 * COLLECT + SUM — sum numeric outputs.
 */
function applyCollectSum(matchedRules, outputNames) {
  const result = {};
  for (const name of outputNames) {
    result[name] = matchedRules.reduce((sum, r) => {
      const val = r.outputs[name];
      return sum + (typeof val === 'number' ? val : 0);
    }, 0);
  }
  return { result, matchedRules };
}

/**
 * COLLECT + MIN — smallest numeric output.
 */
function applyCollectMin(matchedRules, outputNames) {
  if (matchedRules.length === 0) {
    return { result: null, matchedRules };
  }

  const result = {};
  for (const name of outputNames) {
    const values = matchedRules.map((r) => r.outputs[name]).filter((v) => typeof v === 'number');
    result[name] = values.length > 0 ? Math.min(...values) : null;
  }
  return { result, matchedRules };
}

/**
 * COLLECT + MAX — largest numeric output.
 */
function applyCollectMax(matchedRules, outputNames) {
  if (matchedRules.length === 0) {
    return { result: null, matchedRules };
  }

  const result = {};
  for (const name of outputNames) {
    const values = matchedRules.map((r) => r.outputs[name]).filter((v) => typeof v === 'number');
    result[name] = values.length > 0 ? Math.max(...values) : null;
  }
  return { result, matchedRules };
}

/**
 * COLLECT + COUNT — count of matching rules.
 */
function applyCollectCount(matchedRules) {
  return {
    result: matchedRules.length,
    matchedRules,
  };
}

/**
 * Check if two output maps are equal (shallow comparison).
 */
function outputsEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

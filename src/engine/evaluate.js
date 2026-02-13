/*
 * Copyright 2025 Operaton contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * DMN Decision Table & Literal Expression Evaluator.
 *
 * This is the core engine that evaluates DMN decisions. It reimplements
 * the logic from Operaton's engine-dmn/engine/ in JavaScript.
 *
 * The engine does NOT evaluate FEEL expressions itself — it delegates
 * to a pluggable FeelProvider (feelin or feel-scala).
 */

import { applyHitPolicy } from './hit-policy.js';
import { coerceValue } from './types.js';
import { FeelinProvider } from './feel/feelin.js';

/**
 * @typedef {Object} EvaluationTrace
 * @property {string} decisionId
 * @property {string} decisionName
 * @property {string} type - "decisionTable" or "literalExpression"
 * @property {Object} inputValues - Evaluated input expression values
 * @property {import('./hit-policy.js').MatchedRule[]} matchedRules
 * @property {*} result
 * @property {string} [error]
 */

/**
 * @typedef {Object} EvaluationResult
 * @property {*} result - The final result
 * @property {EvaluationTrace[]} trace - Audit log of all evaluations
 * @property {string} [error] - Error message if evaluation failed
 */

/**
 * Evaluate a single decision from a parsed DMN model.
 *
 * @param {import('../parser/parse.js').DmnModel} model - Parsed DMN model
 * @param {string} decisionId - ID of the decision to evaluate
 * @param {Object} inputData - Input variable bindings
 * @param {Object} [options]
 * @param {import('./feel/provider.js').FeelProvider} [options.feelProvider] - FEEL backend (defaults to feelin)
 * @returns {EvaluationResult}
 */
export function evaluateDecision(model, decisionId, inputData, options = {}) {
  const feelProvider = options.feelProvider || new FeelinProvider();
  const overrides = options.overrides || {};
  const trace = [];

  // Build the full context by evaluating required decisions (DRG)
  const context = { ...inputData };
  const evaluated = new Map();

  try {
    const result = evaluateDecisionRecursive(
      model,
      decisionId,
      context,
      feelProvider,
      trace,
      evaluated,
      overrides,
    );
    return { result, trace };
  } catch (err) {
    return { result: null, trace, error: err.message };
  }
}

/**
 * Recursively evaluate a decision and its dependencies.
 *
 * @param {import('../parser/parse.js').DmnModel} model
 * @param {string} decisionId
 * @param {Object} context - Mutable context (enriched with dependency outputs)
 * @param {import('./feel/provider.js').FeelProvider} feelProvider
 * @param {EvaluationTrace[]} trace
 * @param {Map<string, *>} evaluated - Cache of already-evaluated decisions
 * @param {Object} overrides - Map of decisionId → value for what-if analysis
 * @returns {*} The decision result
 */
function evaluateDecisionRecursive(
  model,
  decisionId,
  context,
  feelProvider,
  trace,
  evaluated,
  overrides,
) {
  // Already evaluated? Return cached result
  if (evaluated.has(decisionId)) {
    return evaluated.get(decisionId);
  }

  const decision = model.decisions.get(decisionId);
  if (!decision) {
    throw new Error(`Decision not found: ${decisionId}`);
  }

  // Check for what-if override before evaluating
  if (Object.prototype.hasOwnProperty.call(overrides, decisionId)) {
    const overrideResult = overrides[decisionId];
    evaluated.set(decisionId, overrideResult);
    context[decision.name] = overrideResult;
    context[decisionId] = overrideResult;
    trace.push({
      decisionId,
      decisionName: decision.name,
      type: 'override',
      inputValues: {},
      matchedRules: [],
      result: overrideResult,
    });
    return overrideResult;
  }

  // Evaluate required decisions first (DRG dependencies)
  for (const requiredId of decision.informationRequirements) {
    const requiredResult = evaluateDecisionRecursive(
      model,
      requiredId,
      context,
      feelProvider,
      trace,
      evaluated,
      overrides,
    );
    // The output of a required decision is made available in the context
    // by the decision name (Operaton behavior) or by the output variable name
    const requiredDecision = model.decisions.get(requiredId);
    if (requiredDecision) {
      context[requiredDecision.name] = requiredResult;
      // Also make available by ID for robustness
      context[requiredId] = requiredResult;
    }
  }

  // Evaluate this decision's logic
  let result;
  if (!decision.logic) {
    throw new Error(`Decision ${decisionId} has no decision logic`);
  }

  if (decision.logic.type === 'decisionTable') {
    result = evaluateDecisionTable(decision, context, feelProvider, trace);
  } else if (decision.logic.type === 'literalExpression') {
    result = evaluateLiteralExpression(decision, context, feelProvider, trace);
  } else {
    throw new Error(`Unsupported decision logic type: ${decision.logic.type}`);
  }

  evaluated.set(decisionId, result);
  return result;
}

/**
 * Evaluate a decision table.
 *
 * @param {import('../parser/parse.js').DmnDecision} decision
 * @param {Object} context
 * @param {import('./feel/provider.js').FeelProvider} feelProvider
 * @param {EvaluationTrace[]} trace
 * @returns {*}
 */
function evaluateDecisionTable(decision, context, feelProvider, trace) {
  const dt = decision.logic;

  // Step 1: Evaluate input expressions
  const inputValues = {};
  const evaluatedInputs = dt.inputs.map((input) => {
    const value = input.expression ? feelProvider.evaluate(input.expression, context) : undefined;
    inputValues[input.label || input.expression] = value;
    return value;
  });

  // Step 2: Match rules
  const matchedRules = [];

  for (let ruleIdx = 0; ruleIdx < dt.rules.length; ruleIdx++) {
    const rule = dt.rules[ruleIdx];
    let ruleMatches = true;

    // Check each input entry against the evaluated input value
    for (let inputIdx = 0; inputIdx < rule.inputEntries.length; inputIdx++) {
      const inputEntry = rule.inputEntries[inputIdx];
      const inputValue = evaluatedInputs[inputIdx];

      // Build context for unary test: include all variables plus input-specific ones
      const testContext = { ...context };

      const matches = feelProvider.unaryTest(inputEntry, inputValue, testContext);

      if (!matches) {
        ruleMatches = false;
        break;
      }
    }

    if (ruleMatches) {
      // Evaluate output entries
      const outputs = {};
      for (let outputIdx = 0; outputIdx < rule.outputEntries.length; outputIdx++) {
        const outputEntry = rule.outputEntries[outputIdx];
        const outputDef = dt.outputs[outputIdx];
        const outputName = outputDef.name || outputDef.label || `output${outputIdx}`;

        let value;
        const trimmed = (outputEntry ?? '').trim();
        if (trimmed === '' || trimmed === '-') {
          value = null;
        } else {
          value = feelProvider.evaluate(outputEntry, context);
        }

        // Coerce to declared type
        value = coerceValue(value, outputDef.typeRef);
        outputs[outputName] = value;
      }

      matchedRules.push({
        id: rule.id,
        index: ruleIdx,
        outputs,
      });
    }
  }

  // Step 3: Apply hit policy
  const outputNames = dt.outputs.map((o) => o.name || o.label || 'output');
  const hitResult = applyHitPolicy(dt.hitPolicy, dt.aggregation, matchedRules, outputNames);

  // Record trace
  trace.push({
    decisionId: decision.id,
    decisionName: decision.name,
    type: 'decisionTable',
    hitPolicy: dt.hitPolicy,
    aggregation: dt.aggregation,
    inputValues,
    matchedRules,
    result: hitResult.result,
    error: hitResult.error,
  });

  if (hitResult.error) {
    throw new Error(hitResult.error);
  }

  // For single-output tables, unwrap the result to just the value
  // (Operaton returns a simple value for single-output decisions)
  if (dt.outputs.length === 1 && hitResult.result !== null) {
    const singleOutputName = outputNames[0];

    if (Array.isArray(hitResult.result)) {
      // RULE ORDER / COLLECT: list of single values
      return hitResult.result.map((r) => r[singleOutputName]);
    } else if (typeof hitResult.result === 'object') {
      // UNIQUE / ANY / FIRST: single value
      return hitResult.result[singleOutputName];
    }
  }

  return hitResult.result;
}

/**
 * Evaluate a literal expression decision.
 *
 * @param {import('../parser/parse.js').DmnDecision} decision
 * @param {Object} context
 * @param {import('./feel/provider.js').FeelProvider} feelProvider
 * @param {EvaluationTrace[]} trace
 * @returns {*}
 */
function evaluateLiteralExpression(decision, context, feelProvider, trace) {
  const le = decision.logic;
  const result = feelProvider.evaluate(le.expression, context);

  // Coerce to declared type
  const coerced = coerceValue(result, le.typeRef);

  trace.push({
    decisionId: decision.id,
    decisionName: decision.name,
    type: 'literalExpression',
    inputValues: context,
    matchedRules: [],
    result: coerced,
  });

  return coerced;
}

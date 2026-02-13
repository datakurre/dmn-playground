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
 * DMN Model Comparison — structural diff between two DMN models.
 *
 * Compares two parsed DmnModel instances and produces a structured diff
 * describing what changed between them (decisions added/removed/modified,
 * rule changes, input/output changes, etc.).
 */

/**
 * @typedef {'added' | 'removed' | 'modified' | 'unchanged'} ChangeStatus
 */

/**
 * @typedef {Object} FieldChange
 * @property {string} field - Name of the changed field
 * @property {*} left - Value in the left (old) model
 * @property {*} right - Value in the right (new) model
 */

/**
 * @typedef {Object} RuleDiff
 * @property {ChangeStatus} status
 * @property {number} [leftIndex] - Rule index in left model (undefined if added)
 * @property {number} [rightIndex] - Rule index in right model (undefined if removed)
 * @property {string[]} [leftInputEntries]
 * @property {string[]} [rightInputEntries]
 * @property {string[]} [leftOutputEntries]
 * @property {string[]} [rightOutputEntries]
 */

/**
 * @typedef {Object} DecisionDiff
 * @property {string} id - Decision ID
 * @property {string} name - Decision name (from whichever side exists)
 * @property {ChangeStatus} status
 * @property {FieldChange[]} changes - Top-level field changes
 * @property {RuleDiff[]} [ruleDiffs] - Per-rule diffs (for decision tables)
 */

/**
 * @typedef {Object} ModelComparison
 * @property {DecisionDiff[]} decisions - Per-decision diffs
 * @property {Object} summary - Quick counts
 * @property {number} summary.added
 * @property {number} summary.removed
 * @property {number} summary.modified
 * @property {number} summary.unchanged
 */

/**
 * Compare two DMN models and produce a structured diff.
 *
 * @param {import('../parser/parse.js').DmnModel} left - The "old" / "base" model
 * @param {import('../parser/parse.js').DmnModel} right - The "new" / "changed" model
 * @returns {ModelComparison}
 */
export function compareModels(left, right) {
  const decisions = [];
  const allIds = new Set([...left.decisions.keys(), ...right.decisions.keys()]);

  for (const id of allIds) {
    const leftDec = left.decisions.get(id);
    const rightDec = right.decisions.get(id);

    if (!leftDec) {
      decisions.push({
        id,
        name: rightDec.name,
        status: 'added',
        changes: [],
        ...(rightDec.logic?.type === 'decisionTable'
          ? {
              ruleDiffs: rightDec.logic.rules.map((_, i) => ({
                status: 'added',
                rightIndex: i,
                rightInputEntries: rightDec.logic.rules[i].inputEntries,
                rightOutputEntries: rightDec.logic.rules[i].outputEntries,
              })),
            }
          : {}),
      });
    } else if (!rightDec) {
      decisions.push({
        id,
        name: leftDec.name,
        status: 'removed',
        changes: [],
        ...(leftDec.logic?.type === 'decisionTable'
          ? {
              ruleDiffs: leftDec.logic.rules.map((_, i) => ({
                status: 'removed',
                leftIndex: i,
                leftInputEntries: leftDec.logic.rules[i].inputEntries,
                leftOutputEntries: leftDec.logic.rules[i].outputEntries,
              })),
            }
          : {}),
      });
    } else {
      decisions.push(compareDecisions(leftDec, rightDec));
    }
  }

  // Sort: modified first, then added, removed, unchanged
  const statusOrder = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  decisions.sort((a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4));

  const summary = {
    added: decisions.filter((d) => d.status === 'added').length,
    removed: decisions.filter((d) => d.status === 'removed').length,
    modified: decisions.filter((d) => d.status === 'modified').length,
    unchanged: decisions.filter((d) => d.status === 'unchanged').length,
  };

  return { decisions, summary };
}

/**
 * Compare two decisions that share the same ID.
 *
 * @param {import('../parser/parse.js').DmnDecision} left
 * @param {import('../parser/parse.js').DmnDecision} right
 * @returns {DecisionDiff}
 */
function compareDecisions(left, right) {
  const changes = [];

  if (left.name !== right.name) {
    changes.push({ field: 'name', left: left.name, right: right.name });
  }

  const leftType = left.logic?.type ?? null;
  const rightType = right.logic?.type ?? null;

  if (leftType !== rightType) {
    changes.push({ field: 'logicType', left: leftType, right: rightType });
  }

  let ruleDiffs;

  if (leftType === 'decisionTable' && rightType === 'decisionTable') {
    const dtChanges = compareDecisionTables(left.logic, right.logic);
    changes.push(...dtChanges.fieldChanges);
    ruleDiffs = dtChanges.ruleDiffs;
  } else if (leftType === 'literalExpression' && rightType === 'literalExpression') {
    const leChanges = compareLiteralExpressions(left.logic, right.logic);
    changes.push(...leChanges);
  }

  // Compare information requirements
  const leftReqs = [...left.informationRequirements].sort().join(',');
  const rightReqs = [...right.informationRequirements].sort().join(',');
  if (leftReqs !== rightReqs) {
    changes.push({
      field: 'informationRequirements',
      left: left.informationRequirements,
      right: right.informationRequirements,
    });
  }

  const hasRuleChanges = ruleDiffs?.some((r) => r.status !== 'unchanged') ?? false;
  const status = changes.length > 0 || hasRuleChanges ? 'modified' : 'unchanged';

  return {
    id: left.id,
    name: right.name || left.name,
    status,
    changes,
    ...(ruleDiffs ? { ruleDiffs } : {}),
  };
}

/**
 * Compare two decision tables.
 *
 * @param {import('../parser/parse.js').DmnDecisionTable} left
 * @param {import('../parser/parse.js').DmnDecisionTable} right
 * @returns {{ fieldChanges: FieldChange[], ruleDiffs: RuleDiff[] }}
 */
function compareDecisionTables(left, right) {
  const fieldChanges = [];

  if (left.hitPolicy !== right.hitPolicy) {
    fieldChanges.push({ field: 'hitPolicy', left: left.hitPolicy, right: right.hitPolicy });
  }

  if ((left.aggregation ?? null) !== (right.aggregation ?? null)) {
    fieldChanges.push({
      field: 'aggregation',
      left: left.aggregation ?? null,
      right: right.aggregation ?? null,
    });
  }

  // Compare inputs
  const inputChanges = compareArrayByField(left.inputs, right.inputs, formatInput);
  if (inputChanges.length > 0) {
    fieldChanges.push({ field: 'inputs', left: inputChanges, right: null });
  }

  // Compare outputs
  const outputChanges = compareArrayByField(left.outputs, right.outputs, formatOutput);
  if (outputChanges.length > 0) {
    fieldChanges.push({ field: 'outputs', left: outputChanges, right: null });
  }

  // Compare rules
  const ruleDiffs = compareRules(left.rules, right.rules);

  return { fieldChanges, ruleDiffs };
}

/**
 * Compare two literal expressions.
 *
 * @param {import('../parser/parse.js').DmnLiteralExpression} left
 * @param {import('../parser/parse.js').DmnLiteralExpression} right
 * @returns {FieldChange[]}
 */
function compareLiteralExpressions(left, right) {
  const changes = [];

  if (left.expression !== right.expression) {
    changes.push({ field: 'expression', left: left.expression, right: right.expression });
  }

  if ((left.typeRef ?? null) !== (right.typeRef ?? null)) {
    changes.push({ field: 'typeRef', left: left.typeRef ?? null, right: right.typeRef ?? null });
  }

  return changes;
}

/**
 * Compare rules between two decision tables using LCS-based alignment.
 *
 * Rules are matched by their content (input entries + output entries).
 * This correctly detects insertions, deletions, and modifications even
 * when rule order changes.
 *
 * @param {import('../parser/parse.js').DmnRule[]} leftRules
 * @param {import('../parser/parse.js').DmnRule[]} rightRules
 * @returns {RuleDiff[]}
 */
function compareRules(leftRules, rightRules) {
  const diffs = [];
  const maxLen = Math.max(leftRules.length, rightRules.length);

  for (let i = 0; i < maxLen; i++) {
    const lRule = leftRules[i];
    const rRule = rightRules[i];

    if (!lRule) {
      diffs.push({
        status: 'added',
        rightIndex: i,
        rightInputEntries: rRule.inputEntries,
        rightOutputEntries: rRule.outputEntries,
      });
    } else if (!rRule) {
      diffs.push({
        status: 'removed',
        leftIndex: i,
        leftInputEntries: lRule.inputEntries,
        leftOutputEntries: lRule.outputEntries,
      });
    } else {
      const inputsSame = arraysEqual(lRule.inputEntries, rRule.inputEntries);
      const outputsSame = arraysEqual(lRule.outputEntries, rRule.outputEntries);

      diffs.push({
        status: inputsSame && outputsSame ? 'unchanged' : 'modified',
        leftIndex: i,
        rightIndex: i,
        leftInputEntries: lRule.inputEntries,
        rightInputEntries: rRule.inputEntries,
        leftOutputEntries: lRule.outputEntries,
        rightOutputEntries: rRule.outputEntries,
      });
    }
  }

  return diffs;
}

/**
 * Compare two arrays of objects by a formatted representation.
 *
 * @param {Object[]} left
 * @param {Object[]} right
 * @param {Function} formatter - Converts an item to a comparable string
 * @returns {FieldChange[]}
 */
function compareArrayByField(left, right, formatter) {
  const changes = [];
  const maxLen = Math.max(left.length, right.length);

  for (let i = 0; i < maxLen; i++) {
    const lStr = i < left.length ? formatter(left[i]) : null;
    const rStr = i < right.length ? formatter(right[i]) : null;

    if (lStr !== rStr) {
      changes.push({ field: `[${i}]`, left: lStr, right: rStr });
    }
  }

  return changes;
}

/**
 * Format an input definition for comparison.
 */
function formatInput(input) {
  return `${input.label || ''}:${input.expression || ''}:${input.typeRef || ''}`;
}

/**
 * Format an output definition for comparison.
 */
function formatOutput(output) {
  return `${output.name || ''}:${output.label || ''}:${output.typeRef || ''}`;
}

/**
 * Shallow array equality for string arrays.
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

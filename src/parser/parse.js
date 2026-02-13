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
 * DMN XML Parser — transforms DMN 1.3 XML into an internal decision model.
 *
 * Uses `dmn-moddle` (with `camunda-dmn-moddle` extensions) to parse the XML
 * into a moddle object tree, then extracts a simplified internal representation
 * used by the DMN engine.
 */

import { DmnModdle } from 'dmn-moddle';
import camundaDescriptor from 'camunda-dmn-moddle/resources/camunda.json';

/**
 * @typedef {Object} DmnInput
 * @property {string} id
 * @property {string} label
 * @property {string} expression - FEEL expression for the input (e.g. "age", "customer.name")
 * @property {string} [typeRef] - DMN type reference (string, integer, boolean, etc.)
 */

/**
 * @typedef {Object} DmnOutput
 * @property {string} id
 * @property {string} name - Output variable name
 * @property {string} [label]
 * @property {string} [typeRef] - DMN type reference
 */

/**
 * @typedef {Object} DmnRule
 * @property {string} id
 * @property {string[]} inputEntries - FEEL unary-test expressions (one per input)
 * @property {string[]} outputEntries - FEEL expressions for output values
 * @property {string} [description] - Rule annotation
 */

/**
 * @typedef {Object} DmnDecisionTable
 * @property {string} type - Always "decisionTable"
 * @property {string} id
 * @property {string} hitPolicy - UNIQUE, ANY, FIRST, RULE ORDER, COLLECT
 * @property {string} [aggregation] - SUM, MIN, MAX, COUNT (only with COLLECT)
 * @property {DmnInput[]} inputs
 * @property {DmnOutput[]} outputs
 * @property {DmnRule[]} rules
 */

/**
 * @typedef {Object} DmnLiteralExpression
 * @property {string} type - Always "literalExpression"
 * @property {string} id
 * @property {string} expression - FEEL expression text
 * @property {string} [typeRef]
 * @property {string} [variable] - Output variable name
 */

/**
 * @typedef {Object} DmnDecision
 * @property {string} id
 * @property {string} name
 * @property {DmnDecisionTable|DmnLiteralExpression} logic
 * @property {string[]} informationRequirements - IDs of required decisions
 */

/**
 * @typedef {Object} DmnModel
 * @property {string} id
 * @property {string} name
 * @property {string} namespace
 * @property {Map<string, DmnDecision>} decisions - Keyed by decision ID
 */

/**
 * Parse DMN XML into an internal model.
 *
 * @param {string} xml - DMN 1.3 XML string
 * @returns {Promise<DmnModel>} Parsed model
 */
export async function parseDmnXml(xml) {
  const moddle = new DmnModdle({ camunda: camundaDescriptor });
  const { rootElement } = await moddle.fromXML(xml);

  const decisions = new Map();

  for (const element of rootElement.drgElement || []) {
    if (element.$type === 'dmn:Decision') {
      const decision = extractDecision(element);
      decisions.set(decision.id, decision);
    }
  }

  return {
    id: rootElement.id,
    name: rootElement.name || '',
    namespace: rootElement.namespace || '',
    decisions,
  };
}

/**
 * Extract a decision from a moddle Decision element.
 *
 * @param {Object} element - moddle Decision element
 * @returns {DmnDecision}
 */
function extractDecision(element) {
  const logic = extractDecisionLogic(element.decisionLogic);

  // Extract information requirements (required decisions)
  const informationRequirements = [];
  for (const req of element.informationRequirement || []) {
    if (req.requiredDecision) {
      // href is like "#decisionId"
      const href = req.requiredDecision.href || '';
      const refId = href.startsWith('#') ? href.slice(1) : href;
      if (refId) {
        informationRequirements.push(refId);
      }
    }
  }

  return {
    id: element.id,
    name: element.name || '',
    logic,
    informationRequirements,
  };
}

/**
 * Extract decision logic (decision table or literal expression).
 *
 * @param {Object} decisionLogic - moddle decision logic element
 * @returns {DmnDecisionTable|DmnLiteralExpression|null}
 */
function extractDecisionLogic(decisionLogic) {
  if (!decisionLogic) {
    return null;
  }

  if (decisionLogic.$type === 'dmn:DecisionTable') {
    return extractDecisionTable(decisionLogic);
  }

  if (decisionLogic.$type === 'dmn:LiteralExpression') {
    return extractLiteralExpression(decisionLogic);
  }

  return null;
}

/**
 * Extract a decision table.
 *
 * @param {Object} dt - moddle DecisionTable element
 * @returns {DmnDecisionTable}
 */
function extractDecisionTable(dt) {
  const inputs = (dt.input || []).map((input) => ({
    id: input.id,
    label: input.label || '',
    expression: input.inputExpression?.text || '',
    typeRef: input.inputExpression?.typeRef || input.typeRef || undefined,
  }));

  const outputs = (dt.output || []).map((output) => ({
    id: output.id,
    name: output.name || '',
    label: output.label || '',
    typeRef: output.typeRef || undefined,
  }));

  const rules = (dt.rule || []).map((rule) => ({
    id: rule.id,
    inputEntries: (rule.inputEntry || []).map((entry) => entry.text || ''),
    outputEntries: (rule.outputEntry || []).map((entry) => entry.text || ''),
    description: rule.description || undefined,
  }));

  // Parse hit policy — default is UNIQUE
  let hitPolicy = (dt.hitPolicy || 'UNIQUE').toUpperCase();

  // Normalize "RULE ORDER" — moddle may use "RULE_ORDER" or "RULE ORDER"
  if (hitPolicy === 'RULE_ORDER') {
    hitPolicy = 'RULE ORDER';
  }

  // Aggregation only applies to COLLECT
  let aggregation = dt.aggregation ? dt.aggregation.toUpperCase() : undefined;
  if (hitPolicy !== 'COLLECT') {
    aggregation = undefined;
  }

  return {
    type: 'decisionTable',
    id: dt.id,
    hitPolicy,
    aggregation,
    inputs,
    outputs,
    rules,
  };
}

/**
 * Extract a literal expression.
 *
 * @param {Object} le - moddle LiteralExpression element
 * @returns {DmnLiteralExpression}
 */
function extractLiteralExpression(le) {
  return {
    type: 'literalExpression',
    id: le.id,
    expression: le.text || '',
    typeRef: le.typeRef || undefined,
  };
}

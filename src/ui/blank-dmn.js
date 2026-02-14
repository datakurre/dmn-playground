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
 * Blank DMN template for creating new DMN projects.
 *
 * Provides a minimal valid DMN 1.3 XML with a single empty decision table
 * that users can populate via the edit mode.
 */

/**
 * Generate a blank DMN XML with a single decision table.
 *
 * Each call produces unique IDs to avoid collisions when creating multiple
 * new projects in the same session.
 *
 * @param {Object} [options]
 * @param {string} [options.definitionsName='New Decision Model'] - Name for the definitions element
 * @param {string} [options.decisionName='Decision'] - Name for the decision
 * @returns {string} Valid DMN 1.3 XML string
 */
export function createBlankDmn(options = {}) {
  const { definitionsName = 'New Decision Model', decisionName = 'Decision' } = options;

  const id = generateId();

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             id="definitions_${id}"
             name="${escapeXml(definitionsName)}"
             namespace="http://camunda.org/schema/1.0/dmn">

  <decision id="decision_${id}" name="${escapeXml(decisionName)}">
    <decisionTable id="dt_${id}" hitPolicy="UNIQUE">
      <input id="input_1_${id}" label="Input">
        <inputExpression id="ie_1_${id}" typeRef="string">
          <text>input</text>
        </inputExpression>
      </input>
      <output id="output_1_${id}" label="Output" name="output" typeRef="string" />
      <rule id="rule_1_${id}">
        <inputEntry id="ie_r1_${id}"><text>-</text></inputEntry>
        <outputEntry id="oe_r1_${id}"><text>"result"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>

  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="diagram_${id}">
      <dmndi:DMNShape id="shape_decision_${id}" dmnElementRef="decision_${id}">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;
}

/**
 * Generate a short unique ID suffix.
 *
 * @returns {string} 8-character alphanumeric ID
 */
function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Escape XML special characters.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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
 * InputForm — dynamically generates form controls from DMN decision inputs.
 */

/**
 * Build a form for the inputs of a given decision.
 *
 * @param {HTMLFormElement} formEl - The <form> element to populate
 * @param {import('../parser/parse.js').DmnDecision} decision - The decision to build inputs for
 * @returns {Function} A function that returns the current input values as an object
 */
export function buildInputForm(formEl, decision) {
  formEl.innerHTML = '';

  if (!decision?.logic) {
    formEl.innerHTML = '<p class="hint">No decision logic found</p>';
    return () => ({});
  }

  const inputs =
    decision.logic.type === 'decisionTable'
      ? decision.logic.inputs
      : extractLiteralExpressionVars(decision.logic.expression);

  if (inputs.length === 0) {
    formEl.innerHTML = '<p class="hint">No inputs defined</p>';
    return () => ({});
  }

  const fields = [];

  for (const input of inputs) {
    const field = createField(input);
    formEl.appendChild(field.element);
    fields.push(field);
  }

  // Return a getter for current values
  return () => {
    const values = {};
    for (const field of fields) {
      values[field.name] = field.getValue();
    }
    return values;
  };
}

/**
 * Create a form field for a single input.
 */
function createField(input) {
  const name = input.expression || input.name || input.label || input.id;
  const label = input.label || name;
  const typeRef = (input.typeRef || 'string').toLowerCase();

  const div = document.createElement('div');
  div.className = 'form-field';

  const labelEl = document.createElement('label');
  labelEl.textContent = `${label} (${typeRef})`;
  labelEl.htmlFor = `input-${name}`;
  div.appendChild(labelEl);

  let inputEl;

  if (typeRef === 'boolean') {
    inputEl = document.createElement('select');
    inputEl.id = `input-${name}`;
    for (const val of ['true', 'false']) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      inputEl.appendChild(opt);
    }
  } else {
    inputEl = document.createElement('input');
    inputEl.id = `input-${name}`;

    if (typeRef === 'integer' || typeRef === 'long') {
      inputEl.type = 'number';
      inputEl.step = '1';
    } else if (typeRef === 'double' || typeRef === 'number') {
      inputEl.type = 'number';
      inputEl.step = 'any';
    } else if (typeRef === 'date') {
      inputEl.type = 'date';
    } else {
      inputEl.type = 'text';
    }

    inputEl.placeholder = name;
  }

  div.appendChild(inputEl);

  return {
    name,
    element: div,
    getValue() {
      const raw = inputEl.value;
      if (raw === '') return undefined;

      switch (typeRef) {
        case 'boolean':
          return raw === 'true';
        case 'integer':
        case 'long':
          return parseInt(raw, 10);
        case 'double':
        case 'number':
          return parseFloat(raw);
        default:
          return raw;
      }
    },
  };
}

/**
 * Extract variable names from a literal expression (best-effort heuristic).
 * Returns them as pseudo-input descriptors.
 */
function extractLiteralExpressionVars(expression) {
  // Match identifiers that aren't FEEL keywords or numbers
  const keywords = new Set([
    'if',
    'then',
    'else',
    'for',
    'return',
    'in',
    'not',
    'and',
    'or',
    'true',
    'false',
    'null',
    'some',
    'every',
    'satisfies',
    'function',
    'instance',
    'of',
  ]);

  const identifiers = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const unique = [...new Set(identifiers)].filter((id) => !keywords.has(id));

  return unique.map((name) => ({
    name,
    label: name,
    expression: name,
    typeRef: 'string',
  }));
}

/**
 * Build override fields for intermediate decisions in a DRG.
 *
 * When the selected decision has required decisions (dependencies), this
 * creates input fields that allow the user to override the intermediate
 * results for what-if analysis.
 *
 * @param {HTMLElement} containerEl - DOM element to populate
 * @param {import('../parser/parse.js').DmnModel} model - The full DMN model
 * @param {string} decisionId - The target decision being evaluated
 * @returns {Function} A function that returns current override values (only non-empty ones)
 */
export function buildOverrideForm(containerEl, model, decisionId) {
  containerEl.innerHTML = '';

  const decision = model.decisions.get(decisionId);
  if (!decision || decision.informationRequirements.length === 0) {
    return () => ({});
  }

  // Collect all transitive dependencies
  const deps = collectDependencies(model, decisionId);

  if (deps.length === 0) {
    return () => ({});
  }

  const heading = document.createElement('h4');
  heading.textContent = 'Override Intermediate Results';
  heading.className = 'override-heading';
  containerEl.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Leave empty to compute normally';
  containerEl.appendChild(hint);

  const fields = [];

  for (const depId of deps) {
    const dep = model.decisions.get(depId);
    if (!dep) continue;

    const div = document.createElement('div');
    div.className = 'form-field override-field';

    const label = document.createElement('label');
    label.textContent = `⚡ ${dep.name || depId}`;
    label.htmlFor = `override-${depId}`;
    div.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `override-${depId}`;
    input.placeholder = 'auto';
    input.className = 'override-input';
    div.appendChild(input);

    containerEl.appendChild(div);
    fields.push({ id: depId, input });
  }

  return () => {
    const overrides = {};
    for (const field of fields) {
      const raw = field.input.value.trim();
      if (raw === '') continue;

      // Auto-coerce the override value
      if (raw === 'true') overrides[field.id] = true;
      else if (raw === 'false') overrides[field.id] = false;
      else if (raw === 'null') overrides[field.id] = null;
      else if (!isNaN(Number(raw)) && raw !== '') overrides[field.id] = Number(raw);
      else if (raw.startsWith('"') && raw.endsWith('"')) overrides[field.id] = raw.slice(1, -1);
      else overrides[field.id] = raw;
    }
    return overrides;
  };
}

/**
 * Collect all transitive decision dependencies (not including the target itself).
 *
 * @param {import('../parser/parse.js').DmnModel} model
 * @param {string} decisionId
 * @returns {string[]} Decision IDs in dependency order
 */
function collectDependencies(model, decisionId) {
  const visited = new Set();
  const order = [];

  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);

    const dec = model.decisions.get(id);
    if (!dec) return;

    for (const reqId of dec.informationRequirements) {
      visit(reqId);
    }

    order.push(id);
  }

  visit(decisionId);
  // Remove the target itself
  return order.filter((id) => id !== decisionId);
}

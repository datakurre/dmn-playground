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
 * FeelScalaProvider — wraps the feel-scala engine compiled via Scala.js.
 *
 * feel-scala is the production FEEL engine used by Operaton/Camunda 7.
 * It provides maximum fidelity for FEEL expression evaluation.
 *
 * The Scala.js bundle is compiled from the feel-scala Scala source using
 * `sbt fastOptJS` and placed at `./feel-scala-bundle.js`. The bundle
 * exports `FeelEngineBuilder` which is used to create a `FeelEngineApi`
 * instance configured for JS interop (using `forJS()`).
 *
 * @see https://github.com/camunda/feel-scala
 */

import { FeelProvider } from './provider.js';

/**
 * Loaded FeelEngineApi instance (built via FeelEngineBuilder.forJS().build()).
 * @type {Object|null}
 */
let feelScalaApi = null;

/**
 * Whether we've attempted to load the feel-scala bundle.
 * @type {boolean}
 */
let loadAttempted = false;

/**
 * Try to load the feel-scala Scala.js bundle and create the engine.
 * Returns true if successfully loaded, false otherwise.
 *
 * @returns {Promise<boolean>}
 */
async function loadFeelScalaBundle() {
  if (loadAttempted) {
    return feelScalaApi !== null;
  }
  loadAttempted = true;

  try {
    const module = await import(/* webpackIgnore: true */ './feel-scala-bundle.js');
    const { FeelEngineBuilder } = module;
    feelScalaApi = FeelEngineBuilder.forJS().build();
    return true;
  } catch {
    // Bundle not available — fall back to feelin
    return false;
  }
}

/**
 * Check if the feel-scala bundle is available without loading it.
 *
 * @returns {boolean}
 */
export function isFeelScalaAvailable() {
  return feelScalaApi !== null;
}

/**
 * Extract the result value from a feel-scala EvaluationResult object.
 *
 * The Scala.js compilation mangles field names, so we locate fields by
 * suffix pattern matching (e.g. `__f_result`, `__f_isSuccess`).
 *
 * @param {Object} evalResult - Raw EvaluationResult from feel-scala API
 * @returns {{ result: *, isSuccess: boolean, failure: string|null }}
 */
function extractResult(evalResult) {
  const entries = Object.entries(evalResult);

  const resultEntry = entries.find(([k]) => k.endsWith('__f_result'));
  const successEntry = entries.find(([k]) => k.endsWith('__f_isSuccess'));
  const failureEntry = entries.find(([k]) => k.endsWith('__f_failure'));

  const isSuccess = successEntry ? successEntry[1] : false;
  const result = resultEntry ? resultEntry[1] : null;

  let failure = null;
  if (!isSuccess && failureEntry) {
    const failObj = failureEntry[1];
    const msgEntry = Object.entries(failObj).find(([k]) => k.endsWith('__f_message'));
    failure = msgEntry ? msgEntry[1] : String(failObj);
  }

  return { result, isSuccess, failure };
}

export class FeelScalaProvider extends FeelProvider {
  constructor() {
    super('feel-scala');
    this._ready = false;
  }

  /**
   * Initialize the provider by loading the Scala.js bundle.
   * Must be called before evaluate() or unaryTest().
   *
   * @returns {Promise<void>}
   * @throws {Error} If the feel-scala bundle is not available
   */
  async initialize() {
    const loaded = await loadFeelScalaBundle();
    if (!loaded) {
      throw new Error(
        'feel-scala Scala.js bundle is not available. ' + 'Use FeelinProvider as a fallback.',
      );
    }
    this._ready = true;
  }

  /**
   * Evaluate a FEEL expression using feel-scala.
   *
   * @param {string} expression - FEEL expression
   * @param {Object} context - Variable bindings
   * @returns {*} The evaluated result value
   * @throws {Error} If the provider is not initialized or evaluation fails
   */
  evaluate(expression, context = {}) {
    this._ensureReady();

    const hasContext = Object.keys(context).length > 0;
    const evalResult = hasContext
      ? feelScalaApi.evalExpressionWithContext(expression, context)
      : feelScalaApi.evaluateExpression(expression);

    const { result, isSuccess, failure } = extractResult(evalResult);

    if (!isSuccess) {
      throw new Error(`feel-scala evaluation failed: ${failure}`);
    }

    return result;
  }

  /**
   * Evaluate a FEEL unary test using feel-scala.
   *
   * @param {string} expression - FEEL unary-test expression
   * @param {*} inputValue - The value to test
   * @param {Object} context - Additional variable bindings
   * @returns {boolean} Whether the input value satisfies the test
   * @throws {Error} If the provider is not initialized
   */
  unaryTest(expression, inputValue, context = {}) {
    // Wildcard: dash or empty means "any value"
    const trimmed = (expression ?? '').trim();
    if (trimmed === '' || trimmed === '-') {
      return true;
    }

    this._ensureReady();

    const hasContext = Object.keys(context).length > 0;
    const evalResult = hasContext
      ? feelScalaApi.evalUnaryTestsWithContext(trimmed, inputValue, context)
      : feelScalaApi.evaluateUnaryTests(trimmed, inputValue);

    const { result, isSuccess } = extractResult(evalResult);

    // A successful unary test returns true/false; a failed one returns null
    return isSuccess && result === true;
  }

  /**
   * @private
   */
  _ensureReady() {
    if (!this._ready) {
      throw new Error('FeelScalaProvider is not initialized. Call initialize() first.');
    }
  }
}

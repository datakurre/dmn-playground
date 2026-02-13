/**
 * FeelScalaProvider — wraps the feel-scala engine compiled via Scala.js.
 *
 * feel-scala is the production FEEL engine used by Operaton/Camunda 7.
 * It provides maximum fidelity for FEEL expression evaluation.
 *
 * This provider requires a Scala.js-compiled bundle of feel-scala to be
 * available. Until the Scala.js transpilation is complete, this provider
 * will throw an error on construction if the bundle is not found.
 *
 * @see https://github.com/camunda/feel-scala
 */

import { FeelProvider } from './provider.js';

/**
 * Dynamically loaded feel-scala engine instance.
 * @type {Object|null}
 */
let feelScalaEngine = null;

/**
 * Whether we've attempted to load the feel-scala bundle.
 * @type {boolean}
 */
let loadAttempted = false;

/**
 * Try to load the feel-scala Scala.js bundle.
 * Returns true if successfully loaded, false otherwise.
 *
 * @returns {Promise<boolean>}
 */
async function loadFeelScalaBundle() {
  if (loadAttempted) {
    return feelScalaEngine !== null;
  }
  loadAttempted = true;

  try {
    // The feel-scala Scala.js bundle is expected to expose a global or module
    // Once the Scala.js transpilation (TODO) is complete, this import path
    // will point to the compiled JS bundle.
    const module = await import(/* webpackIgnore: true */ './feel-scala-bundle.js');
    feelScalaEngine = module.default || module;
    return true;
  } catch {
    // Bundle not available yet — expected until Scala.js transpilation is done
    return false;
  }
}

/**
 * Check if the feel-scala bundle is available without loading it.
 *
 * @returns {boolean}
 */
export function isFeelScalaAvailable() {
  return feelScalaEngine !== null;
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
        'feel-scala Scala.js bundle is not available. ' +
          'The Scala.js transpilation must be completed first. ' +
          'Use FeelinProvider as a fallback.',
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
   * @throws {Error} If the provider is not initialized
   */
  evaluate(expression, context = {}) {
    this._ensureReady();

    // feel-scala API: engine.evalExpression(expression, context)
    // The exact API shape depends on the Scala.js export.
    const result = feelScalaEngine.evalExpression(expression, context);
    return unwrapScalaResult(result);
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

    // feel-scala API: engine.evalUnaryTests(expression, context)
    // The input value is passed as the special variable in the context.
    const testContext = {
      ...context,
      [FeelScalaProvider.INPUT_VARIABLE_KEY]: inputValue,
    };

    const result = feelScalaEngine.evalUnaryTests(trimmed, testContext);
    return unwrapScalaResult(result) === true;
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

/**
 * The context key used by feel-scala for the input value in unary tests.
 * In Operaton, this is the special variable name for the "?" input.
 */
FeelScalaProvider.INPUT_VARIABLE_KEY = '?';

/**
 * Unwrap a Scala.js result value to a plain JS value.
 *
 * feel-scala may return Scala wrapper types (Option, List, etc.)
 * that need to be converted to native JS equivalents.
 *
 * @param {*} result - Raw result from feel-scala
 * @returns {*} Unwrapped JS value
 */
function unwrapScalaResult(result) {
  if (result === null || result === undefined) {
    return null;
  }

  // Scala Option → unwrap Some(x) or None → null
  if (typeof result.isEmpty === 'function') {
    return result.isEmpty() ? null : unwrapScalaResult(result.get());
  }

  // Scala List/Seq → JS array
  if (typeof result.toJSArray === 'function') {
    return result.toJSArray().map(unwrapScalaResult);
  }

  // Scala Map → JS object
  if (typeof result.toJSObject === 'function') {
    return result.toJSObject();
  }

  return result;
}

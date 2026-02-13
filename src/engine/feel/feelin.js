/**
 * FeelinProvider — wraps the `feelin` JS library as a FEEL backend.
 *
 * `feelin` is a lightweight FEEL parser and interpreter written in JS.
 * It supports FEEL expressions and unary tests out of the box.
 *
 * @see https://github.com/nikku/feelin
 */

import { evaluate as feelinEvaluate, unaryTest as feelinUnaryTest } from 'feelin';

import { FeelProvider } from './provider.js';

export class FeelinProvider extends FeelProvider {
  constructor() {
    super('feelin');
  }

  /**
   * Evaluate a FEEL expression using feelin.
   *
   * @param {string} expression - FEEL expression
   * @param {Object} context - Variable bindings
   * @returns {*} The evaluated result value
   */
  evaluate(expression, context = {}) {
    const result = feelinEvaluate(expression, context);
    return result.value;
  }

  /**
   * Evaluate a FEEL unary test using feelin.
   *
   * A dash ("-") or empty/blank string is treated as a wildcard (always matches).
   *
   * @param {string} expression - FEEL unary-test expression
   * @param {*} inputValue - The value to test
   * @param {Object} context - Additional variable bindings
   * @returns {boolean} Whether the input value satisfies the test
   */
  unaryTest(expression, inputValue, context = {}) {
    // Wildcard: dash or empty means "any value"
    const trimmed = (expression ?? '').trim();
    if (trimmed === '' || trimmed === '-') {
      return true;
    }

    // feelin expects the input value as '?' in the context
    const testContext = { ...context, '?': inputValue };
    const result = feelinUnaryTest(trimmed, testContext);
    return result.value === true;
  }
}

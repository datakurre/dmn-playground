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
 * FeelProvider — pluggable interface for FEEL expression evaluation.
 *
 * The DMN engine delegates all FEEL expression evaluation and unary-test
 * matching to a FeelProvider. Two backends are supported:
 *
 * 1. FeelinProvider  — wraps the `feelin` JS library (lightweight, default)
 * 2. FeelScalaProvider — wraps feel-scala compiled via Scala.js (production parity)
 *
 * @interface FeelProvider
 */

/**
 * @typedef {Object} FeelResult
 * @property {*} value - The result of the evaluation
 * @property {Array} [warnings] - Any warnings produced during evaluation
 */

/**
 * Base class for FEEL providers. Subclasses must implement evaluate() and unaryTest().
 */
export class FeelProvider {
  /**
   * @param {string} name - Human-readable provider name
   */
  constructor(name) {
    if (new.target === FeelProvider) {
      throw new Error('FeelProvider is abstract and cannot be instantiated directly');
    }
    this.name = name;
  }

  /**
   * Evaluate a FEEL expression in the given context.
   *
   * @param {string} expression - FEEL expression (e.g. "a + b", "if x > 5 then \"high\" else \"low\"")
   * @param {Object} context - Variable bindings available to the expression
   * @returns {*} The result value
   * @throws {Error} If the expression cannot be evaluated
   */
  evaluate(_expression, _context) {
    throw new Error('evaluate() must be implemented by subclass');
  }

  /**
   * Evaluate a FEEL unary-test expression against an input value.
   *
   * In DMN, input entries in decision table rules are unary tests.
   * Examples: "> 5", "\"A\", \"B\"", "[1..10]", "not(null)"
   *
   * A dash ("-") or empty string means "any value matches" (wildcard).
   *
   * @param {string} expression - FEEL unary-test expression
   * @param {*} inputValue - The value to test against
   * @param {Object} context - Additional variable bindings
   * @returns {boolean} Whether the input value satisfies the unary test
   * @throws {Error} If the expression cannot be evaluated
   */
  unaryTest(_expression, _inputValue, _context) {
    throw new Error('unaryTest() must be implemented by subclass');
  }
}

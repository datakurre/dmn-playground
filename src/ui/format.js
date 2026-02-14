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
 * UI formatting utilities — pure functions for display formatting.
 *
 * These are extracted from Viewer.js so they can be tested without
 * browser DOM dependencies.
 */

/**
 * Format a result value for compact overlay display.
 *
 * Used by the DRD simulation overlays to show a concise preview of
 * each decision's evaluation result. Values longer than 30 characters
 * are truncated with an ellipsis.
 *
 * @param {*} value - The result value to format
 * @returns {string} Formatted string suitable for display in an overlay
 *
 * @example
 * formatOverlayResult(null)           // '∅'
 * formatOverlayResult(42)             // '42'
 * formatOverlayResult({ a: 1 })       // '{"a":1}'
 * formatOverlayResult('x'.repeat(50)) // 'xxxxxxxxxxxxxxxxxxxxxxxxxxx...'
 */
export function formatOverlayResult(value) {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 30 ? json.slice(0, 27) + '...' : json;
  }
  const str = String(value);
  return str.length > 30 ? str.slice(0, 27) + '...' : str;
}

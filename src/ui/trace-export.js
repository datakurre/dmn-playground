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
 * Trace export utilities — serialize evaluation traces to JSON and CSV.
 *
 * Pure functions with no DOM dependencies for easy unit testing.
 */

/**
 * Convert an evaluation trace to a JSON string.
 *
 * @param {import('../engine/evaluate.js').EvaluationTrace[]} trace
 * @param {Object} [options]
 * @param {string} [options.decisionId] - The evaluated decision ID (for metadata)
 * @returns {string} Pretty-printed JSON
 */
export function traceToJson(trace, options = {}) {
  const data = {
    exportedAt: new Date().toISOString(),
    ...(options.decisionId ? { decisionId: options.decisionId } : {}),
    totalSteps: trace.length,
    trace: trace.map((entry) => ({
      step: trace.indexOf(entry) + 1,
      decisionId: entry.decisionId,
      decisionName: entry.decisionName,
      type: entry.type,
      ...(entry.hitPolicy ? { hitPolicy: entry.hitPolicy } : {}),
      ...(entry.aggregation ? { aggregation: entry.aggregation } : {}),
      inputValues: entry.inputValues || {},
      matchedRules: (entry.matchedRules || []).map((rule) => ({
        index: rule.index,
        id: rule.id,
        outputs: rule.outputs,
      })),
      result: entry.result,
      ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    })),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Convert an evaluation trace to CSV format.
 *
 * Each trace entry becomes one row. Complex values (objects/arrays) are
 * JSON-serialized in cells.
 *
 * @param {import('../engine/evaluate.js').EvaluationTrace[]} trace
 * @returns {string} CSV text with header row
 */
export function traceToCSV(trace) {
  const headers = [
    'step',
    'decisionId',
    'decisionName',
    'type',
    'hitPolicy',
    'aggregation',
    'inputValues',
    'matchedRuleCount',
    'matchedRuleIndices',
    'result',
    'durationMs',
    'error',
  ];

  const rows = trace.map((entry, i) => [
    i + 1,
    entry.decisionId,
    entry.decisionName,
    entry.type,
    entry.hitPolicy || '',
    entry.aggregation || '',
    JSON.stringify(entry.inputValues || {}),
    (entry.matchedRules || []).length,
    (entry.matchedRules || []).map((r) => r.index + 1).join(';'),
    JSON.stringify(entry.result),
    entry.durationMs !== undefined ? entry.durationMs : '',
    entry.error || '',
  ]);

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

/**
 * Escape a value for CSV output.
 *
 * @param {*} value
 * @returns {string}
 */
function csvEscape(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Trigger a file download in the browser.
 *
 * @param {string} content - File content
 * @param {string} filename - Suggested filename
 * @param {string} mimeType - MIME type for the blob
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

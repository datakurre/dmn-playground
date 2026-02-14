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
 * Batch evaluation — evaluate a decision against multiple input rows.
 *
 * Supports CSV and JSON input formats.
 */

import { evaluateDecision } from './evaluate.js';

/**
 * @typedef {Object} BatchRow
 * @property {number} index - Row index (0-based)
 * @property {Object} inputData - Input variable bindings for this row
 * @property {*} result - Evaluation result
 * @property {import('./evaluate.js').EvaluationTrace[]} trace - Evaluation trace
 * @property {string} [error] - Error message if evaluation failed
 */

/**
 * Evaluate a decision for each row of input data.
 *
 * @param {import('../parser/parse.js').DmnModel} model - Parsed DMN model
 * @param {string} decisionId - ID of the decision to evaluate
 * @param {Object[]} inputRows - Array of input data objects
 * @param {Object} [options] - Evaluation options (passed to evaluateDecision)
 * @returns {BatchRow[]} Results for each input row
 */
export function evaluateBatch(model, decisionId, inputRows, options = {}) {
  return inputRows.map((inputData, index) => {
    try {
      const { result, trace, error } = evaluateDecision(model, decisionId, inputData, options);
      return { index, inputData, result, trace, error };
    } catch (err) {
      return { index, inputData, result: null, trace: [], error: err.message };
    }
  });
}

/**
 * Parse CSV text into an array of input data objects.
 *
 * The first line is treated as headers (variable names).
 * Values are auto-coerced: numbers become numbers, "true"/"false" become
 * booleans, empty strings become undefined.
 *
 * @param {string} csvText - CSV text with header row
 * @returns {Object[]} Array of row objects keyed by header names
 */
export function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row = {};

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const raw = (values[i] ?? '').trim();
      row[header] = coerceCSVValue(raw);
    }

    return row;
  });
}

/**
 * @typedef {Object} DecisionAggregate
 * @property {string} decisionId - Decision ID
 * @property {string} decisionName - Decision display name
 * @property {string} type - "decisionTable", "literalExpression", or "override"
 * @property {number} evaluatedCount - Number of batch rows where this decision was evaluated
 * @property {number} errorCount - Number of batch rows where this decision had errors
 * @property {Map<number, number>} ruleMatchFrequency - Map of rule index → match count (decision tables only)
 * @property {number} totalRules - Total number of rules in the decision table (0 for non-tables)
 * @property {number[]} unmatchedRules - Rule indices that never matched across all batch rows
 */

/**
 * @typedef {Object} BatchAggregation
 * @property {number} totalRows - Total number of batch input rows
 * @property {number} successRows - Number of rows that evaluated without error
 * @property {number} failedRows - Number of rows that had errors
 * @property {DecisionAggregate[]} decisions - Per-decision aggregation data
 */

/**
 * Aggregate batch evaluation results into a DRD summary.
 *
 * Produces per-decision statistics across all batch rows: evaluation counts,
 * error counts, and rule match frequency heatmaps for decision tables.
 *
 * @param {BatchRow[]} batchResults - Results from evaluateBatch()
 * @returns {BatchAggregation}
 */
export function aggregateBatchResults(batchResults) {
  if (!batchResults || batchResults.length === 0) {
    return { totalRows: 0, successRows: 0, failedRows: 0, decisions: [] };
  }

  const totalRows = batchResults.length;
  const successRows = batchResults.filter((r) => !r.error).length;
  const failedRows = totalRows - successRows;

  // Accumulate per-decision stats across all batch rows
  // Key: decisionId, Value: accumulated stats
  const decisionMap = new Map();

  for (const row of batchResults) {
    if (!row.trace) continue;

    for (const entry of row.trace) {
      let agg = decisionMap.get(entry.decisionId);
      if (!agg) {
        agg = {
          decisionId: entry.decisionId,
          decisionName: entry.decisionName,
          type: entry.type,
          evaluatedCount: 0,
          errorCount: 0,
          ruleMatchFrequency: new Map(),
          totalRules: 0,
        };
        decisionMap.set(entry.decisionId, agg);
      }

      agg.evaluatedCount++;

      if (entry.error) {
        agg.errorCount++;
      }

      // Track rule match frequency for decision tables
      if (entry.matchedRules && entry.matchedRules.length > 0) {
        for (const rule of entry.matchedRules) {
          const idx = rule.index;
          agg.ruleMatchFrequency.set(idx, (agg.ruleMatchFrequency.get(idx) || 0) + 1);
        }
      }
    }
  }

  // Determine total rules per decision table from the first trace that has them,
  // and compute unmatched rules
  for (const row of batchResults) {
    if (!row.trace) continue;
    for (const entry of row.trace) {
      const agg = decisionMap.get(entry.decisionId);
      if (!agg || agg.totalRules > 0) continue;

      // For decision tables, the hitPolicy presence indicates a table
      if (entry.type === 'decisionTable' && entry.hitPolicy) {
        // Count total rules from the trace — we can infer from maximal rule index
        // plus any info we have. Use matchedRules across all rows.
        // We'll set totalRules after the loop below.
      }
    }
  }

  // Second pass: determine totalRules by scanning all rule indices across all rows
  for (const row of batchResults) {
    if (!row.trace) continue;
    for (const entry of row.trace) {
      const agg = decisionMap.get(entry.decisionId);
      if (!agg) continue;
      if (entry.matchedRules) {
        for (const rule of entry.matchedRules) {
          if (rule.index + 1 > agg.totalRules) {
            agg.totalRules = rule.index + 1;
          }
        }
      }
    }
  }

  // Build final decisions array with unmatchedRules
  const decisions = [];
  for (const agg of decisionMap.values()) {
    const unmatchedRules = [];
    if (agg.type === 'decisionTable' && agg.totalRules > 0) {
      for (let i = 0; i < agg.totalRules; i++) {
        if (!agg.ruleMatchFrequency.has(i)) {
          unmatchedRules.push(i);
        }
      }
    }

    decisions.push({
      decisionId: agg.decisionId,
      decisionName: agg.decisionName,
      type: agg.type,
      evaluatedCount: agg.evaluatedCount,
      errorCount: agg.errorCount,
      ruleMatchFrequency: agg.ruleMatchFrequency,
      totalRules: agg.totalRules,
      unmatchedRules,
    });
  }

  return { totalRows, successRows, failedRows, decisions };
}

/**
 * Parse a single CSV line, respecting quoted fields.
 *
 * @param {string} line - A single CSV line
 * @returns {string[]} Parsed field values
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Coerce a raw CSV string value to its appropriate JS type.
 *
 * @param {string} raw - Raw string value from CSV
 * @returns {*} Coerced value
 */
function coerceCSVValue(raw) {
  if (raw === '') return undefined;
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  if (raw.toLowerCase() === 'null') return null;

  const num = Number(raw);
  if (raw !== '' && !isNaN(num) && isFinite(num)) return num;

  return raw;
}

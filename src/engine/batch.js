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

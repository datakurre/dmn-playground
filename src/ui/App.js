/**
 * App.js — Main application entry point for the DMN Simulator UI.
 *
 * Wires up the viewer, input form, and evaluation engine.
 */

import { parseDmnXml } from '../parser/parse.js';
import { evaluateDecision } from '../engine/evaluate.js';
import { evaluateBatch, parseCSV } from '../engine/batch.js';
import { createViewer } from './Viewer.js';
import { buildInputForm, buildOverrideForm } from './InputForm.js';
import { encodeState, decodeState } from './url-state.js';
import { SAMPLE_DMN } from './sample-dmn.js';

// ── State ───────────────────────────────────────────────────────────

let currentXml = null;
let currentModel = null;
let viewer = null;
let getInputValues = () => ({});
let getOverrideValues = () => ({});

// ── DOM References ──────────────────────────────────────────────────

const viewerPanel = document.getElementById('dmn-viewer');
const dropZone = document.getElementById('drop-zone');
const btnLoad = document.getElementById('btn-load');
const btnSample = document.getElementById('btn-sample');
const btnEvaluate = document.getElementById('btn-evaluate');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnTheme = document.getElementById('btn-theme');
const btnShare = document.getElementById('btn-share');
const btnBatch = document.getElementById('btn-batch');
const decisionSelect = document.getElementById('decision-select');
const inputForm = document.getElementById('input-form');
const overrideForm = document.getElementById('override-form');
const resultOutput = document.getElementById('result-output');
const traceOutput = document.getElementById('trace-output');
const fileInput = document.getElementById('file-input');
const importInput = document.getElementById('import-input');
const batchInput = document.getElementById('batch-input');
const batchModal = document.getElementById('batch-modal');
const batchSummary = document.getElementById('batch-summary');
const batchResults = document.getElementById('batch-results');
const btnBatchClose = document.getElementById('btn-batch-close');
const btnBatchDownload = document.getElementById('btn-batch-download');

// ── Initialize Viewer ───────────────────────────────────────────────

viewer = createViewer(viewerPanel);

// ── Theme ───────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('dmn-sim-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    btnTheme.textContent = '☀️ Light';
  }
}

initTheme();

btnTheme.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    btnTheme.textContent = '🌙 Dark';
    localStorage.setItem('dmn-sim-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    btnTheme.textContent = '☀️ Light';
    localStorage.setItem('dmn-sim-theme', 'dark');
  }
});

// ── Event Handlers ──────────────────────────────────────────────────

btnLoad.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const xml = await file.text();
    await loadDmn(xml);
  }
  fileInput.value = '';
});

btnSample.addEventListener('click', () => loadDmn(SAMPLE_DMN));

btnEvaluate.addEventListener('click', () => runEvaluation());

btnExport.addEventListener('click', () => exportTestData());

btnImport.addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    try {
      const json = await file.text();
      await importTestData(json);
    } catch (err) {
      showError(`Failed to import test data: ${err.message}`);
    }
  }
  importInput.value = '';
});

// ── Share URL ─────────────────────────────────────────────────────

btnShare.addEventListener('click', async () => {
  const decisionId = decisionSelect.value;
  if (!decisionId || !currentXml) {
    showError('Load a DMN file and select a decision first');
    return;
  }

  try {
    const inputData = getInputValues();
    const hash = await encodeState({ dmnXml: currentXml, decisionId, inputData });
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;

    await navigator.clipboard.writeText(url);
    showToast('Shareable URL copied to clipboard!');
  } catch (err) {
    showError(`Failed to create share URL: ${err.message}`);
  }
});

// ── Batch Evaluation ────────────────────────────────────────────

btnBatch.addEventListener('click', () => batchInput.click());

batchInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    try {
      const text = await file.text();
      let rows;
      if (file.name.endsWith('.csv')) {
        rows = parseCSV(text);
      } else {
        rows = JSON.parse(text);
        if (!Array.isArray(rows)) {
          throw new Error('JSON file must contain an array of input objects');
        }
      }
      runBatchEvaluation(rows);
    } catch (err) {
      showError(`Failed to process batch file: ${err.message}`);
    }
  }
  batchInput.value = '';
});

btnBatchClose.addEventListener('click', () => {
  batchModal.classList.add('hidden');
});

btnBatchDownload.addEventListener('click', () => downloadBatchResults());

// Close modal on background click
batchModal.addEventListener('click', (e) => {
  if (e.target === batchModal) {
    batchModal.classList.add('hidden');
  }
});

decisionSelect.addEventListener('change', () => {
  const decisionId = decisionSelect.value;
  if (decisionId && currentModel) {
    const decision = currentModel.decisions.get(decisionId);
    getInputValues = buildInputForm(inputForm, decision);
    getOverrideValues = buildOverrideForm(overrideForm, currentModel, decisionId);
    viewer.clearHighlights();
    viewer.clearDecisionHighlights();
    resultOutput.textContent = 'No results yet';
    resultOutput.className = 'result-empty';
    traceOutput.textContent = '';
  }
});

// ── Drag & Drop ─────────────────────────────────────────────────────

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const file = e.dataTransfer.files[0];
  if (file) {
    const xml = await file.text();
    await loadDmn(xml);
  }
});

// Enter key in form triggers evaluation
inputForm.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runEvaluation();
  }
});

// ── Core Logic ──────────────────────────────────────────────────────

async function loadDmn(xml) {
  try {
    currentXml = xml;
    currentModel = await parseDmnXml(xml);

    // Load into viewer
    await viewer.load(xml);
    dropZone.classList.add('hidden');

    // Populate decision selector
    decisionSelect.innerHTML = '<option value="">— Select decision —</option>';
    for (const [id, decision] of currentModel.decisions) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = decision.name || id;
      decisionSelect.appendChild(opt);
    }

    decisionSelect.disabled = false;
    btnEvaluate.disabled = false;
    btnExport.disabled = false;
    btnShare.disabled = false;
    btnBatch.disabled = false;

    // Auto-select if only one decision
    if (currentModel.decisions.size === 1) {
      const [firstId, firstDecision] = currentModel.decisions.entries().next().value;
      decisionSelect.value = firstId;
      getInputValues = buildInputForm(inputForm, firstDecision);
      getOverrideValues = buildOverrideForm(overrideForm, currentModel, firstId);
    }

    // Reset results
    resultOutput.textContent = 'No results yet';
    resultOutput.className = 'result-empty';
    traceOutput.textContent = '';
  } catch (err) {
    showError(`Failed to load DMN: ${formatError(err)}`);
  }
}

function runEvaluation() {
  const decisionId = decisionSelect.value;
  if (!decisionId || !currentModel) {
    showError('Please select a decision first');
    return;
  }

  const inputData = getInputValues();
  const overrides = getOverrideValues();

  try {
    const options = {};
    if (Object.keys(overrides).length > 0) {
      options.overrides = overrides;
    }

    const { result, trace, error } = evaluateDecision(currentModel, decisionId, inputData, options);

    if (error) {
      showError(formatEngineError(error));
    } else {
      showResult(result);
    }

    showTrace(trace);

    // Highlight matched rules in the decision table viewer
    if (trace && trace.length > 0) {
      const lastTrace = trace[trace.length - 1];
      if (lastTrace.type === 'decisionTable' && lastTrace.matchedRules.length > 0) {
        viewer.highlightRules(lastTrace.decisionId, lastTrace.matchedRules);
      } else {
        viewer.clearHighlights();
      }

      // For multi-decision DRG, show evaluation flow in DRD
      if (trace.length > 1) {
        viewer.highlightDecisions(trace);
      }
    }
  } catch (err) {
    showError(`Evaluation error: ${formatError(err)}`);
  }
}

// ── Import/Export Test Data ─────────────────────────────────────────

function exportTestData() {
  const decisionId = decisionSelect.value;
  if (!decisionId || !currentXml) {
    showError('Load a DMN file and select a decision first');
    return;
  }

  const inputData = getInputValues();
  const data = {
    version: 1,
    dmnXml: currentXml,
    decisionId,
    inputData,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dmn-test-${decisionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importTestData(json) {
  const data = JSON.parse(json);

  if (!data.dmnXml || !data.decisionId) {
    throw new Error('Invalid test data: missing dmnXml or decisionId');
  }

  // Load the DMN model
  await loadDmn(data.dmnXml);

  // Select the decision
  decisionSelect.value = data.decisionId;
  const decision = currentModel.decisions.get(data.decisionId);
  if (decision) {
    getInputValues = buildInputForm(inputForm, decision);

    // Populate input fields from the imported data
    if (data.inputData) {
      for (const [key, value] of Object.entries(data.inputData)) {
        const inputEl = document.getElementById(`input-${key}`);
        if (inputEl && value !== undefined) {
          inputEl.value = String(value);
        }
      }
    }
  }
}

// ── Batch Evaluation ────────────────────────────────────────────────

let lastBatchResults = null;

function runBatchEvaluation(rows) {
  const decisionId = decisionSelect.value;
  if (!decisionId || !currentModel) {
    showError('Please select a decision first');
    return;
  }

  const results = evaluateBatch(currentModel, decisionId, rows);
  lastBatchResults = results;

  // Show results in modal
  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.filter((r) => r.error).length;
  batchSummary.textContent = `${results.length} rows evaluated: ${successCount} succeeded, ${errorCount} failed`;

  // Build results table
  const inputKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

  let html = '<table><thead><tr>';
  html += '<th>#</th>';
  for (const key of inputKeys) {
    html += `<th>${escapeHtml(key)}</th>`;
  }
  html += '<th>Result</th><th>Error</th>';
  html += '</tr></thead><tbody>';

  for (const row of results) {
    const rowClass = row.error ? ' class="batch-error"' : '';
    html += `<tr${rowClass}>`;
    html += `<td>${row.index + 1}</td>`;
    for (const key of inputKeys) {
      html += `<td>${escapeHtml(String(row.inputData[key] ?? ''))}</td>`;
    }
    html += `<td>${escapeHtml(formatBatchResult(row.result))}</td>`;
    html += `<td>${escapeHtml(row.error || '')}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  batchResults.innerHTML = html;
  batchModal.classList.remove('hidden');
}

function downloadBatchResults() {
  if (!lastBatchResults) return;

  const data = lastBatchResults.map((r) => ({
    index: r.index,
    inputData: r.inputData,
    result: r.result,
    error: r.error || null,
  }));

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `batch-results-${decisionSelect.value}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatBatchResult(result) {
  if (result === null || result === undefined) return '—';
  if (typeof result === 'object') return JSON.stringify(result);
  return String(result);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── URL State Loading ───────────────────────────────────────────────

async function loadFromUrlHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  try {
    const state = await decodeState(hash);
    await loadDmn(state.dmnXml);

    if (state.decisionId) {
      decisionSelect.value = state.decisionId;
      const decision = currentModel.decisions.get(state.decisionId);
      if (decision) {
        getInputValues = buildInputForm(inputForm, decision);
        getOverrideValues = buildOverrideForm(overrideForm, currentModel, state.decisionId);

        // Populate input fields
        if (state.inputData) {
          for (const [key, value] of Object.entries(state.inputData)) {
            const inputEl = document.getElementById(`input-${key}`);
            if (inputEl && value !== undefined) {
              inputEl.value = String(value);
            }
          }
        }
      }
    }

    // Clear the hash to avoid re-loading on refresh
    history.replaceState(null, '', window.location.pathname);
  } catch (err) {
    console.warn('Failed to load state from URL:', err);
  }
}

// Load state from URL hash on startup
loadFromUrlHash();

// ── PWA Service Worker Registration ─────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

// ── Display Helpers ─────────────────────────────────────────────────

function showResult(result) {
  resultOutput.className = '';
  resultOutput.textContent = JSON.stringify(result, null, 2);
}

function showError(message) {
  resultOutput.className = 'result-error';
  resultOutput.textContent = message;
}

/**
 * Show a temporary toast notification.
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

/**
 * Format engine errors into user-friendly messages.
 */
function formatEngineError(error) {
  if (error.includes('UNIQUE hit policy violated')) {
    const match = error.match(/(\d+) rules matched/);
    const count = match ? match[1] : 'multiple';
    return `Hit policy violation: UNIQUE requires at most 1 matching rule, but ${count} rules matched. Check your input data or decision table conditions.`;
  }
  if (error.includes('ANY hit policy violated')) {
    return 'Hit policy violation: ANY requires all matching rules to produce the same output, but the matched rules have different outputs.';
  }
  if (error.includes('Decision not found')) {
    const match = error.match(/Decision not found: (.+)/);
    const id = match ? match[1] : 'unknown';
    return `Decision "${id}" was not found in the model. It may be referenced as a dependency but missing from the DMN file.`;
  }
  if (error.includes('no decision logic')) {
    return 'The selected decision has no decision logic (no decision table or literal expression defined).';
  }
  return error;
}

/**
 * Format JS errors into readable messages.
 */
function formatError(err) {
  if (err && err.message) {
    // Strip overly technical stack traces
    return err.message.split('\n')[0];
  }
  return String(err);
}

function showTrace(trace) {
  if (!trace || trace.length === 0) {
    traceOutput.textContent = 'No trace available';
    return;
  }

  const lines = [];
  for (const entry of trace) {
    lines.push(`━━ ${entry.decisionName} (${entry.decisionId}) ━━`);
    lines.push(`  Type: ${entry.type}`);
    if (entry.hitPolicy) {
      lines.push(
        `  Hit Policy: ${entry.hitPolicy}${entry.aggregation ? ' + ' + entry.aggregation : ''}`,
      );
    }
    lines.push(`  Inputs: ${JSON.stringify(entry.inputValues)}`);
    lines.push(`  Matched Rules: ${entry.matchedRules.length}`);
    for (const rule of entry.matchedRules) {
      lines.push(`    ✓ Rule ${rule.index + 1} (${rule.id}): ${JSON.stringify(rule.outputs)}`);
    }
    lines.push(`  Result: ${JSON.stringify(entry.result)}`);
    if (entry.error) {
      lines.push(`  ⚠ Error: ${entry.error}`);
    }
    lines.push('');
  }

  traceOutput.textContent = lines.join('\n');
}

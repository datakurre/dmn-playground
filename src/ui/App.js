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
 * App.js — Main application entry point for the DMN Playground UI.
 *
 * Wires up the viewer, input form, and evaluation engine.
 */

import { parseDmnXml } from '../parser/parse.js';
import { evaluateDecision } from '../engine/evaluate.js';
import { evaluateBatch, parseCSV } from '../engine/batch.js';
import { compareModels } from '../engine/compare.js';
import {
  getAvailableProviders,
  getProvider,
  setCurrentProvider,
  getCurrentProviderName,
} from '../engine/feel/registry.js';
import { createViewer } from './Viewer.js';
import { buildInputForm, buildOverrideForm } from './InputForm.js';
import { encodeState, decodeState } from './url-state.js';
import { SAMPLE_DMN } from './sample-dmn.js';
import { createBlankDmn } from './blank-dmn.js';
import { traceToJson, traceToCSV, downloadFile } from './trace-export.js';

// ── Accessibility: Focus Trapping ───────────────────────────────────

/**
 * Trap keyboard focus within a modal dialog element.
 * Returns a cleanup function to remove the event listener.
 *
 * @param {HTMLElement} modal - The modal container element
 * @returns {Function} cleanup - Removes the focus trap
 */
function trapFocus(modal) {
  function handler(e) {
    if (e.key === 'Tab') {
      const focusable = modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
  modal.addEventListener('keydown', handler);
  return () => modal.removeEventListener('keydown', handler);
}

/** Track active focus traps for cleanup */
let activeModalCleanup = null;

/**
 * Open a modal with focus management.
 *
 * @param {HTMLElement} modal - The modal element
 * @param {HTMLElement} [focusTarget] - Element to focus when modal opens
 */
function openModal(modal, focusTarget) {
  modal.classList.remove('hidden');
  activeModalCleanup = trapFocus(modal);
  // Focus the close button or specified target after a tick
  setTimeout(() => {
    const target = focusTarget || modal.querySelector('.modal-close');
    if (target) target.focus();
  }, 50);
}

/**
 * Close a modal and restore focus.
 *
 * @param {HTMLElement} modal - The modal element
 * @param {HTMLElement} [returnFocus] - Element to return focus to
 */
function closeModal(modal, returnFocus) {
  modal.classList.add('hidden');
  if (activeModalCleanup) {
    activeModalCleanup();
    activeModalCleanup = null;
  }
  if (returnFocus) returnFocus.focus();
}

// ── State ───────────────────────────────────────────────────────────

let currentXml = null;
let currentModel = null;
let viewer = null;
let getInputValues = () => ({});
let getOverrideValues = () => ({});
let lastTrace = null;
let drdOverlaysVisible = true;
let dataFlowVisible = false;
let animationController = null;

// ── DOM References ──────────────────────────────────────────────────

const viewerPanel = document.getElementById('dmn-viewer');
const dropZone = document.getElementById('drop-zone');
const btnNew = document.getElementById('btn-new');
const btnLoad = document.getElementById('btn-load');
const btnSample = document.getElementById('btn-sample');
const btnEvaluate = document.getElementById('btn-evaluate');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnTheme = document.getElementById('btn-theme');
const btnShare = document.getElementById('btn-share');
const btnBatch = document.getElementById('btn-batch');
const btnEditToggle = document.getElementById('btn-edit-toggle');
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
const batchEditorPanel = document.getElementById('batch-editor-panel');
const batchEditor = document.getElementById('batch-editor');
const btnBatchRun = document.getElementById('btn-batch-run');
const btnBatchClear = document.getElementById('btn-batch-clear');
const feelProviderSelect = document.getElementById('feel-provider-select');
const btnCompare = document.getElementById('btn-compare');
const compareInput = document.getElementById('compare-input');
const compareModal = document.getElementById('compare-modal');
const compareSummary = document.getElementById('compare-summary');
const compareResults = document.getElementById('compare-results');
const btnCompareClose = document.getElementById('btn-compare-close');
const btnViewDrd = document.getElementById('btn-view-drd');
const btnToggleOverlays = document.getElementById('btn-toggle-overlays');
const btnResetDrd = document.getElementById('btn-reset-drd');
const btnToggleDataflow = document.getElementById('btn-toggle-dataflow');
const drdControls = document.getElementById('drd-controls');
const btnTraceJson = document.getElementById('btn-trace-json');
const btnTraceCsv = document.getElementById('btn-trace-csv');
const traceActions = document.getElementById('trace-actions');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const btnZoomEvaluated = document.getElementById('btn-zoom-evaluated');
const drdZoomControls = document.getElementById('drd-zoom-controls');

// Animation controls
const btnAnimPlay = document.getElementById('btn-anim-play');
const btnAnimPause = document.getElementById('btn-anim-pause');
const btnAnimStep = document.getElementById('btn-anim-step');
const btnAnimFinish = document.getElementById('btn-anim-finish');
const animSpeedSelect = document.getElementById('anim-speed-select');
const animSpeedLabel = document.getElementById('anim-speed-label');
const animStepIndicator = document.getElementById('anim-step-indicator');

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

// ── FEEL Provider Selection ──────────────────────────────────────────

function initFeelProviderSelect() {
  const providers = getAvailableProviders();
  feelProviderSelect.innerHTML = '';
  for (const p of providers) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.label;
    opt.title = p.description;
    if (!p.available && p.name !== 'feelin') {
      opt.textContent += ' (loading…)';
    }
    feelProviderSelect.appendChild(opt);
  }
  feelProviderSelect.value = getCurrentProviderName();

  // Restore saved preference
  const saved = localStorage.getItem('dmn-sim-feel-provider');
  if (saved) {
    setCurrentProvider(saved);
    feelProviderSelect.value = saved;
  }
}

initFeelProviderSelect();

feelProviderSelect.addEventListener('change', async () => {
  const name = feelProviderSelect.value;
  try {
    // Pre-initialize the provider to verify it works
    const provider = await getCurrentProviderForEval(name);
    if (provider) {
      setCurrentProvider(name);
      localStorage.setItem('dmn-sim-feel-provider', name);
      showToast(`Switched to ${name}`);
      // Update option text (remove "loading…" if present)
      const opt = feelProviderSelect.querySelector(`option[value="${name}"]`);
      const info = getAvailableProviders().find((p) => p.name === name);
      if (opt && info) {
        opt.textContent = info.label;
      }
    }
  } catch {
    showError(`Failed to load ${name}. Falling back to feelin.`);
    setCurrentProvider('feelin');
    feelProviderSelect.value = 'feelin';
    localStorage.setItem('dmn-sim-feel-provider', 'feelin');
  }
});

/**
 * Get the FEEL provider instance for evaluation.
 * Optionally specify a name to try; otherwise uses the current selection.
 */
async function getCurrentProviderForEval(name) {
  return getProvider(name || getCurrentProviderName());
}

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

btnNew.addEventListener('click', async () => {
  const xml = createBlankDmn();
  await loadDmn(xml);
  // Automatically enter edit mode for new projects
  await viewer.setEditMode(true);
  btnEditToggle.textContent = '👁 View';
  btnEditToggle.title = 'Switch to view mode';
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
  closeModal(batchModal, btnBatch);
});

btnBatchDownload.addEventListener('click', () => downloadBatchResults());

// Close modal on background click
batchModal.addEventListener('click', (e) => {
  if (e.target === batchModal) {
    closeModal(batchModal, btnBatch);
  }
});

// ── Edit Mode Toggle ────────────────────────────────────────────

btnEditToggle.addEventListener('click', async () => {
  const newMode = !viewer.isEditMode();
  await viewer.setEditMode(newMode);

  if (newMode) {
    btnEditToggle.textContent = '👁 View';
    btnEditToggle.title = 'Switch to view mode';
  } else {
    btnEditToggle.textContent = '✏️ Edit';
    btnEditToggle.title = 'Switch to edit mode';
    // After leaving edit mode, re-parse the (possibly edited) XML
    const xml = await viewer.saveXml();
    if (xml && xml !== currentXml) {
      currentXml = xml;
      currentModel = await parseDmnXml(xml);
      // Re-populate the decision selector
      const selectedId = decisionSelect.value;
      decisionSelect.innerHTML = '<option value="">— Select decision —</option>';
      for (const [id, decision] of currentModel.decisions) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = decision.name || id;
        decisionSelect.appendChild(opt);
      }
      // Restore selection if still valid
      if (currentModel.decisions.has(selectedId)) {
        decisionSelect.value = selectedId;
        const decision = currentModel.decisions.get(selectedId);
        getInputValues = buildInputForm(inputForm, decision);
        getOverrideValues = buildOverrideForm(overrideForm, currentModel, selectedId);
      }
    }
  }
});

// ── Batch Editor (inline) ───────────────────────────────────────

// ── DRD Controls ────────────────────────────────────────────────

/**
 * Handle click on a decision overlay in the DRD view.
 * Navigates to the decision table / literal expression view and highlights matched rules.
 */
async function handleDrdDecisionClick(decisionId, traceEntry) {
  const success = await viewer.navigateToDecision(decisionId);
  if (success && traceEntry.type === 'decisionTable' && traceEntry.matchedRules.length > 0) {
    // Wait for view transition
    await new Promise((resolve) => setTimeout(resolve, 100));
    viewer.highlightRules(decisionId, traceEntry.matchedRules);
  }

  // Scroll the trace table to the corresponding entry and highlight it
  scrollTraceToDecision(decisionId);
}

btnViewDrd.addEventListener('click', async () => {
  if (!lastTrace || lastTrace.length === 0) return;
  await viewer.highlightDecisions(lastTrace, {
    onDecisionClick: handleDrdDecisionClick,
  });
  drdOverlaysVisible = true;
  btnToggleOverlays.textContent = '👁 Hide Overlays';
});

btnToggleOverlays.addEventListener('click', async () => {
  if (!lastTrace) return;
  drdOverlaysVisible = !drdOverlaysVisible;
  if (drdOverlaysVisible) {
    await viewer.highlightDecisions(lastTrace, {
      onDecisionClick: handleDrdDecisionClick,
    });
    btnToggleOverlays.textContent = '👁 Hide Overlays';
  } else {
    viewer.clearDecisionHighlights();
    btnToggleOverlays.textContent = '👁 Show Overlays';
  }
});

btnResetDrd.addEventListener('click', () => {
  stopAnimation();
  viewer.clearDecisionHighlights();
  viewer.clearHighlights();
  lastTrace = null;
  drdOverlaysVisible = true;
  drdControls.classList.add('hidden');
  btnToggleOverlays.textContent = '👁 Hide Overlays';
  btnZoomEvaluated.classList.add('hidden');
  dataFlowVisible = false;
  btnToggleDataflow.textContent = '🔗 Data Flow';
  btnToggleDataflow.classList.add('hidden');
});

btnToggleDataflow.addEventListener('click', () => {
  if (!lastTrace || !currentModel) return;
  dataFlowVisible = !dataFlowVisible;
  if (dataFlowVisible) {
    viewer.showDataFlow(lastTrace, currentModel);
    btnToggleDataflow.textContent = '🔗 Hide Flow';
  } else {
    viewer.clearDataFlow();
    btnToggleDataflow.textContent = '🔗 Data Flow';
  }
});

// ── Animation Controls ──────────────────────────────────────────

/**
 * Stop any running animation and hide animation controls.
 */
function stopAnimation() {
  if (animationController) {
    animationController.stop();
    animationController = null;
  }
  hideAnimationControls();
}

/**
 * Show animation controls for multi-decision evaluation.
 */
function showAnimationControls() {
  btnAnimPlay.classList.remove('hidden');
  animSpeedLabel.classList.remove('hidden');
}

/**
 * Hide all animation controls and reset state.
 */
function hideAnimationControls() {
  btnAnimPlay.classList.add('hidden');
  btnAnimPause.classList.add('hidden');
  btnAnimStep.classList.add('hidden');
  btnAnimFinish.classList.add('hidden');
  animSpeedLabel.classList.add('hidden');
  animStepIndicator.classList.add('hidden');
  animStepIndicator.textContent = '';
}

/**
 * Update the step indicator text.
 */
function updateStepIndicator(step, total) {
  animStepIndicator.textContent = `${step + 1}/${total}`;
  animStepIndicator.classList.remove('hidden');
}

/**
 * Switch to "playing" button state.
 */
function setAnimPlaying() {
  btnAnimPlay.classList.add('hidden');
  btnAnimPause.classList.remove('hidden');
  btnAnimStep.classList.remove('hidden');
  btnAnimFinish.classList.remove('hidden');
}

/**
 * Switch to "paused" button state.
 */
function setAnimPaused() {
  btnAnimPlay.classList.remove('hidden');
  btnAnimPause.classList.add('hidden');
  btnAnimStep.classList.remove('hidden');
  btnAnimFinish.classList.remove('hidden');
}

/**
 * Switch to "complete" button state.
 */
function setAnimComplete() {
  btnAnimPlay.classList.add('hidden');
  btnAnimPause.classList.add('hidden');
  btnAnimStep.classList.add('hidden');
  btnAnimFinish.classList.add('hidden');
}

btnAnimPlay.addEventListener('click', () => {
  if (!lastTrace || lastTrace.length <= 1) return;

  if (animationController && !animationController.isPlaying()) {
    // Resume existing animation
    animationController.play();
    setAnimPlaying();
    return;
  }

  // Start new animation
  stopAnimation();
  viewer.clearDecisionHighlights();

  animationController = viewer.animateDecisions(lastTrace, {
    onDecisionClick: handleDrdDecisionClick,
    speed: Number(animSpeedSelect.value),
    onStep(step) {
      updateStepIndicator(step, lastTrace.length);
      // Scroll trace table to current step
      const entry = lastTrace[step];
      if (entry) {
        scrollTraceToDecision(entry.decisionId);
      }
    },
    onComplete() {
      setAnimComplete();
    },
  });

  if (animationController) {
    animationController.play();
    setAnimPlaying();
  }
});

btnAnimPause.addEventListener('click', () => {
  if (animationController) {
    animationController.pause();
    setAnimPaused();
  }
});

btnAnimStep.addEventListener('click', () => {
  if (animationController) {
    animationController.stepForward();
    setAnimPaused();
  }
});

btnAnimFinish.addEventListener('click', () => {
  if (animationController) {
    animationController.finish();
    setAnimComplete();
  }
});

animSpeedSelect.addEventListener('change', () => {
  if (animationController) {
    animationController.setSpeed(Number(animSpeedSelect.value));
  }
});

// ── Trace Export ────────────────────────────────────────────────

btnTraceJson.addEventListener('click', () => {
  if (!lastTrace || lastTrace.length === 0) return;
  const json = traceToJson(lastTrace, { decisionId: decisionSelect.value });
  downloadFile(json, `trace-${decisionSelect.value}.json`, 'application/json');
});

btnTraceCsv.addEventListener('click', () => {
  if (!lastTrace || lastTrace.length === 0) return;
  const csv = traceToCSV(lastTrace);
  downloadFile(csv, `trace-${decisionSelect.value}.csv`, 'text/csv');
});

// ── DRD Zoom Controls ───────────────────────────────────────────

btnZoomIn.addEventListener('click', () => viewer.zoomIn());
btnZoomOut.addEventListener('click', () => viewer.zoomOut());
btnZoomReset.addEventListener('click', () => viewer.zoomFit());
btnZoomEvaluated.addEventListener('click', () => {
  if (lastTrace && lastTrace.length > 0) {
    viewer.zoomToEvaluated(lastTrace);
  }
});

// ── Keyboard Shortcuts ──────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Don't intercept when user is typing in an input/textarea/select
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Escape — close modals first, then navigate back to DRD
  if (e.key === 'Escape') {
    if (!batchModal.classList.contains('hidden')) {
      e.preventDefault();
      closeModal(batchModal, btnBatch);
      return;
    }
    if (!compareModal.classList.contains('hidden')) {
      e.preventDefault();
      closeModal(compareModal, btnCompare);
      return;
    }
    if (!viewer.isDrdView() && lastTrace && lastTrace.length > 1) {
      e.preventDefault();
      viewer.highlightDecisions(lastTrace, {
        onDecisionClick: handleDrdDecisionClick,
      });
    }
    return;
  }

  // Ctrl/Cmd+Enter — run evaluation
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runEvaluation();
    return;
  }
});

btnBatchRun.addEventListener('click', () => {
  const text = batchEditor.value.trim();
  if (!text) {
    showError('Batch editor is empty');
    return;
  }

  try {
    let rows;
    // Try JSON first, then fall back to CSV
    if (text.startsWith('[')) {
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) {
        throw new Error('JSON must be an array of input objects');
      }
    } else {
      rows = parseCSV(text);
      if (rows.length === 0) {
        throw new Error('No data rows found in CSV');
      }
    }
    runBatchEvaluation(rows);
  } catch (err) {
    showError(`Batch input error: ${err.message}`);
  }
});

btnBatchClear.addEventListener('click', () => {
  batchEditor.value = '';
});

// ── Compare Mode ────────────────────────────────────────────────

btnCompare.addEventListener('click', () => compareInput.click());

compareInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    try {
      const xml = await file.text();
      const otherModel = await parseDmnXml(xml);
      showComparison(currentModel, otherModel);
    } catch (err) {
      showError(`Failed to compare: ${err.message}`);
    }
  }
  compareInput.value = '';
});

btnCompareClose.addEventListener('click', () => {
  closeModal(compareModal, btnCompare);
});

compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) {
    closeModal(compareModal, btnCompare);
  }
});

function showComparison(leftModel, rightModel) {
  const diff = compareModels(leftModel, rightModel);

  // Summary
  const parts = [];
  if (diff.summary.modified > 0) parts.push(`${diff.summary.modified} modified`);
  if (diff.summary.added > 0) parts.push(`${diff.summary.added} added`);
  if (diff.summary.removed > 0) parts.push(`${diff.summary.removed} removed`);
  if (diff.summary.unchanged > 0) parts.push(`${diff.summary.unchanged} unchanged`);
  compareSummary.textContent = `${diff.decisions.length} decisions compared: ${parts.join(', ')}`;

  // Build comparison HTML
  let html = '';

  for (const dec of diff.decisions) {
    const statusClass = `compare-${dec.status}`;
    const statusIcon =
      dec.status === 'added'
        ? '➕'
        : dec.status === 'removed'
          ? '➖'
          : dec.status === 'modified'
            ? '✏️'
            : '✔️';

    html += `<div class="compare-decision ${statusClass}">`;
    html += `<h4>${statusIcon} ${escapeHtml(dec.name || dec.id)} <span class="compare-status">${dec.status}</span></h4>`;

    // Field-level changes
    if (dec.changes.length > 0) {
      html += '<div class="compare-changes">';
      for (const change of dec.changes) {
        if (change.field === 'inputs' || change.field === 'outputs') {
          // Array-style changes stored in .left
          for (const sub of change.left) {
            html += `<div class="compare-change">`;
            html += `<span class="compare-field">${escapeHtml(change.field)}${escapeHtml(sub.field)}</span> `;
            if (sub.left !== null) {
              html += `<span class="compare-old">${escapeHtml(String(sub.left))}</span> → `;
            }
            if (sub.right !== null) {
              html += `<span class="compare-new">${escapeHtml(String(sub.right))}</span>`;
            }
            html += '</div>';
          }
        } else {
          html += `<div class="compare-change">`;
          html += `<span class="compare-field">${escapeHtml(change.field)}</span>: `;
          html += `<span class="compare-old">${escapeHtml(String(change.left))}</span>`;
          html += ` → <span class="compare-new">${escapeHtml(String(change.right))}</span>`;
          html += '</div>';
        }
      }
      html += '</div>';
    }

    // Rule diffs
    if (dec.ruleDiffs && dec.ruleDiffs.some((r) => r.status !== 'unchanged')) {
      html +=
        '<table class="compare-rules"><thead><tr><th>#</th><th>Status</th><th>Left</th><th>Right</th></tr></thead><tbody>';

      for (const rule of dec.ruleDiffs) {
        const ruleClass = `compare-rule-${rule.status}`;
        const ruleNum =
          rule.leftIndex !== null && rule.leftIndex !== undefined
            ? rule.leftIndex + 1
            : rule.rightIndex !== null && rule.rightIndex !== undefined
              ? rule.rightIndex + 1
              : '?';
        const leftText = formatRuleEntries(rule.leftInputEntries, rule.leftOutputEntries);
        const rightText = formatRuleEntries(rule.rightInputEntries, rule.rightOutputEntries);

        html += `<tr class="${ruleClass}">`;
        html += `<td>${ruleNum}</td>`;
        html += `<td>${rule.status}</td>`;
        html += `<td>${escapeHtml(leftText)}</td>`;
        html += `<td>${escapeHtml(rightText)}</td>`;
        html += '</tr>';
      }

      html += '</tbody></table>';
    }

    html += '</div>';
  }

  compareResults.innerHTML = html;
  openModal(compareModal);
}

function formatRuleEntries(inputs, outputs) {
  if (!inputs && !outputs) return '—';
  const parts = [];
  if (inputs) parts.push(`IN: ${inputs.join(', ')}`);
  if (outputs) parts.push(`OUT: ${outputs.join(', ')}`);
  return parts.join(' | ');
}

decisionSelect.addEventListener('change', () => {
  const decisionId = decisionSelect.value;
  if (decisionId && currentModel) {
    const decision = currentModel.decisions.get(decisionId);
    getInputValues = buildInputForm(inputForm, decision);
    getOverrideValues = buildOverrideForm(overrideForm, currentModel, decisionId);
    viewer.clearHighlights();
    viewer.clearDecisionHighlights();
    stopAnimation();
    lastTrace = null;
    drdControls.classList.add('hidden');
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
    btnCompare.disabled = false;
    btnEditToggle.disabled = false;
    batchEditorPanel.classList.remove('hidden');

    // Show DRD zoom controls if there's more than one decision (DRD view)
    if (currentModel.decisions.size > 1) {
      drdZoomControls.classList.remove('hidden');
    } else {
      drdZoomControls.classList.add('hidden');
    }

    // Reset edit mode button state
    if (viewer.isEditMode()) {
      await viewer.setEditMode(false);
      btnEditToggle.textContent = '✏️ Edit';
      btnEditToggle.title = 'Switch to edit mode';
    }

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

async function runEvaluation() {
  const decisionId = decisionSelect.value;
  if (!decisionId || !currentModel) {
    showError('Please select a decision first');
    return;
  }

  // Switch to view mode if currently editing
  if (viewer.isEditMode()) {
    const xml = await viewer.saveXml();
    if (xml && xml !== currentXml) {
      currentXml = xml;
      currentModel = await parseDmnXml(xml);
    }
    await viewer.setEditMode(false);
    btnEditToggle.textContent = '✏️ Edit';
    btnEditToggle.title = 'Switch to edit mode';
    await viewer.load(currentXml);
  }

  const inputData = getInputValues();
  const overrides = getOverrideValues();

  try {
    const options = {};
    if (Object.keys(overrides).length > 0) {
      options.overrides = overrides;
    }
    options.feelProvider = await getCurrentProviderForEval();

    const { result, trace, error } = evaluateDecision(currentModel, decisionId, inputData, options);

    if (error) {
      showError(formatEngineError(error));
    } else {
      showResult(result);
    }

    showTrace(trace);

    // Store trace for DRD controls
    lastTrace = trace;

    // Highlight matched rules in the decision table viewer
    if (trace && trace.length > 0) {
      const lastTraceEntry = trace[trace.length - 1];

      // For multi-decision DRG, show evaluation flow in DRD
      if (trace.length > 1) {
        const autoNav = localStorage.getItem('dmn-sim-drd-auto-nav') !== 'false';
        if (autoNav) {
          await viewer.highlightDecisions(trace, {
            onDecisionClick: handleDrdDecisionClick,
          });
        }
        // Show DRD controls
        drdControls.classList.remove('hidden');
        drdOverlaysVisible = true;
        btnToggleOverlays.textContent = '👁 Hide Overlays';
        // Show data flow toggle
        btnToggleDataflow.classList.remove('hidden');
        dataFlowVisible = false;
        btnToggleDataflow.textContent = '🔗 Data Flow';
        // Show zoom-to-evaluated button
        btnZoomEvaluated.classList.remove('hidden');
        // Show animation controls
        stopAnimation();
        showAnimationControls();
      } else if (
        lastTraceEntry.type === 'decisionTable' &&
        lastTraceEntry.matchedRules.length > 0
      ) {
        viewer.highlightRules(lastTraceEntry.decisionId, lastTraceEntry.matchedRules);
        drdControls.classList.add('hidden');
        btnToggleDataflow.classList.add('hidden');
        stopAnimation();
      } else {
        viewer.clearHighlights();
        drdControls.classList.add('hidden');
        btnToggleDataflow.classList.add('hidden');
        stopAnimation();
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

async function runBatchEvaluation(rows) {
  const decisionId = decisionSelect.value;
  if (!decisionId || !currentModel) {
    showError('Please select a decision first');
    return;
  }

  let feelProvider;
  try {
    feelProvider = await getCurrentProviderForEval();
  } catch {
    feelProvider = undefined;
  }
  const results = evaluateBatch(currentModel, decisionId, rows, { feelProvider });
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
  openModal(batchModal);
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
    traceOutput.innerHTML = '<span class="trace-empty">No trace available</span>';
    traceActions.classList.add('hidden');
    return;
  }

  traceActions.classList.remove('hidden');

  // Build interactive trace table
  const table = document.createElement('table');
  table.className = 'trace-table';
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', 'Evaluation trace');

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>#</th><th>Decision</th><th>Type</th><th>Result</th><th>Time</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let totalDuration = 0;

  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    const tr = document.createElement('tr');
    tr.className = 'trace-row';
    tr.setAttribute('role', 'row');
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('aria-label', `Step ${i + 1}: ${entry.decisionName}`);
    tr.dataset.decisionId = entry.decisionId;

    if (entry.error) tr.classList.add('trace-error');
    if (entry.type === 'override') tr.classList.add('trace-override');

    const typeIcon =
      entry.type === 'override'
        ? '⚡'
        : entry.error
          ? '❌'
          : entry.type === 'literalExpression'
            ? '𝑓'
            : '▦';

    const resultText = entry.error ? entry.error : (JSON.stringify(entry.result) ?? '∅');
    const duration = entry.durationMs !== undefined ? `${entry.durationMs}ms` : '—';

    if (entry.durationMs !== undefined) totalDuration += entry.durationMs;

    tr.innerHTML = [
      `<td class="trace-step">${i + 1}</td>`,
      `<td class="trace-decision">${escapeHtml(entry.decisionName || entry.decisionId)}</td>`,
      `<td class="trace-type">${typeIcon}</td>`,
      `<td class="trace-result">${escapeHtml(resultText.length > 60 ? resultText.slice(0, 57) + '...' : resultText)}</td>`,
      `<td class="trace-duration">${duration}</td>`,
    ].join('');

    // Tooltip with full detail
    const tooltipLines = [
      `Decision: ${entry.decisionName} (${entry.decisionId})`,
      `Type: ${entry.type}`,
    ];
    if (entry.hitPolicy) {
      tooltipLines.push(
        `Hit Policy: ${entry.hitPolicy}${entry.aggregation ? ' + ' + entry.aggregation : ''}`,
      );
    }
    if (entry.type !== 'override' && entry.inputValues) {
      tooltipLines.push(`Inputs: ${JSON.stringify(entry.inputValues)}`);
    }
    tooltipLines.push(`Result: ${JSON.stringify(entry.result, null, 2)}`);
    if (entry.matchedRules && entry.matchedRules.length > 0) {
      tooltipLines.push(`Matched Rules: ${entry.matchedRules.length}`);
    }
    if (entry.error) tooltipLines.push(`Error: ${entry.error}`);
    tr.title = tooltipLines.join('\n');

    // Click handler — navigate to decision in DRD or decision table
    tr.addEventListener('click', () => handleTraceRowClick(entry));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTraceRowClick(entry);
      }
    });

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);

  // Summary footer
  if (trace.length > 1 && totalDuration > 0) {
    const tfoot = document.createElement('tfoot');
    tfoot.innerHTML = `<tr><td colspan="4">Total</td><td>${Math.round(totalDuration * 100) / 100}ms</td></tr>`;
    table.appendChild(tfoot);
  }

  traceOutput.innerHTML = '';
  traceOutput.appendChild(table);
}

/**
 * Handle click on a trace table row — navigate to the decision.
 */
async function handleTraceRowClick(entry) {
  // Highlight the clicked row and scroll it into view
  scrollTraceToDecision(entry.decisionId);

  // Navigate to the decision
  await handleDrdDecisionClick(entry.decisionId, entry);
}

/**
 * Scroll the trace table to highlight the row for the given decision.
 *
 * @param {string} decisionId - The decision element ID
 */
function scrollTraceToDecision(decisionId) {
  const rows = traceOutput.querySelectorAll('.trace-row');
  rows.forEach((r) => r.classList.remove('trace-active'));

  const activeRow = traceOutput.querySelector(`[data-decision-id="${decisionId}"]`);
  if (activeRow) {
    activeRow.classList.add('trace-active');
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

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
 * Viewer — dmn-js integration for rendering and editing DMN diagrams.
 *
 * Supports toggling between a read-only Viewer and a full Modeler.
 */

import DmnViewer from 'dmn-js/lib/Viewer.js';
import DmnModeler from 'dmn-js/lib/Modeler.js';
import { formatOverlayResult } from './format.js';

// Import dmn-js CSS
import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-decision-table-controls.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';

/**
 * Initialize a dmn-js viewer/modeler in the given container.
 *
 * Supports toggling between read-only (Viewer) and editable (Modeler) modes.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @returns {Object} Controller with load/highlightRules/clearHighlights/setEditMode/saveXml methods
 */
export function createViewer(container) {
  let viewer = new DmnViewer({ container });
  let editMode = false;
  let currentXml = null;

  /**
   * Destroy the current viewer/modeler instance and create a new one.
   */
  function recreateInstance(useModeler) {
    viewer.destroy();
    if (useModeler) {
      viewer = new DmnModeler({ container });
    } else {
      viewer = new DmnViewer({ container });
    }
  }

  const ctrl = {
    /**
     * Load DMN XML into the viewer.
     *
     * @param {string} xml - DMN XML string
     * @returns {Promise<Object>} The parsed definitions element
     */
    async load(xml) {
      currentXml = xml;
      const { warnings } = await viewer.importXML(xml);
      if (warnings.length > 0) {
        console.warn('DMN viewer warnings:', warnings);
      }

      return viewer.getDefinitions();
    },

    /**
     * Get the list of views (DRD, decision tables, etc.)
     */
    getViews() {
      return viewer.getViews();
    },

    /**
     * Open a specific view by its element.
     */
    open(view) {
      return viewer.open(view);
    },

    /**
     * Get the underlying dmn-js viewer instance.
     */
    getInstance() {
      return viewer;
    },

    /**
     * Navigate to a decision table view and highlight matched rules.
     *
     * @param {string} decisionId - The decision element ID
     * @param {Array<{id: string, index: number}>} matchedRules - Rules that matched
     */
    async highlightRules(decisionId, matchedRules) {
      // Find the decision table view for this decision
      const views = viewer.getViews();
      const tableView = views.find(
        (v) => v.type === 'decisionTable' && v.element?.id === decisionId,
      );

      if (!tableView) {
        return;
      }

      // Open the decision table view
      await viewer.open(tableView);

      // Wait a tick for the DOM to update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Clear previous highlights
      this.clearHighlights();

      // Highlight matched rule rows using data-row-id selectors
      for (const rule of matchedRules) {
        const cells = container.querySelectorAll(`[data-row-id="${rule.id}"]`);
        cells.forEach((cell) => cell.classList.add('matched-rule'));
      }
    },

    /**
     * Remove all rule highlights from the viewer.
     */
    clearHighlights() {
      const highlighted = container.querySelectorAll('.matched-rule');
      highlighted.forEach((el) => el.classList.remove('matched-rule'));
    },

    /**
     * Navigate to the DRD view and highlight evaluated decisions.
     *
     * Shows visual overlays on each evaluated decision node with its result
     * and evaluation order. Supports interactive click-to-navigate, what-if
     * override indicators, and dimming of non-evaluated decisions.
     *
     * @param {import('../engine/evaluate.js').EvaluationTrace[]} trace - Evaluation trace entries
     * @param {Object} [options]
     * @param {Function} [options.onDecisionClick] - Callback when a decision overlay is clicked
     */
    async highlightDecisions(trace, options = {}) {
      if (!trace || trace.length === 0) return;

      // Find the DRD view
      const views = viewer.getViews();
      const drdView = views.find((v) => v.type === 'drd');

      if (!drdView) return;

      // Open the DRD view
      await viewer.open(drdView);

      // Wait for DOM update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get the active DRD viewer
      const drdViewer = viewer.getActiveViewer();
      if (!drdViewer) return;

      const overlays = drdViewer.get('overlays');
      const canvas = drdViewer.get('canvas');
      const elementRegistry = drdViewer.get('elementRegistry');

      // Clear previous decision highlights
      this.clearDecisionHighlights();

      // Collect evaluated decision IDs for dimming non-evaluated ones
      const evaluatedIds = new Set(trace.map((e) => e.decisionId));

      // Dim non-evaluated decisions
      elementRegistry.forEach((element) => {
        if (element.type === 'dmn:Decision' && !evaluatedIds.has(element.id)) {
          try {
            canvas.addMarker(element.id, 'decision-not-evaluated');
          } catch {
            // Element may not support markers
          }
        }
      });

      // Add markers and overlays for each evaluated decision
      for (let i = 0; i < trace.length; i++) {
        const entry = trace[i];
        const decisionId = entry.decisionId;

        try {
          // Add CSS marker to the decision shape based on status
          let markerClass;
          if (entry.error) {
            markerClass = 'decision-error';
          } else if (entry.type === 'override') {
            markerClass = 'decision-override';
          } else {
            markerClass = 'decision-evaluated';
          }
          canvas.addMarker(decisionId, markerClass);

          // Add order number overlay
          const orderHtml = document.createElement('div');
          orderHtml.className = 'decision-order-badge';
          if (entry.type === 'override') {
            orderHtml.classList.add('override');
          }
          orderHtml.textContent = String(i + 1);
          orderHtml.title = `Step ${i + 1}: ${entry.decisionName}`;
          orderHtml.setAttribute('role', 'img');
          orderHtml.setAttribute('aria-label', `Evaluation step ${i + 1}: ${entry.decisionName}`);

          overlays.add(decisionId, 'evaluation-order', {
            position: { top: -12, right: -12 },
            html: orderHtml,
          });

          // Add result overlay (clickable)
          const resultHtml = document.createElement('div');
          const isError = !!entry.error;
          const isOverride = entry.type === 'override';

          // Determine CSS class
          let overlayClass = 'decision-result-overlay';
          if (isError) overlayClass += ' error';
          else if (isOverride) overlayClass += ' override';
          else if (entry.type === 'literalExpression') overlayClass += ' literal';

          resultHtml.className = overlayClass;
          resultHtml.setAttribute('role', 'button');
          resultHtml.setAttribute('tabindex', '0');
          resultHtml.setAttribute(
            'aria-label',
            `${entry.decisionName}: ${isError ? 'error' : isOverride ? 'overridden' : 'result'} — ${formatOverlayResult(entry.result)}`,
          );

          // Build content
          const typeIcon = isOverride
            ? '⚡'
            : isError
              ? '❌'
              : entry.type === 'literalExpression'
                ? '𝑓'
                : '▦';
          const resultText = formatOverlayResult(entry.result);
          resultHtml.textContent = `${typeIcon} ${resultText}`;

          // Duration suffix
          if (entry.durationMs !== undefined) {
            const durationSpan = document.createElement('span');
            durationSpan.className = 'decision-duration';
            durationSpan.textContent = ` ${entry.durationMs}ms`;
            resultHtml.appendChild(durationSpan);
          }

          // Tooltip with full detail
          const tooltipLines = [
            `Decision: ${entry.decisionName} (${entry.decisionId})`,
            `Type: ${entry.type}`,
            `Result: ${JSON.stringify(entry.result, null, 2)}`,
          ];
          if (entry.inputValues && Object.keys(entry.inputValues).length > 0) {
            tooltipLines.push(`Inputs: ${JSON.stringify(entry.inputValues, null, 2)}`);
          }
          if (entry.durationMs !== undefined) {
            tooltipLines.push(`Duration: ${entry.durationMs}ms`);
          }
          if (entry.error) {
            tooltipLines.push(`Error: ${entry.error}`);
          }
          resultHtml.title = tooltipLines.join('\n');

          // Click handler — navigate to the decision table/expression view
          if (options.onDecisionClick) {
            resultHtml.style.cursor = 'pointer';
            resultHtml.addEventListener('click', (e) => {
              e.stopPropagation();
              options.onDecisionClick(entry.decisionId, entry);
            });
            resultHtml.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                options.onDecisionClick(entry.decisionId, entry);
              }
            });
          }

          overlays.add(decisionId, 'evaluation-result', {
            position: { bottom: -8, left: 0 },
            html: resultHtml,
          });

          // Error detail overlay for failed decisions
          if (isError) {
            const errorHtml = document.createElement('div');
            errorHtml.className = 'decision-error-detail';
            errorHtml.textContent = entry.error;
            errorHtml.title = entry.error;
            errorHtml.setAttribute('role', 'alert');
            errorHtml.setAttribute('aria-label', `Error: ${entry.error}`);

            overlays.add(decisionId, 'evaluation-error', {
              position: { bottom: -28, left: 0 },
              html: errorHtml,
            });
          }
        } catch {
          // Element may not exist in the DRD — skip silently
        }
      }
    },

    /**
     * Animate the evaluation flow step by step.
     *
     * Reveals overlays one decision at a time in evaluation order.
     * Returns a controller with play/pause/step/stop/setSpeed methods.
     *
     * @param {import('../engine/evaluate.js').EvaluationTrace[]} trace - Evaluation trace entries
     * @param {Object} [options]
     * @param {Function} [options.onDecisionClick] - Callback when a decision overlay is clicked
     * @param {Function} [options.onStep] - Callback when a step is revealed (receives step index)
     * @param {Function} [options.onComplete] - Callback when animation finishes
     * @param {number} [options.speed=1000] - Delay between steps in milliseconds
     * @returns {Object|null} Animation controller or null if animation cannot start
     */
    animateDecisions(trace, options = {}) {
      if (!trace || trace.length === 0) return null;

      // Find the DRD view
      const views = viewer.getViews();
      const drdView = views.find((v) => v.type === 'drd');
      if (!drdView) return null;

      let currentStep = -1;
      let speed = options.speed || 1000;
      let timerId = null;
      let playing = false;
      let stopped = false;

      // Pre-open DRD view and set up base state
      const setupPromise = (async () => {
        await viewer.open(drdView);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const drdViewer = viewer.getActiveViewer();
        if (!drdViewer) return false;

        const overlaysSvc = drdViewer.get('overlays');
        const canvas = drdViewer.get('canvas');
        const elementRegistry = drdViewer.get('elementRegistry');

        // Clear previous highlights
        ctrl.clearDecisionHighlights();

        // Dim all decisions initially
        const evaluatedIds = new Set(trace.map((e) => e.decisionId));
        elementRegistry.forEach((element) => {
          if (element.type === 'dmn:Decision') {
            try {
              canvas.addMarker(element.id, 'decision-not-evaluated');
            } catch {
              // Element may not support markers
            }
          }
        });

        return { overlaysSvc, canvas, elementRegistry, evaluatedIds };
      })();

      /**
       * Reveal one step of the animation by adding its overlays.
       */
      async function revealStep(stepIndex) {
        const ctx = await setupPromise;
        if (!ctx || stopped) return;

        const { overlaysSvc, canvas } = ctx;
        const entry = trace[stepIndex];
        const decisionId = entry.decisionId;

        try {
          // Remove dim marker, add status marker
          try {
            canvas.removeMarker(decisionId, 'decision-not-evaluated');
          } catch {
            // ignore
          }

          let markerClass;
          if (entry.error) {
            markerClass = 'decision-error';
          } else if (entry.type === 'override') {
            markerClass = 'decision-override';
          } else {
            markerClass = 'decision-evaluated';
          }
          canvas.addMarker(decisionId, markerClass);

          // Add order badge
          const orderHtml = document.createElement('div');
          orderHtml.className = 'decision-order-badge';
          if (entry.type === 'override') {
            orderHtml.classList.add('override');
          }
          orderHtml.textContent = String(stepIndex + 1);
          orderHtml.title = `Step ${stepIndex + 1}: ${entry.decisionName}`;
          orderHtml.setAttribute('role', 'img');
          orderHtml.setAttribute(
            'aria-label',
            `Evaluation step ${stepIndex + 1}: ${entry.decisionName}`,
          );

          overlaysSvc.add(decisionId, 'evaluation-order', {
            position: { top: -12, right: -12 },
            html: orderHtml,
          });

          // Add result overlay
          const resultHtml = document.createElement('div');
          const isError = !!entry.error;
          const isOverride = entry.type === 'override';

          let overlayClass = 'decision-result-overlay';
          if (isError) overlayClass += ' error';
          else if (isOverride) overlayClass += ' override';
          else if (entry.type === 'literalExpression') overlayClass += ' literal';

          resultHtml.className = overlayClass;
          resultHtml.setAttribute('role', 'button');
          resultHtml.setAttribute('tabindex', '0');
          resultHtml.setAttribute(
            'aria-label',
            `${entry.decisionName}: ${isError ? 'error' : isOverride ? 'overridden' : 'result'} — ${formatOverlayResult(entry.result)}`,
          );

          const typeIcon = isOverride
            ? '⚡'
            : isError
              ? '❌'
              : entry.type === 'literalExpression'
                ? '𝑓'
                : '▦';
          const resultText = formatOverlayResult(entry.result);
          resultHtml.textContent = `${typeIcon} ${resultText}`;

          if (entry.durationMs !== undefined) {
            const durationSpan = document.createElement('span');
            durationSpan.className = 'decision-duration';
            durationSpan.textContent = ` ${entry.durationMs}ms`;
            resultHtml.appendChild(durationSpan);
          }

          if (options.onDecisionClick) {
            resultHtml.style.cursor = 'pointer';
            resultHtml.addEventListener('click', (e) => {
              e.stopPropagation();
              options.onDecisionClick(entry.decisionId, entry);
            });
            resultHtml.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                options.onDecisionClick(entry.decisionId, entry);
              }
            });
          }

          overlaysSvc.add(decisionId, 'evaluation-result', {
            position: { bottom: -8, left: 0 },
            html: resultHtml,
          });

          if (isError) {
            const errorHtml = document.createElement('div');
            errorHtml.className = 'decision-error-detail';
            errorHtml.textContent = entry.error;
            errorHtml.title = entry.error;
            errorHtml.setAttribute('role', 'alert');
            errorHtml.setAttribute('aria-label', `Error: ${entry.error}`);

            overlaysSvc.add(decisionId, 'evaluation-error', {
              position: { bottom: -28, left: 0 },
              html: errorHtml,
            });
          }
        } catch {
          // Element may not exist in the DRD — skip silently
        }

        currentStep = stepIndex;
        if (options.onStep) {
          options.onStep(stepIndex);
        }
      }

      function scheduleNext() {
        if (stopped || !playing) return;
        if (currentStep >= trace.length - 1) {
          playing = false;
          if (options.onComplete) {
            options.onComplete();
          }
          return;
        }
        timerId = setTimeout(() => {
          if (stopped || !playing) return;
          revealStep(currentStep + 1).then(scheduleNext);
        }, speed);
      }

      const animCtrl = {
        /**
         * Start or resume automatic playback.
         */
        play() {
          if (stopped) return;
          if (playing) return;
          playing = true;
          // If we haven't started yet, reveal the first step immediately
          if (currentStep < 0) {
            revealStep(0).then(scheduleNext);
          } else {
            scheduleNext();
          }
        },

        /**
         * Pause automatic playback.
         */
        pause() {
          playing = false;
          if (timerId !== null) {
            clearTimeout(timerId);
            timerId = null;
          }
        },

        /**
         * Advance one step forward.
         */
        stepForward() {
          if (stopped) return;
          animCtrl.pause();
          const next = currentStep + 1;
          if (next < trace.length) {
            revealStep(next);
          }
        },

        /**
         * Stop the animation and show all remaining overlays.
         */
        finish() {
          animCtrl.pause();
          // Reveal all remaining steps synchronously
          const start = currentStep + 1;
          const reveal = async () => {
            for (let i = start; i < trace.length; i++) {
              await revealStep(i);
            }
            if (options.onComplete) {
              options.onComplete();
            }
          };
          reveal();
        },

        /**
         * Stop the animation completely and clean up.
         */
        stop() {
          stopped = true;
          playing = false;
          if (timerId !== null) {
            clearTimeout(timerId);
            timerId = null;
          }
        },

        /**
         * Set the animation speed.
         *
         * @param {number} ms - Delay between steps in milliseconds
         */
        setSpeed(ms) {
          speed = ms;
        },

        /**
         * Get the current step index (-1 if not started).
         *
         * @returns {number}
         */
        getCurrentStep() {
          return currentStep;
        },

        /**
         * Get the total number of steps.
         *
         * @returns {number}
         */
        getTotalSteps() {
          return trace.length;
        },

        /**
         * Whether the animation is currently playing.
         *
         * @returns {boolean}
         */
        isPlaying() {
          return playing;
        },
      };

      return animCtrl;
    },

    /**
     * Remove all decision evaluation highlights and overlays.
     */
    clearDecisionHighlights() {
      const drdViewer = viewer.getActiveViewer();
      if (!drdViewer) return;

      try {
        const overlays = drdViewer.get('overlays');
        const canvas = drdViewer.get('canvas');
        const elementRegistry = drdViewer.get('elementRegistry');

        // Remove overlays
        overlays.remove({ type: 'evaluation-order' });
        overlays.remove({ type: 'evaluation-result' });
        overlays.remove({ type: 'evaluation-error' });

        // Remove markers from all elements
        elementRegistry.forEach((element) => {
          try {
            canvas.removeMarker(element.id, 'decision-evaluated');
            canvas.removeMarker(element.id, 'decision-error');
            canvas.removeMarker(element.id, 'decision-override');
            canvas.removeMarker(element.id, 'decision-not-evaluated');
          } catch {
            // Ignore errors for elements without markers
          }
        });
      } catch {
        // Viewer may not be in DRD mode
      }
    },

    /**
     * Zoom in on the DRD canvas.
     *
     * @param {number} [step=0.2] - Zoom increment
     */
    zoomIn(step = 0.2) {
      try {
        const drdViewer = viewer.getActiveViewer();
        if (!drdViewer) return;
        const canvas = drdViewer.get('canvas');
        const current = canvas.zoom();
        canvas.zoom(current + step, 'auto');
      } catch {
        // Not in DRD mode
      }
    },

    /**
     * Zoom out on the DRD canvas.
     *
     * @param {number} [step=0.2] - Zoom decrement
     */
    zoomOut(step = 0.2) {
      try {
        const drdViewer = viewer.getActiveViewer();
        if (!drdViewer) return;
        const canvas = drdViewer.get('canvas');
        const current = canvas.zoom();
        canvas.zoom(Math.max(0.1, current - step), 'auto');
      } catch {
        // Not in DRD mode
      }
    },

    /**
     * Fit the DRD diagram to the viewport.
     */
    zoomFit() {
      try {
        const drdViewer = viewer.getActiveViewer();
        if (!drdViewer) return;
        const canvas = drdViewer.get('canvas');
        canvas.zoom('fit-viewport', 'auto');
      } catch {
        // Not in DRD mode
      }
    },

    /**
     * Zoom the DRD canvas to fit only the evaluated decisions.
     *
     * Calculates the bounding box of all evaluated decision elements
     * and adjusts the viewbox to show only those elements with padding.
     *
     * @param {import('../engine/evaluate.js').EvaluationTrace[]} trace - Evaluation trace entries
     */
    zoomToEvaluated(trace) {
      try {
        if (!trace || trace.length === 0) return;

        const drdViewer = viewer.getActiveViewer();
        if (!drdViewer) return;

        const canvas = drdViewer.get('canvas');
        const elementRegistry = drdViewer.get('elementRegistry');

        const evaluatedIds = new Set(trace.map((e) => e.decisionId));

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let found = false;

        evaluatedIds.forEach((id) => {
          const element = elementRegistry.get(id);
          if (element && element.x !== undefined && element.y !== undefined) {
            found = true;
            minX = Math.min(minX, element.x);
            minY = Math.min(minY, element.y);
            maxX = Math.max(maxX, element.x + (element.width || 180));
            maxY = Math.max(maxY, element.y + (element.height || 80));
          }
        });

        if (!found) return;

        // Add padding around the bounding box
        const padding = 60;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        canvas.viewbox({
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        });
      } catch {
        // Not in DRD mode or elements not found
      }
    },

    /**
     * Whether the viewer is currently in edit mode.
     *
     * @returns {boolean}
     */
    isEditMode() {
      return editMode;
    },

    /**
     * Check if the current view is the DRD view.
     *
     * @returns {boolean}
     */
    isDrdView() {
      try {
        const activeViewer = viewer.getActiveViewer();
        if (!activeViewer) return false;
        // If we can get the canvas, we're likely in DRD view
        activeViewer.get('canvas');
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Navigate to a specific decision's view (decision table or literal expression).
     *
     * @param {string} decisionId - The decision element ID to navigate to
     * @returns {Promise<boolean>} Whether navigation succeeded
     */
    async navigateToDecision(decisionId) {
      const views = viewer.getViews();
      const decisionView = views.find(
        (v) =>
          v.element?.id === decisionId &&
          (v.type === 'decisionTable' || v.type === 'literalExpression'),
      );
      if (decisionView) {
        await viewer.open(decisionView);
        return true;
      }
      return false;
    },

    /**
     * Navigate to the DRD (overview) view.
     *
     * @returns {Promise<boolean>} Whether navigation succeeded
     */
    async navigateToDrd() {
      const views = viewer.getViews();
      const drdView = views.find((v) => v.type === 'drd');
      if (drdView) {
        await viewer.open(drdView);
        return true;
      }
      return false;
    },

    /**
     * Toggle between view and edit modes.
     * Recreates the internal viewer/modeler and reloads the current XML.
     *
     * @param {boolean} enable - Whether to enable edit mode
     * @returns {Promise<void>}
     */
    async setEditMode(enable) {
      if (enable === editMode) return;

      // When switching from edit → view, save current edits first
      if (editMode && !enable) {
        try {
          const { xml } = await viewer.saveXML({ format: true });
          currentXml = xml;
        } catch {
          // If save fails, keep the last known XML
        }
      }

      editMode = enable;
      recreateInstance(enable);

      if (currentXml) {
        await ctrl.load(currentXml);
      }
    },

    /**
     * Export the current DMN XML from the viewer/modeler.
     * In edit mode, this returns the edited XML. In view mode, the original.
     *
     * @returns {Promise<string>} The DMN XML string
     */
    async saveXml() {
      if (editMode) {
        const { xml } = await viewer.saveXML({ format: true });
        currentXml = xml;
        return xml;
      }
      return currentXml;
    },

    /**
     * Get the current XML (last loaded or last saved).
     *
     * @returns {string|null}
     */
    getCurrentXml() {
      return currentXml;
    },
  };

  return ctrl;
}

export { formatOverlayResult };

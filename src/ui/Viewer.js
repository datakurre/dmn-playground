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
     * and evaluation order.
     *
     * @param {import('../engine/evaluate.js').EvaluationTrace[]} trace - Evaluation trace entries
     */
    async highlightDecisions(trace) {
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

      // Clear previous decision highlights
      this.clearDecisionHighlights();

      // Add markers and overlays for each evaluated decision
      for (let i = 0; i < trace.length; i++) {
        const entry = trace[i];
        const decisionId = entry.decisionId;

        try {
          // Add CSS marker to the decision shape
          const markerClass = entry.error ? 'decision-error' : 'decision-evaluated';
          canvas.addMarker(decisionId, markerClass);

          // Add order number overlay
          const orderHtml = document.createElement('div');
          orderHtml.className = 'decision-order-badge';
          orderHtml.textContent = String(i + 1);
          orderHtml.title = `Step ${i + 1}: ${entry.decisionName}`;

          overlays.add(decisionId, 'evaluation-order', {
            position: { top: -12, right: -12 },
            html: orderHtml,
          });

          // Add result overlay
          const resultHtml = document.createElement('div');
          resultHtml.className = entry.error
            ? 'decision-result-overlay error'
            : 'decision-result-overlay';
          const resultText =
            entry.type === 'override'
              ? `⚡ ${formatOverlayResult(entry.result)}`
              : formatOverlayResult(entry.result);
          resultHtml.textContent = resultText;
          resultHtml.title = JSON.stringify(entry.result, null, 2);

          overlays.add(decisionId, 'evaluation-result', {
            position: { bottom: -8, left: 0 },
            html: resultHtml,
          });
        } catch {
          // Element may not exist in the DRD — skip silently
        }
      }
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

        // Remove markers from all elements
        elementRegistry.forEach((element) => {
          try {
            canvas.removeMarker(element.id, 'decision-evaluated');
            canvas.removeMarker(element.id, 'decision-error');
          } catch {
            // Ignore errors for elements without markers
          }
        });
      } catch {
        // Viewer may not be in DRD mode
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

/**
 * Format a result value for compact overlay display.
 *
 * @param {*} value
 * @returns {string}
 */
function formatOverlayResult(value) {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 30 ? json.slice(0, 27) + '...' : json;
  }
  const str = String(value);
  return str.length > 30 ? str.slice(0, 27) + '...' : str;
}

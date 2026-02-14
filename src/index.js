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
 * dmn-playground — main entry point.
 *
 * Re-exports the public API for the DMN engine.
 * This module can be consumed as a library: `@dmn-playground/engine`
 */

export { parseDmnXml } from './parser/parse.js';
export { evaluateDecision } from './engine/evaluate.js';
export { evaluateBatch, parseCSV, aggregateBatchResults } from './engine/batch.js';
export { compareModels } from './engine/compare.js';
export { resolveEvaluationOrder, getDependencies } from './engine/drg.js';
export { applyHitPolicy } from './engine/hit-policy.js';
export { coerceValue } from './engine/types.js';

// UI utilities
export { createBlankDmn } from './ui/blank-dmn.js';
export { formatOverlayResult } from './ui/format.js';

// FEEL providers
export { FeelProvider } from './engine/feel/provider.js';
export { FeelinProvider } from './engine/feel/feelin.js';
export { FeelScalaProvider, isFeelScalaAvailable } from './engine/feel/feel-scala.js';
export {
  getAvailableProviders,
  getProvider,
  getCurrentProvider,
  setCurrentProvider,
  getCurrentProviderName,
  createDefaultProvider,
} from './engine/feel/registry.js';

/**
 * dmn-simulator — main entry point.
 *
 * Re-exports the public API for the DMN engine.
 * This module can be consumed as a library: `@dmn-simulator/engine`
 */

export { parseDmnXml } from './parser/parse.js';
export { evaluateDecision } from './engine/evaluate.js';
export { evaluateBatch, parseCSV } from './engine/batch.js';
export { resolveEvaluationOrder, getDependencies } from './engine/drg.js';
export { applyHitPolicy } from './engine/hit-policy.js';
export { coerceValue } from './engine/types.js';

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

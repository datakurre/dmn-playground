/**
 * FEEL provider barrel — re-exports for convenience.
 */
export { FeelProvider } from './provider.js';
export { FeelinProvider } from './feelin.js';
export { FeelScalaProvider, isFeelScalaAvailable } from './feel-scala.js';
export {
  getAvailableProviders,
  getProvider,
  getCurrentProvider,
  setCurrentProvider,
  getCurrentProviderName,
  createDefaultProvider,
} from './registry.js';

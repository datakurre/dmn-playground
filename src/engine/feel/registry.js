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
 * FEEL Provider Registry — runtime selection of FEEL backend.
 *
 * Manages the available FEEL providers and allows switching between them
 * at runtime via configuration or UI toggle.
 *
 * Two backends are supported:
 * 1. feelin    — lightweight JS FEEL engine (always available, default)
 * 2. feel-scala — Scala.js-compiled production FEEL engine (optional)
 */

import { FeelinProvider } from './feelin.js';
import { FeelScalaProvider, isFeelScalaAvailable } from './feel-scala.js';

/**
 * @typedef {'feelin' | 'feel-scala'} ProviderName
 */

/**
 * @typedef {Object} ProviderInfo
 * @property {string} name - Provider identifier
 * @property {string} label - Human-readable display name
 * @property {string} description - Short description
 * @property {boolean} available - Whether the provider can be used
 */

/**
 * Cached provider instances.
 * @type {Map<string, import('./provider.js').FeelProvider>}
 */
const providerCache = new Map();

/**
 * The currently selected provider name.
 * @type {ProviderName}
 */
let currentProviderName = 'feel-scala';

/**
 * Get information about all registered FEEL providers.
 *
 * @returns {ProviderInfo[]}
 */
export function getAvailableProviders() {
  return [
    {
      name: 'feel-scala',
      label: 'feel-scala (Scala.js)',
      description: 'Production FEEL engine from Operaton/Camunda 7 (compiled via Scala.js)',
      available: isFeelScalaAvailable(),
    },
    {
      name: 'feelin',
      label: 'feelin (JS)',
      description: 'Lightweight FEEL interpreter written in JavaScript',
      available: true,
    },
  ];
}

/**
 * Get or create a FEEL provider instance by name.
 *
 * @param {ProviderName} name - Provider name
 * @returns {Promise<import('./provider.js').FeelProvider>}
 * @throws {Error} If the provider is not available
 */
export async function getProvider(name) {
  if (providerCache.has(name)) {
    return providerCache.get(name);
  }

  let provider;

  switch (name) {
    case 'feelin':
      provider = new FeelinProvider();
      break;

    case 'feel-scala':
      provider = new FeelScalaProvider();
      await provider.initialize();
      break;

    default:
      throw new Error(`Unknown FEEL provider: ${name}`);
  }

  providerCache.set(name, provider);
  return provider;
}

/**
 * Get the currently selected provider instance.
 * Falls back to feelin if the selected provider is not available.
 *
 * @returns {Promise<import('./provider.js').FeelProvider>}
 */
export async function getCurrentProvider() {
  try {
    return await getProvider(currentProviderName);
  } catch {
    // Fall back to feelin if the selected provider fails
    if (currentProviderName !== 'feelin') {
      console.warn(
        `FEEL provider "${currentProviderName}" is not available, falling back to feelin`,
      );
      currentProviderName = 'feelin';
      return getProvider('feelin');
    }
    throw new Error('No FEEL provider available');
  }
}

/**
 * Set the active FEEL provider by name.
 *
 * @param {ProviderName} name - Provider name to activate
 */
export function setCurrentProvider(name) {
  currentProviderName = name;
}

/**
 * Get the name of the currently selected provider.
 *
 * @returns {ProviderName}
 */
export function getCurrentProviderName() {
  return currentProviderName;
}

/**
 * Create a provider instance synchronously (feelin only).
 * Use this when async initialization is not possible.
 *
 * @returns {import('./provider.js').FeelProvider}
 */
export function createDefaultProvider() {
  if (!providerCache.has('feelin')) {
    providerCache.set('feelin', new FeelinProvider());
  }
  return providerCache.get('feelin');
}

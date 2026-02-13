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
 * URL State — encode/decode simulation state for sharing via URL hash.
 *
 * State includes the DMN XML, selected decision ID, and input data.
 * The state is compressed (deflate-raw) and base64url-encoded.
 */

/**
 * @typedef {Object} SimulationState
 * @property {string} dmnXml - DMN XML content
 * @property {string} decisionId - Selected decision ID
 * @property {Object} inputData - Input variable bindings
 */

/**
 * Encode simulation state into a URL-safe hash string.
 *
 * @param {SimulationState} state
 * @returns {Promise<string>} Base64url-encoded compressed state
 */
export async function encodeState(state) {
  const json = JSON.stringify({
    v: 1,
    x: state.dmnXml,
    d: state.decisionId,
    i: state.inputData,
  });

  const bytes = new TextEncoder().encode(json);
  const compressed = await compress(bytes);
  return uint8ToBase64Url(compressed);
}

/**
 * Decode simulation state from a URL hash string.
 *
 * @param {string} hash - Base64url-encoded compressed state
 * @returns {Promise<SimulationState>} Decoded state
 */
export async function decodeState(hash) {
  const compressed = base64UrlToUint8(hash);
  const bytes = await decompress(compressed);
  const json = new TextDecoder().decode(bytes);
  const data = JSON.parse(json);

  if (data.v !== 1) {
    throw new Error(`Unsupported state version: ${data.v}`);
  }

  return {
    dmnXml: data.x,
    decisionId: data.d,
    inputData: data.i,
  };
}

/**
 * Compress bytes using deflate-raw.
 *
 * @param {Uint8Array} input
 * @returns {Promise<Uint8Array>}
 */
async function compress(input) {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompress bytes using deflate-raw.
 *
 * @param {Uint8Array} input
 * @returns {Promise<Uint8Array>}
 */
async function decompress(input) {
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Encode a Uint8Array to a URL-safe base64 string (no padding).
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function uint8ToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a URL-safe base64 string to Uint8Array.
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
function base64UrlToUint8(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

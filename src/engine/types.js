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
 * Type coercion for DMN input/output values.
 *
 * DMN type-refs: string, boolean, integer, long, double, date, time, dateTime.
 * This module coerces JS values to the expected DMN types.
 */

/**
 * Coerce a value to the DMN type specified by typeRef.
 *
 * @param {*} value - The value to coerce
 * @param {string} [typeRef] - DMN type reference
 * @returns {*} The coerced value
 */
export function coerceValue(value, typeRef) {
  if (value === null || value === undefined || !typeRef) {
    return value;
  }

  switch (typeRef.toLowerCase()) {
    case 'string':
      // Operaton preserves the FEEL evaluation result — it does NOT
      // convert numbers/booleans to strings based on typeRef.
      // Only convert if value is already a string or truly needs it.
      if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      return String(value);

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
      }
      return Boolean(value);

    case 'integer':
    case 'long': {
      const num = Number(value);
      return Number.isFinite(num) ? Math.trunc(num) : value;
    }

    case 'double':
    case 'number': {
      const num = Number(value);
      return Number.isFinite(num) ? num : value;
    }

    case 'date':
    case 'time':
    case 'datetime':
    case 'dateTime':
      // FEEL handles date/time parsing — pass through for now
      return value;

    default:
      return value;
  }
}

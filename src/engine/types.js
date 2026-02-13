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

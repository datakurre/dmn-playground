import { describe, it, expect } from 'vitest';

import { coerceValue } from '../../src/engine/types.js';

describe('Type Coercion', () => {
  it('returns value unchanged when no typeRef', () => {
    expect(coerceValue(42)).toBe(42);
    expect(coerceValue('hello')).toBe('hello');
  });

  it('coerces to string (Operaton-compatible)', () => {
    // Operaton preserves FEEL result types — numbers/booleans stay as-is
    expect(coerceValue(42, 'string')).toBe(42);
    expect(coerceValue(true, 'string')).toBe(true);
    // Non-number/boolean values are converted to string
    expect(coerceValue([1, 2], 'string')).toBe('1,2');
  });

  it('coerces to boolean', () => {
    expect(coerceValue('true', 'boolean')).toBe(true);
    expect(coerceValue('false', 'boolean')).toBe(false);
    expect(coerceValue(true, 'boolean')).toBe(true);
  });

  it('coerces to integer', () => {
    expect(coerceValue('42', 'integer')).toBe(42);
    expect(coerceValue(42.7, 'integer')).toBe(42);
    expect(coerceValue('3.9', 'integer')).toBe(3);
  });

  it('coerces to double', () => {
    expect(coerceValue('3.14', 'double')).toBe(3.14);
    expect(coerceValue(42, 'double')).toBe(42);
  });

  it('passes null/undefined through', () => {
    expect(coerceValue(null, 'string')).toBe(null);
    expect(coerceValue(undefined, 'integer')).toBe(undefined);
  });
});

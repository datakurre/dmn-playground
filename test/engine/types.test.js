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

  it('coerces truthy non-string non-boolean to boolean', () => {
    expect(coerceValue(1, 'boolean')).toBe(true);
    expect(coerceValue(0, 'boolean')).toBe(false);
  });

  it('coerces to integer', () => {
    expect(coerceValue('42', 'integer')).toBe(42);
    expect(coerceValue(42.7, 'integer')).toBe(42);
    expect(coerceValue('3.9', 'integer')).toBe(3);
  });

  it('coerces to long (same as integer)', () => {
    expect(coerceValue('99', 'long')).toBe(99);
    expect(coerceValue(7.8, 'long')).toBe(7);
  });

  it('returns original value for non-finite integer/long', () => {
    expect(coerceValue('abc', 'integer')).toBe('abc');
    expect(coerceValue('xyz', 'long')).toBe('xyz');
  });

  it('coerces to double', () => {
    expect(coerceValue('3.14', 'double')).toBe(3.14);
    expect(coerceValue(42, 'double')).toBe(42);
  });

  it('coerces to number (same as double)', () => {
    expect(coerceValue('2.5', 'number')).toBe(2.5);
    expect(coerceValue(10, 'number')).toBe(10);
  });

  it('returns original value for non-finite double/number', () => {
    expect(coerceValue('abc', 'double')).toBe('abc');
    expect(coerceValue('xyz', 'number')).toBe('xyz');
  });

  it('passes null/undefined through', () => {
    expect(coerceValue(null, 'string')).toBe(null);
    expect(coerceValue(undefined, 'integer')).toBe(undefined);
  });

  it('passes through date/time types unchanged', () => {
    const dateVal = '2024-01-15';
    expect(coerceValue(dateVal, 'date')).toBe(dateVal);
    expect(coerceValue('10:30:00', 'time')).toBe('10:30:00');
    expect(coerceValue('2024-01-15T10:30:00', 'dateTime')).toBe('2024-01-15T10:30:00');
    expect(coerceValue('2024-01-15T10:30:00', 'datetime')).toBe('2024-01-15T10:30:00');
  });

  it('returns value unchanged for unknown typeRef', () => {
    expect(coerceValue(42, 'customType')).toBe(42);
    expect(coerceValue('hello', 'unknownType')).toBe('hello');
  });

  it('is case-insensitive for typeRef', () => {
    expect(coerceValue('42', 'INTEGER')).toBe(42);
    expect(coerceValue('3.14', 'DOUBLE')).toBe(3.14);
    expect(coerceValue('true', 'BOOLEAN')).toBe(true);
    expect(coerceValue(42, 'STRING')).toBe(42);
  });
});

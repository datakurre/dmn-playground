import { describe, it, expect } from 'vitest';

import { formatOverlayResult } from '../../src/ui/format.js';

describe('formatOverlayResult', () => {
  it('returns "∅" for null', () => {
    expect(formatOverlayResult(null)).toBe('∅');
  });

  it('returns "∅" for undefined', () => {
    expect(formatOverlayResult(undefined)).toBe('∅');
  });

  it('formats simple strings', () => {
    expect(formatOverlayResult('hello')).toBe('hello');
  });

  it('formats numbers', () => {
    expect(formatOverlayResult(42)).toBe('42');
    expect(formatOverlayResult(3.14)).toBe('3.14');
  });

  it('formats booleans', () => {
    expect(formatOverlayResult(true)).toBe('true');
    expect(formatOverlayResult(false)).toBe('false');
  });

  it('formats objects as JSON', () => {
    expect(formatOverlayResult({ a: 1 })).toBe('{"a":1}');
  });

  it('formats arrays as JSON', () => {
    expect(formatOverlayResult([1, 2, 3])).toBe('[1,2,3]');
  });

  it('truncates long strings to 30 characters', () => {
    const longStr = 'a'.repeat(50);
    const result = formatOverlayResult(longStr);
    expect(result).toHaveLength(30);
    expect(result).toBe('a'.repeat(27) + '...');
  });

  it('does not truncate strings at exactly 30 characters', () => {
    const str = 'a'.repeat(30);
    expect(formatOverlayResult(str)).toBe(str);
  });

  it('truncates long JSON objects', () => {
    const obj = { longKey: 'a'.repeat(30) };
    const result = formatOverlayResult(obj);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('...');
  });

  it('does not truncate short JSON objects', () => {
    const obj = { x: 1 };
    expect(formatOverlayResult(obj)).toBe('{"x":1}');
  });

  it('formats zero correctly', () => {
    expect(formatOverlayResult(0)).toBe('0');
  });

  it('formats empty string', () => {
    expect(formatOverlayResult('')).toBe('');
  });

  it('formats empty object', () => {
    expect(formatOverlayResult({})).toBe('{}');
  });

  it('formats empty array', () => {
    expect(formatOverlayResult([])).toBe('[]');
  });
});

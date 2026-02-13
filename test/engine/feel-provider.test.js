import { describe, it, expect } from 'vitest';

import { FeelinProvider } from '../../src/engine/feel/feelin.js';

describe('FeelinProvider', () => {
  const provider = new FeelinProvider();

  describe('evaluate()', () => {
    it('evaluates arithmetic expressions', () => {
      expect(provider.evaluate('1 + 2')).toBe(3);
      expect(provider.evaluate('10 * 3 + 5')).toBe(35);
    });

    it('evaluates expressions with context variables', () => {
      expect(provider.evaluate('x + y', { x: 10, y: 20 })).toBe(30);
    });

    it('evaluates string expressions', () => {
      expect(provider.evaluate('"hello"')).toBe('hello');
    });

    it('evaluates boolean expressions', () => {
      expect(provider.evaluate('true')).toBe(true);
      expect(provider.evaluate('false')).toBe(false);
    });

    it('evaluates if-then-else', () => {
      expect(provider.evaluate('if x > 5 then "high" else "low"', { x: 10 })).toBe('high');
      expect(provider.evaluate('if x > 5 then "high" else "low"', { x: 3 })).toBe('low');
    });
  });

  describe('unaryTest()', () => {
    it('matches greater-than', () => {
      expect(provider.unaryTest('> 5', 10)).toBe(true);
      expect(provider.unaryTest('> 5', 3)).toBe(false);
    });

    it('matches less-than', () => {
      expect(provider.unaryTest('< 18', 10)).toBe(true);
      expect(provider.unaryTest('< 18', 20)).toBe(false);
    });

    it('matches equality (string)', () => {
      expect(provider.unaryTest('"A"', 'A')).toBe(true);
      expect(provider.unaryTest('"A"', 'B')).toBe(false);
    });

    it('treats dash as wildcard', () => {
      expect(provider.unaryTest('-', 42)).toBe(true);
      expect(provider.unaryTest('-', 'anything')).toBe(true);
    });

    it('treats empty string as wildcard', () => {
      expect(provider.unaryTest('', 42)).toBe(true);
    });

    it('matches ranges', () => {
      expect(provider.unaryTest('[1..10]', 5)).toBe(true);
      expect(provider.unaryTest('[1..10]', 15)).toBe(false);
    });

    it('uses context variables in unary tests', () => {
      expect(provider.unaryTest('> minAge', 20, { minAge: 18 })).toBe(true);
      expect(provider.unaryTest('> minAge', 15, { minAge: 18 })).toBe(false);
    });
  });

  describe('provider metadata', () => {
    it('has name "feelin"', () => {
      expect(provider.name).toBe('feelin');
    });
  });
});

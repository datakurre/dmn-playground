import { describe, it, expect } from 'vitest';

import { applyHitPolicy } from '../../src/engine/hit-policy.js';

describe('Hit Policies', () => {
  const outputNames = ['result'];

  function rule(id, index, outputs) {
    return { id, index, outputs };
  }

  describe('UNIQUE', () => {
    it('returns null when no rules match', () => {
      const hp = applyHitPolicy('UNIQUE', undefined, [], outputNames);
      expect(hp.result).toBe(null);
      expect(hp.error).toBeUndefined();
    });

    it('returns the single matched rule output', () => {
      const matched = [rule('r1', 0, { result: 'A' })];
      const hp = applyHitPolicy('UNIQUE', undefined, matched, outputNames);
      expect(hp.result).toEqual({ result: 'A' });
    });

    it('errors when multiple rules match', () => {
      const matched = [rule('r1', 0, { result: 'A' }), rule('r2', 1, { result: 'B' })];
      const hp = applyHitPolicy('UNIQUE', undefined, matched, outputNames);
      expect(hp.result).toBe(null);
      expect(hp.error).toContain('UNIQUE');
    });
  });

  describe('ANY', () => {
    it('returns null when no rules match', () => {
      const hp = applyHitPolicy('ANY', undefined, [], outputNames);
      expect(hp.result).toBe(null);
    });

    it('returns output when all matched rules have same output', () => {
      const matched = [rule('r1', 0, { result: 'X' }), rule('r2', 1, { result: 'X' })];
      const hp = applyHitPolicy('ANY', undefined, matched, outputNames);
      expect(hp.result).toEqual({ result: 'X' });
    });

    it('errors when matched rules have different outputs', () => {
      const matched = [rule('r1', 0, { result: 'X' }), rule('r2', 1, { result: 'Y' })];
      const hp = applyHitPolicy('ANY', undefined, matched, outputNames);
      expect(hp.error).toContain('ANY');
    });
  });

  describe('FIRST', () => {
    it('returns null when no rules match', () => {
      const hp = applyHitPolicy('FIRST', undefined, [], outputNames);
      expect(hp.result).toBe(null);
    });

    it('returns the first matched rule output', () => {
      const matched = [rule('r1', 0, { result: 'first' }), rule('r2', 1, { result: 'second' })];
      const hp = applyHitPolicy('FIRST', undefined, matched, outputNames);
      expect(hp.result).toEqual({ result: 'first' });
    });
  });

  describe('RULE ORDER', () => {
    it('returns empty array when no rules match', () => {
      const hp = applyHitPolicy('RULE ORDER', undefined, [], outputNames);
      expect(hp.result).toEqual([]);
    });

    it('returns all matched outputs in table order', () => {
      const matched = [
        rule('r1', 0, { result: 'A' }),
        rule('r3', 2, { result: 'C' }),
        rule('r2', 1, { result: 'B' }),
      ];
      const hp = applyHitPolicy('RULE ORDER', undefined, matched, outputNames);
      expect(hp.result).toEqual([{ result: 'A' }, { result: 'C' }, { result: 'B' }]);
    });
  });

  describe('COLLECT', () => {
    it('returns list of all matched outputs (no aggregation)', () => {
      const matched = [rule('r1', 0, { result: 10 }), rule('r2', 1, { result: 20 })];
      const hp = applyHitPolicy('COLLECT', undefined, matched, outputNames);
      expect(hp.result).toEqual([{ result: 10 }, { result: 20 }]);
    });

    it('COLLECT + SUM', () => {
      const matched = [
        rule('r1', 0, { result: 10 }),
        rule('r2', 1, { result: 20 }),
        rule('r3', 2, { result: 5 }),
      ];
      const hp = applyHitPolicy('COLLECT', 'SUM', matched, outputNames);
      expect(hp.result).toEqual({ result: 35 });
    });

    it('COLLECT + MIN', () => {
      const matched = [
        rule('r1', 0, { result: 10 }),
        rule('r2', 1, { result: 3 }),
        rule('r3', 2, { result: 20 }),
      ];
      const hp = applyHitPolicy('COLLECT', 'MIN', matched, outputNames);
      expect(hp.result).toEqual({ result: 3 });
    });

    it('COLLECT + MAX', () => {
      const matched = [
        rule('r1', 0, { result: 10 }),
        rule('r2', 1, { result: 3 }),
        rule('r3', 2, { result: 20 }),
      ];
      const hp = applyHitPolicy('COLLECT', 'MAX', matched, outputNames);
      expect(hp.result).toEqual({ result: 20 });
    });

    it('COLLECT + COUNT', () => {
      const matched = [
        rule('r1', 0, { result: 'a' }),
        rule('r2', 1, { result: 'b' }),
        rule('r3', 2, { result: 'c' }),
      ];
      const hp = applyHitPolicy('COLLECT', 'COUNT', matched, outputNames);
      expect(hp.result).toBe(3);
    });

    it('COLLECT + SUM with no matches returns zero', () => {
      const hp = applyHitPolicy('COLLECT', 'SUM', [], outputNames);
      expect(hp.result).toEqual({ result: 0 });
    });

    it('COLLECT + MIN with no matches returns null', () => {
      const hp = applyHitPolicy('COLLECT', 'MIN', [], outputNames);
      expect(hp.result).toBe(null);
    });

    it('COLLECT + COUNT with no matches returns zero', () => {
      const hp = applyHitPolicy('COLLECT', 'COUNT', [], outputNames);
      expect(hp.result).toBe(0);
    });
  });
});

import { describe, it, expect } from 'vitest';

import { FeelScalaProvider } from '../../src/engine/feel/feel-scala.js';
import {
  getAvailableProviders,
  getProvider,
  getCurrentProvider,
  setCurrentProvider,
  getCurrentProviderName,
  createDefaultProvider,
} from '../../src/engine/feel/registry.js';
import { FeelinProvider } from '../../src/engine/feel/feelin.js';

describe('FeelScalaProvider', () => {
  it('has name "feel-scala"', () => {
    const provider = new FeelScalaProvider();
    expect(provider.name).toBe('feel-scala');
  });

  it('throws when evaluate is called without initialization', () => {
    const provider = new FeelScalaProvider();
    expect(() => provider.evaluate('1 + 2')).toThrow(/not initialized/);
  });

  it('throws when unaryTest is called without initialization (non-wildcard)', () => {
    const provider = new FeelScalaProvider();
    expect(() => provider.unaryTest('> 5', 10)).toThrow(/not initialized/);
  });

  it('handles wildcard unary tests without initialization', () => {
    const provider = new FeelScalaProvider();
    expect(provider.unaryTest('-', 42)).toBe(true);
    expect(provider.unaryTest('', 42)).toBe(true);
    expect(provider.unaryTest('  ', 42)).toBe(true);
  });

  it('fails to initialize when bundle is not available', async () => {
    const provider = new FeelScalaProvider();
    await expect(provider.initialize()).rejects.toThrow(/not available/);
  });
});

describe('FEEL Provider Registry', () => {
  describe('getAvailableProviders()', () => {
    it('lists feelin as available', () => {
      const providers = getAvailableProviders();
      const feelin = providers.find((p) => p.name === 'feelin');
      expect(feelin).toBeDefined();
      expect(feelin.available).toBe(true);
    });

    it('lists feel-scala as not available (no bundle)', () => {
      const providers = getAvailableProviders();
      const scala = providers.find((p) => p.name === 'feel-scala');
      expect(scala).toBeDefined();
      expect(scala.available).toBe(false);
    });
  });

  describe('getProvider()', () => {
    it('returns a FeelinProvider for "feelin"', async () => {
      const provider = await getProvider('feelin');
      expect(provider).toBeInstanceOf(FeelinProvider);
      expect(provider.name).toBe('feelin');
    });

    it('throws for unknown provider name', async () => {
      await expect(getProvider('nonexistent')).rejects.toThrow(/[Uu]nknown/);
    });

    it('throws for feel-scala when bundle is unavailable', async () => {
      await expect(getProvider('feel-scala')).rejects.toThrow(/not available/);
    });

    it('caches provider instances', async () => {
      const p1 = await getProvider('feelin');
      const p2 = await getProvider('feelin');
      expect(p1).toBe(p2);
    });
  });

  describe('getCurrentProvider() / setCurrentProvider()', () => {
    it('defaults to feelin', () => {
      expect(getCurrentProviderName()).toBe('feelin');
    });

    it('returns feelin provider by default', async () => {
      setCurrentProvider('feelin');
      const provider = await getCurrentProvider();
      expect(provider.name).toBe('feelin');
    });

    it('falls back to feelin when feel-scala is not available', async () => {
      setCurrentProvider('feel-scala');
      const provider = await getCurrentProvider();
      // Falls back since feel-scala bundle isn't available
      expect(provider.name).toBe('feelin');
      // Reset
      setCurrentProvider('feelin');
    });
  });

  describe('createDefaultProvider()', () => {
    it('returns a FeelinProvider synchronously', () => {
      const provider = createDefaultProvider();
      expect(provider).toBeInstanceOf(FeelinProvider);
      expect(provider.name).toBe('feelin');
    });
  });
});

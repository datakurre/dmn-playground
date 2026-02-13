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

  it('successfully initializes when bundle is available', async () => {
    const provider = new FeelScalaProvider();
    await provider.initialize();
    // Basic smoke test
    const result = provider.evaluate('1 + 2');
    expect(result).toBe(3);
  });

  it('evaluates expressions after initialization', async () => {
    const provider = new FeelScalaProvider();
    await provider.initialize();
    expect(provider.evaluate('"hello"')).toBe('hello');
    expect(provider.evaluate('true')).toBe(true);
    expect(provider.evaluate('if 10 > 5 then "yes" else "no"')).toBe('yes');
  });

  it('evaluates unary tests after initialization', async () => {
    const provider = new FeelScalaProvider();
    await provider.initialize();
    expect(provider.unaryTest('> 5', 10)).toBe(true);
    expect(provider.unaryTest('> 5', 3)).toBe(false);
    expect(provider.unaryTest('"A"', 'A')).toBe(true);
    expect(provider.unaryTest('[1..10]', 5)).toBe(true);
    expect(provider.unaryTest('[1..10]', 15)).toBe(false);
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

    it('lists feel-scala as available (bundle present)', () => {
      const providers = getAvailableProviders();
      const scala = providers.find((p) => p.name === 'feel-scala');
      expect(scala).toBeDefined();
      expect(scala.available).toBe(true);
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

    it('returns a FeelScalaProvider for "feel-scala"', async () => {
      const provider = await getProvider('feel-scala');
      expect(provider).toBeInstanceOf(FeelScalaProvider);
      expect(provider.name).toBe('feel-scala');
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

    it('returns feel-scala provider when selected', async () => {
      setCurrentProvider('feel-scala');
      const provider = await getCurrentProvider();
      expect(provider.name).toBe('feel-scala');
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

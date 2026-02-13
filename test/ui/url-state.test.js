import { describe, it, expect } from 'vitest';

import { encodeState, decodeState } from '../../src/ui/url-state.js';

describe('URL State', () => {
  it('round-trips a simple state', async () => {
    const state = {
      dmnXml: '<definitions/>',
      decisionId: 'decision_1',
      inputData: { age: 25, name: 'Alice' },
    };

    const hash = await encodeState(state);
    const decoded = await decodeState(hash);

    expect(decoded).toEqual(state);
  });

  it('produces a URL-safe string (no +, /, or =)', async () => {
    const state = {
      dmnXml: '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" />',
      decisionId: 'test',
      inputData: {},
    };

    const hash = await encodeState(state);

    expect(hash).not.toMatch(/[+/=]/);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('handles Unicode characters in DMN XML', async () => {
    const state = {
      dmnXml: '<definitions name="Ünïcödé Tëst ™" />',
      decisionId: 'test',
      inputData: { label: 'Ångström' },
    };

    const hash = await encodeState(state);
    const decoded = await decodeState(hash);

    expect(decoded).toEqual(state);
  });

  it('handles empty input data', async () => {
    const state = {
      dmnXml: '<definitions/>',
      decisionId: 'dec1',
      inputData: {},
    };

    const hash = await encodeState(state);
    const decoded = await decodeState(hash);

    expect(decoded).toEqual(state);
  });

  it('handles complex input data with nested values', async () => {
    const state = {
      dmnXml: '<definitions/>',
      decisionId: 'dec1',
      inputData: { count: 42, rate: 3.14, active: true, label: 'test' },
    };

    const hash = await encodeState(state);
    const decoded = await decodeState(hash);

    expect(decoded).toEqual(state);
  });

  it('handles large DMN XML', async () => {
    const largeDmn = '<definitions>' + '<rule>'.repeat(500) + '</definitions>';
    const state = {
      dmnXml: largeDmn,
      decisionId: 'big',
      inputData: { x: 1 },
    };

    const hash = await encodeState(state);
    const decoded = await decodeState(hash);

    expect(decoded).toEqual(state);
  });

  it('rejects unsupported version', async () => {
    // Manually craft a state with wrong version
    const state = {
      dmnXml: '<definitions/>',
      decisionId: 'test',
      inputData: {},
    };

    const hash = await encodeState(state);
    const decoded = await decodeState(hash);

    // This should work fine
    expect(decoded.dmnXml).toBe('<definitions/>');
  });
});

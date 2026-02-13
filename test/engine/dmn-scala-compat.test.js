/**
 * Tests adapted from camunda/dmn-scala — decision table and literal expression
 * evaluation tests ported to verify compatibility with both feelin and feel-scala
 * FEEL providers.
 *
 * Source: https://github.com/camunda/dmn-scala
 *
 * These tests use the original DMN fixtures from the dmn-scala project and
 * verify that our JS DMN engine produces the same results.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { parseDmnXml } from '../../src/parser/parse.js';
import { evaluateDecision } from '../../src/engine/evaluate.js';
import { FeelinProvider } from '../../src/engine/feel/feelin.js';
import { FeelScalaProvider } from '../../src/engine/feel/feel-scala.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixtures, name), 'utf-8');
}

// ─── Test suite runner for a given FEEL provider ───────────────────

function defineProviderTests(providerName, getProvider) {
  describe(`dmn-scala compat: ${providerName}`, () => {
    /** @type {import('../../src/engine/feel/provider.js').FeelProvider} */
    let provider;

    beforeAll(async () => {
      provider = await getProvider();
    });

    // ── Discount (UNIQUE hit policy) ─────────────────────────────

    describe("Decision table 'Discount' (UNIQUE)", () => {
      it('returns 0.1 for Business, orderSize 7', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Business', orderSize: 7 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.1);
      });

      it('returns 0.15 for Business, orderSize 15', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Business', orderSize: 15 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.15);
      });

      it('returns 0.05 for Private, orderSize 9', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Private', orderSize: 9 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.05);
      });
    });

    // ── Person Loan Compliance (ANY hit policy) ──────────────────

    describe("Decision table 'Person Loan Compliance' (ANY)", () => {
      it("returns 'Not Compliant' for low credit rating", async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-person-loan-compliance.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'personLoanCompliance',
          { creditRating: 'B', creditBalance: 10000, loanBalance: 50000 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe('Not Compliant');
      });

      it("returns 'Compliant' for good credit", async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-person-loan-compliance.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'personLoanCompliance',
          { creditRating: 'A', creditBalance: 5000, loanBalance: 10000 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe('Compliant');
      });
    });

    // ── Special Discount (FIRST hit policy) ──────────────────────

    describe("Decision table 'Special Discount' (FIRST)", () => {
      it('returns 0 for Phone order', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-special-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'specialDiscount',
          { typeOfOrder: 'Phone', customerLocation: 'US', typeOfCustomer: 'Retailer' },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0);
      });

      it('returns 5 for Retailer in US via Web', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-special-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'specialDiscount',
          { typeOfOrder: 'Web', customerLocation: 'US', typeOfCustomer: 'Retailer' },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(5);
      });

      it('returns 10 for Wholesaler in US via Web', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-special-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'specialDiscount',
          { typeOfOrder: 'Web', customerLocation: 'US', typeOfCustomer: 'Wholesaler' },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(10);
      });

      it('returns 0 for Non-US customer', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-special-discount.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'specialDiscount',
          { typeOfOrder: 'Web', customerLocation: 'Non-US', typeOfCustomer: 'Retailer' },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0);
      });
    });

    // ── Holidays (COLLECT + SUM) ─────────────────────────────────

    describe("Decision table 'Holidays' (COLLECT+SUM)", () => {
      it('returns 30 for age 58, 31 years of service', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-holidays-collect-sum.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'holidays',
          { age: 58, yearsOfService: 31 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(30);
      });

      it('returns 22 for age 25, 2 years of service', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-holidays-collect-sum.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'holidays',
          { age: 25, yearsOfService: 2 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(22);
      });

      it('returns 27 for age 16, 1 year of service', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-holidays-collect-sum.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'holidays',
          { age: 16, yearsOfService: 1 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(27);
      });

      it('returns 24 for age 46, 19 years of service', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-holidays-collect-sum.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'holidays',
          { age: 46, yearsOfService: 19 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(24);
      });
    });

    // ── Discount (COLLECT + MAX) ─────────────────────────────────

    describe("Decision table 'Discount' (COLLECT+MAX)", () => {
      it('returns 0.1 for Business, orderSize 8', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount-collect-max.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Business', orderSize: 8 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.1);
      });

      it('returns 0.15 for Business, orderSize 12', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount-collect-max.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Business', orderSize: 12 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.15);
      });

      it('returns 0.06 for Private, orderSize 17', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount-collect-max.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Private', orderSize: 17 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.06);
      });

      it('returns 0.05 for Private, orderSize 13', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-discount-collect-max.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'discount',
          { customer: 'Private', orderSize: 13 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(0.05);
      });
    });

    // ── Insurance Fee (COLLECT + MIN) ────────────────────────────

    describe("Decision table 'Insurance Fee' (COLLECT+MIN)", () => {
      it('returns 200 for 1 year without incident', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-insurance-fee.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'insuranceFee',
          { years: 1 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(200);
      });

      it('returns 190 for 4 years without incident', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-insurance-fee.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'insuranceFee',
          { years: 4 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(190);
      });

      it('returns 100 for 16 years without incident', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-insurance-fee.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'insuranceFee',
          { years: 16 },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe(100);
      });
    });

    // ── Greeting (Literal Expression) ────────────────────────────

    describe("Literal expression 'Greeting'", () => {
      it('returns "Hello DMN"', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-greeting.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'greeting',
          { name: 'DMN' },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe('Hello DMN');
      });

      it('returns "Hello John"', async () => {
        const model = await parseDmnXml(loadFixture('dmn-scala-greeting.dmn'));
        const { result, error } = evaluateDecision(
          model,
          'greeting',
          { name: 'John' },
          { feelProvider: provider },
        );
        expect(error).toBeUndefined();
        expect(result).toBe('Hello John');
      });
    });
  });
}

// ─── Run tests for both FEEL providers ─────────────────────────────

defineProviderTests('feelin', async () => new FeelinProvider());

defineProviderTests('feel-scala', async () => {
  const provider = new FeelScalaProvider();
  await provider.initialize();
  return provider;
});

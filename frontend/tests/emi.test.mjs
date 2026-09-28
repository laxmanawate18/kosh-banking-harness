import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/common/Formatters.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { monthlyEmi, formatRupees, fdMaturity, rdMaturity, maxEligibleLoan } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('monthlyEmi matches the standard reducing-balance formula', () => {
  // ₹50,00,000 at 8.5% for 20 years ≈ ₹43,391
  assert.equal(Math.round(monthlyEmi(5_000_000, 8.5, 240)), 43391);
  assert.equal(monthlyEmi(120_000, 0, 12), 10_000);
  assert.equal(monthlyEmi(100_000, 10, 0), 0);
});

test('formatRupees uses Indian digit grouping', () => {
  assert.equal(formatRupees(4339123.4), '₹43,39,123');
});

test('deposit and eligibility maths match standard Indian bank calculators', () => {
  // ₹1,00,000 FD at 7% for 1 year, quarterly compounding
  assert.equal(Math.round(fdMaturity(100_000, 7, 1)), 107186);
  // ₹1,000/month RD at 7% for 12 months ≈ ₹12,462–12,463
  assert.ok(Math.abs(rdMaturity(1000, 7, 12) - 12463) <= 1);
  assert.equal(rdMaturity(1000, 0, 12), 12000);
  // ₹1,00,000 income, no EMIs: EMI budget ₹50,000 at 8.5% for 20y → ≈ ₹57.6 lakh
  assert.ok(Math.abs(maxEligibleLoan(100_000, 0, 8.5, 240) - 5_761_560) < 100);
  assert.equal(maxEligibleLoan(40_000, 25_000, 9, 120), 0);
});

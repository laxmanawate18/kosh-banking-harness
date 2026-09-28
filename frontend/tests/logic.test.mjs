import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = async (rel) => {
  const src = readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const { parseUpi } = await load('upi.ts');
const { festivalFor } = await load('festival.ts');

test('parseUpi accepts only well-formed upi://pay payloads', () => {
  assert.deepEqual(parseUpi('upi://pay?pa=priya.m@okhdfc&pn=Priya%20Mehta&am=250.00&cu=INR'), { pa: 'priya.m@okhdfc', pn: 'Priya Mehta', am: '250.00' });
  assert.equal(parseUpi('upi://pay?pn=NoAddress'), null);
  assert.equal(parseUpi('https://evil.example/pay?pa=a@b'), null);
  assert.equal(parseUpi('upi://pay?pa=<script>@x'), null);
  assert.equal(parseUpi('not a url'), null);
  assert.equal(parseUpi('upi://pay?pa=shop@ybl').pn, 'shop');
});

test('festivalFor picks the right window and honours overrides', () => {
  assert.equal(festivalFor(new Date(2026, 10, 8)), 'diwali');
  assert.equal(festivalFor(new Date(2026, 8, 25)), null);
  assert.equal(festivalFor(new Date(2027, 0, 26)), 'republic');
  assert.equal(festivalFor(new Date(2026, 8, 25), 'holi'), 'holi');
  assert.equal(festivalFor(new Date(2026, 8, 25), 'bogus'), null);
});

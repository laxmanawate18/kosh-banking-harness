import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const I18N = join(SRC, 'i18n');

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(name)) files.push(p);
  }
})(SRC);

const dict = Object.assign({}, ...readdirSync(I18N).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(I18N, f), 'utf8'))));

// Literal keys passed to t('...') / t("...") anywhere in the source.
const KEY = /\bt\(\s*(['"])((?:\\.|(?!\1).)+)\1/g;
const used = new Map();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(KEY)) {
    const key = m[2].replace(/\\(['"\\])/g, '$1');
    if (!used.has(key)) used.set(key, file.replace(SRC, ''));
  }
}

test('every t() key has Hindi and Marathi translations', () => {
  const missing = [...used].filter(([k]) => !dict[k]?.hi || !dict[k]?.mr).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, [], `Missing translations:\n${missing.join('\n')}`);
});

test('translations keep every {placeholder}', () => {
  const broken = [];
  for (const [key, entry] of Object.entries(dict)) {
    const vars = (key.match(/\{\w+\}/g) || []).sort().join();
    for (const lang of ['hi', 'mr']) {
      if (entry[lang] && (entry[lang].match(/\{\w+\}/g) || []).sort().join() !== vars) broken.push(`${lang}: ${key}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('translations are Devanagari, not copied English', () => {
  const copied = Object.entries(dict)
    .filter(([key, e]) => /[a-z]{3}/i.test(key) && (e.hi === key || e.mr === key) && !/^[A-Z0-9 .,+%₹/&()-]+$/.test(key))
    .map(([k]) => k);
  assert.deepEqual(copied, []);
});

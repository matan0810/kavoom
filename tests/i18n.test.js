// Every text the interface asks for exists in Hebrew and in English.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { POWERUPS } from '../shared/config.js';
import { translate } from '../src/i18n/strings.js';

async function sources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await sources(path)));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const exists = (key) =>
  ['he', 'en'].every((lang) => {
    const text = translate(lang, key, 1, 2, 3);
    return typeof text === 'string' && text !== key && text.trim() !== '';
  });

test("every t('key') in the code has a Hebrew and an English text", async () => {
  const root = new URL('../src', import.meta.url).pathname;
  const keys = new Set();
  for (const file of await sources(root)) {
    const code = (await readFile(file, 'utf8')).replace(/\/\/.*$/gm, ''); // comments hold examples
    for (const m of code.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 50, 'the scan found the keys');
  const missing = [...keys].filter((k) => !exists(k));
  assert.deepEqual(missing, []);
});

test('every power-up has a name and an explanation in both languages', () => {
  for (const def of POWERUPS) {
    assert.ok(exists(`pu_${def.id}`), def.id);
    assert.ok(exists(`pu_${def.id}_what`), def.id);
  }
});

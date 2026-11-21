// Rules about the repository itself (CLAUDE.md, sections 6 and 7), checked so they hold.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const workflows = async () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const names = (await readdir(dir)).filter((n) => n.endsWith('.yml'));
  return Promise.all(names.map(async (n) => [n, await readFile(new URL(n, dir), 'utf8')]));
};

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('dependencies run no code at install time', async () => {
  const npmrc = await read('.npmrc');
  assert.match(npmrc, /^ignore-scripts=true$/m);
});

test('package.json has no pre/post hooks, which ignore-scripts would silently skip', async () => {
  const { scripts } = JSON.parse(await read('package.json'));
  const hooks = Object.keys(scripts).filter((name) => /^(pre|post)/.test(name));
  assert.deepEqual(hooks, []);
  assert.match(scripts.test, /vite build/, 'npm test builds the site itself');
});

test('no workflow checkout keeps the token in .git/config', async () => {
  for (const [name, text] of await workflows()) {
    const steps = text.split(/\n(?=\s*- )/).filter((s) => /uses: actions\/checkout@/.test(s));
    for (const step of steps) assert.match(step, /persist-credentials: false/, name);
  }
});

test('workflows are read-only unless a job asks for more', async () => {
  for (const [name, text] of await workflows()) {
    assert.match(text, /^permissions:\n\s+contents: read$/m, name);
  }
});

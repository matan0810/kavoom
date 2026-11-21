import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyRelease,
  checkRelease,
  nextVersion,
  releasedSections,
  unreleasedNotes,
} from '../scripts/changelog.mjs';

const LOG = `# Changelog

## [Unreleased]

### Added
- Room passwords. _(Live since 2026-11-20, published without a version at the owner's request.)_
- Bigger buttons.

## [1.2.0] - 2026-11-14

### Fixed
- A crash.
`;

test('versions go up by the kind of change', () => {
  assert.equal(nextVersion('1.4.9', 'patch'), '1.4.10');
  assert.equal(nextVersion('1.4.9', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.9', 'major'), '2.0.0');
  assert.throws(() => nextVersion('1.4', 'patch'));
  assert.throws(() => nextVersion('1.4.0', 'huge'));
});

test('a release turns Unreleased into a dated section and drops the live marks', () => {
  const out = applyRelease(LOG, '1.3.0', '2026-11-21');
  assert.equal(unreleasedNotes(out), '');
  const [newest] = releasedSections(out);
  assert.equal(newest.version, '1.3.0');
  assert.equal(newest.date, '2026-11-21');
  assert.match(newest.body, /- Room passwords\.\n- Bigger buttons\./);
  assert.doesNotMatch(newest.body, /Live since/);
  assert.equal(releasedSections(out)[1].version, '1.2.0', 'older sections untouched');
});

test('an empty Unreleased section or a version already there is refused', () => {
  const empty = applyRelease(LOG, '1.3.0', '2026-11-21');
  assert.throws(() => applyRelease(empty, '1.4.0', '2026-11-22'), /nothing to release/);
  assert.throws(() => applyRelease(LOG, '1.2.0', '2026-11-22'), /already has a section/);
});

test('a release is checked before it reaches the shell', () => {
  const good = { version: '1.6.0', commit: 'a'.repeat(40), date: '2026-11-20' };
  assert.doesNotThrow(() => checkRelease(good));
  for (const bad of [
    { ...good, version: '1.6.0; rm -rf /' },
    { ...good, version: 'v1.6.0' },
    { ...good, commit: 'abc123' },
    { ...good, commit: `${'a'.repeat(39)}$` },
    { ...good, date: '20 Nov 2026' },
    { ...good, date: '' },
  ]) {
    assert.throws(() => checkRelease(bad), JSON.stringify(bad));
  }
});

test('the real CHANGELOG and release history agree', async () => {
  const read = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
  const sections = new Map(releasedSections(await read('CHANGELOG.md')).map((s) => [s.version, s]));
  const history = JSON.parse(await read('scripts/release-history.json'));
  const { version } = JSON.parse(await read('package.json'));
  assert.ok(sections.has(version), 'the current version has a section');
  for (const r of history) {
    const s = sections.get(r.version);
    assert.ok(s, `section for ${r.version}`);
    assert.doesNotThrow(() => checkRelease({ ...r, date: s.date }));
  }
});

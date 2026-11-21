// Prepares a release: bumps the version in package.json and package-lock.json (the only
// places it lives) and turns the Unreleased notes in CHANGELOG.md into a section dated today.
//
//   npm run bump -- patch|minor|major

import { readFile, writeFile } from 'node:fs/promises';
import { BUMPS, applyRelease, nextVersion } from './changelog.mjs';

const bump = process.argv[2];
if (!BUMPS.includes(bump)) {
  console.error(`Usage: npm run bump -- ${BUMPS.join('|')}`);
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const readJson = async (file) => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const writeJson = (file, data) =>
  writeFile(new URL(file, root), `${JSON.stringify(data, null, 2)}\n`);

const pkg = await readJson('package.json');
const version = nextVersion(pkg.version, bump);
const today = new Date().toISOString().slice(0, 10);
const changelogUrl = new URL('CHANGELOG.md', root);
const changelog = applyRelease(await readFile(changelogUrl, 'utf8'), version, today);

const lock = await readJson('package-lock.json');
lock.version = version;
lock.packages[''].version = version;
pkg.version = version;

await writeFile(changelogUrl, changelog);
await writeJson('package.json', pkg);
await writeJson('package-lock.json', lock);
console.log(`Version ${version}, dated ${today}. Commit it as "Release v${version}".`);

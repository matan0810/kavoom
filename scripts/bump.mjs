// Prepares a release on the dev branch:
//   npm run bump -- patch|minor|major
// Updates package.json, package-lock.json and shared/config.js, and turns the
// "Unreleased" section of CHANGELOG.md into the new version's section.

import { readFile, writeFile } from 'node:fs/promises';

const kind = process.argv[2];
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: npm run bump -- patch|minor|major');
  process.exit(1);
}

const read = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const write = (f, s) => writeFile(new URL(`../${f}`, import.meta.url), s);

const pkg = JSON.parse(await read('package.json'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
const next = kind === 'major' ? `${maj + 1}.0.0` : kind === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;

const log = await read('CHANGELOG.md');
const unreleased = /## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/.exec(log);
if (!unreleased || !unreleased[1].trim()) {
  console.error('CHANGELOG.md has nothing under "## [Unreleased]". Describe the changes first.');
  process.exit(1);
}
const date = new Date().toISOString().slice(0, 10);
await write('CHANGELOG.md', log.replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${next}] - ${date}\n`));

pkg.version = next;
await write('package.json', JSON.stringify(pkg, null, 2) + '\n');

const lock = JSON.parse(await read('package-lock.json'));
lock.version = next;
if (lock.packages && lock.packages['']) lock.packages[''].version = next;
await write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

const config = await read('shared/config.js');
await write('shared/config.js', config.replace(/export const VERSION = '[^']*';/, `export const VERSION = '${next}';`));

console.log(`Version ${next} is ready. Commit it as "Release v${next}" and merge dev into main.`);

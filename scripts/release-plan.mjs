// Lists every release that should exist on GitHub: the past ones in release-history.json
// and the current version at the given commit. Writes each release's notes to a file and
// prints one tab-separated line per release, oldest first:
//
//   tag  commit  title  notes-file  is-latest
//
//   node scripts/release-plan.mjs <current version's commit> <notes directory>
//
// The Tag workflow creates whichever of these do not exist yet. (1.0.0 predates tagging and
// has no commit on record, so it is not in the history.)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkRelease, releasedSections } from './changelog.mjs';

const [currentCommit, notesDir] = process.argv.slice(2);
if (!currentCommit || !notesDir) {
  console.error('Usage: node scripts/release-plan.mjs <current commit> <notes directory>');
  process.exit(1);
}

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');
const { version: currentVersion } = JSON.parse(await read('package.json'));
const history = JSON.parse(await read('scripts/release-history.json'));
const sections = new Map(releasedSections(await read('CHANGELOG.md')).map((s) => [s.version, s]));

const releases = [
  ...history.filter((r) => r.version !== currentVersion),
  { version: currentVersion, commit: currentCommit },
];
await mkdir(notesDir, { recursive: true });

for (const { version, commit } of releases) {
  const section = sections.get(version);
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}`);
  checkRelease({ version, commit, date: section.date });
  const notesFile = join(notesDir, `v${version}.md`);
  await writeFile(notesFile, `${section.body}\n`);
  const title = `KAVOOM v${version}`;
  console.log([`v${version}`, commit, title, notesFile, version === currentVersion].join('\t'));
}

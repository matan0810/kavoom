// Prints the CHANGELOG.md section for one version, for the GitHub release page.
//   node scripts/release-notes.mjs 1.2.0

import { readFile } from 'node:fs/promises';

const version = process.argv[2];
const log = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const esc = version.replace(/\./g, '\\.');
const match = new RegExp(`## \\[${esc}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`).exec(log);
console.log(match ? match[1].trim() : `KAVOOM ${version}`);

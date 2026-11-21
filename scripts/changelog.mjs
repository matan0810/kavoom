// Pure helpers for CHANGELOG.md and version numbers, shared by the bump and release
// scripts and tested in tests/changelog.test.js.

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const SECTION_PATTERN = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/gm;

// The note on an Unreleased line already published without a version (CLAUDE.md, section 9).
const LIVE_MARK = / _\(Live since \d{4}-\d{2}-\d{2}, published without a version[^)]*\)_/g;

export const BUMPS = ['patch', 'minor', 'major'];

export function nextVersion(current, bump) {
  const match = VERSION_PATTERN.exec(current);
  if (!match) throw new Error(`Not a MAJOR.MINOR.PATCH version: ${current}`);
  if (!BUMPS.includes(bump)) throw new Error(`Not a bump: ${bump}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// The changelog's `## [...]` sections, in file order.
function sections(changelog) {
  const headings = [...changelog.matchAll(SECTION_PATTERN)];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? changelog.length;
    return { name: heading[1], date: heading[2] ?? '', body: changelog.slice(start, end).trim() };
  });
}

export function unreleasedNotes(changelog) {
  return sections(changelog).find((s) => s.name === 'Unreleased')?.body ?? '';
}

// Every released section: { version, date, body }.
export function releasedSections(changelog) {
  return sections(changelog)
    .filter((s) => s.name !== 'Unreleased')
    .map(({ name, date, body }) => ({ version: name, date, body }));
}

// Turns the Unreleased notes into a section for `version` dated `date`, leaving an empty
// Unreleased section above it, and drops the marks of lines that went live without a version.
export function applyRelease(changelog, version, date) {
  const notes = unreleasedNotes(changelog);
  if (!notes) throw new Error('The Unreleased section is empty: there is nothing to release');
  if (releasedSections(changelog).some((s) => s.version === version)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  const heading = '## [Unreleased]';
  const start = changelog.indexOf(heading) + heading.length;
  const end = start + changelog.slice(start).indexOf(notes) + notes.length;
  const body = notes.replace(LIVE_MARK, '');
  return `${changelog.slice(0, start)}\n\n## [${version}] - ${date}\n\n${body}${changelog.slice(end)}`;
}

// A release about to be created: the tag, the commit and the date become arguments of
// `gh release create` and fields of a tab-separated plan, so each is checked to be exactly
// what it claims before it gets there.
export function checkRelease({ version, commit, date }) {
  if (!VERSION_PATTERN.test(version))
    throw new Error(`Not a MAJOR.MINOR.PATCH version: ${version}`);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a full commit hash: ${commit}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
}

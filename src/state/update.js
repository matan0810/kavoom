// Is a newer version of the game live than the one on screen? A phone that saved the game
// opens the saved copy first, so a release shows only on the next visit unless the player
// is told. The site's /version answer is outside data: anything but a plain version is
// ignored.

const PLAIN = /^(\d+)\.(\d+)\.(\d+)$/;

export function liveVersion(body) {
  try {
    const version = JSON.parse(body)?.version;
    return typeof version === 'string' && PLAIN.test(version) ? version : null;
  } catch {
    return null;
  }
}

// Only a newer live version counts: during a deploy the old server may still answer, and a
// page that is already new must not be told to go back.
export function isNewer(live, current) {
  const a = PLAIN.exec(live ?? '');
  const b = PLAIN.exec(current ?? '');
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  }
  return false;
}

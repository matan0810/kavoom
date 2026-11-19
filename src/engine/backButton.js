// Makes the browser's Back button (and the phone's back gesture) step back
// inside the game instead of leaving the site.
//
// Anything that covers the menu is a "layer": the game screen, an open dialog,
// an online room. Each open layer owns one browser history entry, so Back has
// something to go back to. When Back is pressed, the top layer hears about it
// through its onBack function and closes itself.
//
// A "sticky" layer stays open on Back (the game screen: Back opens its menu
// instead of throwing the match away), so its history entry is put back.

const layers = []; // bottom to top: { onBack, sticky }
let depth = 0; // how many history entries we currently own
let ignore = 0; // popstate events caused by our own history.go()
let scheduled = false;

// history.go() is asynchronous: the browser moves later and then reports it
// with a popstate event. Until that report comes, adding entries would land in
// the wrong place, so syncing waits for it. If no report comes (a jump past the
// start of the history does nothing), the wait ends after a moment.
let travelTimer = 0;
function travel(steps) {
  ignore++;
  history.go(steps);
  clearTimeout(travelTimer);
  travelTimer = setTimeout(() => {
    if (ignore === 0) return;
    ignore = 0;
    schedule();
  }, 1000);
}

// Bring the browser history in line with the open layers. Runs once per tick,
// so closing one layer and opening another in the same moment costs nothing.
function sync() {
  scheduled = false;
  if (ignore > 0) return; // a move is under way; its popstate will sync again
  const want = layers.length;
  if (want > depth) {
    for (let d = depth + 1; d <= want; d++) history.pushState({ kavoomDepth: d }, '');
  } else if (want < depth) {
    travel(want - depth);
  }
  depth = want;
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(sync);
}

// How layers stack, whatever order they open in: a dialog is above the game,
// the game is above the online room. (After a reload, the room and the game
// come back in the same moment, in either order.)
export const LEVELS = { room: 1, game: 2, dialog: 3 };

export function addLayer(onBack, sticky = false, level = LEVELS.dialog) {
  const layer = { onBack, sticky, level };
  const above = layers.findIndex((l) => l.level > level);
  if (above < 0) layers.push(layer);
  else layers.splice(above, 0, layer);
  schedule();
  return layer;
}

export function removeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i < 0) return; // already closed by the Back button
  layers.splice(i, 1);
  schedule();
}

function onPopState(e) {
  if (ignore > 0) {
    ignore--;
    if (ignore === 0) schedule(); // layers opened meanwhile get their entries now
    return;
  }
  const at = (e.state && e.state.kavoomDepth) || 0;
  if (at > depth) {
    // Forward button: there is nothing to go forward to, so undo it.
    travel(depth - at);
    return;
  }
  depth = at;
  // One press closes one layer, however far the browser actually jumped.
  const top = layers[layers.length - 1];
  if (top) {
    if (!top.sticky) layers.pop();
    top.onBack();
  }
  schedule();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPopState);
  // After a reload the page starts at the menu, but the tab may still hold
  // entries from before. Walk back over them so Back is not a dead key.
  const stale = (history.state && history.state.kavoomDepth) || 0;
  if (stale > 0) travel(-stale);
}

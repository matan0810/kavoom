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

// Bring the browser history in line with the open layers. Runs once per tick,
// so closing one layer and opening another in the same moment costs nothing.
function sync() {
  scheduled = false;
  const want = layers.length;
  if (want > depth) {
    for (let d = depth + 1; d <= want; d++) history.pushState({ kavoomDepth: d }, '');
  } else if (want < depth) {
    ignore++;
    history.go(want - depth);
  }
  depth = want;
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(sync);
}

export function addLayer(onBack, sticky = false) {
  const layer = { onBack, sticky };
  layers.push(layer);
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
    return;
  }
  const at = (e.state && e.state.kavoomDepth) || 0;
  if (at > depth) {
    // Forward button: there is nothing to go forward to, so undo it.
    ignore++;
    history.go(depth - at);
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
  if (stale > 0) {
    ignore++;
    history.go(-stale);
  }
}

// Menu, game loop and the match state machine, for both local and online play:
//   menu -> countdown -> playing -> roundEnd -> countdown ... -> matchEnd
// Local: this file runs the simulation. Online: the server runs it and this
// file draws the snapshots it sends.

import { ARENA, DT, PALETTE, PLAYER_COLORS, DEFAULT_COLORS, DEFAULT_KEYS, LENGTHS, POWERUPS, FX_KEYS, SERVER_URL, MAX_PLAYERS, makeRng } from './config.js';
import { Round } from './sim/round.js';
import { Match } from './sim/match.js';
import { Renderer } from './render.js';
import { Input, keyLabel } from './input.js';
import { Sfx } from './audio.js';
import { Net } from './net.js';
import { t, setLang, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'kavoom.settings.v1';
const DEMO = window.innerWidth < 700 ? { w: 720, h: 420 } : { w: 1120, h: 300 };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const ONLINE_KEYS = [['ArrowLeft', 'ArrowRight'], ['KeyA', 'KeyD']];
const NO_FX = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));

// ---------- Settings ----------

function defaults() {
  return {
    lang: (navigator.language || 'he').startsWith('he') ? 'he' : 'en',
    tab: 'local',
    players: DEFAULT_COLORS.map((color, i) => ({
      mode: i === 0 ? 'human' : i < 3 ? 'bot' : 'off',
      name: '', // empty = show the colour's name
      color,
      keys: [...DEFAULT_KEYS[i]],
    })),
    length: 'normal',
    botLevel: 'medium',
    powerups: 'on',
    sound: 'on',
    volume: 0.7,
    shake: 'on',
    pads: 'auto',
    online: { name: '', color: 0 },
  };
}

const CHOICES = {
  lang: ['he', 'en'], tab: ['local', 'online'], length: Object.keys(LENGTHS), botLevel: ['easy', 'medium', 'hard'],
  powerups: ['on', 'off'], sound: ['on', 'off'], shake: ['on', 'off'], pads: ['auto', 'on', 'off'],
};
const validColor = (c) => Number.isInteger(c) && c >= 0 && c < PALETTE.length;

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved) return base;
    for (const k in CHOICES) if (CHOICES[k].includes(saved[k])) base[k] = saved[k];
    if (typeof saved.volume === 'number') base.volume = Math.min(1, Math.max(0, saved.volume));
    (saved.players || []).slice(0, MAX_PLAYERS).forEach((p, i) => {
      const slot = base.players[i];
      if (['human', 'bot', 'off'].includes(p.mode)) slot.mode = p.mode;
      if (typeof p.name === 'string') slot.name = p.name.slice(0, 10);
      if (validColor(p.color)) slot.color = p.color;
      if (Array.isArray(p.keys) && p.keys.length === 2 && p.keys.every((c) => typeof c === 'string')) slot.keys = p.keys;
    });
    if (new Set(base.players.map((p) => p.color)).size < MAX_PLAYERS) base.players.forEach((p, i) => (p.color = DEFAULT_COLORS[i]));
    if (saved.online) {
      if (typeof saved.online.name === 'string') base.online.name = saved.online.name.slice(0, 10);
      if (validColor(saved.online.color)) base.online.color = saved.online.color;
    }
  } catch { /* storage unavailable: defaults are fine */ }
  return base;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

const settings = load();
const input = new Input();
const sfx = new Sfx();
const colorName = (i) => PALETTE[i][getLang()];
const slotName = (p) => p.name || colorName(p.color);

// ---------- Small DOM helpers ----------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function button(label, cls, fn) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

// A row of mutually exclusive buttons.
function segGroup(label, options, current, onPick, disabled = false) {
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', label);
  for (const [val, text] of options) {
    const b = button(text, '', () => onPick(val));
    b.setAttribute('aria-pressed', String(val === current));
    b.disabled = disabled;
    seg.append(b);
  }
  return seg;
}

function swatches(current, taken, onPick) {
  const row = el('div', 'swatches');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', t('pickColor'));
  PALETTE.forEach((c, i) => {
    const b = button('', 'swatch', () => onPick(i));
    b.style.setProperty('--c', c.hex);
    b.setAttribute('aria-label', colorName(i));
    b.setAttribute('aria-pressed', String(i === current));
    b.disabled = taken.has(i) && i !== current;
    row.append(b);
  });
  return row;
}

function settingRow(label, control) {
  const row = el('div', 'setting');
  row.append(el('span', 'setting-name', label), control);
  return row;
}

// ---------- Game state ----------

$('demo').style.aspectRatio = `${DEMO.w} / ${DEMO.h}`;
const demoRenderer = new Renderer($('demo'), DEMO.w, DEMO.h, { calm: reducedMotion });
const renderer = new Renderer($('arena'), ARENA.w, ARENA.h, { calm: reducedMotion });
input.bindTouch($('arenaWrap'));

let state = 'menu';
let mode = 'local';
let paused = false;
let participants = []; // local match only
let match = null;
let round = null;
let view = null; // what the renderer draws: a Round, or a snapshot shaped like one
let hud = { names: [], colors: [], scores: [], live: null, target: 0, roundNo: 1 };
let acc = 0;
let timer = 0;
let lastCount = 0;
let demo = null;
let demoRest = 0;
let rebinding = null; // { slot, side, el }
let openPicker = -1;
let overlay = null; // { kind, spec } currently shown
const padState = new Map(); // player index -> { l, r }
const online = { net: null, you: 0, room: null, status: '', busy: false, myIndex: -1, code: '', lastDir: 0, draw: null };

function applySettings() {
  setLang(settings.lang);
  sfx.enabled = settings.sound === 'on';
  sfx.volume = settings.volume;
  renderer.calm = reducedMotion || settings.shake === 'off';
}

// ---------- Menu ----------

function renderStatic() {
  const app = $('app');
  const dir = settings.lang === 'he' ? 'rtl' : 'ltr';
  for (const node of [app, document.documentElement]) {
    node.lang = settings.lang;
    node.dir = dir;
  }
  document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
    const key = seg.dataset.key;
    seg.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(settings[key] === b.dataset.val));
      b.onclick = () => {
        settings[key] = b.dataset.val;
        save();
        renderAll();
      };
    });
  });
  $('localPane').hidden = settings.tab !== 'local';
  $('onlinePane').hidden = settings.tab !== 'online';
  $('onlineName').placeholder = t('yourName');
  $('onlineName').setAttribute('aria-label', t('yourName'));
  renderGameLabels();
}

function renderSlots() {
  const list = $('slots');
  list.textContent = '';
  settings.players.forEach((p, i) => {
    const li = el('li', 'slot' + (p.mode === 'off' ? ' off' : ''));
    li.style.setProperty('--c', PALETTE[p.color].hex);

    const dot = button('', 'dot', () => {
      openPicker = openPicker === i ? -1 : i;
      renderSlots();
    });
    dot.setAttribute('aria-label', `${t('pickColor')}: ${colorName(p.color)}`);
    dot.setAttribute('aria-expanded', String(openPicker === i));
    li.append(dot);

    const name = el('input', 'slot-name');
    name.id = `name-${i}`;
    name.value = slotName(p);
    name.maxLength = 10;
    name.setAttribute('aria-label', t('playerName', i + 1));
    name.addEventListener('input', () => {
      const v = name.value.trim();
      p.name = v === colorName(p.color) ? '' : v;
      save();
    });
    li.append(name);

    li.append(segGroup(t('playerName', i + 1), [['off', t('modeOff')], ['human', t('modeHuman')], ['bot', t('modeBot')]], p.mode, (val) => {
      p.mode = val;
      save();
      renderSlots();
    }));

    if (p.mode === 'human') {
      const keys = el('div', 'slot-keys');
      [[t('left'), 0], [t('right'), 1]].forEach(([label, side]) => {
        keys.append(el('span', '', label));
        const cap = button(keyLabel(p.keys[side]), 'keycap', () => {
          if (rebinding) rebinding.el.classList.remove('listening');
          rebinding = { slot: i, side, el: cap };
          cap.classList.add('listening');
          cap.textContent = t('pressKey');
        });
        keys.append(cap);
      });
      li.append(keys);
    } else if (p.mode === 'bot') {
      li.append(el('div', 'slot-keys', t('cpu')));
    }

    if (openPicker === i) {
      const row = swatches(p.color, new Set(), (c) => {
        // A colour that another slot holds is swapped with this one.
        const other = settings.players.find((q) => q !== p && q.color === c);
        if (other) other.color = p.color;
        p.color = c;
        openPicker = -1;
        save();
        renderSlots();
      });
      row.classList.add('slot-pick');
      li.append(row);
    }
    list.append(li);
  });

  const active = settings.players.filter((p) => p.mode !== 'off').length;
  $('start').disabled = active < 2;
  $('startHint').textContent = active < 2 ? t('needTwo') : t('startHint', active, LENGTHS[settings.length] * (active - 1));
}

function finishRebind(code) {
  const { slot, side } = rebinding;
  rebinding = null;
  if (code !== 'Escape') {
    const mine = settings.players[slot].keys;
    for (const p of settings.players) {
      const j = p.keys.indexOf(code);
      if (j >= 0) p.keys[j] = mine[side]; // taken key: the two bindings swap
    }
    mine[side] = code;
    save();
  }
  renderSlots();
}

function renderAll() {
  applySettings();
  renderStatic();
  renderSlots();
  renderOnline();
  if (state !== 'menu') {
    renderScores();
    if (overlay) showOverlay(overlay.kind, overlay.build);
  }
}

// ---------- Online lobby ----------

const me = () => (online.room ? online.room.members.find((m) => m.id === online.you) : null);
const isHost = () => !!online.room && online.room.host === online.you;
const identity = () => ({ name: settings.online.name.trim() || t('player'), color: settings.online.color });

function setStatus(key) {
  online.status = key;
  renderOnline();
}

function renderOnline() {
  const room = online.room;
  const taken = new Set(room ? room.members.filter((m) => m.id !== online.you).map((m) => m.color) : []);
  const mine = me();
  $('onlineColors').replaceChildren(swatches(mine ? mine.color : settings.online.color, taken, (c) => {
    settings.online.color = c;
    save();
    if (online.net && room) online.net.send({ t: 'color', color: c });
    else renderOnline();
  }));
  if ($('onlineName') !== document.activeElement) $('onlineName').value = settings.online.name;

  const side = $('onlineSide');
  side.textContent = '';
  if (!room) {
    side.append(el('h2', '', t('tabOnline')));
    const create = button(t('createRoom'), 'btn primary big', () => goOnline({ t: 'create', ...identity() }));
    const code = el('input', 'field code');
    code.id = 'roomCode';
    code.maxLength = 4;
    code.placeholder = t('roomCode');
    code.setAttribute('aria-label', t('roomCode'));
    code.autocomplete = 'off';
    code.value = online.code;
    const join = button(t('joinRoom'), 'btn', () => goOnline({ t: 'join', code: online.code, ...identity() }));
    join.disabled = online.code.length !== 4;
    code.addEventListener('input', () => {
      online.code = code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '');
      join.disabled = online.code.length !== 4;
    });
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !join.disabled) join.click();
    });
    const row = el('div', 'join-row');
    row.append(code, join);
    side.append(create, row);
    create.disabled = online.busy;
    if (online.busy) join.disabled = true;
  } else {
    const head = el('div', 'room-head');
    const title = el('h2', '', t('room', ''));
    const codeEl = el('span', 'room-code', room.code);
    codeEl.dir = 'ltr';
    title.append(codeEl);
    const copy = button(t('copyLink'), 'btn', () => {
      const link = `${location.origin}${location.pathname}#${room.code}`;
      const done = () => (copy.textContent = t('copied'));
      const fallback = () => {
        const box = el('input', 'field');
        box.readOnly = true;
        box.value = link;
        box.dir = 'ltr';
        copy.replaceWith(box);
        box.select();
      };
      try {
        navigator.clipboard.writeText(link).then(done, fallback);
      } catch {
        fallback();
      }
    });
    head.append(title, copy);
    side.append(head);

    const list = el('ul', 'slots');
    for (const m of room.members) {
      const li = el('li', 'member');
      li.style.setProperty('--c', PALETTE[m.color].hex);
      li.append(el('span', 'dot'), el('span', 'who', m.name + (m.id === online.you ? ` (${t('you')})` : '')));
      if (m.id === room.host) li.append(el('span', 'tag', t('host')));
      else if (!m.on) li.append(el('span', 'tag', t('away')));
      else if (m.bot && isHost() && room.state === 'lobby') li.append(button(t('remove'), 'btn small', () => online.net.send({ t: 'removeBot', id: m.id })));
      else if (m.bot) li.append(el('span', 'tag', t('modeBot')));
      list.append(li);
    }
    side.append(list);

    const locked = !isHost() || room.state !== 'lobby';
    const set = (key) => (val) => online.net.send({ t: 'set', key, val });
    const s = room.settings;
    side.append(
      settingRow(t('length'), segGroup(t('length'), [['short', t('short')], ['normal', t('normal')], ['long', t('long')]], s.length, set('length'), locked)),
      settingRow(t('botLevel'), segGroup(t('botLevel'), [['easy', t('easy')], ['medium', t('medium')], ['hard', t('hard')]], s.botLevel, set('botLevel'), locked)),
      settingRow(t('powerups'), segGroup(t('powerups'), [['on', t('on')], ['off', t('off')]], s.powerups, set('powerups'), locked)),
    );

    const actions = el('div', 'room-actions');
    if (room.state !== 'lobby') {
      side.append(el('p', 'hint', t('matchRunning')));
    } else if (isHost()) {
      const add = button(t('addBot'), 'btn', () => online.net.send({ t: 'addBot' }));
      add.disabled = room.members.length >= MAX_PLAYERS;
      const start = button(t('start'), 'btn primary', () => online.net.send({ t: 'start' }));
      start.disabled = room.members.length < 2;
      actions.append(start, add);
      if (room.members.length < 2) side.append(el('p', 'hint', t('needTwo')));
    } else {
      side.append(el('p', 'hint', t('waitingHost')));
    }
    actions.append(button(t('leaveYes'), 'btn', () => leaveRoom()));
    side.append(actions);
  }
  const status = el('p', 'hint', online.status ? t(online.status) : '');
  status.setAttribute('role', 'status');
  side.append(status);
}

function serverUrl() {
  return SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

async function goOnline(first) {
  if (online.busy) return;
  online.busy = true;
  setStatus('connecting');
  const net = new Net(serverUrl(), {
    message: (m) => net === online.net && onNet(m),
    status: (s) => net === online.net && setStatus(s === 'ok' ? '' : 'reconnecting'),
    down: () => net === online.net && onNetDown(),
  }, identity);
  online.net = net;
  try {
    await net.open();
    online.busy = false;
    setStatus('');
    net.send(first);
  } catch {
    online.net = null;
    online.busy = false;
    setStatus('noServer');
  }
}

function leaveRoom(status = '') {
  if (online.net) {
    online.net.send({ t: 'leave' });
    online.net.close();
  }
  online.net = null;
  online.room = null;
  online.status = status;
  if (mode === 'online' && state !== 'menu') toMenu();
  else renderOnline();
  if (location.hash) history.replaceState(null, '', location.pathname);
}

function onNetDown() {
  online.net = null;
  leaveRoom('lost');
}

function onNet(m) {
  switch (m.t) {
    case 'joined':
      online.you = m.you;
      online.code = m.code;
      break;
    case 'room':
      online.room = m;
      online.status = '';
      renderOnline();
      if (overlay && overlay.kind === 'end') showOverlay('end', overlay.build); // host may have changed
      break;
    case 'round':
      onRound(m);
      break;
    case 's':
      onSnapshot(m);
      break;
    case 'roundEnd':
      onRoundEnd(m);
      break;
    case 'error':
      online.net.close();
      online.net = null;
      setStatus({ noroom: 'errNoroom', full: 'errFull', busy: 'errBusy' }[m.code] || 'lost');
      break;
  }
}

function onRound(m) {
  mode = 'online';
  online.myIndex = m.order.indexOf(online.you);
  online.lastDir = 0;
  hud = { names: m.names, colors: m.colors.map((c) => PALETTE[c].hex), scores: m.scores, live: m.order.map(() => 0), target: m.target, roundNo: m.roundNo };
  renderer.reset(hud.colors);
  online.draw = renderer.hooks();
  view = { players: [], items: [], wrap: 0 };
  for (const g of m.segs) online.draw.segment({ id: g[0] }, g[1], g[2], g[3], g[4], g[5]);
  state = 'countdown';
  lastCount = 0;
  paused = false;
  enterGame();
}

function onSnapshot(m) {
  if (mode !== 'online' || !view || state === 'menu' || state === 'matchEnd') return;
  const first = view.players.length === 0;
  view.players = m.p.map((a, id) => ({
    id, x: a[0], y: a[1], angle: a[2], alive: !!a[3], r: a[4],
    fx: a[5] ? Object.fromEntries(FX_KEYS.map((k, i) => [k, a[5][i]])) : NO_FX,
  }));
  view.items = m.it.map((a) => ({ def: POWERUPS[a[0]], x: a[1], y: a[2], life: a[3] }));
  view.wrap = m.wr;
  const draw = online.draw;
  for (const g of m.g) draw.segment({ id: g[0] }, g[1], g[2], g[3], g[4], g[5]);
  let died = false;
  for (const e of m.e) {
    if (e[0] === 'd') {
      draw.death({ id: e[1], x: e[2], y: e[3] });
      sfx.death();
      died = true;
    } else if (e[0] === 'k') {
      draw.pickup({ id: e[1] }, { x: e[2], y: e[3], def: POWERUPS[e[4]] });
      sfx.pickup();
    } else if (e[0] === 'c') {
      draw.clear();
      sfx.clear();
    }
  }
  hud.live = m.pts;
  if (m.ph === 'c') {
    state = 'countdown';
    showCount(m.cd);
  } else if (state === 'countdown') {
    state = 'playing';
    $('count').hidden = true;
    sfx.go();
  } else if (state === 'roundEnd') {
    return;
  }
  if (died || first) renderScores();
}

function onRoundEnd(m) {
  if (mode !== 'online' || state === 'menu') return;
  hud.scores = m.scores;
  finishRound(m.winner, m.champion, m.rounds);
}

// ---------- Local match ----------

function startMatch() {
  participants = settings.players.filter((p) => p.mode !== 'off').map((p) => ({ ...p, name: slotName(p), hex: PALETTE[p.color].hex }));
  if (participants.length < 2) return;
  mode = 'local';
  match = new Match(participants.length, LENGTHS[settings.length]);
  hud = { names: participants.map((p) => p.name), colors: participants.map((p) => p.hex), scores: match.scores, live: null, target: match.target, roundNo: 1 };
  startRound();
}

function startRound() {
  renderer.reset(hud.colors);
  const draw = renderer.hooks();
  round = new Round({
    w: ARENA.w,
    h: ARENA.h,
    players: participants.map((p) => ({ bot: p.mode === 'bot' ? settings.botLevel : null })),
    rng: makeRng((Math.random() * 2 ** 32) >>> 0),
    powerups: settings.powerups === 'on',
    hooks: {
      segment: draw.segment,
      death: (p) => {
        draw.death(p);
        sfx.death();
        renderScores();
      },
      pickup: (p, it) => {
        draw.pickup(p, it);
        sfx.pickup();
      },
      clear: () => {
        draw.clear();
        sfx.clear();
      },
    },
  });
  view = round;
  hud.live = round.points;
  hud.roundNo = match.roundNo + 1;
  state = 'countdown';
  paused = false;
  timer = 2.4;
  lastCount = 0;
  acc = 0;
  enterGame();
}

function endRound() {
  match.applyRound(round.points);
  finishRound(round.winner, match.winner(), match.roundNo);
}

// ---------- Shared game screen ----------

function show(screen) {
  $('menu').hidden = screen !== 'menu';
  $('game').hidden = screen !== 'game';
}

function enterGame() {
  show('game');
  $('banner').hidden = true;
  $('count').hidden = true;
  if (!overlay || overlay.kind !== 'settings') hideOverlay();
  buildPads();
  renderGameLabels();
  renderScores();
  try {
    navigator.wakeLock?.request('screen').catch(() => {});
  } catch { /* optional */ }
}

function renderGameLabels() {
  $('roundLabel').textContent = t('round', hud.roundNo);
  $('targetLabel').textContent = t('target', hud.target);
  $('pauseBtn').hidden = mode === 'online';
  $('pauseBtn').textContent = paused ? t('resume') : t('pause');
  $('quitBtn').textContent = mode === 'online' ? t('leave') : t('menu');
}

function showCount(left) {
  const n = Math.ceil(left / 0.8);
  if (n === lastCount || n <= 0) return;
  lastCount = n;
  $('count').textContent = String(n);
  $('count').hidden = false;
  sfx.tick();
}

// Round is over. winner and champion are player indexes, or -1.
function finishRound(winner, champion, rounds) {
  state = champion >= 0 ? 'matchEnd' : 'roundEnd'; // set first: scores are no longer live
  renderScores();
  if (champion >= 0) {
    sfx.win();
    showOverlay('end', () => {
      const hostCanStart = mode === 'online' && isHost();
      const actions = mode === 'local'
        ? [[t('rematch'), startMatch, true], [t('mainMenu'), toMenu]]
        : hostCanStart
          ? [[t('rematch'), () => online.net.send({ t: 'start' }), true], [t('backToRoom'), toMenu]]
          : [[t('backToRoom'), toMenu, true]];
      const text = t('afterRounds', rounds) + (mode === 'online' && !hostCanStart ? `. ${t('hostCanRematch')}` : '');
      return { title: t('wonMatch', hud.names[champion]), text, scores: true, actions };
    });
    return;
  }
  timer = 2.8;
  sfx.round();
  const b = $('banner');
  b.textContent = winner >= 0 ? t('roundOf', hud.names[winner]) : t('draw');
  b.style.color = winner >= 0 ? hud.colors[winner] : '';
  b.append(el('small', '', mode === 'local' ? t('spaceNext') : t('nextSoon')));
  b.hidden = false;
}

function toMenu() {
  state = 'menu';
  paused = false;
  round = null;
  view = null;
  hideOverlay();
  show('menu');
  if (mode === 'online') settings.tab = 'online';
  renderAll();
  if (!demo || demo.over) newDemo();
}

function scoreList() {
  const live = state === 'playing' || state === 'countdown' ? hud.live : null;
  const total = (i) => hud.scores[i] + (live ? live[i] || 0 : 0);
  const order = hud.names.map((_, i) => i).sort((a, b) => total(b) - total(a) || a - b);
  const ol = el('ol', 'scores');
  for (const i of order) {
    const out = state === 'playing' && view && view.players[i] && !view.players[i].alive;
    const li = el('li', out ? 'out' : '');
    li.style.setProperty('--c', hud.colors[i]);
    li.append(el('span', 'dot'), el('span', 'who', hud.names[i]), el('span', 'pts', String(total(i))));
    ol.append(li);
  }
  return ol;
}

function renderScores() {
  $('scores').replaceChildren(...scoreList().children);
}

// ---------- Overlays: pause, confirm, settings, match end ----------

// build() returns { title, text, scores, body, actions } and is called again
// when the language changes, so an open dialog is retranslated in place.
function showOverlay(kind, build) {
  const spec = build();
  overlay = { kind, build };
  const o = $('overlay');
  o.textContent = '';
  const card = el('div', 'card');
  card.append(el('h2', '', spec.title));
  if (spec.text) card.append(el('p', '', spec.text));
  if (spec.scores) card.append(scoreList());
  if (spec.body) card.append(spec.body);
  const row = el('div', 'overlay-actions');
  for (const [label, fn, primary] of spec.actions) row.append(button(label, 'btn' + (primary ? ' primary' : ''), fn));
  card.append(row);
  o.append(card);
  o.hidden = false;
  row.firstChild.focus();
}

function hideOverlay() {
  overlay = null;
  $('overlay').hidden = true;
}

const canPause = () => mode === 'local' && ['countdown', 'playing', 'roundEnd'].includes(state);

function pause() {
  if (!canPause()) return;
  paused = true;
  renderGameLabels();
  showOverlay('pause', () => ({ title: t('paused'), text: t('pausedText'), actions: [[t('resume'), resume, true], [t('mainMenu'), toMenu]] }));
}

function resume() {
  paused = false;
  hideOverlay();
  renderGameLabels();
}

// Leaving a match in progress always asks first.
function askQuit() {
  if (state === 'matchEnd') return mode === 'online' ? leaveRoom() : toMenu();
  if (mode === 'online') {
    showOverlay('quit', () => ({ title: t('leaveTitle'), text: t('leaveText'), actions: [[t('keepPlaying'), hideOverlay, true], [t('leaveYes'), () => leaveRoom()]] }));
    return;
  }
  paused = true;
  renderGameLabels();
  showOverlay('quit', () => ({ title: t('quitTitle'), text: t('quitText'), actions: [[t('keepPlaying'), resume, true], [t('quitYes'), toMenu]] }));
}

function openSettings() {
  const previous = overlay;
  const wasPaused = paused;
  if (canPause()) paused = true;
  const pick = (key) => (val) => {
    settings[key] = val;
    save();
    applySettings();
    if (state !== 'menu') buildPads();
    showOverlay('settings', build);
  };
  const close = () => {
    hideOverlay();
    if (previous && previous.kind !== 'settings') return showOverlay(previous.kind, previous.build);
    if (!wasPaused) paused = false;
    renderGameLabels();
  };
  const build = () => {
    const body = el('div', 'dialog-rows');
    const onOff = [['on', t('on')], ['off', t('off')]];
    const vol = el('input');
    vol.type = 'range';
    vol.id = 'volume';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(settings.volume * 100));
    vol.setAttribute('aria-label', t('volume'));
    vol.addEventListener('input', () => {
      settings.volume = Number(vol.value) / 100;
      sfx.volume = settings.volume;
      save();
    });
    vol.addEventListener('change', () => sfx.pickup());
    body.append(
      settingRow(t('sound'), segGroup(t('sound'), onOff, settings.sound, pick('sound'))),
      settingRow(t('volume'), vol),
      settingRow(t('shake'), segGroup(t('shake'), onOff, settings.shake, pick('shake'))),
      settingRow(t('pads'), segGroup(t('pads'), [['auto', t('auto')], ...onOff], settings.pads, pick('pads'))),
    );
    if (document.fullscreenEnabled) {
      body.append(button(t('fullscreen'), 'btn', () => {
        try {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => {}), () => {});
        } catch { /* optional */ }
      }));
    }
    return { title: t('moreSettings'), body, actions: [[t('close'), close, true]] };
  };
  showOverlay('settings', build);
}

// ---------- Touch buttons ----------

const padsWanted = () => settings.pads === 'on' || (settings.pads === 'auto' && coarse);

// One pair of buttons per human on this device (up to four), in the player's colour.
function buildPads() {
  const box = $('pads');
  const game = $('game');
  box.textContent = '';
  padState.clear();
  let owners = [];
  if (padsWanted()) {
    if (mode === 'online') owners = online.myIndex >= 0 ? [online.myIndex] : [];
    else owners = participants.map((p, i) => (p.mode === 'human' ? i : -1)).filter((i) => i >= 0).slice(0, 4);
  }
  for (const i of owners) {
    const st = { l: 0, r: 0 };
    padState.set(i, st);
    const pair = el('div', 'pad');
    pair.style.setProperty('--c', hud.colors[i]);
    for (const [key, sym, label] of [['l', '◀', t('left')], ['r', '▶', t('right')]]) {
      const b = el('button', 'padbtn', sym);
      b.type = 'button';
      b.setAttribute('aria-label', `${hud.names[i]} ${label}`);
      const off = () => {
        st[key] = 0;
        b.classList.remove('on');
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        st[key] = 1;
        b.classList.add('on');
        try {
          b.setPointerCapture(e.pointerId);
        } catch { /* ignore */ }
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      pair.append(b);
    }
    box.append(pair);
  }
  box.hidden = owners.length === 0;
  game.classList.toggle('touch', owners.length > 0);
  game.classList.toggle('solo', owners.length === 1);
  requestAnimationFrame(fitArena);
}

function padDir(i) {
  const st = padState.get(i);
  return st ? st.r - st.l : 0;
}

function fitArena() {
  const wrap = $('arenaWrap');
  const width = Math.min(wrap.clientWidth, (wrap.clientHeight * ARENA.w) / ARENA.h);
  $('arena').style.width = `${Math.max(120, Math.floor(width))}px`;
}

// ---------- Loop ----------

function newDemo() {
  demoRenderer.reset(PLAYER_COLORS);
  demo = new Round({
    w: DEMO.w,
    h: DEMO.h,
    players: Array.from({ length: 5 }, () => ({ bot: 'hard' })),
    rng: makeRng((Math.random() * 2 ** 32) >>> 0),
    powerups: true,
    hooks: demoRenderer.hooks(),
  });
  demoRest = 0;
}

function stepLocal(dt) {
  if (state === 'countdown') {
    timer -= dt;
    showCount(timer);
    if (timer <= 0) {
      $('count').hidden = true;
      state = 'playing';
      sfx.go();
    }
  } else if (state === 'playing') {
    const humans = participants.filter((p) => p.mode === 'human').length;
    const touch = humans === 1 ? input.touchDir() : 0; // half-screen touch only makes sense for one player
    participants.forEach((p, i) => {
      if (p.mode === 'human') round.players[i].input = input.keys(p.keys) || padDir(i) || touch;
    });
    acc += dt;
    while (acc >= DT && !round.over) {
      round.step();
      acc -= DT;
    }
    if (round.over) endRound();
  } else if (state === 'roundEnd') {
    timer -= dt;
    if (timer <= 0) startRound();
  }
}

function sendInput() {
  if (online.myIndex < 0 || !online.net) return;
  const dir = input.keys(ONLINE_KEYS[0]) || input.keys(ONLINE_KEYS[1]) || padDir(online.myIndex) || input.touchDir();
  if (dir === online.lastDir) return;
  online.lastDir = dir;
  online.net.send({ t: 'input', d: dir });
}

function stepDemo(dt) {
  if (reducedMotion) return;
  if (demo.over) {
    demoRest += dt;
    if (demoRest > 1.6) newDemo();
    return;
  }
  acc += dt;
  while (acc >= DT && !demo.over) {
    demo.step();
    acc -= DT;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state === 'menu') {
    stepDemo(dt);
    demoRenderer.draw(demo, { dt });
  } else {
    if (mode === 'online') sendInput();
    else if (!paused) stepLocal(dt);
    renderer.draw(view, { dt: paused ? 0 : dt, intro: state === 'countdown', names: hud.names });
  }
  requestAnimationFrame(frame);
}

// ---------- Events ----------

window.addEventListener('keydown', (e) => {
  if (rebinding) {
    e.preventDefault();
    finishRebind(e.code);
    return;
  }
  if (state === 'menu') {
    if (e.code === 'Escape' && overlay) hideOverlay();
    return;
  }
  const typing = e.target instanceof HTMLInputElement;
  if (e.code === 'Space' && !typing) {
    e.preventDefault();
    if (e.repeat || mode === 'online' || (overlay && overlay.kind === 'settings')) return;
    if (paused) resume();
    else if (state === 'roundEnd') startRound();
    else if (state === 'matchEnd') startMatch();
    else pause();
  } else if (e.code === 'Escape') {
    if (!overlay) pause();
    else if (overlay.kind === 'pause' || overlay.kind === 'quit') (mode === 'local' ? resume : hideOverlay)();
  } else if (mode === 'online' ? ONLINE_KEYS.flat().includes(e.code) : participants.some((p) => p.mode === 'human' && p.keys.includes(e.code))) {
    e.preventDefault(); // keep arrows and other bound keys from scrolling the page
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !overlay) pause();
});
window.addEventListener('resize', fitArena);
new ResizeObserver(fitArena).observe($('arenaWrap'));

$('start').addEventListener('click', startMatch);
$('moreBtn').addEventListener('click', openSettings);
$('gearBtn').addEventListener('click', openSettings);
$('quitBtn').addEventListener('click', askQuit);
$('pauseBtn').addEventListener('click', () => (paused ? resume() : state === 'roundEnd' ? startRound() : pause()));
$('onlineName').addEventListener('change', () => {
  settings.online.name = $('onlineName').value.trim().slice(0, 10);
  save();
  if (online.net && online.room) online.net.send({ t: 'name', name: identity().name });
});

// A shared link carries the room code in the hash.
const linked = /^#([A-Za-z]{4})$/.exec(location.hash);
if (linked) {
  settings.tab = 'online';
  online.code = linked[1].toUpperCase();
}

renderAll();
newDemo();
if (reducedMotion) for (let i = 0; i < 120 * 5 && !demo.over; i++) demo.step(); // a still frame with some trails on it
requestAnimationFrame(frame);

// Test hook for the browser smoke tests.
window.__kavoom = { get state() { return state; }, get round() { return round; }, get match() { return match; }, get view() { return view; }, online };

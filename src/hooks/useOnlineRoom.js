// The connection to an online room: create, join, leave, and the lobby state.
// Lobby messages become React state; match messages (60 snapshots a second)
// go straight to the game engine and never touch React.

import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_URL } from '../../shared/config.js';
import { Net } from '../engine/net.js';
import { game } from '../engine/index.js';

const ERRORS = {
  noroom: 'errNoroom',
  full: 'errFull',
  busy: 'errBusy',
  locked: 'errLocked',
  kicked: 'errKicked',
};

const WAKE_UP_MS = 90000; // a sleeping free server takes about a minute to answer
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Open the connection, retrying while the server may still be waking up.
// Returns true once connected, false when it is time to give up.
async function openPatiently(net, setStatus) {
  const giveUpAt = Date.now() + WAKE_UP_MS;
  for (;;) {
    try {
      await net.open();
      return true;
    } catch {
      if (net.done || !navigator.onLine || Date.now() > giveUpAt) return false;
      setStatus('waking');
      await sleep(2000);
    }
  }
}

function serverUrl() {
  return SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

// identity: { name, color } of this player, sent when creating, joining and rejoining.
export function useOnlineRoom(identity) {
  const [room, setRoom] = useState(null); // the last 'room' message, or null outside a room
  const [you, setYou] = useState(0); // this player's id in the room
  const [status, setStatus] = useState(''); // a strings.js key, or ''
  const [busy, setBusy] = useState(false);
  const net = useRef(null);
  const youRef = useRef(0);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;

  const send = useCallback((msg) => {
    if (net.current) net.current.send(msg);
  }, []);

  const leave = useCallback((why = '') => {
    if (net.current) {
      net.current.send({ t: 'leave' });
      net.current.close();
    }
    net.current = null;
    game.send = null;
    setRoom(null);
    setStatus(why);
    if (game.mode === 'online' && game.state !== 'idle') game.stop();
    if (location.hash) history.replaceState(history.state, '', location.pathname);
  }, []);

  const onMessage = useCallback(
    (m) => {
      switch (m.t) {
        case 'joined':
          youRef.current = m.you;
          setYou(m.you);
          // The code from a shared link has done its job; a clean address also
          // keeps it out of the history entries the Back button walks through.
          if (location.hash) history.replaceState(history.state, '', location.pathname);
          break;
        case 'room':
          setRoom(m);
          setStatus('');
          break;
        case 'round':
          game.onlineRound(m, youRef.current);
          break;
        case 's':
          game.onlineSnapshot(m);
          break;
        case 'pong':
          game.onlinePong(m);
          break;
        case 'roundEnd':
          game.onlineRoundEnd(m);
          break;
        case 'error':
          // Refused at the door, or the room is gone: either way we are not in one.
          leave(Object.hasOwn(ERRORS, m.code) ? ERRORS[m.code] : 'lost');
          break;
      }
    },
    [leave],
  );

  // first: the opening message, { t: 'create' }, { t: 'quick' } or { t: 'join', code }.
  const connect = useCallback(
    async (first) => {
      if (net.current) return;
      setBusy(true);
      setStatus('connecting');
      const mine = new Net(
        serverUrl(),
        {
          message: (m) => mine === net.current && onMessage(m),
          status: (s) => mine === net.current && setStatus(s === 'ok' ? '' : 'reconnecting'),
          down: () => {
            if (mine !== net.current) return;
            net.current = null;
            leave('lost');
          },
        },
        () => latestIdentity.current,
      );
      net.current = mine;
      game.send = (msg) => mine.send(msg);
      if (await openPatiently(mine, setStatus)) {
        setStatus('');
        mine.send({ ...first, ...latestIdentity.current });
      } else if (net.current === mine) {
        net.current = null;
        setStatus(navigator.onLine ? 'noServer' : 'offline');
      }
      setBusy(false);
    },
    [leave, onMessage],
  );

  // Closing the tab's component tree closes the socket too.
  useEffect(() => () => net.current && net.current.close(), []);

  return { room, you, status, busy, connect, leave, send, isHost: !!room && room.host === you };
}

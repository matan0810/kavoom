// The connection to an online room: create, join, leave, and the lobby state.
// Lobby messages become React state; match messages (60 snapshots a second)
// go straight to the game engine and never touch React.

import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_URL } from '../../shared/config.js';
import { LINKED_ROOM } from '../state/settings.js';
import { Net } from '../engine/net.js';
import { game } from '../engine/index.js';
import { clearSession, loadSession, saveSession } from '../state/session.js';

// Server answers that end our claim on a seat, so the device forgets it.
const SEAT_GONE = ['noroom', 'kicked', 'locked', 'full'];

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
  const [saved, setSaved] = useState(loadSession); // a seat this device can return to
  const net = useRef(null);
  const youRef = useRef(0);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;

  const send = useCallback((msg) => {
    if (net.current) net.current.send(msg);
  }, []);

  // why: a strings.js key for the status line. Leaving on purpose (why = '')
  // gives up the seat; losing the connection keeps it, to come back to.
  const leave = useCallback((why = '', forget = why === '') => {
    if (forget) {
      clearSession();
      setSaved(null);
    } else {
      setSaved(loadSession());
    }
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
          saveSession(m);
          // The code from a shared link has done its job; a clean address also
          // keeps it out of the history entries the Back button walks through.
          if (location.hash) history.replaceState(history.state, '', location.pathname);
          break;
        case 'room':
          setRoom(m);
          setStatus('');
          break;
        case 'round':
          if (net.current?.session) saveSession(net.current.session); // still here: keep it fresh
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
          leave(
            Object.hasOwn(ERRORS, m.code) ? ERRORS[m.code] : 'lost',
            SEAT_GONE.includes(m.code),
          );
          break;
      }
    },
    [leave],
  );

  // first: the opening message, { t: 'create' }, { t: 'quick' }, { t: 'join', code }
  // or { t: 'rejoin', code, token }. Joining a room this device has a seat in
  // becomes a rejoin, so it takes back that seat instead of making a second one.
  const connect = useCallback(
    async (first) => {
      if (net.current) return;
      const seat = loadSession();
      if (first.t === 'join' && seat && seat.code === first.code) first = { t: 'rejoin', ...seat };
      setBusy(true);
      setStatus(first.t === 'rejoin' ? 'returning' : 'connecting');
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

  // Opening the game with a seat to return to (a reload, a closed tab, a phone
  // that dropped the page) goes straight back to it.
  useEffect(() => {
    const seat = loadSession();
    if (seat && (!LINKED_ROOM || LINKED_ROOM === seat.code)) connect({ t: 'rejoin', ...seat });
    // Only on the first render: later returns are the player's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the tab's component tree closes the socket too.
  useEffect(() => () => net.current && net.current.close(), []);

  const rejoin = useCallback(() => saved && connect({ t: 'rejoin', ...saved }), [saved, connect]);

  return {
    room,
    you,
    status,
    busy,
    saved,
    connect,
    rejoin,
    leave,
    send,
    isHost: !!room && room.host === you,
  };
}

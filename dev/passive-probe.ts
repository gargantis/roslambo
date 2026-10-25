// The M5 probe of Trystero's passive rooms (PLAN §15 M5). Dev-only, never
// built: research/passive/probe.spec.ts opens it as
//   passive-probe.html#relay=ws://…&name=W&rooms=g:a,r1:p,r2:p
// (room:mode, a = active, p = passive) and reads window.probe.

import { joinRoom } from '@trystero-p2p/nostr';
import { roomConfig } from '../src/net/room-config';

interface ProbeEvent {
  at: number; // Date.now(): the pages share one machine's clock
  room: string;
  kind: 'join' | 'leave' | 'message';
  peer: string;
  data?: string;
}

declare global {
  interface Window {
    probe?: {
      name: string;
      events: ProbeEvent[];
      send: (room: string, text: string) => void;
      stream: (room: string, perSecond: number) => void;
      leave: (room: string) => Promise<void>;
      join: (room: string, mode: 'a' | 'p') => void;
    };
  }
}

const q = new URLSearchParams(location.hash.slice(1));
const relay = q.get('relay')!;
const name = q.get('name') ?? '?';
const events: ProbeEvent[] = [];
const rooms = new Map<string, { leave: () => Promise<void>; send: (d: string) => Promise<void> }>();

function join(roomId: string, mode: 'a' | 'p'): void {
  const room = joinRoom(roomConfig({ relays: [relay], local: true, passive: mode === 'p' }), roomId);
  const action = room.makeAction<string>('m', {
    onMessage: (data, ctx) => {
      events.push({ at: Date.now(), room: roomId, kind: 'message', peer: ctx.peerId, data });
    },
  });
  room.onPeerJoin = (peer) => {
    events.push({ at: Date.now(), room: roomId, kind: 'join', peer });
  };
  room.onPeerLeave = (peer) => {
    events.push({ at: Date.now(), room: roomId, kind: 'leave', peer });
  };
  rooms.set(roomId, { leave: () => room.leave(), send: (d) => action.send(`${name}:${d}`) });
}

for (const spec of (q.get('rooms') ?? '').split(',').filter(Boolean)) {
  const [roomId, mode] = spec.split(':');
  join(roomId!, mode === 'p' ? 'p' : 'a');
}

window.probe = {
  name,
  events,
  send: (room, text) => void rooms.get(room)?.send(text).catch(() => {}),
  stream: (room, perSecond) => {
    let k = 0;
    setInterval(() => void rooms.get(room)?.send(String(k++)).catch(() => {}), 1000 / perSecond);
  },
  leave: async (room) => {
    await rooms.get(room)?.leave();
    rooms.delete(room);
  },
  join,
};
document.getElementById('log')!.textContent += `\n${name}: ${[...rooms.keys()].join(', ')}`;

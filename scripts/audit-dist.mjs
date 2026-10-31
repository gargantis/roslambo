#!/usr/bin/env node
// The PLAN §13 dist audit. The logic and its planted-failure self-test
// are shared, in vendor/hermet/audit-dist.mjs; roslambo's one exception
// is here.
import { runAuditDist } from '../vendor/hermet/audit-dist.mjs';

await runAuditDist({
  // Trystero's built-in STUN list is a template literal,
  // `stun:stun${i}.l.google.com:19302`, whose prefix the scan reads as a
  // host named "stun". roslambo always passes its own iceServers, so the
  // defaults are never used (src/net/room-config.test.ts).
  ignoredHosts: ['stun'],
});

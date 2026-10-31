#!/usr/bin/env node
// PLAN §18: bundled packages keep their licences, so their notices ship in
// dist/THIRD-PARTY-LICENSES.txt, written by the shared vendor/hermet code
// from Vite's npm licence JSON. audit-dist checks the list against
// scripts/expected-licenses.json. (roslambo itself is unlicensed: no
// permission is granted to use it.)
import { writeLicenseNotices } from '../vendor/hermet/licenses.mjs';

await writeLicenseNotices({ product: 'roslambo' });

#!/usr/bin/env node
// PLAN §18: bundled packages keep their licences, so their notices ship in
// dist/THIRD-PARTY-LICENSES.txt. Turns Vite's npm licence JSON into that
// file and deletes the JSON; audit-dist checks the list against
// scripts/expected-licenses.json. (roslambo itself is unlicensed: no
// permission is granted to use it.) Ported from amorfus.
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const licenseJson = join(dist, '.license-npm.json');

const parts = [];
try {
  await access(licenseJson);
  const raw = JSON.parse(await readFile(licenseJson, 'utf8'));
  // Vite (Rolldown) emits an array of { name, version, license, licenseText? }.
  const list = Array.isArray(raw) ? raw : (raw.dependencies ?? []);
  for (const dep of list) {
    parts.push(`## ${dep.name}@${dep.version}\n\n${dep.license ?? ''}\n\n${dep.licenseText ?? ''}`.trim());
  }
  await rm(licenseJson);
} catch {
  // No bundled npm dependencies yet.
}

const header = 'Third-party notices for the roslambo distribution.\nEach section is one bundled package.\n';
await writeFile(join(dist, 'THIRD-PARTY-LICENSES.txt'), `${header}\n${parts.join('\n\n')}\n`);
console.log(`licenses: wrote THIRD-PARTY-LICENSES.txt with ${parts.length} entries`);

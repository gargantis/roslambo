// PLAN §13 dist audit, ported from amorfus without its IPFS rules. Pure
// directory-in, findings-out, so the planted-failure self-test runs in
// vitest without a real build.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, posix, dirname } from 'node:path';

const TEXT_EXT = new Set(['.html', '.css', '.js', '.txt', '.json']);
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.txt', '.ico', '.png', '.svg', '.webmanifest']);
const MAX_BYTES = 25 * 1024 * 1024;

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/, // AWS access key ID
  /ghp_[A-Za-z0-9]{36}/, // GitHub token
  /github_pat_[A-Za-z0-9_]{22,}/,
  /sk-[A-Za-z0-9]{20,}/, // generic secret-key shape
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/, // JWT
];

// The scheme starts a word: minified CSS such as `grid-template-rows:auto`
// holds "ws:auto", which is not a WebSocket URL. A host starts with a
// letter or digit: "start with wss://." in a sentence names none.
const URL_RE = /\b(?:https?|wss?|stun|turn):\/?\/?([A-Za-z0-9][A-Za-z0-9.-]*)(?::\d+)?/g;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

export async function auditDist(dir, { allowedHosts, expectedLicensePackages, ignoredHosts = [] }) {
  const findings = [];
  const files = await walk(dir);
  const relFiles = new Set(files.map((f) => toPosix(relative(dir, f))));

  for (const abs of files) {
    const rel = toPosix(relative(dir, abs));
    const base = posix.basename(rel);
    const ext = extOf(base);

    // Dotfiles, source maps and markdown never ship (a stray CLAUDE.md must not).
    if (base.startsWith('.') || ext === '.md' || ext === '.map') {
      findings.push({ file: rel, why: 'forbidden file' });
      continue;
    }
    if (!ALLOWED_EXT.has(ext)) findings.push({ file: rel, why: 'extension not allowlisted' });

    const st = await stat(abs);
    if (st.size > MAX_BYTES) findings.push({ file: rel, why: 'file over 25 MiB' });

    if (!TEXT_EXT.has(ext)) continue;
    const text = await readFile(abs, 'utf8');

    for (const re of SECRET_PATTERNS) {
      if (re.test(text)) findings.push({ file: rel, why: 'secret pattern' });
    }

    // A request needs a URL in code. In JS that means string literals: a URL
    // in a comment is dead text (licence headers carry them). HTML and CSS
    // are scanned in full. Licence notices are text, not requests.
    if (base === 'THIRD-PARTY-LICENSES.txt') continue;
    const hostScanText = ext === '.js' ? jsStringLiterals(text).join('\n') : text;
    for (const m of hostScanText.matchAll(URL_RE)) {
      const host = m[1].toLowerCase();
      if (host === 'www.w3.org') continue; // namespace URLs never produce requests
      if (ignoredHosts.includes(host)) continue;
      if (LOOPBACK.has(host) || !allowedHosts.includes(host)) {
        findings.push({ file: rel, why: 'host not in third-party.json', detail: host });
      }
    }

    if (ext === '.html') checkRefs(htmlRefs(text), rel, relFiles, findings);
    else if (ext === '.css') checkRefs(cssRefs(text), rel, relFiles, findings);
    else if (ext === '.js') {
      for (const s of jsStringLiterals(text)) {
        if (s.startsWith('/') && !s.startsWith('//')) {
          findings.push({ file: rel, why: 'root-absolute URL', detail: s });
        }
      }
    }
  }

  // The licence list against the expected package set.
  if (!relFiles.has('THIRD-PARTY-LICENSES.txt')) {
    findings.push({ file: 'THIRD-PARTY-LICENSES.txt', why: 'missing licence notices' });
  } else {
    const text = await readFile(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'utf8');
    const present = new Set([...text.matchAll(/^## (@?[A-Za-z0-9._/-]+?)@[0-9]/gm)].map((m) => m[1]));
    const expected = new Set(expectedLicensePackages);
    for (const p of present) if (!expected.has(p)) findings.push({ file: 'THIRD-PARTY-LICENSES.txt', why: 'licence list mismatch', detail: `unexpected ${p}` });
    for (const p of expected) if (!present.has(p)) findings.push({ file: 'THIRD-PARTY-LICENSES.txt', why: 'licence list mismatch', detail: `missing ${p}` });
  }

  return { findings };
}

function checkRefs(refs, rel, relFiles, findings) {
  for (const r of refs) {
    if (/^(?:https?|wss?):/.test(r) || r.startsWith('data:') || r.startsWith('#') || r.startsWith('mailto:')) continue;
    if (r.startsWith('/')) {
      findings.push({ file: rel, why: 'root-absolute URL', detail: r });
      continue;
    }
    const target = posix.normalize(posix.join(toPosix(dirname(rel)), r.split(/[?#]/)[0]));
    if (!relFiles.has(target)) findings.push({ file: rel, why: 'unresolved reference', detail: r });
  }
}

function htmlRefs(text) {
  return [...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function cssRefs(text) {
  return [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
}

// A small tokenizer, enough for minified JS: comments, quoted strings,
// template literals with nested ${…} expressions, and regex literals
// (a '/' where an operand may start). It returns every string's text and
// every template's static parts. A regular expression alone can't track
// nested templates, and read code between two of them as a string (M5).
// It jumps between the characters that matter, so a 25 MiB file is quick.
const SPECIAL = /["'`/{}]/g;
const QUOTED = { '"': /"((?:[^"\\\n]|\\.)*)"/y, "'": /'((?:[^'\\\n]|\\.)*)'/y };
const TEMPLATE_PART = /((?:[^`\\$]|\\[\s\S]|\$(?!\{))*)(`|\$\{)?/y;
const REGEX_LITERAL = /\/(?:[^/\\[\n]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[a-z]*/iy;
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'delete', 'new', 'throw', 'yield', 'await']);

function regexMayStart(text, i) {
  let j = i - 1;
  while (j >= 0 && (text[j] === ' ' || text[j] === '\n' || text[j] === '\t' || text[j] === '\r')) j--;
  if (j < 0) return true;
  const c = text[j];
  if (REGEX_AFTER.has(c)) return true;
  if (!/[A-Za-z]/.test(c)) return false;
  let k = j;
  while (k > 0 && /[\w$]/.test(text[k - 1])) k--;
  return REGEX_AFTER_WORD.has(text.slice(k, j + 1));
}

export function jsStringLiterals(text) {
  const out = [];
  const braces = []; // per open template expression: '{' depth inside it
  let i = 0;
  const template = () => {
    // i is just after a backtick, or after the '}' closing an expression.
    TEMPLATE_PART.lastIndex = i;
    const m = TEMPLATE_PART.exec(text);
    out.push(m[1]);
    i = TEMPLATE_PART.lastIndex;
    if (m[2] === '${') braces.push(0);
  };
  while (i < text.length) {
    SPECIAL.lastIndex = i;
    const m = SPECIAL.exec(text);
    if (!m) break;
    i = m.index;
    const c = m[0];
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === '/') {
      REGEX_LITERAL.lastIndex = i;
      i = regexMayStart(text, i) && REGEX_LITERAL.test(text) ? REGEX_LITERAL.lastIndex : i + 1;
    } else if (c === '"' || c === "'") {
      const re = QUOTED[c];
      re.lastIndex = i;
      const q = re.exec(text);
      if (q) {
        out.push(q[1]);
        i = re.lastIndex;
      } else i++;
    } else if (c === '`') {
      i++;
      template();
    } else if (c === '{') {
      if (braces.length > 0) braces[braces.length - 1]++;
      i++;
    } else if (braces.length > 0 && braces[braces.length - 1] === 0) {
      braces.pop(); // the '}' closing a template expression
      i++;
      template();
    } else {
      if (braces.length > 0) braces[braces.length - 1]--;
      i++;
    }
  }
  return out;
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(join(e.parentPath, e.name));
  }
  return out;
}

const extOf = (base) => {
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
};
const toPosix = (p) => p.split('\\').join('/');

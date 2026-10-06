'use strict';

// BDPG.stableStringify lives inside the inline <script> of
// bus-dev-potential-gallons/index.html -- an IIFE in a plain HTML file, with
// no module boundary to require() through. Rather than retype the function
// here (which would test a COPY, not the shipped code, and could drift
// silently out of sync with the real implementation), this harness reads the
// actual file, slices out the literal `BDPG.stableStringify = function (v) {
// ... }` block by locating the marker and balancing braces from the first
// `{` after it, and evaluates that exact text. If the function in the file
// ever changes, this test exercises the new text automatically; if the
// marker ever goes missing (renamed, deleted, moved out of the file), the
// extraction throws loudly instead of silently testing stale code.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function extractBlock(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('marker not found: ' + startMarker);
  const braceStart = src.indexOf('{', start);
  if (braceStart === -1) throw new Error('no opening brace after marker: ' + startMarker);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('unbalanced braces for marker: ' + startMarker);
  return src.slice(start, end + 1);
}

const htmlPath = path.join(__dirname, 'bus-dev-potential-gallons', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const block = extractBlock(html, 'BDPG.stableStringify = function');

// The block is `BDPG.stableStringify = function (v) { ... }` -- an assignment
// statement, not a standalone expression. Running it inside a function body
// with a local BDPG object lets the assignment land, then we hand back the
// function it produced. The function recurses through `BDPG.stableStringify`
// internally, so it has to be read off the same object it assigned to.
const build = new Function('BDPG', block + '\nreturn BDPG.stableStringify;');
const S = build({});

test('key order does not affect the serialization', () => {
  assert.equal(S({ a: 1, b: 2 }), S({ b: 2, a: 1 }));
  assert.equal(S({ x: { p: 1, q: 2 } }), S({ x: { q: 2, p: 1 } }));
});

test('arrays keep their order, which is meaningful', () => {
  assert.notEqual(S([1, 2]), S([2, 1]));
});

test('different content still compares different', () => {
  assert.notEqual(S({ a: 1 }), S({ a: 2 }));
  assert.notEqual(S({ a: 1 }), S({ a: 1, b: 2 }));
});

test('primitives and null round-trip', () => {
  assert.equal(S(null), 'null');
  assert.equal(S(''), '""');
  assert.equal(S(0), '0');
});

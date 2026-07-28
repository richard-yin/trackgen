'use strict';

/**
 * Loads voiceTypes.js in a Node.js vm context, stripping the QML-only
 * `.pragma library` header that has no meaning outside the Qt runtime.
 *
 * Two sentinel globals are injected for the functions that reference them
 * (partHasNotesInRange); Phase 2 tests override ctx.Segment / ctx.Element
 * and replace ctx.partHasNotesInRange with a custom spy before each test.
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.resolve(__dirname, '../../trackgen/voiceTypes.js'),
  'utf8'
).replace(/^\.pragma library\s*\n?/, '');

const ctx = {
  // Stub constants matching MuseScore's Segment.ChordRest and Element.REST
  Segment: { ChordRest: 1 },
  Element:  { REST: 9 },
};

vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = ctx;

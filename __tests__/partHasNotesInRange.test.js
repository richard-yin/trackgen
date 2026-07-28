'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore, makeCursorFactory } = require('./helpers/mockScore');

// REST type constant matching the shim's stub value
const REST_TYPE = 9;
// A non-REST note type
const NOTE_TYPE = 1;

/**
 * Builds a score where score.newCursor() returns a fresh cursor each call,
 * driven by the provided elements list.
 */
function scoreWithCursor(parts, elementsList) {
  var score = makeScore(parts);
  score.newCursor = makeCursorFactory(elementsList);
  return score;
}

describe('partHasNotesInRange', () => {
  test('returns false when all elements in range are rests', () => {
    var score = scoreWithCursor([makePart('')], [
      { tick: 0,   type: REST_TYPE },
      { tick: 480, type: REST_TYPE },
    ]);
    expect(VT.partHasNotesInRange(score, 0, 1, 0, 960)).toBe(false);
  });

  test('returns true when at least one non-rest element is in range', () => {
    var score = scoreWithCursor([makePart('')], [
      { tick: 0,   type: REST_TYPE },
      { tick: 480, type: NOTE_TYPE },
    ]);
    expect(VT.partHasNotesInRange(score, 0, 1, 0, 960)).toBe(true);
  });

  test('element exactly at tickStart is included', () => {
    var score = scoreWithCursor([makePart('')], [
      { tick: 100, type: NOTE_TYPE },
    ]);
    expect(VT.partHasNotesInRange(score, 0, 1, 100, 200)).toBe(true);
  });

  test('element at tickEnd (exclusive) is not included', () => {
    var score = scoreWithCursor([makePart('')], [
      { tick: 200, type: NOTE_TYPE },
    ]);
    // range is [0, 200) — tick 200 is excluded
    expect(VT.partHasNotesInRange(score, 0, 1, 0, 200)).toBe(false);
  });

  test('note before tickStart is not included', () => {
    var score = scoreWithCursor([makePart('')], [
      { tick: 50,  type: NOTE_TYPE },
      { tick: 200, type: REST_TYPE },
    ]);
    expect(VT.partHasNotesInRange(score, 0, 1, 100, 300)).toBe(false);
  });

  test('empty element list returns false', () => {
    var score = scoreWithCursor([makePart('')], []);
    expect(VT.partHasNotesInRange(score, 0, 1, 0, 9999)).toBe(false);
  });
});

describe('partHasNotesInRange — multi-staff', () => {
  test('returns true when note is found in the second staff (staffIdx 1)', () => {
    // The cursor mock is stateless across staffIdx, so we build one that only
    // has a note at tick 100.  For staffIdx 0 rewind would still find it, but
    // for staffIdx 1 the SAME cursor is used (the factory returns a fresh one
    // per call to score.newCursor() — which is called once per invocation of
    // partHasNotesInRange, not once per staff).  We make a cursor that has a
    // note only when staffIdx == 1 by using a wrapper factory.
    var parts = [makePart('', '', '', 2)]; // nstaves=2 → staffStart=0, staffEnd=1
    var callCount = 0;
    var score = makeScore(parts);
    score.newCursor = function () {
      var idx = 0;
      var elementsByStaff = [
        [{ tick: 100, type: REST_TYPE }],  // staff 0: rest only
        [{ tick: 100, type: NOTE_TYPE }],  // staff 1: note
      ];
      var cursor = {
        filter:   null,
        staffIdx: 0,
        rewindToTick: function (t) {
          var els = elementsByStaff[cursor.staffIdx] || [];
          idx = 0;
          while (idx < els.length && els[idx].tick < t) idx++;
        },
        get segment() {
          var els = elementsByStaff[cursor.staffIdx] || [];
          return idx < els.length ? {} : null;
        },
        get tick() {
          var els = elementsByStaff[cursor.staffIdx] || [];
          return idx < els.length ? els[idx].tick : Infinity;
        },
        get element() {
          var els = elementsByStaff[cursor.staffIdx] || [];
          return idx < els.length ? { type: els[idx].type } : null;
        },
        next: function () {
          var els = elementsByStaff[cursor.staffIdx] || [];
          idx++;
          return idx < els.length;
        },
      };
      return cursor;
    };

    expect(VT.partHasNotesInRange(score, 0, 2, 0, 200)).toBe(true);
  });
});

describe('classifyScore with range filter', () => {
  /**
   * Inject a deterministic partHasNotesInRange into the shim context so that
   * classifyScore range-filter logic can be tested without a real cursor.
   */
  var original;
  beforeEach(function () {
    original = VT.partHasNotesInRange;
  });
  afterEach(function () {
    VT.partHasNotesInRange = original;
  });

  test('SATB part with no notes in range is excluded from slots', () => {
    VT.partHasNotesInRange = function () { return false; };
    var sop = makePart('[SATB] Soprano');
    var score = makeScore([sop]);
    var staffStartMap = [0];
    var r = VT.classifyScore(score, 0, 960, staffStartMap);
    expect(r.slots['S1']).toHaveLength(0);
  });

  test('SATB part with notes in range is included in slots', () => {
    VT.partHasNotesInRange = function () { return true; };
    var sop = makePart('[SATB] Soprano');
    var score = makeScore([sop]);
    var staffStartMap = [0];
    var r = VT.classifyScore(score, 0, 960, staffStartMap);
    expect(r.slots['S1']).toHaveLength(1);
  });

  test('SOLO part with no notes in range is excluded from soloists', () => {
    VT.partHasNotesInRange = function () { return false; };
    var cantor = makePart('[SOLO] Cantor');
    var score  = makeScore([cantor]);
    var staffStartMap = [0];
    var r = VT.classifyScore(score, 0, 960, staffStartMap);
    expect(r.soloists).toHaveLength(0);
  });

  test('instrumental parts are always included regardless of range', () => {
    VT.partHasNotesInRange = function () { return false; };
    var piano = makePart('Piano');
    var score = makeScore([piano]);
    var staffStartMap = [0];
    var r = VT.classifyScore(score, 0, 960, staffStartMap);
    expect(r.instrumentals).toHaveLength(1);
  });

  test('range filter is skipped when no tick args are provided', () => {
    // partHasNotesInRange should never be called in no-filter mode
    VT.partHasNotesInRange = function () { throw new Error('should not be called'); };
    var sop = makePart('[SATB] Soprano');
    var r = VT.classifyScore(makeScore([sop]));
    expect(r.slots['S1']).toHaveLength(1);
  });
});

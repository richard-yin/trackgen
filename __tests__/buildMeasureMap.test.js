'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { linkMeasures } = require('./helpers/mockScore');

/**
 * buildMeasureMap consumes score.firstMeasure as a linked list.
 * We inject the head node and a null-terminated chain.
 */
function scoreWithMeasures(optsList) {
  return { firstMeasure: linkMeasures(optsList) };
}

describe('buildMeasureMap — basic numbering', () => {
  test('four regular measures get displayNo 1–4', () => {
    var score = scoreWithMeasures([
      { tick: 0   },
      { tick: 480 },
      { tick: 960 },
      { tick: 1440 },
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map).toHaveLength(4);
    expect(map.map(function (e) { return e.displayNo; })).toEqual([1, 2, 3, 4]);
  });

  test('tick values are taken from firstSegment.tick', () => {
    var score = scoreWithMeasures([{ tick: 100 }, { tick: 200 }]);
    var map = VT.buildMeasureMap(score);
    expect(map[0].tick).toBe(100);
    expect(map[1].tick).toBe(200);
  });

  test('empty score (no measures) returns empty array', () => {
    var map = VT.buildMeasureMap({ firstMeasure: null });
    expect(map).toHaveLength(0);
  });
});

describe('buildMeasureMap — pickup (excluded) measures', () => {
  test('irregular=true gives displayNo 0 and does not increment counter', () => {
    var score = scoreWithMeasures([
      { irregular: true, tick: 0 },
      { tick: 480 },
      { tick: 960 },
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map[0].displayNo).toBe(0);
    // Subsequent measures still start from 1
    expect(map[1].displayNo).toBe(1);
    expect(map[2].displayNo).toBe(2);
  });

  test('excludeFromNumbering=true (MS4 property) gives displayNo 0', () => {
    var score = scoreWithMeasures([
      { excludeFromNumbering: true, tick: 0 },
      { tick: 480 },
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map[0].displayNo).toBe(0);
    expect(map[1].displayNo).toBe(1);
  });
});

describe('buildMeasureMap — measureNumberOffset (cumulative offset)', () => {
  test('positive offset applied mid-score shifts all subsequent displayNos', () => {
    var score = scoreWithMeasures([
      { tick: 0   },
      { tick: 480, measureNumberOffset: 5 },  // runningOffset becomes 5
      { tick: 960 },
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map[0].displayNo).toBe(1);
    expect(map[1].displayNo).toBe(7);  // seqNo 2 + offset 5
    expect(map[2].displayNo).toBe(8);  // seqNo 3 + offset 5
  });

  test('noOffset (MS3 property name) is also respected', () => {
    var score = scoreWithMeasures([
      { tick: 0   },
      { tick: 480, noOffset: 3 },
      { tick: 960 },
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map[1].displayNo).toBe(5);  // seqNo 2 + offset 3
    expect(map[2].displayNo).toBe(6);
  });

  test('negative offset decrements subsequent displayNos', () => {
    var score = scoreWithMeasures([
      { tick: 0   },
      { tick: 480 },
      { tick: 960, measureNumberOffset: -1 },
      { tick: 1440 },
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map[0].displayNo).toBe(1);
    expect(map[1].displayNo).toBe(2);
    expect(map[2].displayNo).toBe(2);  // seqNo 3 + offset -1
    expect(map[3].displayNo).toBe(3);
  });

  test('offsets accumulate across multiple offset measures', () => {
    // The offset on a measure is added to runningOffset BEFORE displayNo is computed
    // for that measure, so the offset shifts the measure carrying it and all subsequent.
    var score = scoreWithMeasures([
      { tick: 0,    measureNumberOffset: 0 },
      { tick: 480,  measureNumberOffset: 2 },   // runningOffset → 2, seqNo 2 → displayNo 4
      { tick: 960,  measureNumberOffset: 3 },   // runningOffset → 5, seqNo 3 → displayNo 8
      { tick: 1440 },                            // runningOffset still 5, seqNo 4 → displayNo 9
    ]);
    var map = VT.buildMeasureMap(score);
    expect(map[0].displayNo).toBe(1);
    expect(map[1].displayNo).toBe(4);
    expect(map[2].displayNo).toBe(8);
    expect(map[3].displayNo).toBe(9);
  });
});

describe('buildMeasureMap — measure objects are preserved', () => {
  test('map[i].measure references the original linked-list node', () => {
    var head = linkMeasures([{ tick: 0 }, { tick: 480 }]);
    var map = VT.buildMeasureMap({ firstMeasure: head });
    expect(map[0].measure).toBe(head);
    expect(map[1].measure).toBe(head.nextMeasure);
  });
});

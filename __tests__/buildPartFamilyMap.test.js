'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore } = require('./helpers/mockScore');

function classifyNames(longNames) {
  var parts = longNames.map(function (n) { return makePart(n); });
  return VT.classifyScore(makeScore(parts));
}

describe('buildPartFamilyMap — family routing', () => {
  test('S*/A* slots are assigned family "upper"', () => {
    var c = classifyNames(['[SATB] Soprano','[SATB] Alto']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    map.forEach(function (entry) {
      expect(entry.family).toBe('upper');
    });
  });

  test('T*/B* slots are assigned family "lower"', () => {
    var c = classifyNames(['[SATB] Tenor','[SATB] Bass']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    map.forEach(function (entry) {
      expect(entry.family).toBe('lower');
    });
  });

  test('[SOLO] parts are assigned family "solo"', () => {
    var c = classifyNames(['[SOLO] Cantor']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    expect(map).toHaveLength(1);
    expect(map[0].family).toBe('solo');
  });

  test('mixed SATB + soloist score maps all three families', () => {
    var c = classifyNames(['[SATB] Soprano','[SATB] Bass','[SOLO] Cantor']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    var families = map.map(function (e) { return e.family; });
    expect(families).toContain('upper');
    expect(families).toContain('lower');
    expect(families).toContain('solo');
  });
});

describe('buildPartFamilyMap — deduplication', () => {
  test('SATB Soprano part appears only once even though it fills S1, S2, S2Mz', () => {
    var sopPart = makePart('[SATB] Soprano');
    var c = VT.classifyScore(makeScore([sopPart]));
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    var entries = map.filter(function (e) { return e.part === sopPart; });
    expect(entries).toHaveLength(1);
  });

  test('SATB Bass part appears only once even though it fills B1, B2, B1Bar', () => {
    var bassPart = makePart('[SATB] Bass');
    var c = VT.classifyScore(makeScore([bassPart]));
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    var entries = map.filter(function (e) { return e.part === bassPart; });
    expect(entries).toHaveLength(1);
  });

  test('full SATB score deduplicates to exactly 4 unique entries', () => {
    var c = classifyNames(['[SATB] Soprano','[SATB] Alto','[SATB] Tenor','[SATB] Bass']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    expect(map).toHaveLength(4);
  });
});

describe('buildPartFamilyMap — ordering', () => {
  test('upper parts appear before lower parts, soloists last', () => {
    var c = classifyNames(['[SATB] Tenor','[SATB] Bass','[SATB] Soprano','[SOLO] Cantor']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    var upIdx   = map.findIndex(function (e) { return e.family === 'upper'; });
    var loIdx   = map.findIndex(function (e) { return e.family === 'lower'; });
    var soloIdx = map.findIndex(function (e) { return e.family === 'solo'; });
    expect(upIdx).toBeLessThan(loIdx);
    expect(loIdx).toBeLessThan(soloIdx);
  });

  test('instrumental parts (no prefix) do not appear in the family map', () => {
    var c = classifyNames(['[SATB] Soprano','Piano']);
    var map = VT.buildPartFamilyMap(c.slots, c.soloists);
    // Piano is in instrumentals, not slots or soloists — should not appear
    expect(map).toHaveLength(1);
  });
});

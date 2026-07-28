'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore } = require('./helpers/mockScore');

// Helper: build a score whose parts all have the given longNames.
function scoreFromNames(longNames) {
  return makeScore(longNames.map(function (n) { return makePart(n); }));
}

describe('classifyScore — SATB classification', () => {
  test('standard SATB score produces four slots', () => {
    var score = scoreFromNames(['[SATB] Soprano','[SATB] Alto','[SATB] Tenor','[SATB] Bass']);
    var r = VT.classifyScore(score);

    expect(r.slots['S1'].length).toBe(1);
    expect(r.slots['S2'].length).toBe(1);   // SATB Soprano maps to S1,S2,S2Mz
    expect(r.slots['S2Mz'].length).toBe(1);
    expect(r.slots['A1'].length).toBe(1);
    expect(r.slots['T1'].length).toBe(1);
    expect(r.slots['B1'].length).toBe(1);
    expect(r.instrumentals).toHaveLength(0);
    expect(r.soloists).toHaveLength(0);
  });

  test('SSAATTBB score maps each voice to exactly one primary slot', () => {
    var names = [
      '[SSAATTBB] Soprano 1','[SSAATTBB] Soprano 2',
      '[SSAATTBB] Alto 1',   '[SSAATTBB] Alto 2',
      '[SSAATTBB] Tenor 1',  '[SSAATTBB] Tenor 2',
      '[SSAATTBB] Bass 1',   '[SSAATTBB] Bass 2',
    ];
    var r = VT.classifyScore(scoreFromNames(names));
    var SLOT_ORDER = VT.SLOT_ORDER;
    // Every slot should have exactly one part.
    SLOT_ORDER.forEach(function (sid) {
      expect(r.slots[sid].length).toBe(1);
    });
  });

  test('SMA prefix produces S1/S2 (Soprano), S2Mz/A1Mz (Mezzo), A1/A2 (Alto)', () => {
    var r = VT.classifyScore(scoreFromNames(['[SMA] Soprano','[SMA] Mezzo-soprano','[SMA] Alto']));
    expect(r.slots['S1'].length).toBe(1);
    expect(r.slots['S2'].length).toBe(1);
    expect(r.slots['S2Mz'].length).toBe(1);
    expect(r.slots['A1Mz'].length).toBe(1);
    expect(r.slots['A1'].length).toBe(1);
    expect(r.slots['A2'].length).toBe(1);
  });

  test('modifierPresent is set for mezzo-soprano and baritone staves', () => {
    var r = VT.classifyScore(scoreFromNames(['[SMA] Mezzo-soprano']));
    expect(r.modifierPresent['S2Mz']).toBe(true);
    expect(r.modifierPresent['A1Mz']).toBe(true);
  });

  test('modifierPresent is not set when no modifier voice is present', () => {
    var r = VT.classifyScore(scoreFromNames(['[SATB] Soprano','[SATB] Tenor']));
    expect(r.modifierPresent['S2Mz']).toBeFalsy();
    expect(r.modifierPresent['T2Bar']).toBeFalsy();
  });

  test('partMeta is populated for classified parts', () => {
    var score = scoreFromNames(['[SATB] Soprano','Piano']);
    var r = VT.classifyScore(score);
    expect(r.partMeta[0]).toEqual({ prefix: 'SATB', voiceName: 'Soprano' });
    expect(r.partMeta[1]).toBeUndefined();
  });
});

describe('classifyScore — soloist detection', () => {
  test('[SOLO] parts are collected in soloists, not slots or instrumentals', () => {
    var r = VT.classifyScore(scoreFromNames(['[SOLO] Cantor','[SATB] Soprano']));
    expect(r.soloists).toHaveLength(1);
    expect(r.soloists[0].displayName).toBe('Cantor');
    // Soprano slot still filled
    expect(r.slots['S1'].length).toBe(1);
  });

  test('[SOLO] with no name defaults displayName to "Soloist"', () => {
    var r = VT.classifyScore(scoreFromNames(['[SOLO]']));
    expect(r.soloists[0].displayName).toBe('Soloist');
  });

  test('multiple soloists all appear in soloists array in score order', () => {
    var r = VT.classifyScore(scoreFromNames(['[SOLO] Cantor','[SOLO] Reader']));
    expect(r.soloists.map(function (s) { return s.displayName; })).toEqual(['Cantor','Reader']);
  });
});

describe('classifyScore — instrumental fallback', () => {
  test('parts with no recognised prefix go into instrumentals', () => {
    var r = VT.classifyScore(scoreFromNames(['Piano','Violin','[SATB] Bass']));
    expect(r.instrumentals).toHaveLength(2);
    expect(r.slots['B1'].length).toBe(1);
  });

  test('purely instrumental score fills no slots', () => {
    var r = VT.classifyScore(scoreFromNames(['Piano','Cello']));
    VT.SLOT_ORDER.forEach(function (sid) {
      expect(r.slots[sid]).toHaveLength(0);
    });
    expect(r.instrumentals).toHaveLength(2);
  });
});

describe('classifyScore — shortName and partName fallbacks', () => {
  test('falls back to shortName when longName has no prefix', () => {
    var score = makeScore([makePart('Soprano', '[SATB] Soprano', '')]);
    var r = VT.classifyScore(score);
    expect(r.slots['S1'].length).toBe(1);
  });

  test('falls back to partName when neither longName nor shortName match', () => {
    var score = makeScore([makePart('Soprano', '', '[SATB] Soprano')]);
    var r = VT.classifyScore(score);
    expect(r.slots['S1'].length).toBe(1);
  });
});

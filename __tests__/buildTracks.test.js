'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore } = require('./helpers/mockScore');

function classifyNames(longNames) {
  var parts = longNames.map(function (n) { return makePart(n); });
  return VT.classifyScore(makeScore(parts));
}

describe('buildTracks — basic emission', () => {
  test('standard SATB emits Soprano, Alto, Tenor, Bass in canonical order', () => {
    var c = classifyNames(['[SATB] Soprano','[SATB] Alto','[SATB] Tenor','[SATB] Bass']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var names = tracks.map(function (t) { return t.displayName; });
    expect(names).toContain('Soprano');
    expect(names).toContain('Alto');
    expect(names).toContain('Tenor');
    expect(names).toContain('Bass');
    // Canonical order: all S slots before A, A before T, T before B
    expect(names.indexOf('Soprano')).toBeLessThan(names.indexOf('Alto'));
    expect(names.indexOf('Alto')).toBeLessThan(names.indexOf('Tenor'));
    expect(names.indexOf('Tenor')).toBeLessThan(names.indexOf('Bass'));
  });

  test('empty score produces no tracks', () => {
    var c = classifyNames([]);
    expect(VT.buildTracks(c.slots, c.modifierPresent, c.soloists)).toHaveLength(0);
  });
});

describe('buildTracks — modifier slot suppression', () => {
  test('S2Mz slot is suppressed when no Mezzo-soprano stave is present', () => {
    var c = classifyNames(['[SATB] Soprano']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks.find(function (t) { return t.slotId === 'S2Mz'; })).toBeUndefined();
  });

  test('S2Mz slot is emitted when a Mezzo-soprano stave is present', () => {
    var c = classifyNames(['[SMA] Soprano','[SMA] Mezzo-soprano','[SMA] Alto']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks.find(function (t) { return t.slotId === 'S2Mz'; })).toBeDefined();
  });

  test('T2Bar slot is suppressed when no Baritone stave is present', () => {
    var c = classifyNames(['[TBB] Tenor','[TBB] Bass']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks.find(function (t) { return t.slotId === 'T2Bar'; })).toBeUndefined();
  });

  test('T2Bar slot is emitted when a Baritone stave is present', () => {
    var c = classifyNames(['[TBB] Tenor','[TBB] Baritone','[TBB] Bass']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks.find(function (t) { return t.slotId === 'T2Bar'; })).toBeDefined();
  });
});

describe('buildTracks — sibling deduplication', () => {
  test('S1 and S2 collapse to single Soprano when the same part populates both', () => {
    // SATB Soprano maps to [S1, S2, S2Mz]; S1 and S2 will share the same part object.
    var c = classifyNames(['[SATB] Soprano']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var s2Track = tracks.find(function (t) { return t.slotId === 'S2'; });
    expect(s2Track).toBeUndefined();
    var s1Track = tracks.find(function (t) { return t.slotId === 'S1'; });
    expect(s1Track).toBeDefined();
    expect(s1Track.displayName).toBe('Soprano');
  });

  test('S1 and S2 are kept distinct when different parts occupy each slot', () => {
    var c = classifyNames(['[SSAATTBB] Soprano 1','[SSAATTBB] Soprano 2']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks.find(function (t) { return t.slotId === 'S1'; })).toBeDefined();
    expect(tracks.find(function (t) { return t.slotId === 'S2'; })).toBeDefined();
  });

  test('display names switch to "Soprano 1" / "Soprano 2" when S1 and S2 are distinct', () => {
    var c = classifyNames(['[SSAATTBB] Soprano 1','[SSAATTBB] Soprano 2']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var s1 = tracks.find(function (t) { return t.slotId === 'S1'; });
    var s2 = tracks.find(function (t) { return t.slotId === 'S2'; });
    expect(s1.displayName).toBe('Soprano 1');
    expect(s2.displayName).toBe('Soprano 2');
  });

  test('Bass 1 / Bass 2 dedup and display name logic mirrors Soprano', () => {
    // SATB Bass → B1, B2 share same part → collapse
    var c = classifyNames(['[SATB] Bass']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var b1 = tracks.find(function (t) { return t.slotId === 'B1'; });
    var b2 = tracks.find(function (t) { return t.slotId === 'B2'; });
    expect(b1).toBeDefined();
    expect(b1.displayName).toBe('Bass');
    expect(b2).toBeUndefined();
  });
});

describe('buildTracks — display names for modifier tracks', () => {
  test('S2Mz is "Soprano / Mezzo-soprano" when S1/S2 are collapsed', () => {
    var c = classifyNames(['[SATB] Soprano','[SMA] Mezzo-soprano']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var mzTrack = tracks.find(function (t) { return t.slotId === 'S2Mz'; });
    expect(mzTrack.displayName).toBe('Soprano / Mezzo-soprano');
  });

  test('S2Mz is "Soprano 2 / Mezzo-soprano" when S1 and S2 are distinct', () => {
    var c = classifyNames(['[SSAATTBB] Soprano 1','[SSAATTBB] Soprano 2','[SMA] Mezzo-soprano']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var mzTrack = tracks.find(function (t) { return t.slotId === 'S2Mz'; });
    expect(mzTrack.displayName).toBe('Soprano 2 / Mezzo-soprano');
  });
});

describe('buildTracks — soloists', () => {
  test('soloists are appended after SATB tracks', () => {
    var c = classifyNames(['[SATB] Soprano','[SOLO] Cantor']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var lastTrack = tracks[tracks.length - 1];
    expect(lastTrack.isSoloist).toBe(true);
    expect(lastTrack.displayName).toBe('Cantor');
  });

  test('each soloist gets slotId "SOLO_<index>"', () => {
    var c = classifyNames(['[SOLO] Cantor','[SOLO] Reader']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks[0].slotId).toBe('SOLO_0');
    expect(tracks[1].slotId).toBe('SOLO_1');
  });

  test('soloist track parts array contains exactly the soloist part', () => {
    var soloistPart = makePart('[SOLO] Cantor');
    var score = makeScore([soloistPart]);
    var c = VT.classifyScore(score);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    expect(tracks[0].parts).toHaveLength(1);
    expect(tracks[0].parts[0]).toBe(soloistPart);
  });

  test('buildTracks with no soloists argument produces no SOLO tracks', () => {
    var c = classifyNames(['[SATB] Soprano']);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent);
    expect(tracks.find(function (t) { return t.isSoloist; })).toBeUndefined();
  });
});

describe('buildTracks — parts array on emitted tracks', () => {
  test('each track carries the correct part objects from classification', () => {
    var sopPart = makePart('[SATB] Soprano');
    var score = makeScore([sopPart]);
    var c = VT.classifyScore(score);
    var tracks = VT.buildTracks(c.slots, c.modifierPresent, c.soloists);
    var s1 = tracks.find(function (t) { return t.slotId === 'S1'; });
    expect(s1.parts).toContain(sopPart);
  });
});

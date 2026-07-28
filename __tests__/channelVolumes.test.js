'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore } = require('./helpers/mockScore');

function partWithVolume(vol, program) {
  return makePart('', '', '', 1, [{ volume: vol, midiProgram: program != null ? program : 0 }]);
}

describe('saveChannelVolumes', () => {
  test('captures volume for every channel', () => {
    var score = makeScore([partWithVolume(64), partWithVolume(32)]);
    var snap  = VT.saveChannelVolumes(score);
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ partIdx: 0, instrIdx: 0, chanIdx: 0, volume: 64 });
    expect(snap[1]).toMatchObject({ partIdx: 1, instrIdx: 0, chanIdx: 0, volume: 32 });
  });
});

describe('applyBackgroundVoices', () => {
  function makeBgEntry(part, family) {
    return { part: part, family: family };
  }

  test('upper family part gets upperBgVolume and upperBgProgram', () => {
    var part  = partWithVolume(100, 0);
    VT.applyBackgroundVoices(makeScore([part]),
      [makeBgEntry(part, 'upper')], 32, 64, 40, 41, 50, 42);
    expect(part.instruments[0].channels[0].volume).toBe(32);
    expect(part.instruments[0].channels[0].midiProgram).toBe(40);
  });

  test('lower family part gets lowerBgVolume and lowerBgProgram', () => {
    var part  = partWithVolume(100, 0);
    VT.applyBackgroundVoices(makeScore([part]),
      [makeBgEntry(part, 'lower')], 32, 64, 40, 41, 50, 42);
    expect(part.instruments[0].channels[0].volume).toBe(64);
    expect(part.instruments[0].channels[0].midiProgram).toBe(41);
  });

  test('solo family part gets soloistBgVolume and soloistBgProgram', () => {
    var part  = partWithVolume(100, 0);
    VT.applyBackgroundVoices(makeScore([part]),
      [makeBgEntry(part, 'solo')], 32, 64, 40, 41, 50, 42);
    expect(part.instruments[0].channels[0].volume).toBe(50);
    expect(part.instruments[0].channels[0].midiProgram).toBe(42);
  });

  test('bgProgram -1 does not overwrite midiProgram', () => {
    var part  = partWithVolume(100, 73);
    VT.applyBackgroundVoices(makeScore([part]),
      [makeBgEntry(part, 'upper')], 32, 64, -1, -1, 50, -1);
    expect(part.instruments[0].channels[0].midiProgram).toBe(73);
    expect(part.instruments[0].channels[0].volume).toBe(32);
  });

  test('bgProgram null does not overwrite midiProgram', () => {
    var part  = partWithVolume(100, 73);
    VT.applyBackgroundVoices(makeScore([part]),
      [makeBgEntry(part, 'lower')], 32, 64, null, null, 50, null);
    expect(part.instruments[0].channels[0].midiProgram).toBe(73);
  });

  test('multiple bg parts each receive their family settings', () => {
    var upper = partWithVolume(100, 0);
    var lower = partWithVolume(100, 0);
    VT.applyBackgroundVoices(makeScore([upper, lower]),
      [makeBgEntry(upper, 'upper'), makeBgEntry(lower, 'lower')],
      32, 64, 40, 41, 50, 42);
    expect(upper.instruments[0].channels[0].volume).toBe(32);
    expect(lower.instruments[0].channels[0].volume).toBe(64);
  });
});

describe('restoreChannelVolumes', () => {
  test('restores volume for each channel', () => {
    var score = makeScore([partWithVolume(64)]);
    var snap  = VT.saveChannelVolumes(score);
    score.parts[0].instruments[0].channels[0].volume = 100;
    VT.restoreChannelVolumes(score, snap);
    expect(score.parts[0].instruments[0].channels[0].volume).toBe(64);
  });

  test('save → applyBackgroundVoices → restore round-trip is lossless', () => {
    var part  = partWithVolume(100, 73);
    var score = makeScore([part]);
    var snap  = VT.saveChannelVolumes(score);
    VT.applyBackgroundVoices(score, [{ part: part, family: 'upper' }], 32, 64, 40, 41, 50, 42);
    VT.restoreChannelVolumes(score, snap);
    expect(part.instruments[0].channels[0].volume).toBe(100);
  });
});

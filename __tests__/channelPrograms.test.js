'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore } = require('./helpers/mockScore');

function scoreWithPrograms(partPrograms) {
  var parts = partPrograms.map(function (prog) {
    return makePart('', '', '', 1, [{ midiProgram: prog }]);
  });
  return makeScore(parts);
}

describe('saveChannelPrograms', () => {
  test('captures midiProgram for every channel', () => {
    var score = scoreWithPrograms([40, 73]);
    var snap  = VT.saveChannelPrograms(score);
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({ partIdx: 0, instrIdx: 0, chanIdx: 0, program: 40 });
    expect(snap[1]).toMatchObject({ partIdx: 1, instrIdx: 0, chanIdx: 0, program: 73 });
  });
});

describe('applyChannelPrograms', () => {
  test('upper slot track gets upperProgram', () => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 0 }]);
    var track = { slotId: 'S1', parts: [part] };
    VT.applyChannelPrograms(makeScore([part]), track, 40, 42);
    expect(part.instruments[0].channels[0].midiProgram).toBe(40);
  });

  test('lower slot track gets lowerProgram', () => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 0 }]);
    var track = { slotId: 'T1', parts: [part] };
    VT.applyChannelPrograms(makeScore([part]), track, 40, 42);
    expect(part.instruments[0].channels[0].midiProgram).toBe(42);
  });

  test('SOLO_ prefix track is a no-op', () => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 0 }]);
    var track = { slotId: 'SOLO_0', parts: [part] };
    VT.applyChannelPrograms(makeScore([part]), track, 40, 42);
    expect(part.instruments[0].channels[0].midiProgram).toBe(0);
  });

  test('program -1 is a no-op (keep original)', () => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 73 }]);
    var track = { slotId: 'A1', parts: [part] };
    VT.applyChannelPrograms(makeScore([part]), track, -1, -1);
    expect(part.instruments[0].channels[0].midiProgram).toBe(73);
  });

  test.each(['S1','S2','S2Mz','A1Mz','A1','A2'])('%s is an upper slot', (slotId) => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 0 }]);
    var track = { slotId: slotId, parts: [part] };
    VT.applyChannelPrograms(makeScore([part]), track, 40, 42);
    expect(part.instruments[0].channels[0].midiProgram).toBe(40);
  });

  test.each(['T1','T2','T2Bar','B1Bar','B1','B2'])('%s is a lower slot', (slotId) => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 0 }]);
    var track = { slotId: slotId, parts: [part] };
    VT.applyChannelPrograms(makeScore([part]), track, 40, 42);
    expect(part.instruments[0].channels[0].midiProgram).toBe(42);
  });
});

describe('restoreChannelPrograms', () => {
  test('restores midiProgram for each channel', () => {
    var score = scoreWithPrograms([40, 73]);
    var snap  = VT.saveChannelPrograms(score);
    score.parts[0].instruments[0].channels[0].midiProgram = 99;
    score.parts[1].instruments[0].channels[0].midiProgram = 0;
    VT.restoreChannelPrograms(score, snap);
    expect(score.parts[0].instruments[0].channels[0].midiProgram).toBe(40);
    expect(score.parts[1].instruments[0].channels[0].midiProgram).toBe(73);
  });

  test('save → apply → restore round-trip leaves programs unchanged', () => {
    var part  = makePart('', '', '', 1, [{ midiProgram: 73 }]);
    var score = makeScore([part]);
    var track = { slotId: 'S1', parts: [part] };
    var snap  = VT.saveChannelPrograms(score);
    VT.applyChannelPrograms(score, track, 40, 42);
    VT.restoreChannelPrograms(score, snap);
    expect(part.instruments[0].channels[0].midiProgram).toBe(73);
  });
});

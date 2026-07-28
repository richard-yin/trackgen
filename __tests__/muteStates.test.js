'use strict';

const VT = require('./helpers/voiceTypes.shim');
const { makePart, makeScore } = require('./helpers/mockScore');

function twoPartScore() {
  return makeScore([
    makePart('[SATB] Soprano', '', '', 1, [{ mute: false }, { mute: true }]),
    makePart('[SATB] Alto',    '', '', 1, [{ mute: true  }]),
  ]);
}

describe('saveMuteStates', () => {
  test('captures mute value for every channel across all parts', () => {
    var score = twoPartScore();
    var snap = VT.saveMuteStates(score);

    expect(snap).toHaveLength(3); // 2 channels on part 0, 1 on part 1
    expect(snap[0]).toEqual({ partIdx: 0, instrIdx: 0, chanIdx: 0, wasMuted: false });
    expect(snap[1]).toEqual({ partIdx: 0, instrIdx: 0, chanIdx: 1, wasMuted: true  });
    expect(snap[2]).toEqual({ partIdx: 1, instrIdx: 0, chanIdx: 0, wasMuted: true  });
  });

  test('snapshot is independent — mutating the score does not change snapshot values', () => {
    var score = twoPartScore();
    var snap = VT.saveMuteStates(score);
    score.parts[0].instruments[0].channels[0].mute = true;
    expect(snap[0].wasMuted).toBe(false);
  });
});

describe('applyMutesForTrack', () => {
  test('parts in trackParts are unmuted', () => {
    var score = makeScore([makePart('A', '', '', 1, [{ mute: true }])]);
    VT.applyMutesForTrack(score, [score.parts[0]], [], []);
    expect(score.parts[0].instruments[0].channels[0].mute).toBe(false);
  });

  test('parts in bgParts are unmuted', () => {
    var score = makeScore([makePart('B', '', '', 1, [{ mute: true }])]);
    VT.applyMutesForTrack(score, [], [score.parts[0]], []);
    expect(score.parts[0].instruments[0].channels[0].mute).toBe(false);
  });

  test('parts in instrumentalParts are unmuted', () => {
    var score = makeScore([makePart('C', '', '', 1, [{ mute: true }])]);
    VT.applyMutesForTrack(score, [], [], [score.parts[0]]);
    expect(score.parts[0].instruments[0].channels[0].mute).toBe(false);
  });

  test('parts in none of the three arrays are muted', () => {
    var score = makeScore([makePart('D', '', '', 1, [{ mute: false }])]);
    VT.applyMutesForTrack(score, [], [], []);
    expect(score.parts[0].instruments[0].channels[0].mute).toBe(true);
  });

  test('three-part score: only the track part is unmuted, other two are muted', () => {
    var track = makePart('[SATB] Soprano');
    var bg    = makePart('[SATB] Alto');
    var other = makePart('[SATB] Tenor');
    var score = makeScore([track, bg, other]);
    // Pass bg as instrumental to simplify (both scenarios covered separately above)
    VT.applyMutesForTrack(score, [track], [], []);
    expect(score.parts[0].instruments[0].channels[0].mute).toBe(false);
    expect(score.parts[1].instruments[0].channels[0].mute).toBe(true);
    expect(score.parts[2].instruments[0].channels[0].mute).toBe(true);
  });
});

describe('restoreMuteStates', () => {
  test('restores each channel to its snapshotted mute value', () => {
    var score = twoPartScore();
    var snap = VT.saveMuteStates(score);

    // Flip everything
    score.parts[0].instruments[0].channels[0].mute = true;
    score.parts[0].instruments[0].channels[1].mute = false;
    score.parts[1].instruments[0].channels[0].mute = false;

    VT.restoreMuteStates(score, snap);

    expect(score.parts[0].instruments[0].channels[0].mute).toBe(false);
    expect(score.parts[0].instruments[0].channels[1].mute).toBe(true);
    expect(score.parts[1].instruments[0].channels[0].mute).toBe(true);
  });

  test('save → apply → restore leaves score in original state', () => {
    var score  = twoPartScore();
    var before = VT.saveMuteStates(score).map(function (e) { return e.wasMuted; });
    var snap   = VT.saveMuteStates(score);
    VT.applyMutesForTrack(score, [], [], []);
    VT.restoreMuteStates(score, snap);
    var after  = VT.saveMuteStates(score).map(function (e) { return e.wasMuted; });
    expect(after).toEqual(before);
  });
});

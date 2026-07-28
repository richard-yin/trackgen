'use strict';

const VT = require('./helpers/voiceTypes.shim');

describe('parseStaff', () => {
  describe('valid SATB prefixes', () => {
    test.each([
      ['[SATB] Soprano',      { prefix: 'SATB', voiceName: 'Soprano'      }],
      ['[SATB] Alto',         { prefix: 'SATB', voiceName: 'Alto'         }],
      ['[SATB] Tenor',        { prefix: 'SATB', voiceName: 'Tenor'        }],
      ['[SATB] Bass',         { prefix: 'SATB', voiceName: 'Bass'         }],
      ['[SA] Soprano',        { prefix: 'SA',   voiceName: 'Soprano'      }],
      ['[SA] Alto',           { prefix: 'SA',   voiceName: 'Alto'         }],
      ['[TB] Tenor',          { prefix: 'TB',   voiceName: 'Tenor'        }],
      ['[TB] Bass',           { prefix: 'TB',   voiceName: 'Bass'         }],
      ['[SSAA] Soprano 1',    { prefix: 'SSAA', voiceName: 'Soprano 1'    }],
      ['[SSAA] Soprano 2',    { prefix: 'SSAA', voiceName: 'Soprano 2'    }],
      ['[SSAA] Alto 1',       { prefix: 'SSAA', voiceName: 'Alto 1'       }],
      ['[SSAA] Alto 2',       { prefix: 'SSAA', voiceName: 'Alto 2'       }],
      ['[TTBB] Tenor 1',      { prefix: 'TTBB', voiceName: 'Tenor 1'      }],
      ['[TTBB] Tenor 2',      { prefix: 'TTBB', voiceName: 'Tenor 2'      }],
      ['[TTBB] Bass 1',       { prefix: 'TTBB', voiceName: 'Bass 1'       }],
      ['[TTBB] Bass 2',       { prefix: 'TTBB', voiceName: 'Bass 2'       }],
      ['[SMA] Mezzo-soprano',   { prefix: 'SMA',  voiceName: 'Mezzo-soprano' }],
      ['[TBB] Baritone',        { prefix: 'TBB',  voiceName: 'Baritone'      }],
      ['[SSAATTBB] Bass 1',     { prefix: 'SSAATTBB', voiceName: 'Bass 1'    }],
      ['[SSAATTBB] Tenor 2',    { prefix: 'SSAATTBB', voiceName: 'Tenor 2'   }],
      ['[SMATBB] Baritone',     { prefix: 'SMATBB',   voiceName: 'Baritone'  }],
      ['[SATBB] Baritone',      { prefix: 'SATBB',    voiceName: 'Baritone'  }],
      ['[SATTBB] Tenor 1',      { prefix: 'SATTBB',   voiceName: 'Tenor 1'   }],
      ['[SSAATB] Soprano 1',    { prefix: 'SSAATB',   voiceName: 'Soprano 1' }],
      ['[SSAATBB] Baritone',    { prefix: 'SSAATBB',  voiceName: 'Baritone'  }],
      ['[SMATTBB] Mezzo-soprano',{ prefix: 'SMATTBB', voiceName: 'Mezzo-soprano' }],
      ['[SMATB] Mezzo-soprano',  { prefix: 'SMATB',   voiceName: 'Mezzo-soprano' }],
    ])('%s', (name, expected) => {
      expect(VT.parseStaff(name)).toEqual(expected);
    });
  });

  describe('extra whitespace is trimmed', () => {
    test('[SATB]  Soprano  (extra spaces)', () => {
      expect(VT.parseStaff('[SATB]  Soprano')).toEqual({ prefix: 'SATB', voiceName: 'Soprano' });
    });
  });

  describe('case-insensitivity: prefix is upper-cased, voice name lookup is lower-cased', () => {
    test('[satb] Soprano — prefix normalised to SATB', () => {
      expect(VT.parseStaff('[satb] Soprano')).toEqual({ prefix: 'SATB', voiceName: 'Soprano' });
    });

    test('[Satb] Soprano — prefix normalised to SATB', () => {
      expect(VT.parseStaff('[Satb] Soprano')).toEqual({ prefix: 'SATB', voiceName: 'Soprano' });
    });

    test('[SATB] soprano — voice name accepted (lookup is case-insensitive), preserved as-is', () => {
      expect(VT.parseStaff('[SATB] soprano')).toEqual({ prefix: 'SATB', voiceName: 'soprano' });
    });

    test('[SATB] SOPRANO — voice name accepted, preserved as-is', () => {
      expect(VT.parseStaff('[SATB] SOPRANO')).toEqual({ prefix: 'SATB', voiceName: 'SOPRANO' });
    });
  });

  describe('returns null for non-matching input', () => {
    test.each([
      ['empty string',         ''],
      ['null',                 null],
      ['no brackets',          'Soprano'],
      ['unknown prefix',       '[XYZ] Soprano'],
      ['valid prefix, wrong voice name', '[SATB] Mezzo-soprano'],
      ['[SOLO] prefix',        '[SOLO] Cantor'],
      ['no voice name',        '[SATB]'],
    ])('%s → null', (_, name) => {
      expect(VT.parseStaff(name)).toBeNull();
    });
  });
});

describe('_parseSolo', () => {
  test('returns prefix and voiceName for [SOLO] Cantor', () => {
    expect(VT._parseSolo('[SOLO] Cantor')).toEqual({ prefix: 'SOLO', voiceName: 'Cantor' });
  });

  test('defaults voiceName to "Soloist" when text after [SOLO] is blank', () => {
    expect(VT._parseSolo('[SOLO]')).toEqual({ prefix: 'SOLO', voiceName: 'Soloist' });
    expect(VT._parseSolo('[SOLO]   ')).toEqual({ prefix: 'SOLO', voiceName: 'Soloist' });
  });

  test('is case-insensitive on the SOLO keyword', () => {
    expect(VT._parseSolo('[solo] Cantor')).toEqual({ prefix: 'SOLO', voiceName: 'Cantor' });
    expect(VT._parseSolo('[Solo] Cantor')).toEqual({ prefix: 'SOLO', voiceName: 'Cantor' });
  });

  test('preserves multi-word soloist names', () => {
    expect(VT._parseSolo('[SOLO] Guest Soloist')).toEqual({ prefix: 'SOLO', voiceName: 'Guest Soloist' });
  });

  test.each([
    ['empty string', ''],
    ['null', null],
    ['no brackets', 'Cantor'],
    ['SATB part', '[SATB] Soprano'],
  ])('returns null for %s', (_, name) => {
    expect(VT._parseSolo(name)).toBeNull();
  });
});

describe('getVoiceAbbrev', () => {
  test.each([
    ['soprano',       'S'  ],
    ['alto',          'A'  ],
    ['tenor',         'T'  ],
    ['bass',          'B'  ],
    ['mezzo-soprano', 'Mz' ],
    ['baritone',      'Bar'],
    ['soprano 1',     'S1' ],
    ['soprano 2',     'S2' ],
    ['alto 1',        'A1' ],
    ['alto 2',        'A2' ],
    ['tenor 1',       'T1' ],
    ['tenor 2',       'T2' ],
    ['bass 1',        'B1' ],
    ['bass 2',        'B2' ],
  ])('%s → %s', (voiceName, expected) => {
    expect(VT.getVoiceAbbrev(voiceName)).toBe(expected);
  });

  test('falls back to the original name when not in the map', () => {
    expect(VT.getVoiceAbbrev('Countertenor')).toBe('Countertenor');
  });
});

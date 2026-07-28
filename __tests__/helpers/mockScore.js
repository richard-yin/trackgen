'use strict';

/**
 * Factory helpers for constructing minimal MuseScore-like objects.
 * All fields present in the real API that voiceTypes.js touches are included.
 */

function makeChannel(opts) {
  return Object.assign({ mute: false, midiProgram: 0, volume: 100 }, opts || {});
}

function makeInstrument(channels) {
  return { channels: channels || [makeChannel()] };
}

/**
 * makePart(longName, shortName?, partName?, nstaves?, instrumentOpts?)
 *
 * instrumentOpts: array of channel option objects, one per channel on the
 * single instrument.  Defaults to one channel with factory defaults.
 */
function makePart(longName, shortName, partName, nstaves, channelOptsList) {
  var channels = (channelOptsList || [{}]).map(makeChannel);
  return {
    longName:   longName  || '',
    shortName:  shortName || '',
    partName:   partName  || '',
    nstaves:    nstaves   || 1,
    instruments: [makeInstrument(channels)],
  };
}

/** makeScore(parts[]) */
function makeScore(parts) {
  return { parts: parts || [] };
}

/**
 * makeMeasure(opts)
 * opts: { irregular, excludeFromNumbering, noOffset, measureNumberOffset, tick, next }
 * Produces a linked-list node compatible with buildMeasureMap.
 */
function makeMeasure(opts) {
  opts = opts || {};
  return {
    irregular:              opts.irregular              || false,
    excludeFromNumbering:   opts.excludeFromNumbering   || false,
    noOffset:               opts.noOffset               || 0,
    measureNumberOffset:    opts.measureNumberOffset    || 0,
    firstSegment:           { tick: opts.tick != null ? opts.tick : 0 },
    nextMeasure:            opts.next                   || null,
  };
}

/**
 * linkMeasures(list)
 * Given an array of makeMeasure option objects, builds a linked list and
 * returns score.firstMeasure (the head).
 */
function linkMeasures(optsList) {
  var nodes = optsList.map(makeMeasure);
  for (var i = 0; i < nodes.length - 1; i++) {
    nodes[i].nextMeasure = nodes[i + 1];
  }
  return nodes[0] || null;
}

/**
 * makeCursorFactory(elementsList)
 *
 * Returns a function() that, when called, produces a fresh stateful cursor
 * mock each time (suitable for score.newCursor).
 *
 * elementsList: [{ tick, type }]  — type === 9 (Element.REST) or a note type.
 * The cursor visits elements in tick order.  rewindToTick seeks to the first
 * element with tick >= the given value.
 */
function makeCursorFactory(elementsList) {
  return function newCursor() {
    var elements = elementsList || [];
    var idx = 0;
    return {
      filter:   null,
      staffIdx: 0,
      rewindToTick: function (t) {
        idx = 0;
        while (idx < elements.length && elements[idx].tick < t) idx++;
      },
      get segment() { return idx < elements.length ? {} : null; },
      get tick()    { return idx < elements.length ? elements[idx].tick : Infinity; },
      get element() {
        return idx < elements.length ? { type: elements[idx].type } : null;
      },
      next: function () { idx++; return idx < elements.length; },
    };
  };
}

module.exports = {
  makeChannel,
  makeInstrument,
  makePart,
  makeScore,
  makeMeasure,
  linkMeasures,
  makeCursorFactory,
};

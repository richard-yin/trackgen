.pragma library

// ─── Slot order & metadata ────────────────────────────────────────────────────

var SLOT_ORDER = ["S1","S2","S2Mz","A1Mz","A1","A2","T1","T2","T2Bar","B1Bar","B1","B2"];

// Modifier slots are only emitted when a Mezzo-soprano or Baritone stave is
// present in them; non-modifier staves that also map there do not trigger emission.
var MODIFIER_SLOTS      = { "S2Mz":true, "A1Mz":true, "T2Bar":true, "B1Bar":true };
var MODIFIER_VOICE_NAMES = { "mezzo-soprano":true, "baritone":true };

// Upper family: S*/A*  Lower family: T*/B*
var UPPER_SLOT_IDS = { "S1":true,"S2":true,"S2Mz":true,"A1Mz":true,"A1":true,"A2":true };

// Abbreviations used in the track-list parentheticals
var VOICE_ABBREV = {
    "soprano":"S",  "alto":"A",  "tenor":"T",  "bass":"B",
    "mezzo-soprano":"Mz",  "baritone":"Bar",
    "soprano 1":"S1", "soprano 2":"S2",
    "alto 1":"A1",    "alto 2":"A2",
    "tenor 1":"T1",   "tenor 2":"T2",
    "bass 1":"B1",    "bass 2":"B2"
};

// ─── Prefix → voice name → [slot, …] mapping ─────────────────────────────────
//
// Rules encoded here:
//  • Unison configs (SATB Soprano, SA Soprano, TB Tenor, …) include the
//    combined slots (S2Mz, A1Mz, T2Bar, B1Bar) because all singers of that
//    family sing together.
//  • Split upper configs (SMA, SMATB, SMATBB) do NOT include S2Mz/A1Mz in
//    Soprano/Alto — those slots are triggered only by the Mezzo-soprano stave.
//  • Modifier staves (Mezzo-soprano, Baritone) feed exactly two combined slots.

var VOICE_MAP = {
    "SA": {
        "soprano": ["S1","S2","S2Mz"],
        "alto":    ["A1","A2","A1Mz"]
    },
    "SMA": {
        "soprano":       ["S1","S2"],
        "mezzo-soprano": ["S2Mz","A1Mz"],
        "alto":          ["A1","A2"]
    },
    "SSAA": {
        "soprano 1": ["S1"],
        "soprano 2": ["S2","S2Mz"],
        "alto 1":    ["A1","A1Mz"],
        "alto 2":    ["A2"]
    },
    "TB": {
        "tenor": ["T1","T2","T2Bar"],
        "bass":  ["B1","B2","B1Bar"]
    },
    "TBB": {
        "tenor":    ["T1","T2"],
        "baritone": ["T2Bar","B1Bar"],
        "bass":     ["B1","B2"]
    },
    "TTBB": {
        "tenor 1": ["T1"],
        "tenor 2": ["T2","T2Bar"],
        "bass 1":  ["B1","B1Bar"],
        "bass 2":  ["B2"]
    },
    "SATB": {
        "soprano": ["S1","S2","S2Mz"],
        "alto":    ["A1","A2","A1Mz"],
        "tenor":   ["T1","T2","T2Bar"],
        "bass":    ["B1","B2","B1Bar"]
    },
    "SMATB": {
        "soprano":       ["S1","S2"],
        "mezzo-soprano": ["S2Mz","A1Mz"],
        "alto":          ["A1","A2"],
        "tenor":         ["T1","T2","T2Bar"],
        "bass":          ["B1","B2","B1Bar"]
    },
    "SMATBB": {
        "soprano":       ["S1","S2"],
        "mezzo-soprano": ["S2Mz","A1Mz"],
        "alto":          ["A1","A2"],
        "tenor":         ["T1","T2"],
        "baritone":      ["T2Bar","B1Bar"],
        "bass":          ["B1","B2"]
    },
    "SATBB": {
        "soprano":  ["S1","S2","S2Mz"],
        "alto":     ["A1","A2","A1Mz"],
        "tenor":    ["T1","T2"],
        "baritone": ["T2Bar","B1Bar"],
        "bass":     ["B1","B2"]
    },
    "SSAATTBB": {
        "soprano 1": ["S1"],
        "soprano 2": ["S2","S2Mz"],
        "alto 1":    ["A1","A1Mz"],
        "alto 2":    ["A2"],
        "tenor 1":   ["T1"],
        "tenor 2":   ["T2","T2Bar"],
        "bass 1":    ["B1","B1Bar"],
        "bass 2":    ["B2"]
    }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Returns { prefix:"SOLO", voiceName } if name matches [SOLO] prefix, else null.
// voiceName is the free-form text after [SOLO]; defaults to "Soloist" if blank.
function _parseSolo(name) {
    if (!name || name.length === 0) return null;
    var m = name.match(/^\[SOLO\]\s*(.*)/i);
    if (!m) return null;
    return { prefix: "SOLO", voiceName: m[1].trim() || "Soloist" };
}

function _partInArray(part, arr) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === part) return true;
    }
    return false;
}

function _samePartSets(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
        if (!_partInArray(a[i], b)) return false;
    }
    return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Returns the abbreviated voice name used in parentheticals.
function getVoiceAbbrev(voiceName) {
    return VOICE_ABBREV[voiceName.toLowerCase()] || voiceName;
}

// parseStaff(name)
// → { prefix: "SATB", voiceName: "Soprano" } | null
function parseStaff(name) {
    if (!name || name.length === 0) return null;
    var m = name.match(/^\[([A-Za-z]+)\]\s*(.*)/);
    if (!m) return null;
    var prefix = m[1].toUpperCase();
    var voiceName = m[2].trim();
    if (!VOICE_MAP[prefix]) return null;
    if (!VOICE_MAP[prefix][voiceName.toLowerCase()]) return null;
    return { prefix: prefix, voiceName: voiceName };
}

// classifyScore(score)
// → { slots, instrumentals, soloists, modifierPresent, partMeta }
//
// soloists:  [{ part, displayName }]  — parts with [SOLO] prefix, in score order
// partMeta[partIdx] = { prefix, voiceName } for all classified parts (SATB + SOLO);
//                     undefined for pure instrumentals.
function classifyScore(score) {
    var i, p;
    var slots = {}, modifierPresent = {};
    for (i = 0; i < SLOT_ORDER.length; i++) slots[SLOT_ORDER[i]] = [];
    var instrumentals = [], soloists = [], partMeta = [];

    for (p = 0; p < score.parts.length; p++) {
        var part = score.parts[p];
        var parsed = parseStaff(part.longName) ||
                     parseStaff(part.shortName) ||
                     parseStaff(part.partName);
        if (!parsed) {
            // Not a recognised SATB part — check for [SOLO] prefix.
            var soloMeta = _parseSolo(part.longName) ||
                           _parseSolo(part.shortName) ||
                           _parseSolo(part.partName);
            if (soloMeta) {
                partMeta[p] = soloMeta;
                soloists.push({ part: part, displayName: soloMeta.voiceName });
            } else {
                instrumentals.push(part);
            }
            continue;
        }

        partMeta[p] = parsed;
        var mapping = VOICE_MAP[parsed.prefix][parsed.voiceName.toLowerCase()];
        for (i = 0; i < mapping.length; i++) slots[mapping[i]].push(part);
        if (MODIFIER_VOICE_NAMES[parsed.voiceName.toLowerCase()]) {
            for (i = 0; i < mapping.length; i++) modifierPresent[mapping[i]] = true;
        }
    }

    return { slots: slots, instrumentals: instrumentals, soloists: soloists,
             modifierPresent: modifierPresent, partMeta: partMeta };
}

// buildTracks(slots, modifierPresent, soloists)
// → [{ slotId, displayName, parts:[Part], isSoloist? }]
// SATB tracks first (ordered by SLOT_ORDER, non-empty only), then one track per soloist.
// soloists = [{ part, displayName }] as returned by classifyScore (may be omitted / []).
function buildTracks(slots, modifierPresent, soloists) {
    var i, sid;

    // Step 1: which slots emit a track?
    var emit = {};
    for (i = 0; i < SLOT_ORDER.length; i++) {
        sid = SLOT_ORDER[i];
        if (!slots[sid] || slots[sid].length === 0) { emit[sid] = false; continue; }
        if (MODIFIER_SLOTS[sid] && !modifierPresent[sid])  { emit[sid] = false; continue; }
        emit[sid] = true;
    }

    // Step 2: dedup sibling pairs — if S1/S2 (or A1/A2, T1/T2, B1/B2) contain
    // exactly the same parts, collapse the junior slot (S2/A2/T2/B2).
    var PAIRS = [["S1","S2"],["A1","A2"],["T1","T2"],["B1","B2"]];
    var collapsed = {};
    for (i = 0; i < PAIRS.length; i++) {
        var sn = PAIRS[i][0], jn = PAIRS[i][1];
        if (emit[sn] && emit[jn] && _samePartSets(slots[sn], slots[jn])) {
            collapsed[jn] = true;
            emit[jn] = false;
        }
    }

    function isDistinct(s) { return !!(emit[s] && !collapsed[s]); }

    // Step 3: display names
    var dn = {};
    if (isDistinct("S1") && isDistinct("S2")) { dn["S1"] = "Soprano 1"; dn["S2"] = "Soprano 2"; }
    else                                       { dn["S1"] = "Soprano";   dn["S2"] = "Soprano";   }
    dn["S2Mz"] = isDistinct("S2") ? "Soprano 2 / Mezzo-soprano" : "Soprano / Mezzo-soprano";

    if (isDistinct("A1") && isDistinct("A2")) { dn["A1"] = "Alto 1"; dn["A2"] = "Alto 2"; }
    else                                       { dn["A1"] = "Alto";   dn["A2"] = "Alto";   }
    dn["A1Mz"] = isDistinct("A1") ? "Alto 1 / Mezzo-soprano" : "Alto / Mezzo-soprano";

    if (isDistinct("T1") && isDistinct("T2")) { dn["T1"] = "Tenor 1"; dn["T2"] = "Tenor 2"; }
    else                                       { dn["T1"] = "Tenor";   dn["T2"] = "Tenor";   }
    dn["T2Bar"] = isDistinct("T2") ? "Tenor 2 / Baritone" : "Tenor / Baritone";

    if (isDistinct("B1") && isDistinct("B2")) { dn["B1"] = "Bass 1"; dn["B2"] = "Bass 2"; }
    else                                       { dn["B1"] = "Bass";   dn["B2"] = "Bass";   }
    dn["B1Bar"] = isDistinct("B1") ? "Bass 1 / Baritone" : "Bass / Baritone";

    // Step 4: assemble SATB tracks in canonical order
    var result = [];
    for (i = 0; i < SLOT_ORDER.length; i++) {
        sid = SLOT_ORDER[i];
        if (!emit[sid]) continue;
        result.push({ slotId: sid, displayName: dn[sid], parts: slots[sid] });
    }

    // Step 5: append one track per soloist
    if (soloists) {
        for (i = 0; i < soloists.length; i++) {
            result.push({
                slotId:      "SOLO_" + i,
                displayName: soloists[i].displayName,
                parts:       [soloists[i].part],
                isSoloist:   true
            });
        }
    }

    return result;
}

// buildPartFamilyMap(slots, soloists)
// → [{ part, family:"upper"|"lower"|"solo" }]  deduplicated, upper then lower then soloists
// soloists = [{ part, displayName }] as returned by classifyScore (may be omitted / []).
function buildPartFamilyMap(slots, soloists) {
    var result = [], seen = [], s, p;
    var upperSlots = ["S1","S2","S2Mz","A1Mz","A1","A2"];
    var lowerSlots = ["T1","T2","T2Bar","B1Bar","B1","B2"];
    for (s = 0; s < upperSlots.length; s++) {
        var up = slots[upperSlots[s]];
        for (p = 0; p < up.length; p++) {
            if (!_partInArray(up[p], seen)) { result.push({part:up[p], family:"upper"}); seen.push(up[p]); }
        }
    }
    for (s = 0; s < lowerSlots.length; s++) {
        var lp = slots[lowerSlots[s]];
        for (p = 0; p < lp.length; p++) {
            if (!_partInArray(lp[p], seen)) { result.push({part:lp[p], family:"lower"}); seen.push(lp[p]); }
        }
    }
    if (soloists) {
        for (s = 0; s < soloists.length; s++) {
            result.push({ part: soloists[s].part, family: "solo" });
        }
    }
    return result;
}

// ─── Mute save / apply / restore ─────────────────────────────────────────────

// saveMuteStates(score)
// → snapshot: [{ partIdx, instrIdx, chanIdx, wasMuted }]
function saveMuteStates(score) {
    var snap = [];
    for (var p = 0; p < score.parts.length; p++) {
        var part = score.parts[p];
        for (var i = 0; i < part.instruments.length; i++) {
            for (var k = 0; k < part.instruments[i].channels.length; k++) {
                snap.push({ partIdx:p, instrIdx:i, chanIdx:k,
                            wasMuted: part.instruments[i].channels[k].mute });
            }
        }
    }
    return snap;
}

// applyMutesForTrack(score, trackParts, bgParts, instrumentalParts)
// Mutes every part except trackParts, bgParts, and instrumentalParts.
// bgParts here is a plain array of Part objects (not {part,family} objects).
function applyMutesForTrack(score, trackParts, bgParts, instrumentalParts) {
    for (var p = 0; p < score.parts.length; p++) {
        var part = score.parts[p];
        var mute = !_partInArray(part, trackParts) &&
                   !_partInArray(part, bgParts) &&
                   !_partInArray(part, instrumentalParts);
        for (var i = 0; i < part.instruments.length; i++) {
            for (var k = 0; k < part.instruments[i].channels.length; k++) {
                part.instruments[i].channels[k].mute = mute;
            }
        }
    }
}

function restoreMuteStates(score, snapshot) {
    for (var s = 0; s < snapshot.length; s++) {
        var e = snapshot[s];
        score.parts[e.partIdx].instruments[e.instrIdx].channels[e.chanIdx].mute = e.wasMuted;
    }
}

// ─── Channel program save / apply / restore ───────────────────────────────────

// saveChannelPrograms(score)
// → snapshot: [{ partIdx, instrIdx, chanIdx, program }]
function saveChannelPrograms(score) {
    var snap = [];
    for (var p = 0; p < score.parts.length; p++) {
        var part = score.parts[p];
        for (var i = 0; i < part.instruments.length; i++) {
            for (var k = 0; k < part.instruments[i].channels.length; k++) {
                snap.push({ partIdx:p, instrIdx:i, chanIdx:k,
                            program: part.instruments[i].channels[k].midiProgram });
            }
        }
    }
    return snap;
}

// applyChannelPrograms(score, track, upperProgram, lowerProgram)
// Routes by slot family: S*/A* → upperProgram; T*/B* → lowerProgram.
// No-op for soloist tracks (slotId starts with "SOLO_") — they have no voice instrument picker.
// No-op for a given family if its program is null / undefined / -1.
// Instrumental parts are never in track.parts so they are unaffected.
function applyChannelPrograms(score, track, upperProgram, lowerProgram) {
    if (track.slotId.indexOf("SOLO_") === 0) return;
    var program = UPPER_SLOT_IDS[track.slotId] ? upperProgram : lowerProgram;
    if (program === null || program === undefined || program < 0) return;
    for (var p = 0; p < track.parts.length; p++) {
        var part = track.parts[p];
        for (var i = 0; i < part.instruments.length; i++) {
            for (var k = 0; k < part.instruments[i].channels.length; k++) {
                part.instruments[i].channels[k].midiProgram = program;
            }
        }
    }
}

function restoreChannelPrograms(score, snapshot) {
    for (var s = 0; s < snapshot.length; s++) {
        var e = snapshot[s];
        score.parts[e.partIdx].instruments[e.instrIdx].channels[e.chanIdx].midiProgram = e.program;
    }
}

// ─── Channel volume save / apply / restore ────────────────────────────────────

// saveChannelVolumes(score)
// → snapshot: [{ partIdx, instrIdx, chanIdx, volume }]
function saveChannelVolumes(score) {
    var snap = [];
    for (var p = 0; p < score.parts.length; p++) {
        var part = score.parts[p];
        for (var i = 0; i < part.instruments.length; i++) {
            for (var k = 0; k < part.instruments[i].channels.length; k++) {
                snap.push({ partIdx:p, instrIdx:i, chanIdx:k,
                            volume: part.instruments[i].channels[k].volume });
            }
        }
    }
    return snap;
}

// applyBackgroundVoices(score, bgParts, upperBgVolume, lowerBgVolume,
//                       upperBgProgram, lowerBgProgram,
//                       soloistBgVolume, soloistBgProgram)
// bgParts = [{ part, family:"upper"|"lower"|"solo" }]
// Routes by family: upper → upper params, lower → lower params, solo → soloist params.
// Sets channel.volume = bgVolume and, if bgProgram ≥ 0, channel.midiProgram = bgProgram.
function applyBackgroundVoices(score, bgParts, upperBgVolume, lowerBgVolume,
                                upperBgProgram, lowerBgProgram,
                                soloistBgVolume, soloistBgProgram) {
    for (var p = 0; p < bgParts.length; p++) {
        var pf   = bgParts[p];
        var vol  = pf.family === "upper" ? upperBgVolume
                 : pf.family === "lower" ? lowerBgVolume
                 : soloistBgVolume;
        var prg  = pf.family === "upper" ? upperBgProgram
                 : pf.family === "lower" ? lowerBgProgram
                 : soloistBgProgram;
        for (var i = 0; i < pf.part.instruments.length; i++) {
            for (var k = 0; k < pf.part.instruments[i].channels.length; k++) {
                pf.part.instruments[i].channels[k].volume = vol;
                if (prg !== null && prg !== undefined && prg >= 0) {
                    pf.part.instruments[i].channels[k].midiProgram = prg;
                }
            }
        }
    }
}

function restoreChannelVolumes(score, snapshot) {
    for (var s = 0; s < snapshot.length; s++) {
        var e = snapshot[s];
        score.parts[e.partIdx].instruments[e.instrIdx].channels[e.chanIdx].volume = e.volume;
    }
}

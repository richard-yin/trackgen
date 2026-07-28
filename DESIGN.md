# TrackGen — Design Document

> This document is the living design reference for the TrackGen MuseScore 4 plugin.
> Update it alongside any feature additions or API behaviour discoveries.

## Overview

Convert a vocal-instrumental MuseScore score into per-singer learning tracks (MP3), each containing that singer's voice parts plus all instrumental parts. Classification and muting are fully instrument-agnostic — driven solely by `longName` text prefixes.

Three part categories are recognised:
- **SATB-scheme parts** — `[PREFIX] Voice Name` where PREFIX is one of the 11 supported configuration tags. Mapped into canonical voice slots and combined across sections.
- **Soloist parts** — `[SOLO] Voice Name` (free-form name). Each soloist generates its own track and can appear as a background voice in SATB tracks.
- **Instrumental parts** — no recognised prefix. Always present and unmuted in every track.

---

## Constraints & API Reality

- **Channel muting** is the only reliable per-part playback control: `part.instruments[j].channels[k].mute = true/false`
- **Classification is instrument-agnostic**: parts are identified solely by the `[PREFIX]` in `part.longName` (or `shortName` / `partName` as text fallbacks). No `instrumentId`, MIDI program, sound bank, or sound name is read at any point. A choir part named without a prefix is instrumental; a piano named `[SATB] Soprano` would be treated as soprano — the name alone decides.
- **Muting is instrument-agnostic**: `saveMuteStates` / `applyMutesForTrack` / `restoreMuteStates` iterate all `instruments[j].channels[k]` exhaustively. A part is fully silenced regardless of how many channels or instruments it contains and regardless of what sounds those channels use (voice, piano, pizzicato, etc.).
- **MIDI instrument selection** (optional, per output track): the user may choose a playback instrument from a curated list. The selected GM program is written to `channel.midiProgram` on all channels of all vocal parts in that track immediately before export, then restored afterward. This is independent of classification and muting — `midiProgram` is never read for any classification or muting decision.
- **Background voices** (optional, per family): instead of fully muting non-selected vocal parts, they can play at a reduced volume with an optional instrument override. Three independent families are controlled: **upper** (S*/A* slots), **lower** (T*/B* slots), and **soloist** (`[SOLO]` parts). Volume is controlled by writing to `channel.volume` (0–127), which is the plugin API's mixer-equivalent control and the only API-accessible volume lever. **Caveat**: `channel.volume` initialises the mixer channel value; in MuseScore 3's audio engine this maps to MIDI CC7, which score-embedded dynamics controllers can override mid-piece. MuseScore 4's audio engine behaviour requires verification at implementation time — if CC7 interference is observed, the feature degrades gracefully to "Off only" with a noted limitation. `channel.midiProgram` is also written for background instrument override and restored afterward. If the family's background volume is Off, those parts are muted as before.
- **Bracket groups are not accessible** via the plugin API ([MuseScore #28438](https://github.com/musescore/MuseScore/issues/28438)) — classification is entirely determined by the `[PREFIX]` in each part's `longName`
- **`writeScore()` / `readScore()`** are non-functional in MS4
- **Automated export**: `cmd("export-audio")` opens the system save dialog; the user must click Save for each track. The plugin handles all mute setup automatically.
- **Save dialog filename**: no API hook exists to pre-populate `cmd("export-audio")`'s filename field. Best-effort workaround: immediately before each `cmd("export-audio")` call, copy the suggested filename (e.g. `Soprano 1.mp3`) to the system clipboard via a hidden QML `TextEdit` (`selectAll()` + `copy()`), and display it prominently in Screen 2 so the user can paste it. `curScore.path` gives the score's directory, which MuseScore uses as the default folder. Note: a regression in MS4.7.1 requires users to type the extension explicitly; include `.mp3` in the clipboard text.
- Mid-measure configuration changes require no special handling: inactive staves simply contain rests and contribute silence.

---

## File Structure

```
trackgen/
├── .gitignore
├── README.md
├── DESIGN.md             ← this file
└── trackgen/
    ├── trackgen.qml      ← plugin root, all UI, export orchestration
    └── voiceTypes.js     ← voice type defs, classification, track building, mute management
```

---

## Staff Naming Scheme

Staff `longName` encodes both category and voice role via a bracket prefix:

```
[PREFIX] Voice Name
```

**SATB-scheme prefix** — one of the 11 supported configuration tags — resolves all ambiguity about which singer tracks a stave feeds. Voice Name is the role within that configuration. The pair is looked up in a static table in `voiceTypes.js`.

**`[SOLO]` prefix** — marks a soloist part. Voice Name is free-form (e.g. `[SOLO] Soprano I`, `[SOLO] Cantor`). The voice name is used verbatim as the track display name. The `[SOLO]` prefix is matched case-insensitively; if the voice name is blank the display name defaults to "Soloist".

Staves without any recognized prefix are treated as **instrumental** (always unmuted in every track).

Upper-voice prefixes (`[SA]`, `[SMA]`, `[SSAA]`) and lower-voice prefixes (`[TB]`, `[TBB]`, `[TTBB]`) are **independent** — any combination can coexist in the same score section.

### Prefix → voice → track-slot mapping

Track slots: `S1` `S2` `S2Mz` `A1Mz` `A1` `A2` `T1` `T2` `T2Bar` `B1Bar` `B1` `B2`

`S2Mz` = "Soprano 2 / Mezzo-soprano" combined track; likewise `A1Mz`, `T2Bar`, `B1Bar`. These slots only emit a track if any Mz/Bar stave contributes to them.

```
[SA]         Soprano          → S1, S2, S2Mz
             Alto             → A1, A2, A1Mz

[SMA]        Soprano          → S1, S2
             Mezzo-soprano    → S2Mz, A1Mz      ← modifier, not a slot
             Alto             → A1, A2

[SSAA]       Soprano 1        → S1
             Soprano 2        → S2, S2Mz
             Alto 1           → A1, A1Mz
             Alto 2           → A2

[TB]         Tenor            → T1, T2, T2Bar
             Bass             → B1, B2, B1Bar

[TBB]        Tenor            → T1, T2
             Baritone         → T2Bar, B1Bar    ← modifier
             Bass             → B1, B2

[TTBB]       Tenor 1          → T1
             Tenor 2          → T2, T2Bar
             Bass 1           → B1, B1Bar
             Bass 2           → B2

[SATB]       Soprano          → S1, S2, S2Mz
             Alto             → A1, A2, A1Mz
             Tenor            → T1, T2, T2Bar
             Bass             → B1, B2, B1Bar

[SMATB]      Soprano          → S1, S2
             Mezzo-soprano    → S2Mz, A1Mz      ← modifier
             Alto             → A1, A2
             Tenor            → T1, T2, T2Bar
             Bass             → B1, B2, B1Bar

[SMATBB]     Soprano          → S1, S2
             Mezzo-soprano    → S2Mz, A1Mz      ← modifier
             Alto             → A1, A2
             Tenor            → T1, T2
             Baritone         → T2Bar, B1Bar    ← modifier
             Bass             → B1, B2

[SATBB]      Soprano          → S1, S2, S2Mz
             Alto             → A1, A2, A1Mz
             Tenor            → T1, T2
             Baritone         → T2Bar, B1Bar    ← modifier
             Bass             → B1, B2

[SSAATTBB]   Soprano 1        → S1
             Soprano 2        → S2, S2Mz
             Alto 1           → A1, A1Mz
             Alto 2           → A2
             Tenor 1          → T1
             Tenor 2          → T2, T2Bar
             Bass 1           → B1, B1Bar
             Bass 2           → B2
```

### Key rules encoded in the table

- **Unison staves in non-split configs** (`[SATB]` Soprano, `[SA]` Soprano, `[TB]` Tenor, etc.) include S2Mz / A1Mz / T2Bar / B1Bar — all singers of that family (including those who split off in other configs) sing together here
- **Soprano/Alto in split upper configs** (`[SMA]`, `[SMATB]`, `[SMATBB]`) contribute to S1+S2 but NOT S2Mz / A1Mz — mezzo singers in those sections sing the Mezzo-soprano stave, not the Soprano/Alto stave
- **Tenor/Bass in `[SMATBB]`** contribute to T1+T2 / B1+B2 but NOT T2Bar / B1Bar — baritone singers in those sections sing the Baritone stave
- **Modifier staves** (Mezzo-soprano, Baritone) feed exactly two combined slots and never stand alone

---

## Track Generation Rules (`voiceTypes.js`)

### Algorithm

**Optional pre-step**: if a measure range `[tickStart, tickEnd)` is provided (derived from the user-selected display numbers via `measureMap`), skip any SATB or SOLO part that has no non-rest note in that range. Instrumental parts are never skipped.

1. For each `part` in `curScore.parts`, parse `part.longName` for a leading `[PREFIX]` token; if absent, try `part.shortName`, then `part.partName`
2. Strip the prefix; look up `(prefix, trimmed voice name)` in the mapping table (case-insensitive)
3. Append the part to each slot in the result list; or to `soloists` if the prefix is `SOLO` (free-form voice name); or to `instrumentals` if no prefix matches
4. After scanning all parts, build the output track list:
   - Emit one output track per non-empty slot, ordered as the slot list above.
   - **Modifier-slot rule**: S2Mz / A1Mz / T2Bar / B1Bar are only emitted if at least one modifier stave (voiceName `Mezzo-soprano` or `Baritone`) is present in that slot — non-modifier staves that happen to map there (e.g. `[SATB] Soprano → S2Mz`) do not trigger emission on their own.
   - **Deduplication**: within each sibling pair (S1/S2, A1/A2, T1/T2, B1/B2), if both slots are non-empty and contain exactly the same set of parts, collapse them into one track and mark the junior slot (S2/A2/T2/B2) as collapsed. A collapsed slot is treated as non-existent for display-name purposes below.
   - **Soloist tracks**: one track per entry in `soloists`, appended after all SATB tracks. `slotId` is `"SOLO_" + index`. No modifier-slot rule, deduplication, or display-name qualification applies.
   - **Accompaniment track**: always appended last (added by QML, not `buildTracks`). `slotId: "ACCOMP"`, `parts: []`. All vocal parts are muted during export; only instrumentals are kept. Background voice and voice-instrument settings are ignored.
5. Apply display name qualification per SATB family:
   - **S family**: use "Soprano 1" / "Soprano 2" when both S1 and S2 are non-empty and distinct (not collapsed); else "Soprano" for whichever is present
   - **A family**: use "Alto 1" / "Alto 2" when both A1 and A2 are non-empty and distinct; else "Alto"
   - **T family**: use "Tenor 1" / "Tenor 2" when both T1 and T2 are non-empty and distinct; else "Tenor"
   - **B family**: use "Bass 1" / "Bass 2" when both B1 and B2 are non-empty and distinct; else "Bass"
   - **S2Mz**: "Soprano 2 / Mezzo-soprano" when S2 is a distinct (non-collapsed) track; else "Soprano / Mezzo-soprano"
   - **A1Mz**: "Alto 1 / Mezzo-soprano" when A1 is a distinct (non-collapsed) track; else "Alto / Mezzo-soprano"
   - **T2Bar**: "Tenor 2 / Baritone" when T2 is a distinct (non-collapsed) track; else "Tenor / Baritone"
   - **B1Bar**: "Bass 1 / Baritone" when B1 is a distinct (non-collapsed) track; else "Bass / Baritone"

### Track display names

| Slot | Qualified name | Unqualified fallback |
|---|---|---|
| S1 | Soprano 1 | Soprano |
| S2 | Soprano 2 | *(only exists alongside S1)* |
| S2Mz | Soprano 2 / Mezzo-soprano | Soprano / Mezzo-soprano |
| A1Mz | Alto 1 / Mezzo-soprano | Alto / Mezzo-soprano |
| A1 | Alto 1 | Alto |
| A2 | Alto 2 | *(only exists alongside A1)* |
| T1 | Tenor 1 | Tenor |
| T2 | Tenor 2 | *(only exists alongside T1)* |
| T2Bar | Tenor 2 / Baritone | Tenor / Baritone |
| B1Bar | Bass 1 / Baritone | Bass / Baritone |
| B1 | Bass 1 | Bass |
| B2 | Bass 2 | *(only exists alongside B1)* |

### Exported functions

```javascript
buildMeasureMap(score)
// → [{ measure, displayNo, tick }]
// displayNo matches the MuseScore UI number (0 = pickup/excluded).
// noOffset / measureNumberOffset accumulates as a running delta.
// Handles both MS3 ("noOffset","irregular") and MS4 ("measureNumberOffset","excludeFromNumbering")
// property names with a || fallback.

buildStaffStartMap(score)
// → map[partIdx] = cumulative staff index offset (sum of part.nstaves)

partHasNotesInRange(score, staffStart, nStaves, tickStart, tickEnd)
// → bool — true if any staff in [staffStart, staffStart+nStaves) has a non-rest
//   chord-rest element in the tick range [tickStart, tickEnd).
//   Uses a Cursor per staff (cursor.filter = Segment.ChordRest, cursor.rewindToTick).

parseStaff(longName)
// → { prefix: "SATB", voiceName: "Soprano" } | null
// Returns null for [SOLO] prefix (handled separately by _parseSolo).

classifyScore(score, tickStart, tickEnd, staffStartMap)
// → { slots: { S1:[Part], S2:[Part], S2Mz:[Part], A1Mz:[Part],
//              A1:[Part], A2:[Part], T1:[Part], T2:[Part],
//              T2Bar:[Part], B1Bar:[Part], B1:[Part], B2:[Part] },
//     instrumentals: [Part],
//     soloists: [{part, displayName}],
//     modifierPresent: {...},
//     partMeta: [{prefix, voiceName}] }
// tickStart/tickEnd/staffStartMap are optional; when provided, SATB and SOLO
// parts with no notes in the range are skipped; instrumentals are always kept.

buildTracks(slots, modifierPresent, soloists)
// → [{slotId, displayName, parts:[Part], isSoloist?}]
// SATB tracks first (non-empty slots, canonical order), then one track per soloist.
// soloists param is optional ([]).

buildPartFamilyMap(slots, soloists)
// → [{part, family:"upper"|"lower"|"solo"}]  deduplicated
// soloists param is optional ([]).

saveMuteStates(score)
// → snapshot: [{partIdx, instrIdx, chanIdx, wasMuted}]

applyMutesForTrack(score, trackParts, bgParts, instrumentalParts)
// Mutes every part except trackParts, bgParts, and instrumentalParts.
// bgParts here is a plain Part array (extracted from the [{part,family}] array).
restoreMuteStates(score, snapshot)

saveChannelPrograms(score)
// → snapshot: [{partIdx, instrIdx, chanIdx, program}]

applyChannelPrograms(score, track, upperProgram, lowerProgram)
// track = {slotId, displayName, parts:[Part]}
// Routes by slot family: S*/A* slots get upperProgram; T*/B* slots get lowerProgram.
// No-op for SOLO_* slots (soloists have no voice-instrument picker).
// No-op for a given family if its program is null ("Keep original").
// Instrumental parts are never touched.

restoreChannelPrograms(score, snapshot)

saveChannelVolumes(score)
// → snapshot: [{partIdx, instrIdx, chanIdx, volume}]

applyBackgroundVoices(score, bgParts,
                      upperBgVolume, lowerBgVolume, upperBgProgram, lowerBgProgram,
                      soloistBgVolume, soloistBgProgram)
// bgParts = [{part, family:"upper"|"lower"|"solo"}]
// Routes by family: upper → upper params, lower → lower params, solo → soloist params.
// Sets channel.volume = bgVolume (0–127) and, if program ≥ 0, channel.midiProgram = bgProgram.

restoreChannelVolumes(score, snapshot)
```

### Curated instrument list

The same 8-item list is used by all five instrument pickers (upper target, lower target, upper background, lower background, soloist background). Instrumental parts are unaffected by any picker. Soloist tracks have no target instrument picker — their playback sound is always kept original.

| Display name | GM program |
|---|---|
| Keep original | — (no change) |
| Piano | 0 |
| Violin | 40 |
| Viola | 41 |
| Cello | 42 |
| Flute | 73 |
| Oboe | 68 |
| Clarinet | 71 |

### Background volume presets

| Display label | channel.volume |
|---|---|
| Off (muted) | — (mute = true, existing behavior) |
| 25% | 32 |
| 50% | 64 |
| 75% | 96 |

---

## Dialog UX (`trackgen.qml`)

Two-screen flow within a single `pluginType: "dialog"` window.

### Screen 1 — Setup

Track list is computed by `buildTracks` on plugin start. All rows checked by default; user unchecks rows to skip. A settings header controls families independently. Background instrument is disabled (greyed) when its family's background volume is Off. No configuration UI for Mz/Bar assignment — that is determined by naming rules.

The **Soloist background** row (volume + instrument) appears only when at least one `[SOLO]` part is present in the score; it is hidden otherwise.

The **Measure range** SpinBoxes (From / To) default to the full score. Changing them re-runs classification immediately, restricting which parts are considered active. Displayed numbers match the MuseScore UI (pickup measures are excluded from the range).

The **Accompaniment** row is always present at the bottom of the track list. When exported it mutes all voice parts and keeps only instrumentals.

Example — `[SSAATTBB]` + `[SMATBB]` + `[SATB]` + two soloists score (full score selected):

```
TrackGen — Vocal Learning Tracks
──────────────────────────────────────────────────────────────────────
                          Upper                    Lower
Voice instrument:         [Keep original ▾]        [Keep original ▾]
Background volume:        [Off ▾]                  [Off ▾]
Background instrument:    [Keep original ▾] (dim)  [Keep original ▾] (dim)
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
Soloist background:       [Off ▾]  instrument  [Keep original ▾] (dim)
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
Measure range:            From [  1 ↕]  To [40 ↕]  (full score)

Tracks to export:                              (one MP3 per ☑ row)

  ☑ Soprano 1       ([SSAATTBB] S1 · [SMATBB] S · [SATB] S)
  ☑ Soprano 2       ([SSAATTBB] S2 · [SMATBB] S · [SATB] S)
  ☑ Soprano 2/Mz.   ([SSAATTBB] S2 · [SMATBB] Mz · [SATB] S)
  ☑ Alto 1/Mezzo-s. ([SSAATTBB] A1 · [SMATBB] Mz · [SATB] A)
  ☑ Alto 1          ([SSAATTBB] A1 · [SMATBB] A · [SATB] A)
  ☑ Alto 2          ([SSAATTBB] A2 · [SMATBB] A · [SATB] A)
  ☑ Tenor 1         ([SSAATTBB] T1 · [SMATBB] T · [SATB] T)
  ☑ Tenor 2         ([SSAATTBB] T2 · [SMATBB] T · [SATB] T)
  ☑ Tenor 2/Bar.    ([SSAATTBB] T2 · [SMATBB] Bar · [SATB] T)
  ☑ Bass 1/Bar.     ([SSAATTBB] B1 · [SMATBB] Bar · [SATB] B)
  ☑ Bass 1          ([SSAATTBB] B1 · [SMATBB] B · [SATB] B)
  ☑ Bass 2          ([SSAATTBB] B2 · [SMATBB] B · [SATB] B)
  ☑ Soprano I       ([SOLO] Soprano I)
  ☑ Cantor          ([SOLO] Cantor)
  ☑ Accompaniment   (instrumental parts only)

All instrumental parts are always included in every track.
──────────────────────────────────────────────────────────────────────
                                             [Cancel]  [Export All →]
```

Note: `[SMATBB] Soprano` appears in Soprano 1 and Soprano 2 (S1, S2 slots) but **not** in Soprano 2 / Mezzo-soprano (S2Mz slot) — in `[SMATBB]` sections the S2Mz singers are on the Mezzo-soprano stave. Similarly `[SMATBB] Tenor` appears in Tenor 1 and Tenor 2 but not Tenor 2 / Baritone.

Example — `[SATB]` + `[SMATBB]` only (no `[SSAATTBB]`):

```
TrackGen — Vocal Learning Tracks
──────────────────────────────────────────────────────────────────────
                          Upper                    Lower
Voice instrument:         [Keep original ▾]        [Keep original ▾]
Background volume:        [Off ▾]                  [Off ▾]
Background instrument:    [Keep original ▾] (dim)  [Keep original ▾] (dim)

Tracks to export:                              (one MP3 per ☑ row)

  ☑ Soprano          ([SMATBB] S · [SATB] S)
  ☑ Soprano/Mezzo-s. ([SMATBB] Mz · [SATB] S)
  ☑ Alto/Mezzo-s.    ([SMATBB] Mz · [SATB] A)
  ☑ Alto             ([SMATBB] A · [SATB] A)
  ☑ Tenor            ([SMATBB] T · [SATB] T)
  ☑ Tenor/Baritone   ([SMATBB] Bar · [SATB] T)
  ☑ Bass/Baritone    ([SMATBB] Bar · [SATB] B)
  ☑ Bass             ([SMATBB] B · [SATB] B)

All instrumental parts are always included in every track.
──────────────────────────────────────────────────────────────────────
                                             [Cancel]  [Export All →]
```

Note: S1 and S2 slots receive the same staves (`[SMATBB] S` + `[SATB] S`), so they collapse to one unqualified "Soprano" track. Tenor / Baritone gets `[SATB] T` (because `[SATB] Tenor → T1, T2, T2Bar`) but not `[SMATBB] T` (which maps only to T1 and T2, not T2Bar).

- Only rows with at least one stave in the score are shown
- Parenthetical lists the actual prefixed staves feeding each track
- "Export All →" transitions to Screen 2

### Screen 2 — Sequential Export

```
Exporting 1 of 7: Soprano 1
─────────────────────────────────────────────
Suggested filename (copied to clipboard):
  Soprano 1.mp3
Mutes applied. MuseScore's export dialog is now open.
Paste the filename, save, then click Next Track.
─────────────────────────────────────────────
                [Stop & Restore]  [Next Track →]
```

Flow per track:
1. Save: `saveMuteStates` + `saveChannelPrograms` + `saveChannelVolumes`
2. Apply: `applyMutesForTrack(trackParts, bgParts, instrumentalParts)` + `applyChannelPrograms(track, upperProg, lowerProg)` + `applyBackgroundVoices(bgParts, …)`
3. Copy suggested filename (`<TrackName>.mp3`) to clipboard via hidden `TextEdit.selectAll()` / `copy()`
4. `cmd("export-audio")` — user pastes filename, saves file in system dialog
5. User clicks "Next Track" → `restoreMuteStates` + `restoreChannelPrograms` + `restoreChannelVolumes` → advance counter → repeat
6. After last track: restore all states, show "All done." + Close button

`bgParts` for each export = all vocal parts (SATB + soloists) not in the current track whose family background volume ≠ Off. A soloist part's "family" is `"solo"`, routed to the Soloist background volume/instrument settings.

"Stop & Restore" at any point restores mute states, channel programs, and channel volumes then quits.

---

## Key API Reference

Authoritative docs: [Plugin API main page](https://musescore.github.io/MuseScore_PluginAPI_Docs/plugins/html/index.html) · [Plugins for 4.x](https://musescore.org/en/node/337468) · [Updating for MS4.4 (Qt 6)](https://github.com/musescore/MuseScore/wiki/Updating-plugins-for-MuseScore-Studio-4.4)

```javascript
// Score — parts list and path
// https://musescore.github.io/MuseScore_PluginAPI_Docs/plugins/html/class_ms_1_1_plugin_a_p_i_1_1_score.html
curScore.parts          // QQmlListProperty<Part>
curScore.path           // full path to the .mscz file (read-only); cmd("export-audio") defaults to this directory

// Part — identity fields (all read-only; used as plain text only)
// https://musescore.github.io/MuseScore_PluginAPI_Docs/plugins/html/class_ms_1_1_plugin_a_p_i_1_1_part.html
part.longName           // primary classification source  e.g. "[SATB] Soprano"
part.shortName          // fallback if longName is blank
part.partName           // fallback if shortName is also blank (displayed in Mixer header)
part.instruments        // QQmlListProperty<Instrument>
// NOTE: instrumentId, midiChannel, midiBank are never read.
// midiProgram and volume are written (not read) for playback control only — never for classification.

// Channel — mute, volume, and instrument control (readwrite, not undoable)
// https://musescore.github.io/MuseScore_PluginAPI_Docs/plugins/html/class_ms_1_1_plugin_a_p_i_1_1_channel.html
// All channels of all instruments in a part are operated together.
// channel.pan, channel.midiBank are never read.
part.instruments[j].channels[k].mute        = true    // mute selected part
part.instruments[j].channels[k].mute        = false   // unmute (target + background parts)
part.instruments[j].channels[k].midiProgram = 0       // e.g. Piano — target or background instrument
// channel.volume is the only API-accessible volume lever (mixer-equivalent).
// Verify in MS4 that it is not overridden by score-embedded MIDI CC7 events.
part.instruments[j].channels[k].volume      = 64      // 0–127; e.g. 64 = 50% for background voices

// PluginAPI (root MuseScore object) — cmd and quit
// https://musescore.github.io/MuseScore_PluginAPI_Docs/plugins/html/class_ms_1_1_plugin_a_p_i_1_1_plugin_a_p_i.html
cmd("export-audio")     // opens system save dialog (best-effort; behavior unverified in MS4)
quit()                  // safe quit — never Qt.quit(), which crashes MS4
```

**MS4.4 / Qt 6 QML import requirements** (per [updating guide](https://github.com/musescore/MuseScore/wiki/Updating-plugins-for-MuseScore-Studio-4.4)):

```qml
import MuseScore 3.0          // still required even in MS4
import QtQuick 2.9
import QtQuick.Controls 2.2   // Controls 1.x removed in Qt 6
// Do NOT import Qt.labs.settings 1.0 — integrated into MuseScore module in 4.4
```

---

## Score Setup Convention

### Staff naming

Set each vocal part's **longName** (Part Properties → Part name) to `[PREFIX] Voice Name` using the prefix table above. Examples:

| Part longName | Meaning |
|---|---|
| `[SATB] Soprano` | Soprano in a 4-part SATB section |
| `[SSAATTBB] Soprano 2` | Soprano 2 in an 8-part section |
| `[SMA] Mezzo-soprano` | Mezzo in a 3-part upper-voice section (symmetric to `[TBB] Baritone`) |
| `[SMATBB] Baritone` | Baritone in a 6-part section |
| `[SSAA] Alto 1` | Alto 1 in a 4-part upper-voice section |
| `[TB] Bass` | Bass in a 2-part lower-voice section |
| `[TBB] Tenor` | Tenor in a 3-part lower section (T + Bar + B — symmetric to `[SMA]`) |
| `[TBB] Baritone` | Baritone modifier in a 3-part lower section |
| `[TBB] Bass` | Bass in a 3-part lower section |
| `[TTBB] Bass 1` | Bass 1 in a 4-part lower section (symmetric to `[SSAA] Alto 1`) |
| `[SOLO] Soprano I` | Soloist — generates its own track, can be background in SATB tracks |
| `[SOLO] Cantor` | Another soloist with a free-form name |

Parts without any prefix are treated as instrumental and are always included in every track. Piano, strings, etc. need no changes.

### Upper/lower voice independence

Upper and lower prefixes are fully independent. A section that uses `[SSAA]` for the upper voices and `[TB]` for the lower voices requires no combined prefix — just use `[SSAA]` on the soprano/alto staves and `[TB]` on the tenor/bass staves.

### Active measures

Only one configuration's staves for each voice family should have notes in any given measure range; inactive staves should contain full-measure rests. The plugin plays the entire score for each track — inactive staves contribute silence automatically.

### Bracket groups

Using MuseScore bracket groups to visually organize configurations is recommended for readability but has no effect on plugin behavior.

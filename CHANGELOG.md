# Changelog

All notable changes to TrackGen are documented here.

## [1.0.3] — 2026-07-28

### Fixed

- `trackgen.qml` line 611: Unicode curly quotes inside a QML string literal caused `Expected token ','` and prevented the plugin dialog from opening ([#1](https://github.com/richard-yin/trackgen/issues/1)); replaced with escaped straight quotes (`\"`)

### Added

- GitHub Actions CI workflow (`.github/workflows/ci.yml`): runs Jest tests and `qmllint` on every push and pull request
- `npm run lint:qml` script: runs `qmllint` against `trackgen/trackgen.qml` locally and in CI
- Git pre-commit hook (`.git/hooks/pre-commit`): rejects staged `.qml` files containing Unicode curly/smart quotes before they can be committed

---

## [1.0.2] — 2026-07-28

### Added

**Debug logging**
- `voiceTypes.js`: `console.log` statements throughout all public functions — entry/exit, per-part classification decisions (SATB slot mapping, soloist, instrumental, range-skipped), slot emit/suppress/collapse decisions in `buildTracks`, mute/program/volume snapshot sizes, per-part role during mute application (TRACK / BACKGROUND / INSTRUMENTAL / MUTED), background voice family/volume/program
- `trackgen.qml`: dual-output logging via a `dbg()` helper that writes to both `console.log` (visible when MuseScore is launched with `-d`) and a buffered `FileIO 3.0` file log
- Log file `trackgen.log` is created/truncated on each plugin launch and flushed incrementally after each major operation (`reclassify`, `startExport`, each `doExportTrack`, `advanceTrack`, `stopAndRestore`), so the file stays current even if MuseScore crashes mid-export
- `voiceTypes.js` logs remain `console.log`-only (`.pragma library` files cannot import QML types such as `FileIO`)
- All log lines prefixed `[TrackGen]` for easy filtering in the terminal

---

## [1.0.1] — 2026-07-28

### Added

**Post-export trim scripts**
- When a measure range is set, TrackGen now writes `trim_tracks.sh` (Linux/macOS) and `trim_tracks.bat` (Windows) to the score's directory immediately before export begins
- Both scripts loop over `*.mp3` in their own directory and trim each file in-place using `ffmpeg -c copy` (no re-encode), then replace the original
- Trim timestamps are computed with millisecond precision via `cursor.rewindToTick()` + `cursor.time`, which integrates the full tempo map; only the relevant end(s) are trimmed (start-only, end-only, or both, depending on the range)
- Screen 3 (All done) shows the script path and run instructions when scripts are written successfully, or a read-only copy-paste fallback block when file write is unavailable in the plugin sandbox
- No scripts are written for full-score exports

### Fixed

- `startExport()` correctly resets all trim state properties on each new export session

---

## [1.0.0] — 2026-07-28

Initial release.

### Added

- Four new prefix configurations completing the full 3×3 upper/lower combination grid:
  - `[SATTBB]` — SA upper + TTBB lower: Soprano · Alto · Tenor 1 · Tenor 2 · Bass 1 · Bass 2
  - `[SSAATB]` — SSAA upper + TB lower: Soprano 1 · Soprano 2 · Alto 1 · Alto 2 · Tenor · Bass
  - `[SSAATBB]` — SSAA upper + TBB lower: Soprano 1 · Soprano 2 · Alto 1 · Alto 2 · Tenor · Baritone · Bass
  - `[SMATTBB]` — SMA upper + TTBB lower: Soprano · Mezzo-soprano · Alto · Tenor 1 · Tenor 2 · Bass 1 · Bass 2
- Prefix count raised from 11 to 15

---

## [0.3.0] — 2026-07-28

### Added

**Measure range selector**
- New **Measure range** row on Screen 1 (From / To SpinBoxes) restricts classification to the specified display-number range
- Only parts with at least one non-rest note in the selected range are classified as active; instrumental parts are always included regardless of range
- Changing the range immediately refreshes the track list; track checkboxes reset
- Displayed measure numbers match MuseScore's UI (pickup / excluded measures get display number 0 and are omitted from the SpinBox range; per-measure `noOffset` / `measureNumberOffset` offsets are accumulated correctly)
- When the full score is selected the hint "(full score)" is shown next to the SpinBoxes

**Accompaniment-only track**
- A dedicated **Accompaniment** track is always appended at the end of the track list
- Exporting it mutes all voice parts (SATB + soloists) and keeps only instrumental parts unmuted; background voice and voice-instrument settings are ignored for this track
- Track row shows the parenthetical "(instrumental parts only)"

### Changed

- `buildMeasureMap(score)` — new export in `voiceTypes.js`; builds `[{measure, displayNo, tick}]` used for range filtering and SpinBox initialisation; handles both MS3 property names (`noOffset`, `irregular`) and MS4 names (`measureNumberOffset`, `excludeFromNumbering`)
- `buildStaffStartMap(score)` — new export; maps `partIdx → cumulative staff-index offset`
- `partHasNotesInRange(score, staffStart, nStaves, tickStart, tickEnd)` — new export; cursor-based active-measure detection
- `classifyScore(score, tickStart, tickEnd, staffStartMap)` — three new optional params for tick-range filtering

---

## [0.2.0] — 2026-07-28

### Added

**Soloist voice part support**
- New `[SOLO] Voice Name` part prefix for vocal soloists that sit outside the SATB classification scheme (e.g. `[SOLO] Soprano I`, `[SOLO] Baritone`)
- Each `[SOLO]` part generates its own export track (soloist + all instrumentals), appearing after the SATB tracks in the track list
- When exporting SATB tracks, soloists can be kept as background voices with a dedicated **Soloist background** volume (Off / 25 % / 50 % / 75 %) and instrument selector, independent of the upper/lower family controls
- When exporting a soloist's own track, SATB voices obey the existing upper/lower background settings
- The Soloist background row in Screen 1 is hidden automatically when no `[SOLO]` parts are present in the score
- `[SOLO]` parts continue to show their `[SOLO] VoiceName` label in track-list parentheticals

### Changed

- `classifyScore` return value gains a `soloists: [{ part, displayName }]` field
- `buildTracks(slots, modifierPresent, soloists)` — new optional third parameter
- `buildPartFamilyMap(slots, soloists)` — new optional second parameter; soloists added with `family: "solo"`
- `applyBackgroundVoices` — two new trailing parameters: `soloistBgVolume`, `soloistBgProgram`
- `applyChannelPrograms` — no-op for soloist tracks (no voice-instrument picker for `SOLO_*` slots)

---

## [0.1.0] — 2026-07-28

### Added

**Core logic (`voiceTypes.js`)**
- 11-prefix vocal configuration table (initial): `[SA]`, `[SMA]`, `[SSAA]`, `[TB]`, `[TBB]`, `[TTBB]`, `[SATB]`, `[SMATB]`, `[SMATBB]`, `[SATBB]`, `[SSAATTBB]`
- `parseStaff` — extracts `[PREFIX] Voice Name` from a part's `longName`, with `shortName` / `partName` fallbacks
- `classifyScore` — classifies all parts into 12 canonical slots (`S1 S2 S2Mz A1Mz A1 A2 T1 T2 T2Bar B1Bar B1 B2`) and an `instrumentals` list
- `buildTracks` — applies the modifier-slot rule (S2Mz / A1Mz / T2Bar / B1Bar only emitted when a Mezzo-soprano or Baritone stave is present), deduplicates sibling pairs (S1/S2, A1/A2, T1/T2, B1/B2) whose part sets are identical, and computes qualified display names
- `buildPartFamilyMap` — maps every vocal part to its upper/lower family for background-voice routing
- `saveMuteStates` / `applyMutesForTrack` / `restoreMuteStates` — exhaustive per-channel mute management
- `saveChannelPrograms` / `applyChannelPrograms` / `restoreChannelPrograms` — per-track MIDI program override, routed by slot family
- `saveChannelVolumes` / `applyBackgroundVoices` / `restoreChannelVolumes` — background voice volume (25 % / 50 % / 75 %) and optional program override, routed by slot family

**Plugin UI (`trackgen.qml`)**
- Screen 1 (Setup): per-family dropdowns for voice instrument, background volume (Off / 25 % / 50 % / 75 %), and background instrument; background instrument greyed when volume is Off
- Screen 1: scrollable track list with checkboxes; each row shows the display name and a parenthetical listing the contributing `[PREFIX] Abbrev` staves
- Screen 1: "no vocal parts" notice when the score has no recognised `[PREFIX]` staves
- Screen 2 (Sequential export): per-track progress counter, suggested filename display, automatic clipboard copy before each `cmd("export-audio")` call
- Screen 2: MS 4.7.1 extension-regression note; filename includes `.mp3` so a single paste is sufficient
- Screen 2: "Stop & Restore" cancels at any point and restores all mute / program / volume states
- Screen 3 (Done): confirmation with track count and Close button
- Compatible with MuseScore 4.4+ (Qt 6); metadata initialisation handles MS 4.3 and earlier

**Documentation**
- `README.md`: installation, score setup guide, prefix table, multi-section conventions, step-by-step usage walkthrough, known limitations
- `DESIGN.md`: living design reference — API constraints, naming scheme, slot mapping table, algorithm spec, UX wireframes, key API reference

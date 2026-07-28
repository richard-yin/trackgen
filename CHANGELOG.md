# Changelog

All notable changes to TrackGen are documented here.

## [1.1.0] — 2026-07-28

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

## [1.0.0] — 2026-07-28

Initial release.

### Added

**Core logic (`voiceTypes.js`)**
- 11-prefix vocal configuration table: `[SA]`, `[SMA]`, `[SSAA]`, `[TB]`, `[TBB]`, `[TTBB]`, `[SATB]`, `[SMATB]`, `[SMATBB]`, `[SATBB]`, `[SSAATTBB]`
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

# TrackGen

A MuseScore 4 plugin that converts a vocal-instrumental score into per-singer learning tracks (MP3). Each exported track contains that singer's voice parts plus all instrumental parts. Classification is driven entirely by a `[PREFIX]` in each part's long name — no instrument IDs or MIDI programs are read.

Three part categories are recognised: **SATB-scheme parts** (`[PREFIX] Voice Name`), **soloists** (`[SOLO] Voice Name`), and **instrumentals** (no prefix, always present in every track).

## Requirements

- MuseScore 4.4 or later (Qt 6)

## Installation

1. Copy the inner `trackgen/` folder (the one containing `trackgen.qml`) to your MuseScore 4 plugins directory:

   | Platform | Path |
   |----------|------|
   | Windows  | `%USERPROFILE%\Documents\MuseScore4\Plugins\` |
   | macOS    | `~/Documents/MuseScore4/Plugins/` |
   | Linux    | `~/Documents/MuseScore4/Plugins/` |

2. Open MuseScore 4 → **Home → Plugins** and enable **TrackGen**.

## Score Setup

### Staff naming

Set each vocal part's **Part name** (`longName`) to `[PREFIX] Voice Name` using the prefix table below. In MuseScore, edit this via right-click a staff → **Staff/Part Properties → Part name**.

| Example longName | Meaning |
|---|---|
| `[SATB] Soprano` | Soprano in a 4-part SATB section |
| `[SATB] Alto` | Alto in a 4-part SATB section |
| `[SATB] Tenor` | Tenor in a 4-part SATB section |
| `[SATB] Bass` | Bass in a 4-part SATB section |
| `[SSAATTBB] Soprano 1` | Soprano 1 in an 8-part section |
| `[SSAATTBB] Tenor 2` | Tenor 2 in an 8-part section |
| `[SMA] Mezzo-soprano` | Mezzo in a 3-part upper section (S + Mz + A) |
| `[TBB] Baritone` | Baritone modifier in a 3-part lower section (T + Bar + B) |
| `[SMATBB] Baritone` | Baritone in a 6-part mixed section |
| `[SSAA] Alto 1` | Alto 1 in a 4-part upper section |
| `[TTBB] Bass 2` | Bass 2 in a 4-part lower section |
| `[TB] Tenor` | Tenor in a simple 2-part lower section |
| `[SA] Soprano` | Soprano in a simple 2-part upper section |
| `[SOLO] Soprano I` | Soloist — gets its own track; free-form name |
| `[SOLO] Cantor` | Another soloist with a different name |

Parts **without** a `[PREFIX]` are treated as **instrumental** and are always present in every track. Piano accompaniments, strings, etc. require no changes.

### Supported prefixes

| Prefix | Voices |
|---|---|
| `[SA]` | Soprano · Alto |
| `[SMA]` | Soprano · Mezzo-soprano · Alto |
| `[SSAA]` | Soprano 1 · Soprano 2 · Alto 1 · Alto 2 |
| `[TB]` | Tenor · Bass |
| `[TBB]` | Tenor · Baritone · Bass |
| `[TTBB]` | Tenor 1 · Tenor 2 · Bass 1 · Bass 2 |
| `[SATB]` | Soprano · Alto · Tenor · Bass |
| `[SMATB]` | Soprano · Mezzo-soprano · Alto · Tenor · Bass |
| `[SMATBB]` | Soprano · Mezzo-soprano · Alto · Tenor · Baritone · Bass |
| `[SATBB]` | Soprano · Alto · Tenor · Baritone · Bass |
| `[SSAATTBB]` | Soprano 1 · Soprano 2 · Alto 1 · Alto 2 · Tenor 1 · Tenor 2 · Bass 1 · Bass 2 |

Upper prefixes (`[SA]`, `[SMA]`, `[SSAA]`) and lower prefixes (`[TB]`, `[TBB]`, `[TTBB]`) are fully independent and can coexist with any combined prefix in the same score.

### Soloist parts

Name any soloist stave `[SOLO] <free-form name>` (e.g. `[SOLO] Soprano I`, `[SOLO] Cantor`). TrackGen will:

- Generate a dedicated track for each soloist (appended after SATB tracks).
- Include all soloists as optional **background voices** in every other track, controlled by the **Soloist background** settings on Screen 1.

### Multi-section scores

When a score alternates between configurations (e.g. some sections in `[SATB]` and others in `[SSAATTBB]`), add **one staff per prefix per voice type**. Only one configuration's staves should contain notes in any given measure range; inactive staves should contain full-measure rests. The plugin plays the entire score for each track — resting staves contribute silence automatically.

### Bracket groups

Using MuseScore bracket groups to visually group staves by configuration is recommended for readability but has no effect on plugin behaviour.

## Usage

1. Open your score in MuseScore 4.
2. From the **Plugins** menu, run **TrackGen**.

### Screen 1 — Setup

The plugin scans all parts and displays the tracks it will generate.

- **Voice instrument** — optionally replace the playback sound for target voices (upper or lower family).
- **Background volume** — set to 25 %, 50 %, or 75 % to have non-target voices play quietly in the background instead of being silenced. Defaults to Off (fully muted).
- **Background instrument** — optionally override the background voices' sound (only active when background volume is not Off).
- **Soloist background** — (appears only when `[SOLO]` parts are present) independently controls the background volume and instrument for soloist parts when they are not the current track.
- **Measure range** (From / To) — restrict classification to a specific measure range. Only parts with at least one non-rest note in that range are treated as active. Displayed numbers match the MuseScore UI; changing the range immediately refreshes the track list. Defaults to the full score.
- **Track checkboxes** — uncheck any tracks you want to skip.
- **Export All →** — proceeds to Screen 2.

### Screen 2 — Sequential export

For each track in order:

1. TrackGen applies the necessary mutes and settings.
2. MuseScore's system **Save** dialog opens.
3. The suggested filename (e.g. `Soprano 1.mp3`) is **already on your clipboard** — paste it into the filename field.
4. Choose the save folder and click **Save** in the system dialog.
5. Click **Next Track →** in the plugin window. TrackGen restores all states and sets up the next track.
6. After the last track, click **Finish →**. A confirmation screen appears.

**Stop & Restore** cancels the export at any point and restores all mute/volume/program states.

#### MuseScore 4.7.1 note

A regression in MS 4.7.1 requires the file extension to be typed manually. The clipboard text already includes `.mp3`, so pasting the full filename is sufficient.

## Track generation logic

Tracks are generated per singer type, not per stave. The plugin:

- Combines staves from multiple prefixes when they serve the same voice type across sections.
- Collapses sibling tracks (e.g. Soprano 1 / Soprano 2) into a single unqualified track when both slots contain exactly the same staves.
- Emits combined tracks (Soprano 2 / Mezzo-soprano, Alto 1 / Mezzo-soprano, Tenor 2 / Baritone, Bass 1 / Baritone) only when the corresponding modifier stave (Mezzo-soprano or Baritone) is actually present in the score.
- Generates one additional track per `[SOLO]` part, appended after all SATB tracks. Soloist track names come directly from the free-form voice name in the long name.
- Always appends an **Accompaniment** track that mutes all voice parts and exports only the instrumental parts.

## Known limitations

- **Manual save required**: `cmd("export-audio")` opens MuseScore's system save dialog; there is no API to pre-fill the filename or automate the click.
- **Background volume and MIDI CC7**: `channel.volume` maps to MIDI CC7. Score-embedded dynamics events may override it mid-piece in some MuseScore versions. If background levels sound inconsistent, set background volume to Off.
- **No undo**: mute and program changes are not part of the undo stack. TrackGen saves and restores all states automatically; if MuseScore crashes mid-export, re-opening the score reloads its saved mute/program state.
- **Bracket group API unavailable**: classification is purely name-based. Bracket groups visible in the score are ignored.

## File structure

```
trackgen/
├── README.md
├── DESIGN.md
└── trackgen/
    ├── trackgen.qml     ← plugin entry point, UI, export orchestration
    └── voiceTypes.js    ← voice type table, classification, track building,
                            mute / volume / program management
```

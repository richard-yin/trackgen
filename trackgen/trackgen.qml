import QtQuick 2.9
import QtQuick.Controls 2.2
import MuseScore 3.0
import FileIO 3.0
import "voiceTypes.js" as VT

MuseScore {
    //4.4 title:        "TrackGen"
    //4.4 description:  "Generate per-singer vocal learning tracks"
    //4.4 version:      "1.0.2"
    //4.4 categoryCode: "composing-arranging-tools"

    Component.onCompleted: {
        if (mscoreMajorVersion === 4 && mscoreMinorVersion <= 3) {
            title        = "TrackGen"
            description  = "Generate per-singer vocal learning tracks"
            version      = "1.0.2"
            categoryCode = "composing-arranging-tools"
        }
    }

    pluginType: "dialog"
    width:  630
    height: 540

    // ── Plugin state ──────────────────────────────────────────────────────────
    property var  classification: null
    property var  allTracks:      []
    property var  allVocalParts:  []   // [{ part, family:"upper"|"lower"|"solo" }]
    property var  exportQueue:    []   // subset of allTracks, built on Export
    property int  exportIdx:      0
    property var  muteSnap:       null
    property var  progSnap:       null
    property var  volSnap:        null
    property int  screen:         1    // 1 = setup  2 = export  3 = done

    // Measure map and range
    property var  measureMap:      []   // [{ measure, displayNo, tick }] built in onRun
    property var  staffStartMap:   null // map[partIdx] = cumulative staff offset
    property int  firstMeasureNo:  1    // lowest non-zero displayNo in measureMap
    property int  lastMeasureNo:   1    // highest displayNo in measureMap
    property int  measureStart:    1    // user-selected From measure (display number)
    property int  measureEnd:      1    // user-selected To measure (display number)

    // ── Trim script state ─────────────────────────────────────────────────────
    property var    trimInfo:          null   // { ss, to } — null means full range
    property bool   trimScriptWritten: false
    property string trimExportDir:     ""
    property string trimFallbackText:  ""

    // ── Settings ──────────────────────────────────────────────────────────────
    property int upperVoiceProgram: -1   // -1 = keep original
    property int lowerVoiceProgram: -1
    property int upperBgVolume:     -1   // -1 = Off (mute)
    property int lowerBgVolume:     -1
    property int upperBgProgram:    -1
    property int lowerBgProgram:    -1
    property int soloistBgVolume:   -1   // -1 = Off (mute)
    property int soloistBgProgram:  -1

    readonly property var instrPrograms: [-1, 0, 40, 41, 42, 73, 68, 71]
    readonly property var instrNames:    ["Keep original","Piano","Violin","Viola",
                                          "Cello","Flute","Oboe","Clarinet"]
    readonly property var bgVolValues:   [-1, 32, 64, 96]
    readonly property var bgVolLabels:   ["Off","25%","50%","75%"]

    // ── File logging ──────────────────────────────────────────────────────────
    property string _logBuf: ""

    FileIO {
        id: logFile
        onError: console.log("[TrackGen] FileIO error: " + msg)
    }

    // Dual-output log: console.log (visible with -d flag) + buffered file log.
    // voiceTypes.js logs go to console.log only (pragma library cannot use FileIO).
    function dbg(msg) {
        console.log(msg)
        _logBuf += msg + "\n"
    }

    // Append the current buffer to trackgen.log and clear it.
    // Called at the end of each major operation so the file stays up to date
    // even if MuseScore crashes mid-export.
    function _flushLog() {
        if (_logBuf.length === 0 || logFile.source.length === 0) return
        var prev = logFile.read()
        logFile.write((prev || "") + _logBuf)
        _logBuf = ""
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Returns { tickStart, tickEnd } for the given display-number range.
    // tickEnd is the tick of the measure AFTER m2 (exclusive), or a value
    // past the last segment when m2 is the last measure.
    function tickRangeForDisplayRange(m1, m2) {
        dbg("[TrackGen] tickRangeForDisplayRange: m1=" + m1 + " m2=" + m2)
        var tickStart = -1, tickEnd = -1
        for (var i = 0; i < measureMap.length; i++) {
            if (tickStart < 0 && measureMap[i].displayNo >= m1 && measureMap[i].displayNo > 0)
                tickStart = measureMap[i].tick
            if (measureMap[i].displayNo > m2 && measureMap[i].displayNo > 0) {
                tickEnd = measureMap[i].tick
                break
            }
        }
        if (tickStart < 0) tickStart = 0
        if (tickEnd < 0) {
            // m2 is the last measure — use last segment tick + 1
            var ls = curScore.lastSegment
            tickEnd = ls ? ls.tick + 1 : 2147483647
        }
        dbg("[TrackGen] tickRangeForDisplayRange: tickStart=" + tickStart + " tickEnd=" + tickEnd)
        return { tickStart: tickStart, tickEnd: tickEnd }
    }

    // Returns { ss, to } in seconds for the current measure range, where either
    // value may be null meaning "don't trim that end".
    // Returns null when the range spans the full score.
    // Uses cursor.time which integrates the full tempo map internally.
    function computeTrimSeconds() {
        dbg("[TrackGen] computeTrimSeconds: measureStart=" + measureStart +
                    " measureEnd=" + measureEnd +
                    " firstMeasureNo=" + firstMeasureNo + " lastMeasureNo=" + lastMeasureNo)
        if (measureStart <= firstMeasureNo && measureEnd >= lastMeasureNo) {
            dbg("[TrackGen] computeTrimSeconds: full score range, no trim needed")
            return null
        }
        var tr  = tickRangeForDisplayRange(measureStart, measureEnd)
        var cur = curScore.newCursor()
        var ss  = null, to = null
        if (measureStart > firstMeasureNo) {
            cur.rewindToTick(tr.tickStart)
            ss = cur.time.toFixed(3)
        }
        if (measureEnd < lastMeasureNo) {
            cur.rewindToTick(tr.tickEnd)
            to = cur.time.toFixed(3)
        }
        dbg("[TrackGen] computeTrimSeconds: ss=" + ss + " to=" + to)
        return { ss: ss, to: to }
    }

    // Returns { sh, bat } script text for the given trim { ss, to }.
    function generateScripts(trim) {
        var label = "measures " + measureStart + "\u2013" + measureEnd
        var ffSh  = "ffmpeg -y -i \"$f\""
            + (trim.ss !== null ? " -ss " + trim.ss : "")
            + (trim.to !== null ? " -to " + trim.to : "")
            + " -c copy \"$f.tmp.mp3\" && mv \"$f.tmp.mp3\" \"$f\""
        var ffBat = "ffmpeg -y -i \"%%f\""
            + (trim.ss !== null ? " -ss " + trim.ss : "")
            + (trim.to !== null ? " -to " + trim.to : "")
            + " -c copy \"%%f.tmp.mp3\" && move /y \"%%f.tmp.mp3\" \"%%f\""
        var sh = "#!/bin/sh\n"
            + "# TrackGen \u2014 trim tracks to " + label + "\n"
            + "# Requires: ffmpeg  https://ffmpeg.org\n"
            + "set -eu\n"
            + "DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n"
            + "for f in \"$DIR\"/*.mp3; do\n"
            + "  " + ffSh + "\n"
            + "done\n"
            + "echo \"Done.\"\n"
        var bat = "@echo off\r\n"
            + "rem TrackGen \u2014 trim tracks to " + label + "\r\n"
            + "rem Requires: ffmpeg  https://ffmpeg.org\r\n"
            + "setlocal\r\n"
            + "set DIR=%~dp0\r\n"
            + "for %%f in (\"%DIR%*.mp3\") do (\r\n"
            + "    " + ffBat + "\r\n"
            + ")\r\n"
            + "echo Done.\r\n"
        return { sh: sh, bat: bat }
    }

    // Writes text to a local file via XMLHttpRequest PUT.
    // Returns true on success (Qt local PUT reports status 0).
    function writeFile(path, content) {
        dbg("[TrackGen] writeFile: path=" + path + " length=" + content.length)
        try {
            var xhr = new XMLHttpRequest()
            xhr.open("PUT", "file:///" + path.replace(/\\/g, "/"), false)
            xhr.send(content)
            var ok = (xhr.status === 0 || xhr.status === 200 || xhr.status === 201)
            dbg("[TrackGen] writeFile: status=" + xhr.status + " ok=" + ok)
            return ok
        } catch (e) {
            dbg("[TrackGen] writeFile: error: " + e)
            return false
        }
    }

    // Core classification + track-list rebuild. Called on init and whenever
    // the measure range changes.
    function reclassify() {
        var isFullRange = (measureStart <= firstMeasureNo && measureEnd >= lastMeasureNo)
        dbg("[TrackGen] reclassify: measures " + measureStart + "–" + measureEnd +
                    " fullRange=" + isFullRange)
        if (isFullRange) {
            classification = VT.classifyScore(curScore)
        } else {
            var tr = tickRangeForDisplayRange(measureStart, measureEnd)
            classification = VT.classifyScore(curScore, tr.tickStart, tr.tickEnd, staffStartMap)
        }
        allTracks     = VT.buildTracks(classification.slots, classification.modifierPresent,
                                       classification.soloists)
        // Append the accompaniment-only pseudo-track.
        allTracks = allTracks.concat([{
            slotId: "ACCOMP", displayName: "Accompaniment", parts: [], isAccomp: true
        }])
        allVocalParts = VT.buildPartFamilyMap(classification.slots, classification.soloists)
        trackModel.clear()
        for (var i = 0; i < allTracks.length; i++) {
            trackModel.append({
                trackName:    allTracks[i].displayName,
                paren:        computeParenthetical(allTracks[i]),
                trackChecked: true,
                trackIdx:     i
            })
        }
        dbg("[TrackGen] reclassify done: " + allTracks.length + " track(s) in model" +
                    " (incl. Accompaniment), " + allVocalParts.length + " vocal part(s)")
        _flushLog()
    }

    function computeParenthetical(track) {
        if (track.slotId === "ACCOMP") return "(instrumental parts only)"
        if (!classification || !curScore) return ""
        var labels = []
        for (var i = 0; i < track.parts.length; i++) {
            var part = track.parts[i]
            for (var j = 0; j < curScore.parts.length; j++) {
                if (curScore.parts[j] === part && classification.partMeta[j]) {
                    var m = classification.partMeta[j]
                    labels.push("[" + m.prefix + "] " + VT.getVoiceAbbrev(m.voiceName))
                    break
                }
            }
        }
        return "(" + labels.join(" · ") + ")"
    }

    // Returns [{ part, family }] for non-target vocal parts whose family bg volume > 0.
    function computeBgParts(track) {
        var result = []
        for (var i = 0; i < allVocalParts.length; i++) {
            var pf = allVocalParts[i]
            var inTrack = false
            for (var j = 0; j < track.parts.length; j++) {
                if (track.parts[j] === pf.part) { inTrack = true; break }
            }
            if (inTrack) continue
            var vol = pf.family === "upper" ? upperBgVolume
                    : pf.family === "lower" ? lowerBgVolume
                    : soloistBgVolume
            if (vol > 0) result.push(pf)
        }
        return result
    }

    // Extract plain Part array from [{part, family}] array.
    function flatParts(pfArr) {
        var r = []
        for (var i = 0; i < pfArr.length; i++) r.push(pfArr[i].part)
        return r
    }

    function startExport() {
        dbg("[TrackGen] startExport: building export queue from " + trackModel.count + " rows")
        var q = []
        for (var i = 0; i < trackModel.count; i++) {
            var row = trackModel.get(i)
            if (row.trackChecked) q.push(allTracks[row.trackIdx])
        }
        if (q.length === 0) {
            dbg("[TrackGen] startExport: no tracks selected, aborting")
            return
        }
        dbg("[TrackGen] startExport: " + q.length + " track(s) queued")
        for (var j = 0; j < q.length; j++) {
            dbg("[TrackGen]   [" + j + "] " + q[j].displayName + " (slotId=" + q[j].slotId + ")")
        }
        exportQueue = q
        exportIdx   = 0
        muteSnap    = VT.saveMuteStates(curScore)
        progSnap    = VT.saveChannelPrograms(curScore)
        volSnap     = VT.saveChannelVolumes(curScore)

        // Compute trim timestamps and write helper scripts when a range is set.
        trimInfo          = null
        trimScriptWritten = false
        trimExportDir     = ""
        trimFallbackText  = ""
        var trim = computeTrimSeconds()
        if (trim) {
            trimInfo = trim
            dbg("[TrackGen] startExport: trim range ss=" + trim.ss + " to=" + trim.to)
            var scripts = generateScripts(trim)
            var dir = curScore.path.substring(0, curScore.path.lastIndexOf("/"))
            trimExportDir = dir
            dbg("[TrackGen] startExport: writing trim scripts to " + dir)
            var okSh  = writeFile(dir + "/trim_tracks.sh",  scripts.sh)
            var okBat = writeFile(dir + "/trim_tracks.bat", scripts.bat)
            trimScriptWritten = okSh || okBat
            dbg("[TrackGen] startExport: trimScriptWritten=" + trimScriptWritten +
                        " (sh=" + okSh + " bat=" + okBat + ")")
            if (!trimScriptWritten)
                trimFallbackText = scripts.sh
                    + "\n\n--- Windows (trim_tracks.bat) ---\n\n"
                    + scripts.bat
        } else {
            dbg("[TrackGen] startExport: full score range, no trim scripts")
        }

        _flushLog()
        screen = 2
        doExportTrack(0)
    }

    function doExportTrack(idx) {
        var track    = exportQueue[idx]
        var isAccomp = (track.slotId === "ACCOMP")
        dbg("[TrackGen] doExportTrack: idx=" + idx + "/" + exportQueue.length +
                    " track='" + track.displayName + "' slotId=" + track.slotId +
                    " isAccomp=" + isAccomp)
        var bgPf     = isAccomp ? [] : computeBgParts(track)
        dbg("[TrackGen]   bgParts=" + bgPf.length +
                    " instrumentals=" + classification.instrumentals.length)
        VT.applyMutesForTrack(curScore, track.parts, flatParts(bgPf), classification.instrumentals)
        if (!isAccomp) {
            VT.applyChannelPrograms(curScore, track, upperVoiceProgram, lowerVoiceProgram)
        }
        if (!isAccomp && bgPf.length > 0) {
            VT.applyBackgroundVoices(curScore, bgPf,
                upperBgVolume, lowerBgVolume, upperBgProgram, lowerBgProgram,
                soloistBgVolume, soloistBgProgram)
        }
        // Copy suggested filename to clipboard so the user can paste it in the dialog.
        // MS 4.7.1 regression: users must type the extension explicitly, so include .mp3.
        var filename = track.displayName + ".mp3"
        dbg("[TrackGen]   copying filename to clipboard: " + filename)
        clipHelper.text = filename
        clipHelper.selectAll()
        clipHelper.copy()
        dbg("[TrackGen]   calling cmd('export-audio')")
        _flushLog()
        cmd("export-audio")
    }

    function advanceTrack() {
        dbg("[TrackGen] advanceTrack: restoring state after track " + exportIdx)
        VT.restoreMuteStates(curScore, muteSnap)
        VT.restoreChannelPrograms(curScore, progSnap)
        VT.restoreChannelVolumes(curScore, volSnap)
        exportIdx = exportIdx + 1
        dbg("[TrackGen] advanceTrack: exportIdx now=" + exportIdx +
                    " queueLength=" + exportQueue.length)
        if (exportIdx >= exportQueue.length) {
            dbg("[TrackGen] advanceTrack: all tracks done, switching to screen 3")
            _flushLog()
            screen = 3
            return
        }
        doExportTrack(exportIdx)
    }

    function stopAndRestore() {
        dbg("[TrackGen] stopAndRestore: restoring state and quitting" +
                    " (exportIdx=" + exportIdx + ")")
        if (muteSnap) VT.restoreMuteStates(curScore, muteSnap)
        if (progSnap) VT.restoreChannelPrograms(curScore, progSnap)
        if (volSnap)  VT.restoreChannelVolumes(curScore, volSnap)
        _flushLog()
        quit()
    }

    // ── Models ────────────────────────────────────────────────────────────────
    ListModel { id: trackModel }
    // Hidden TextEdit for clipboard access
    TextEdit { id: clipHelper; visible: false; width: 1; height: 1 }

    // Reclassify when the user changes the measure range.
    onMeasureStartChanged: { if (curScore && measureStart <= measureEnd) reclassify() }
    onMeasureEndChanged:   { if (curScore && measureStart <= measureEnd) reclassify() }

    // ── Initialisation ────────────────────────────────────────────────────────
    onRun: {
        if (!curScore) {
            console.log("[TrackGen] onRun: no score open, quitting")
            quit()
            return
        }

        // Point the log file at the score's directory and start fresh.
        var scoreDir = curScore.path.substring(0, curScore.path.lastIndexOf("/"))
        logFile.source = scoreDir + "/trackgen.log"
        logFile.write("")   // truncate / create

        dbg("[TrackGen] onRun: score='" + curScore.title + "'" +
                    " path='" + curScore.path + "'")

        // Build measure map and staff-start map once.
        measureMap    = VT.buildMeasureMap(curScore)
        staffStartMap = VT.buildStaffStartMap(curScore)

        // Find the lowest and highest non-zero (non-excluded) display numbers.
        var fNo = 1, lNo = 1
        for (var i = 0; i < measureMap.length; i++) {
            if (measureMap[i].displayNo > 0) { fNo = measureMap[i].displayNo; break }
        }
        for (var j = measureMap.length - 1; j >= 0; j--) {
            if (measureMap[j].displayNo > 0) { lNo = measureMap[j].displayNo; break }
        }
        firstMeasureNo = fNo
        lastMeasureNo  = lNo
        dbg("[TrackGen] onRun: measure range " + fNo + "–" + lNo +
                    " (" + measureMap.length + " entries in map)")
        // Setting measureStart/measureEnd triggers onMeasure*Changed, but curScore
        // isn't set in the property-change guard yet — call reclassify() explicitly.
        measureStart = fNo
        measureEnd   = lNo
        reclassify()
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Screen 1 — Setup
    // ══════════════════════════════════════════════════════════════════════════
    Item {
        anchors.fill: parent
        visible: screen === 1

        // Title ────────────────────────────────────────────────────────────────
        Label {
            id: s1Title
            anchors { top: parent.top; left: parent.left; right: parent.right
                      topMargin: 12; leftMargin: 14; rightMargin: 14 }
            text: "TrackGen — Vocal Learning Tracks"
            font.bold: true; font.pixelSize: 15
        }
        Rectangle {
            id: s1Sep1
            anchors { top: s1Title.bottom; left: parent.left; right: parent.right
                      topMargin: 6; leftMargin: 14; rightMargin: 14 }
            height: 1; color: "#cccccc"
        }

        // Settings ─────────────────────────────────────────────────────────────
        Item {
            id: s1Settings
            anchors { top: s1Sep1.bottom; left: parent.left; right: parent.right
                      topMargin: 8; leftMargin: 14; rightMargin: 14 }
            height: s1SettingsCol.height

            Column {
                id: s1SettingsCol
                width: parent.width
                spacing: 5

                // Column headers
                Row {
                    Item   { width: 172; height: 1 }
                    Label  { width: 215; text: "Upper"; font.bold: true
                             horizontalAlignment: Text.AlignHCenter }
                    Label  { width: 200; text: "Lower"; font.bold: true
                             horizontalAlignment: Text.AlignHCenter }
                }

                // Voice instrument
                Row {
                    spacing: 0
                    Label { width: 172; height: 30; text: "Voice instrument:"
                            verticalAlignment: Text.AlignVCenter }
                    ComboBox {
                        width: 205; height: 30; model: instrNames
                        onCurrentIndexChanged: upperVoiceProgram = instrPrograms[currentIndex]
                    }
                    Item { width: 10; height: 1 }
                    ComboBox {
                        width: 205; height: 30; model: instrNames
                        onCurrentIndexChanged: lowerVoiceProgram = instrPrograms[currentIndex]
                    }
                }

                // Background volume
                Row {
                    spacing: 0
                    Label { width: 172; height: 30; text: "Background volume:"
                            verticalAlignment: Text.AlignVCenter }
                    ComboBox {
                        width: 205; height: 30; model: bgVolLabels
                        onCurrentIndexChanged: upperBgVolume = bgVolValues[currentIndex]
                    }
                    Item { width: 10; height: 1 }
                    ComboBox {
                        width: 205; height: 30; model: bgVolLabels
                        onCurrentIndexChanged: lowerBgVolume = bgVolValues[currentIndex]
                    }
                }

                // Background instrument (greyed when bg volume is Off)
                Row {
                    spacing: 0
                    Label { width: 172; height: 30; text: "Background instrument:"
                            verticalAlignment: Text.AlignVCenter }
                    ComboBox {
                        width: 205; height: 30; model: instrNames
                        enabled: upperBgVolume > 0
                        opacity: enabled ? 1.0 : 0.35
                        onCurrentIndexChanged: upperBgProgram = instrPrograms[currentIndex]
                    }
                    Item { width: 10; height: 1 }
                    ComboBox {
                        width: 205; height: 30; model: instrNames
                        enabled: lowerBgVolume > 0
                        opacity: enabled ? 1.0 : 0.35
                        onCurrentIndexChanged: lowerBgProgram = instrPrograms[currentIndex]
                    }
                }

                // Soloist background (only shown when [SOLO] parts exist)
                Rectangle {
                    visible: classification && classification.soloists &&
                             classification.soloists.length > 0
                    width: parent.width; height: 1; color: "#e0e0e0"
                }
                Row {
                    visible: classification && classification.soloists &&
                             classification.soloists.length > 0
                    spacing: 0
                    Label { width: 172; height: 30; text: "Soloist background:"
                            verticalAlignment: Text.AlignVCenter }
                    ComboBox {
                        width: 150; height: 30; model: bgVolLabels
                        onCurrentIndexChanged: soloistBgVolume = bgVolValues[currentIndex]
                    }
                    Item { width: 10; height: 1 }
                    Label { width: 90; height: 30; text: "instrument"
                            verticalAlignment: Text.AlignVCenter
                            color: "#444444"; font.pixelSize: 12 }
                    ComboBox {
                        width: 165; height: 30; model: instrNames
                        enabled: soloistBgVolume > 0
                        opacity: enabled ? 1.0 : 0.35
                        onCurrentIndexChanged: soloistBgProgram = instrPrograms[currentIndex]
                    }
                }

                // Measure range selector
                Rectangle { width: parent.width; height: 1; color: "#e0e0e0" }
                Row {
                    spacing: 0
                    Label { width: 172; height: 30; text: "Measure range:"
                            verticalAlignment: Text.AlignVCenter }
                    Label { width: 44; height: 30; text: "From"
                            verticalAlignment: Text.AlignVCenter; color: "#444444" }
                    SpinBox {
                        id: sbFrom
                        width: 76; height: 30
                        from: firstMeasureNo; to: measureEnd
                        value: measureStart
                        onValueModified: measureStart = value
                    }
                    Item { width: 14; height: 1 }
                    Label { width: 26; height: 30; text: "To"
                            verticalAlignment: Text.AlignVCenter; color: "#444444" }
                    SpinBox {
                        id: sbTo
                        width: 76; height: 30
                        from: measureStart; to: lastMeasureNo
                        value: measureEnd
                        onValueModified: measureEnd = value
                    }
                    Item { width: 10; height: 1 }
                    Label {
                        height: 30
                        text: (measureStart <= firstMeasureNo && measureEnd >= lastMeasureNo)
                              ? "(full score)"
                              : "of " + lastMeasureNo
                        verticalAlignment: Text.AlignVCenter
                        color: "#888888"; font.pixelSize: 11; font.italic: true
                    }
                }
            }
        }

        Rectangle {
            id: s1Sep2
            anchors { top: s1Settings.bottom; left: parent.left; right: parent.right
                      topMargin: 8; leftMargin: 14; rightMargin: 14 }
            height: 1; color: "#cccccc"
        }

        // Track list header ────────────────────────────────────────────────────
        Row {
            id: s1TrackHdr
            anchors { top: s1Sep2.bottom; left: parent.left; right: parent.right
                      topMargin: 8; leftMargin: 14; rightMargin: 14 }
            spacing: 10
            Label { text: "Tracks to export:"; font.bold: true }
            Label { text: "(one MP3 per ☑ row)"; color: "#666666"; font.pixelSize: 12 }
        }

        // No-vocals notice (shown only when score has no recognised vocal parts;
        // allTracks always contains at least the Accompaniment entry so check > 1)
        Label {
            visible: allTracks.length <= 1
            anchors { top: s1TrackHdr.bottom; left: parent.left; right: parent.right
                      topMargin: 14; leftMargin: 24; rightMargin: 24 }
            text: "No vocal parts found.\n" +
                  "Set each vocal staff's Part name (longName) to "[PREFIX] Voice Name",\n" +
                  "e.g. "[SATB] Soprano". See README for details."
            color: "#cc0000"; font.pixelSize: 12; wrapMode: Text.WordWrap
        }

        // Track list ───────────────────────────────────────────────────────────
        ListView {
            id: s1TrackList
            anchors { top: s1TrackHdr.bottom; left: parent.left; right: parent.right
                      bottom: s1FooterNote.top
                      topMargin: 4; leftMargin: 8; rightMargin: 8; bottomMargin: 4 }
            model: trackModel
            clip: true
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            delegate: Item {
                width: s1TrackList.width
                height: 44

                CheckBox {
                    id: rowCb
                    anchors { left: parent.left; verticalCenter: parent.verticalCenter
                              leftMargin: 6 }
                    checked: model.trackChecked
                    onClicked: trackModel.setProperty(index, "trackChecked", checked)
                }

                Column {
                    anchors { left: rowCb.right; right: parent.right
                              verticalCenter: parent.verticalCenter
                              leftMargin: 2; rightMargin: 10 }
                    spacing: 1
                    Label { text: model.trackName; font.pixelSize: 13 }
                    Label {
                        text: model.paren
                        font.pixelSize: 11; color: "#666666"
                        elide: Text.ElideRight; width: parent.width
                    }
                }
            }
        }

        // Footer ───────────────────────────────────────────────────────────────
        Label {
            id: s1FooterNote
            anchors { bottom: s1Sep3.top; left: parent.left; right: parent.right
                      bottomMargin: 4; leftMargin: 14; rightMargin: 14 }
            text: "All instrumental parts are always included in every track."
            font.italic: true; font.pixelSize: 11; color: "#666666"
        }
        Rectangle {
            id: s1Sep3
            anchors { bottom: s1BtnRow.top; left: parent.left; right: parent.right
                      bottomMargin: 8; leftMargin: 14; rightMargin: 14 }
            height: 1; color: "#cccccc"
        }
        Row {
            id: s1BtnRow
            anchors { bottom: parent.bottom; right: parent.right
                      bottomMargin: 12; rightMargin: 14 }
            spacing: 8
            Button {
                text: "Cancel"
                onClicked: quit()
            }
            Button {
                text: "Export All →"
                enabled: allTracks.length > 0
                onClicked: startExport()
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Screen 2 — Sequential export
    // ══════════════════════════════════════════════════════════════════════════
    Item {
        anchors.fill: parent
        visible: screen === 2

        // Progress header ─────────────────────────────────────────────────────
        Label {
            id: s2ProgressLbl
            anchors { top: parent.top; left: parent.left; right: parent.right
                      topMargin: 16; leftMargin: 16; rightMargin: 16 }
            text: (exportQueue.length > 0 && exportIdx < exportQueue.length)
                  ? "Exporting " + (exportIdx + 1) + " of " + exportQueue.length
                    + ":   " + exportQueue[exportIdx].displayName
                  : ""
            font.bold: true; font.pixelSize: 15; wrapMode: Text.WordWrap
        }
        Rectangle {
            id: s2Sep1
            anchors { top: s2ProgressLbl.bottom; left: parent.left; right: parent.right
                      topMargin: 10; leftMargin: 16; rightMargin: 16 }
            height: 1; color: "#cccccc"
        }

        // Filename block ───────────────────────────────────────────────────────
        Label {
            id: s2FileHdr
            anchors { top: s2Sep1.bottom; left: parent.left; right: parent.right
                      topMargin: 14; leftMargin: 16; rightMargin: 16 }
            text: "Suggested filename (already copied to clipboard):"
            font.pixelSize: 12
        }
        Label {
            id: s2FilenameLbl
            anchors { top: s2FileHdr.bottom; left: parent.left; right: parent.right
                      topMargin: 6; leftMargin: 30; rightMargin: 16 }
            text: (exportQueue.length > 0 && exportIdx < exportQueue.length)
                  ? exportQueue[exportIdx].displayName + ".mp3"
                  : ""
            font.pixelSize: 15; font.bold: true; font.family: "monospace"
        }

        // Instructions ─────────────────────────────────────────────────────────
        Label {
            id: s2InstrA
            anchors { top: s2FilenameLbl.bottom; left: parent.left; right: parent.right
                      topMargin: 20; leftMargin: 16; rightMargin: 16 }
            text: "Mutes applied. MuseScore's export dialog is now open."
            font.pixelSize: 12
        }
        Label {
            id: s2InstrB
            anchors { top: s2InstrA.bottom; left: parent.left; right: parent.right
                      topMargin: 4; leftMargin: 16; rightMargin: 16 }
            text: "Paste the filename (including .mp3), choose where to save, then click Next Track."
            font.pixelSize: 12; wrapMode: Text.WordWrap
        }

        // Note about MS 4.7.1 regression ──────────────────────────────────────
        Label {
            id: s2Note
            anchors { top: s2InstrB.bottom; left: parent.left; right: parent.right
                      topMargin: 8; leftMargin: 16; rightMargin: 16 }
            text: "Note: MuseScore 4.7.1 requires the extension to be typed manually — paste includes \".mp3\"."
            font.pixelSize: 11; color: "#888888"; wrapMode: Text.WordWrap
        }

        Rectangle {
            id: s2Sep2
            anchors { bottom: s2BtnRow.top; left: parent.left; right: parent.right
                      bottomMargin: 8; leftMargin: 16; rightMargin: 16 }
            height: 1; color: "#cccccc"
        }
        Row {
            id: s2BtnRow
            anchors { bottom: parent.bottom; right: parent.right
                      bottomMargin: 12; rightMargin: 14 }
            spacing: 8
            Button {
                text: "Stop & Restore"
                onClicked: stopAndRestore()
            }
            Button {
                text: (exportIdx + 1 >= exportQueue.length) ? "Finish →" : "Next Track →"
                onClicked: advanceTrack()
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Screen 3 — All done
    // ══════════════════════════════════════════════════════════════════════════
    Item {
        anchors.fill: parent
        visible: screen === 3

        // Summary ──────────────────────────────────────────────────────────────
        Label {
            id: s3Title
            anchors { top: parent.top; left: parent.left; right: parent.right
                      topMargin: 20; leftMargin: 16; rightMargin: 16 }
            text: "All done!  "
                  + exportQueue.length + " track"
                  + (exportQueue.length === 1 ? "" : "s")
                  + " exported."
            font.bold: true; font.pixelSize: 15
            horizontalAlignment: Text.AlignHCenter
        }
        Label {
            id: s3Subtitle
            anchors { top: s3Title.bottom; left: parent.left; right: parent.right
                      topMargin: 8; leftMargin: 16; rightMargin: 16 }
            text: "Mute states, programs, and volumes have been restored."
            font.pixelSize: 12; color: "#666666"
            horizontalAlignment: Text.AlignHCenter
        }

        // Trim section — only visible when a measure range was active ──────────
        Item {
            id: s3TrimSection
            visible: trimInfo !== null
            anchors { top: s3Subtitle.bottom; left: parent.left; right: parent.right
                      bottom: s3Sep.top
                      topMargin: 16; leftMargin: 16; rightMargin: 16; bottomMargin: 8 }

            // Scripts written successfully
            Label {
                visible: trimScriptWritten
                anchors { top: parent.top; left: parent.left; right: parent.right }
                text: "trim_tracks.sh and trim_tracks.bat written to:\n" + trimExportDir
                      + "\n\nRun the appropriate script once to trim all tracks to the selected range."
                      + "\nRequires ffmpeg \u2014 https://ffmpeg.org"
                font.pixelSize: 12; wrapMode: Text.WordWrap; color: "#225500"
            }

            // Fallback: file write unavailable — show copy-paste block
            Column {
                visible: !trimScriptWritten
                anchors { top: parent.top; left: parent.left; right: parent.right
                          bottom: parent.bottom }
                spacing: 6

                Label {
                    width: parent.width
                    text: "File write unavailable \u2014 copy and run to trim all tracks:"
                    font.pixelSize: 12; wrapMode: Text.WordWrap
                }
                ScrollView {
                    width: parent.width
                    height: parent.height - 26
                    clip: true
                    ScrollBar.vertical.policy: ScrollBar.AsNeeded

                    TextArea {
                        text: trimFallbackText
                        readOnly: true
                        selectByMouse: true
                        font.family: "monospace"; font.pixelSize: 11
                        wrapMode: Text.NoWrap
                        background: Rectangle { color: "#f4f4f4"; border.color: "#cccccc" }
                    }
                }
            }
        }

        // Footer ───────────────────────────────────────────────────────────────
        Rectangle {
            id: s3Sep
            anchors { bottom: s3BtnRow.top; left: parent.left; right: parent.right
                      bottomMargin: 8; leftMargin: 16; rightMargin: 16 }
            height: 1; color: "#cccccc"
        }
        Row {
            id: s3BtnRow
            anchors { bottom: parent.bottom; right: parent.right
                      bottomMargin: 12; rightMargin: 14 }
            Button {
                text: "Close"
                onClicked: quit()
            }
        }
    }
}

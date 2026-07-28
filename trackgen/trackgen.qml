import QtQuick 2.9
import QtQuick.Controls 2.2
import MuseScore 3.0
import "voiceTypes.js" as VT

MuseScore {
    //4.4 title:        "TrackGen"
    //4.4 description:  "Generate per-singer vocal learning tracks"
    //4.4 version:      "1.0.0"
    //4.4 categoryCode: "composing-arranging-tools"

    Component.onCompleted: {
        if (mscoreMajorVersion === 4 && mscoreMinorVersion <= 3) {
            title        = "TrackGen"
            description  = "Generate per-singer vocal learning tracks"
            version      = "1.0.0"
            categoryCode = "composing-arranging-tools"
        }
    }

    pluginType: "dialog"
    width:  630
    height: 540

    // ── Plugin state ──────────────────────────────────────────────────────────
    property var  classification: null
    property var  allTracks:      []
    property var  allVocalParts:  []   // [{ part, family:"upper"|"lower" }]
    property var  exportQueue:    []   // subset of allTracks, built on Export
    property int  exportIdx:      0
    property var  muteSnap:       null
    property var  progSnap:       null
    property var  volSnap:        null
    property int  screen:         1    // 1 = setup  2 = export  3 = done

    // ── Settings ──────────────────────────────────────────────────────────────
    property int upperVoiceProgram: -1   // -1 = keep original
    property int lowerVoiceProgram: -1
    property int upperBgVolume:     -1   // -1 = Off (mute)
    property int lowerBgVolume:     -1
    property int upperBgProgram:    -1
    property int lowerBgProgram:    -1

    readonly property var instrPrograms: [-1, 0, 40, 41, 42, 73, 68, 71]
    readonly property var instrNames:    ["Keep original","Piano","Violin","Viola",
                                          "Cello","Flute","Oboe","Clarinet"]
    readonly property var bgVolValues:   [-1, 32, 64, 96]
    readonly property var bgVolLabels:   ["Off","25%","50%","75%"]

    // ── Helpers ───────────────────────────────────────────────────────────────

    function computeParenthetical(track) {
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
            var vol = pf.family === "upper" ? upperBgVolume : lowerBgVolume
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
        var q = []
        for (var i = 0; i < trackModel.count; i++) {
            var row = trackModel.get(i)
            if (row.trackChecked) q.push(allTracks[row.trackIdx])
        }
        if (q.length === 0) return
        exportQueue = q
        exportIdx   = 0
        muteSnap    = VT.saveMuteStates(curScore)
        progSnap    = VT.saveChannelPrograms(curScore)
        volSnap     = VT.saveChannelVolumes(curScore)
        screen      = 2
        doExportTrack(0)
    }

    function doExportTrack(idx) {
        var track  = exportQueue[idx]
        var bgPf   = computeBgParts(track)
        VT.applyMutesForTrack(curScore, track.parts, flatParts(bgPf), classification.instrumentals)
        VT.applyChannelPrograms(curScore, track, upperVoiceProgram, lowerVoiceProgram)
        if (bgPf.length > 0) {
            VT.applyBackgroundVoices(curScore, bgPf,
                upperBgVolume, lowerBgVolume, upperBgProgram, lowerBgProgram)
        }
        // Copy suggested filename to clipboard so the user can paste it in the dialog.
        // MS 4.7.1 regression: users must type the extension explicitly, so include .mp3.
        clipHelper.text = track.displayName + ".mp3"
        clipHelper.selectAll()
        clipHelper.copy()
        cmd("export-audio")
    }

    function advanceTrack() {
        VT.restoreMuteStates(curScore, muteSnap)
        VT.restoreChannelPrograms(curScore, progSnap)
        VT.restoreChannelVolumes(curScore, volSnap)
        exportIdx = exportIdx + 1
        if (exportIdx >= exportQueue.length) { screen = 3; return }
        doExportTrack(exportIdx)
    }

    function stopAndRestore() {
        if (muteSnap) VT.restoreMuteStates(curScore, muteSnap)
        if (progSnap) VT.restoreChannelPrograms(curScore, progSnap)
        if (volSnap)  VT.restoreChannelVolumes(curScore, volSnap)
        quit()
    }

    // ── Models ────────────────────────────────────────────────────────────────
    ListModel { id: trackModel }
    // Hidden TextEdit for clipboard access
    TextEdit { id: clipHelper; visible: false; width: 1; height: 1 }

    // ── Initialisation ────────────────────────────────────────────────────────
    onRun: {
        if (!curScore) { quit(); return }
        classification = VT.classifyScore(curScore)
        allTracks      = VT.buildTracks(classification.slots, classification.modifierPresent)
        allVocalParts  = VT.buildPartFamilyMap(classification.slots)
        trackModel.clear()
        for (var i = 0; i < allTracks.length; i++) {
            trackModel.append({
                trackName:    allTracks[i].displayName,
                paren:        computeParenthetical(allTracks[i]),
                trackChecked: true,
                trackIdx:     i
            })
        }
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

        // No-vocals notice (shown only when score has no recognised vocal parts)
        Label {
            visible: allTracks.length === 0
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

        Column {
            anchors.centerIn: parent
            spacing: 16

            Label {
                text: "All done!  "
                      + exportQueue.length + " track"
                      + (exportQueue.length === 1 ? "" : "s")
                      + " exported."
                font.bold: true; font.pixelSize: 15
                anchors.horizontalCenter: parent.horizontalCenter
            }
            Label {
                text: "Mute states, programs, and volumes have been restored."
                font.pixelSize: 12; color: "#666666"
                anchors.horizontalCenter: parent.horizontalCenter
            }
            Button {
                text: "Close"
                anchors.horizontalCenter: parent.horizontalCenter
                onClicked: quit()
            }
        }
    }
}

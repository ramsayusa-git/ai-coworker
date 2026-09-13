package com.aetostechlabs.aetosonehealth.export

import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.aetostechlabs.aetosonehealth.data.BpReading
import com.aetostechlabs.aetosonehealth.data.EcgSession
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Writes an export into the app's cache and hands it to the system share
 * sheet. Cache (not external storage) so no storage permission is needed and
 * the file is cleaned up by Android on its own.
 */
object Exporter {

    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
    private val fileStamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.getDefault())

    private fun outFile(context: Context, name: String): File {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        return File(dir, name)
    }

    fun bpCsv(context: Context, rows: List<BpReading>, who: String): File {
        val f = outFile(context, "bp-readings-${fileStamp.format(Date())}.csv")
        f.bufferedWriter().use { w ->
            w.write("timestamp,profile,systolic,diastolic,pulse,map,category,source,raw\n")
            rows.forEach { r ->
                w.write(
                    listOf(
                        stamp.format(Date(r.ts)), r.profileName ?: "", r.systolic, r.diastolic,
                        r.pulse, r.meanArterial, r.category, r.source, r.rawHex
                    ).joinToString(",") { csv(it.toString()) } + "\n"
                )
            }
        }
        return f
    }

    fun ecgCsv(context: Context, rows: List<EcgSession>, who: String): File {
        val f = outFile(context, "ecg-sessions-${fileStamp.format(Date())}.csv")
        f.bufferedWriter().use { w ->
            w.write("started,ended,profile,duration_s,hr_avg,hr_min,hr_max,beats,quality\n")
            rows.forEach { s ->
                w.write(
                    listOf(
                        stamp.format(Date(s.startedAt)),
                        s.endedAt?.let { stamp.format(Date(it)) } ?: "",
                        s.profileName ?: "", s.durationSec,
                        s.hrAvg ?: "", s.hrMin ?: "", s.hrMax ?: "", s.beats, s.quality
                    ).joinToString(",") { csv(it.toString()) } + "\n"
                )
            }
        }
        return f
    }

    /**
     * A one-page summary a person can actually hand to a clinician. Kept
     * deliberately plain: values, dates, and the note that offsets were applied.
     */
    fun report(
        context: Context,
        who: String,
        bp: List<BpReading>,
        ecg: List<EcgSession>,
        calibrated: Boolean
    ): File {
        val doc = PdfDocument()
        val title = Paint().apply { textSize = 20f; isFakeBoldText = true }
        val head = Paint().apply { textSize = 12f; isFakeBoldText = true }
        val body = Paint().apply { textSize = 10.5f }
        val muted = Paint().apply { textSize = 9f; color = 0xFF666666.toInt() }

        var pageNo = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNo).create())
        var c = page.canvas
        var y = 56f

        fun newPageIfNeeded(step: Float) {
            if (y + step < 800f) return
            doc.finishPage(page)
            pageNo++
            page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNo).create())
            c = page.canvas
            y = 56f
        }

        c.drawText("Aetos One Health — readings report", 40f, y, title); y += 22f
        c.drawText("Profile: ${who.ifBlank { "All profiles" }}", 40f, y, body); y += 14f
        c.drawText("Generated ${stamp.format(Date())}", 40f, y, muted); y += 12f
        if (calibrated) {
            c.drawText(
                "Values include the calibration offsets configured in the app.", 40f, y, muted
            )
            y += 12f
        }
        y += 12f

        c.drawText("BP Monitor", 40f, y, head); y += 16f
        c.drawText("Date", 40f, y, muted)
        c.drawText("Sys", 220f, y, muted)
        c.drawText("Dia", 265f, y, muted)
        c.drawText("Pulse", 310f, y, muted)
        c.drawText("Category", 365f, y, muted)
        y += 13f
        if (bp.isEmpty()) {
            c.drawText("No readings recorded yet.", 40f, y, body); y += 16f
        } else {
            bp.take(40).forEach { r ->
                newPageIfNeeded(14f)
                c.drawText(stamp.format(Date(r.ts)), 40f, y, body)
                c.drawText("${r.systolic}", 220f, y, body)
                c.drawText("${r.diastolic}", 265f, y, body)
                c.drawText("${r.pulse}", 310f, y, body)
                c.drawText(r.category, 365f, y, body)
                y += 13f
            }
        }
        y += 18f

        newPageIfNeeded(40f)
        c.drawText("ECG sessions", 40f, y, head); y += 16f
        c.drawText("Started", 40f, y, muted)
        c.drawText("Duration", 220f, y, muted)
        c.drawText("Avg HR", 290f, y, muted)
        c.drawText("Range", 350f, y, muted)
        c.drawText("Quality", 430f, y, muted)
        y += 13f
        if (ecg.isEmpty()) {
            c.drawText("No sessions recorded yet.", 40f, y, body)
        } else {
            ecg.take(40).forEach { s ->
                newPageIfNeeded(14f)
                c.drawText(stamp.format(Date(s.startedAt)), 40f, y, body)
                c.drawText("${s.durationSec} s", 220f, y, body)
                c.drawText(s.hrAvg?.let { "%.1f".format(it) } ?: "—", 290f, y, body)
                c.drawText(
                    if (s.hrMin != null && s.hrMax != null) "${s.hrMin}–${s.hrMax}" else "—",
                    350f, y, body
                )
                c.drawText(s.quality, 430f, y, body)
                y += 13f
            }
        }

        newPageIfNeeded(40f)
        y += 24f
        c.drawText(
            "For personal reference only. Not a diagnostic device — discuss any concern with a clinician.",
            40f, y, muted
        )

        doc.finishPage(page)
        val f = outFile(context, "aetos-health-report-${fileStamp.format(Date())}.pdf")
        f.outputStream().use { doc.writeTo(it) }
        doc.close()
        return f
    }

    fun share(context: Context, file: File, mime: String) {
        val uri = FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", file
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, file.name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share ${file.name}"))
    }

    private fun csv(v: String): String =
        if (v.contains(',') || v.contains('"')) "\"" + v.replace("\"", "\"\"") + "\"" else v
}

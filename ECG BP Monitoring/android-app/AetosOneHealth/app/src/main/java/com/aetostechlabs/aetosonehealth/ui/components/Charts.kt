package com.aetostechlabs.aetosonehealth.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.aetostechlabs.aetosonehealth.ui.theme.EcgGrid
import com.aetostechlabs.aetosonehealth.ui.theme.EcgTrace
import kotlin.math.abs
import kotlin.math.max

/**
 * The live ECG trace on classic ECG-paper grid. Autoscaled to the window's own
 * amplitude, because the sensor's absolute counts mean nothing to a reader —
 * the shape does.
 */
@Composable
fun EcgWaveform(
    samples: FloatArray,
    modifier: Modifier = Modifier,
    height: androidx.compose.ui.unit.Dp = 190.dp
) {
    Box(modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxWidth().height(height)) {
            val w = size.width
            val h = size.height

            // ECG paper: 1 mm fine squares, 5 mm bold.
            val fine = h / 20f
            var x = 0f
            while (x <= w) {
                val bold = ((x / fine).toInt() % 5) == 0
                drawLine(
                    color = EcgGrid.copy(alpha = if (bold) 0.75f else 0.35f),
                    start = Offset(x, 0f), end = Offset(x, h),
                    strokeWidth = if (bold) 1.1f else 0.6f
                )
                x += fine
            }
            var y = 0f
            while (y <= h) {
                val bold = ((y / fine).toInt() % 5) == 0
                drawLine(
                    color = EcgGrid.copy(alpha = if (bold) 0.75f else 0.35f),
                    start = Offset(0f, y), end = Offset(w, y),
                    strokeWidth = if (bold) 1.1f else 0.6f
                )
                y += fine
            }

            if (samples.size < 2) return@Canvas

            val peak = max(1f, samples.maxOf { abs(it) })
            val mid = h / 2f
            val scale = (h * 0.42f) / peak
            val dx = w / (samples.size - 1).toFloat()

            val path = Path()
            samples.forEachIndexed { i, v ->
                val px = i * dx
                val py = mid - v * scale
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            drawPath(path, color = EcgTrace, style = Stroke(width = 2.2f))
        }
        if (samples.size < 2) {
            Text(
                "Waiting for the trace",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

data class Series(val label: String, val color: Color, val points: List<Float>)

/**
 * A compact multi-series line chart for trends. No chart library: the shapes
 * here are simple, and one less dependency is one less thing to break on a
 * Play Store update.
 */
@Composable
fun TrendChart(
    series: List<Series>,
    modifier: Modifier = Modifier,
    height: androidx.compose.ui.unit.Dp = 170.dp,
    bands: List<Pair<Float, Color>> = emptyList()
) {
    val hasData = series.any { it.points.size >= 2 }
    Box(modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxWidth().height(height)) {
            val w = size.width
            val h = size.height
            val all = series.flatMap { it.points }
            if (all.isEmpty()) return@Canvas
            var lo = all.min()
            var hi = all.max()
            bands.forEach { (v, _) -> lo = minOf(lo, v); hi = maxOf(hi, v) }
            if (hi - lo < 1f) { hi += 1f; lo -= 1f }
            val pad = (hi - lo) * 0.12f
            lo -= pad; hi += pad
            fun yOf(v: Float) = h - ((v - lo) / (hi - lo)) * h

            // Horizontal guides
            repeat(4) { i ->
                val gy = h * (i + 1) / 5f
                drawLine(
                    Color(0x14000000), Offset(0f, gy), Offset(w, gy), strokeWidth = 1f
                )
            }
            // Reference bands (e.g. the 120/80 thresholds)
            bands.forEach { (v, c) ->
                val gy = yOf(v)
                drawLine(
                    c.copy(alpha = 0.55f), Offset(0f, gy), Offset(w, gy), strokeWidth = 1.4f,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 7f))
                )
            }

            series.forEach { s ->
                if (s.points.size < 2) return@forEach
                val dx = w / (s.points.size - 1).toFloat()
                val path = Path()
                s.points.forEachIndexed { i, v ->
                    val px = i * dx
                    val py = yOf(v)
                    if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
                }
                drawPath(path, color = s.color, style = Stroke(width = 2.6f))
                s.points.forEachIndexed { i, v ->
                    drawCircle(s.color, radius = 3.2f, center = Offset(i * dx, yOf(v)))
                }
            }
        }
        if (!hasData) {
            Text(
                "Not enough readings yet",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

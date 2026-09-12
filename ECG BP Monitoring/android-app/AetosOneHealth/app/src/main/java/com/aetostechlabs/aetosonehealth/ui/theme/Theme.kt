package com.aetostechlabs.aetosonehealth.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Sampled straight from the Aetos One mark: shield navy and circuit orange.
val AetosNavy = Color(0xFF233C7F)
val AetosNavyDark = Color(0xFF16265A)
val AetosOrange = Color(0xFFF07E26)
val AetosOrangeSoft = Color(0xFFFFB273)

val BpSystolic = Color(0xFFD6455B)
val BpDiastolic = Color(0xFF2E7FD4)
val BpPulse = Color(0xFF14A38B)
val EcgTrace = Color(0xFF1B7F4B)
val EcgGrid = Color(0xFFF3C9C4)

private val Light = lightColorScheme(
    primary = AetosNavy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDEE5F8),
    onPrimaryContainer = AetosNavyDark,
    secondary = AetosOrange,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE5D0),
    onSecondaryContainer = Color(0xFF6B3200),
    background = Color(0xFFF4F6FB),
    onBackground = Color(0xFF141926),
    surface = Color.White,
    onSurface = Color(0xFF141926),
    surfaceVariant = Color(0xFFE9EDF6),
    onSurfaceVariant = Color(0xFF4A5468),
    outline = Color(0xFFC6CEDE),
    error = Color(0xFFB3261E)
)

private val Dark = darkColorScheme(
    primary = Color(0xFF9FB6F0),
    onPrimary = Color(0xFF0C1733),
    primaryContainer = Color(0xFF2A3F7D),
    onPrimaryContainer = Color(0xFFDCE4FB),
    secondary = AetosOrangeSoft,
    onSecondary = Color(0xFF4A2100),
    secondaryContainer = Color(0xFF7A3B08),
    onSecondaryContainer = Color(0xFFFFE1C9),
    background = Color(0xFF0E1220),
    onBackground = Color(0xFFE6EAF4),
    surface = Color(0xFF161B2C),
    onSurface = Color(0xFFE6EAF4),
    surfaceVariant = Color(0xFF232A3E),
    onSurfaceVariant = Color(0xFFAFB8CC),
    outline = Color(0xFF3A4359),
    error = Color(0xFFF2B8B5)
)

@Composable
fun AetosOneTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) Dark else Light
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colors.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(colorScheme = colors, typography = AetosTypography, content = content)
}

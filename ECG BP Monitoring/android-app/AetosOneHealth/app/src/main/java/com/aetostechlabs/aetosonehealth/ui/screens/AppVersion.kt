package com.aetostechlabs.aetosonehealth.ui.screens

import com.aetostechlabs.aetosonehealth.BuildConfig

/**
 * Shown on both device cards. Without it, neither the user nor anyone reading a
 * screenshot can tell which build produced it — which turns every report into a
 * guess about what is actually installed.
 */
fun appVersion(): String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

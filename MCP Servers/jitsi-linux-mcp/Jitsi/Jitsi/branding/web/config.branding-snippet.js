/*
 * AetosOne branding snippet for Jitsi Meet config.js (web).
 *
 * Modern Jitsi moved branding OUT of interface_config.js INTO config.js.
 * APPEND the block below into your server's /etc/jitsi/meet/<domain>-config.js
 * (inside the top-level `config = { ... }` object). Do NOT paste the wrapper
 * comment — only the key/values.
 *
 * VISUAL-ONLY: this changes names/logos/links, not features.
 */

// ---- paste from here, inside config = { ... } ----

    // App / product naming
    // (Some builds read these; harmless if ignored.)
    // appName is surfaced in the manifest + document title patch.

    // Dynamic branding: point at a JSON that defines logos/colors. If you host
    // it, uncomment and set the URL. Otherwise the static images/ files apply.
    // dynamicBrandingUrl: 'https://meet.aetosone.com/branding/aetosone.json',

    // Deep-linking / mobile promo — suppress "open in the app" interstitial
    // for a web-first launch. Flip disableDeepLinking to false once mobile ships.
    disableDeepLinking: true,

    // Welcome page tuning
    // (hideConferenceSubject / hideConferenceTimer etc. are optional)

    defaultLocalDisplayName: 'me',
    defaultRemoteDisplayName: 'AetosOne user',

// ---- paste to here ----

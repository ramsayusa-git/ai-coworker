/*
 * AetosOne branding overlay for Jitsi Meet (web).
 * This file is DEPRECATED upstream in favor of config.js, but is still read by
 * older/stable Jitsi builds. Keep BOTH this and the config.js snippet in sync.
 *
 * Deploy target on server: /usr/share/jitsi-meet/interface_config.js
 * (or symlink from your custom overlay dir).
 *
 * VISUAL-ONLY rebrand: names, logos, watermarks, links. No feature changes.
 */
var interfaceConfig = {
    APP_NAME: 'AetosOne',
    NATIVE_APP_NAME: 'AetosOne',
    PROVIDER_NAME: 'AetosOne',

    // In-call top-left logo (browser). Points at the files we shipped in images/.
    DEFAULT_LOGO_URL: 'images/watermark.png',
    DEFAULT_WELCOME_PAGE_LOGO_URL: 'images/watermark.png',

    // Remove the Jitsi watermark link; point brand watermark at your site.
    JITSI_WATERMARK_LINK: '',
    BRAND_WATERMARK_LINK: 'https://meet.aetosone.com',
    SHOW_JITSI_WATERMARK: true,   // now shows AetosOne watermark (image replaced)
    SHOW_WATERMARK_FOR_GUESTS: true,
    SHOW_BRAND_WATERMARK: false,
    SHOW_POWERED_BY: false,
    SHOW_PROMOTIONAL_CLOSE_PAGE: false,
    DISPLAY_WELCOME_PAGE_CONTENT: true,
    DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT: false,
    DISPLAY_WELCOME_FOOTER: false,

    // Hide "Powered by Jitsi" / mobile-app-store nags and deep-link marketing.
    MOBILE_APP_PROMO: false,
    HIDE_DEEP_LINKING_LOGO: false,

    SUPPORT_URL: 'https://meet.aetosone.com/support',

    // Optional: default toolbar (unchanged from stock — visual-only rebrand).
    // Leave TOOLBAR_BUTTONS unset to keep Jitsi defaults.
    DEFAULT_BACKGROUND: '#0b1f2a'
};

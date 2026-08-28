/*
 * Aetos One — runtime frontend rebrand (update-proof).
 *
 * Loaded via `frontend: extra_module_url`. Because it lives in /config/www it
 * survives Core/OS updates that would otherwise revert the stock frontend.
 *
 * It (1) forces the browser tab title to "Aetos One", (2) swaps the favicon to
 * the Aetos logo, and (3) rewrites any residual "Home Assistant" text that the
 * stock frontend renders inside the authenticated app (dialogs, About, etc.),
 * walking open shadow roots. Runs on load, on SPA navigation, and on a light
 * 8s safety interval — deliberately infrequent to keep dashboards responsive.
 *
 * Note: the pre-login page is served before this module loads and cannot be
 * rebranded from here; only the authenticated app is covered.
 */
(function () {
  "use strict";
  var NAME = "Aetos One";
  // Shield (square) icon everywhere for the favicon/tab icon - matches the baked
  // frontend favicon so the tab icon never flickers between the shield and the
  // wide "Aetos One" wordmark.
  var LOGO = "/local/aetos_shield.png";
  // Longest / most specific first so nested phrases resolve correctly.
  var RULES = [
    [/Home Assistant Operating System/g, "Aetos One OS"],
    [/Home Assistant Core/g, "Aetos One Core"],
    [/Home Assistant Supervisor/g, "Aetos One Supervisor"],
    [/Home Assistant/g, NAME],
  ];

  function brandText(s) {
    for (var i = 0; i < RULES.length; i++) s = s.replace(RULES[i][0], RULES[i][1]);
    return s;
  }

  function fixTitle() {
    if (document.title && document.title.indexOf("Home Assistant") >= 0) {
      document.title = brandText(document.title);
    }
  }

  function fixFavicon() {
    try {
      var links = document.querySelectorAll("link[rel*='icon']");
      for (var i = 0; i < links.length; i++) {
        if (links[i].href.indexOf("aetos_shield") < 0) links[i].href = LOGO;
      }
    } catch (e) {}
  }

  // Walk light DOM + open shadow roots, rewriting text nodes in place.
  function walk(node, depth) {
    if (!node || depth > 30) return;
    for (var child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        var v = child.nodeValue;
        if (v && v.indexOf("Home Assistant") >= 0 && v.indexOf("Community Store") < 0) {
          child.nodeValue = brandText(v);
        }
      } else if (child.nodeType === 1) {
        if (child.shadowRoot) walk(child.shadowRoot, depth + 1);
        walk(child, depth + 1);
      }
    }
  }

  // --- Open-source license / attribution shown on the About page (/config/info).
  // Apache-2.0 (HA Core) requires retaining attribution; the OS bundles GPL and
  // other OSS. This is a good-faith notice - have counsel finalise the wording.
  var LICENSE_HTML =
    "<div style='text-align:center'>" +
      "<img src='/local/aetos_shield.png' alt='Aetos One' style='width:96px;height:96px;object-fit:contain;margin:4px auto 10px'>" +
      "<div style='font-size:20px;font-weight:700'>Aetos One</div>" +
      "<div style='opacity:.7;margin-bottom:18px'>Smart Home Controller</div>" +
    "</div>" +
    "<div style='max-width:320px;margin:0 auto;font-size:13px;line-height:1.9'>" +
      "<div><b>Build</b>: v11.0.3</div>" +
      "<div><b>Core</b>: 2026.8.0</div>" +
      "<div><b>Powered by</b>: Aetos Tech Labs</div>" +
      "<div><b>Web</b>: <a href='https://www.aetostechlabs.com' target='_blank' rel='noreferrer noopener'>www.aetostechlabs.com</a></div>" +
      "<div><b>Support</b>: <a href='mailto:krishna@aetostechlabs.com'>krishna@aetostechlabs.com</a></div>" +
      "<div><b>Mobile</b>: +91 99666 12678</div>" +
    "</div>" +
    "<div style='text-align:center;margin-top:16px;font-size:11px;opacity:.5'>Built on Aetos One (Apache-2.0). Open-source license details available on request.</div>";

  function eachRoot(root, cb, depth) {
    if (!root || depth > 30) return;
    try { cb(root); } catch (e) {}
    var els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < els.length; i++) if (els[i].shadowRoot) eachRoot(els[i].shadowRoot, cb, depth + 1);
  }

  function injectLicenses() {
    if (location.pathname.indexOf("/config/info") < 0) return;
    eachRoot(document, function (r) {
      var host = r.querySelector && r.querySelector("ha-config-info");
      if (!host || !host.shadowRoot) return;
      var sr = host.shadowRoot;
      // If the baked frontend (frontend_latest) already renders the Aetos About
      // page, leave it untouched - no runtime injection, no flash. This block is
      // now only a fallback for the legacy es5 bundle (still stock About content).
      if (sr.textContent && sr.textContent.indexOf("Aetos Tech Labs") >= 0) return;
      if (!sr.getElementById("aetos-hide")) {
        var st = document.createElement("style");
        st.id = "aetos-hide";
        st.textContent = ":host>*:not(#aetos-about):not(#aetos-hide){display:none!important}";
        sr.insertBefore(st, sr.firstChild);
      }
      if (!sr.getElementById("aetos-about")) {
        var b = document.createElement("div");
        b.id = "aetos-about";
        b.style.cssText =
          "max-width:640px;margin:24px auto;padding:28px 20px;border-radius:12px;" +
          "background:var(--card-background-color,#fff);color:var(--primary-text-color);" +
          "font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.12)";
        b.innerHTML = LICENSE_HTML;
        sr.appendChild(b);
      }
    }, 0);
  }

  function analyticsRedirect() {
    // Remove the Analytics settings page - bounce any visit back to Settings.
    if (location.pathname.indexOf("/config/analytics") === 0) {
      try { window.location.replace("/config/dashboard"); } catch (e) {}
    }
  }

  var busy = false;
  // Hide selected default sidebar panels (Map / Energy / To-do) via a style in
  // the ha-sidebar shadow root. Update-proof and reversible (edit AETOS_HIDE_PANELS).
  var AETOS_HIDE_PANELS = ["map", "energy", "todo"];
  var AETOS_HIDE_HREFS = ["/config/labs", "/config/cloud"]; // Settings items to hide
  function hideSidebarPanels() {
    eachRoot(document, function (r) {
      if (!r.querySelector) return;
      // Sidebar: hide selected panels + add the Aetos logo next to the title.
      var sb = r.querySelector("ha-sidebar");
      if (sb && sb.shadowRoot) {
        var sr = sb.shadowRoot;
        if (!sr.getElementById("aetos-hide-panels")) {
          var sel = AETOS_HIDE_PANELS.map(function (p) { return 'a[data-panel="' + p + '"]'; }).join(",");
          var st = document.createElement("style"); st.id = "aetos-hide-panels";
          st.textContent = sel + "{display:none!important}";
          sr.appendChild(st);
        }
        // NOTE: the baked frontend (ha-sidebar) already renders ONE Aetos logo
        // next to the title. Do NOT inject another here or the sidebar shows
        // two identical logos. (Removed aetos-sb-logo injection.)
      }
      // Hide Settings items (Labs / Cloud) wherever their nav links render.
      if (r.querySelector('a[href="/config/labs"]') || r.querySelector('a[href="/config/cloud"]') || r.querySelector("ha-navigation-list")) {
        if (r.getElementById && !r.getElementById("aetos-hide-cfg") && r.appendChild) {
          var cs = document.createElement("style"); cs.id = "aetos-hide-cfg";
          cs.textContent = AETOS_HIDE_HREFS.map(function (h) { return 'a[href="' + h + '"]'; }).join(",") + "{display:none!important}";
          r.appendChild(cs);
        }
      }
    }, 0);
  }

  // Hide the baked HA logo chip (ha-logo-svg) that appears top-right on the
  // Logs / Developer Tools header. Global runtime CSS; update-proof + reversible.
  function hideHaLogoChip() {
    if (document.getElementById("aetos-hide-halogo")) return;
    var st = document.createElement("style");
    st.id = "aetos-hide-halogo";
    st.textContent = "ha-logo-svg{display:none!important}";
    (document.head || document.documentElement).appendChild(st);
  }

  function run() {
    if (busy) return;
    busy = true;
    try {
      analyticsRedirect(); fixTitle(); fixFavicon();
      // Leave the About page (/config/info) completely alone - it is baked
      // correctly, so re-writing it at runtime only causes a visible flash.
      if (location.pathname.indexOf('/config/info') < 0) { walk(document.body, 0); }
      hideSidebarPanels(); hideHaLogoChip();
    } catch (e) {}
    busy = false;
  }

  var t;
  function schedule() { clearTimeout(t); t = setTimeout(run, 400); }

  function init() {
    // Default dashboard: on first load of a tab, if we are on the stock
    // Overview, jump to the Aetos One dashboard (url_path "aetos").
    try {
      var dp = location.pathname;
      if (!sessionStorage.getItem("aetos_dash") && (dp === "/" || dp === "/lovelace" || /^\/lovelace(\/|$)/.test(dp))) {
        sessionStorage.setItem("aetos_dash", "1");
        location.replace("/aetos");
        return;
      }
    } catch (e) {}
    run();
    // Rebrand on single-page-app navigation.
    ["pushState", "replaceState"].forEach(function (m) {
      var orig = history[m];
      history[m] = function () {
        var r = orig.apply(this, arguments);
        schedule();
        return r;
      };
    });
    window.addEventListener("popstate", schedule);
    window.addEventListener("hass-more-info", schedule, true);
    // Light safety net; infrequent to keep the UI responsive.
    setInterval(run, 8000);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();

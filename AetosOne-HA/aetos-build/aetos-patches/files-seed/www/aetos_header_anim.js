// Aetos One - header bar: particle-network background + a SINGLE "Aetos One"
// scrolling the full width with a slow zig-zag (40% opacity). Default header
// buttons hidden except the overflow (edit) menu on the right. No waves.
(function () {
  if (!document.getElementById("aetos-hdr-style")) {
    var s = document.createElement("style");
    s.id = "aetos-hdr-style";
    s.textContent =
      "@keyframes aetosScrollX{0%{transform:translateX(100vw)}100%{transform:translateX(-120%)}}" +
      "@keyframes aetosZigY{0%{transform:translateY(-11px)}25%{transform:translateY(9px)}50%{transform:translateY(-9px)}75%{transform:translateY(11px)}100%{transform:translateY(-11px)}}";
    document.head.appendChild(s);
  }
  function allRoots(root, out) {
    out = out || [];
    var els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < els.length; i++) if (els[i].shadowRoot) { out.push(els[i].shadowRoot); allRoots(els[i].shadowRoot, out); }
    return out;
  }
  function findHeader() {
    var roots = [document]; allRoots(document, roots);
    for (var k = 0; k < roots.length; k++) {
      var r = roots[k]; if (!r.querySelector) continue;
      var h = r.querySelector(".header");
      if (h && (h.querySelector(".toolbar") || h.querySelector("app-toolbar") ||
                h.querySelector("ha-tabs") || h.querySelector(".main-title") || h.querySelector("ha-menu-button"))) return h;
    }
    return null;
  }
  function runNet(c) {
    var x = c.getContext("2d"), W, H, pts = [];
    function size() { W = c.width = c.offsetWidth || 900; H = c.height = c.offsetHeight || 56; }
    size(); window.addEventListener("resize", size);
    for (var i = 0; i < 26; i++) pts.push({ x: Math.random() * (c.offsetWidth || 900), y: Math.random() * (c.offsetHeight || 56), vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, r: 1.3 + Math.random() * 1.8 });
    function step() {
      if (!c.isConnected) return;
      if (c.offsetWidth && c.offsetWidth !== W) size();
      x.clearRect(0, 0, W, H); x.fillStyle = "#273A80"; x.fillRect(0, 0, W, H);
      for (var i = 0; i < pts.length; i++) { var p = pts[i]; p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
        var a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) { x.strokeStyle = "rgba(255,255,255," + (0.16 * (1 - d / 110)) + ")"; x.lineWidth = 1; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      }
      for (var i = 0; i < pts.length; i++) { var p = pts[i]; x.fillStyle = i % 5 === 0 ? "rgba(230,112,28,.95)" : "rgba(255,255,255,.55)"; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); }
      requestAnimationFrame(step);
    }
    step();
  }
  function hideButtons(header) {
    var tb = header.querySelector(".toolbar") || header.querySelector("app-toolbar");
    if (!tb) return;
    var kids = tb.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i], tag = (el.tagName || "").toLowerCase();
      if (tag === "ha-button-menu") { el.style.zIndex = "9"; el.style.position = "relative"; continue; }
      el.style.display = "none";
    }
  }
  function mount() {
    var header = findHeader();
    if (!header || header.querySelector("#aetos-net")) return;
    if (getComputedStyle(header).position === "static") header.style.position = "relative";
    header.style.background = "transparent";
    var cv = document.createElement("canvas");
    cv.id = "aetos-net";
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none";
    header.insertBefore(cv, header.firstChild);
    // Keep the canvas strictly behind the toolbar so all buttons (incl. edit) work.
    var tb = header.querySelector(".toolbar") || header.querySelector("app-toolbar");
    if (tb) { tb.style.position = "relative"; tb.style.zIndex = "1"; }
    runNet(cv);
  }
  setInterval(mount, 1000);
  window.addEventListener("location-changed", function () { setTimeout(mount, 300); });
})();

/* User Guide — sidebar active-highlight, mobile menu, accessible lightbox */
(function () {
  "use strict";

  /* ---------- Deep-link landing fix ----------
     The topbar's User Guide button opens /UserGuide#<chapter>. The browser
     jumps to the anchor during parse, but images above it finish loading
     afterwards and reflow the page, leaving the viewport in the wrong place.
     All guide <img> tags carry width/height so reflow is minimal, but fonts
     and edge cases still shift layout — re-snap to the hash target once the
     page has fully loaded (and again shortly after, for slow connections). */
  function snapToHash() {
    if (!location.hash || location.hash.length < 2) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }
  if (location.hash) {
    window.addEventListener("load", function () {
      snapToHash();
      setTimeout(snapToHash, 350);
    });
  }

  /* ---------- Mobile sidebar toggle ---------- */
  var sidebar = document.getElementById("sidebar");
  var scrim = document.getElementById("scrim");
  var toggle = document.getElementById("menuToggle");
  function closeSidebar() { sidebar.classList.remove("open"); scrim.classList.remove("open"); }
  if (toggle) {
    toggle.addEventListener("click", function () {
      sidebar.classList.toggle("open");
      scrim.classList.toggle("open");
    });
  }
  if (scrim) scrim.addEventListener("click", closeSidebar);
  // Close the mobile menu after tapping a link
  Array.prototype.forEach.call(document.querySelectorAll(".nav a"), function (a) {
    a.addEventListener("click", function () { if (window.innerWidth <= 900) closeSidebar(); });
  });

  /* ---------- Active section highlight ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav a[href^='#']"));
  var linkById = {};
  navLinks.forEach(function (a) { linkById[a.getAttribute("href").slice(1)] = a; });

  var targets = navLinks
    .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
    .filter(Boolean);

  function setActive(id) {
    navLinks.forEach(function (a) { a.classList.remove("active"); });
    var link = linkById[id];
    if (link) {
      link.classList.add("active");
      // keep the active link visible within the scrollable sidebar
      if (link.scrollIntoViewIfNeeded) link.scrollIntoViewIfNeeded();
    }
  }

  if ("IntersectionObserver" in window && targets.length) {
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible[e.target.id] = e.intersectionRatio;
        else delete visible[e.target.id];
      });
      // Pick the visible target highest on the page (document order wins ties)
      var best = null;
      for (var i = 0; i < targets.length; i++) {
        if (visible[targets[i].id] != null) { best = targets[i].id; break; }
      }
      if (best) setActive(best);
    }, { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.1, 0.5, 1] });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- Accessible lightbox ---------- */
  var lb = document.getElementById("lightbox");
  if (!lb) return;
  var lbImg = lb.querySelector("img");
  var lbCap = lb.querySelector(".lb-caption");
  var lbClose = lb.querySelector(".lb-close");
  var lastFocus = null;

  function openLightbox(src, alt, caption) {
    lastFocus = document.activeElement;
    lbImg.src = src;
    lbImg.alt = alt || "";
    lbCap.textContent = caption || "";
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    lbClose.focus();
    document.addEventListener("keydown", onKey);
  }
  function closeLightbox() {
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    lbImg.src = "";
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") closeLightbox();
    // simple focus trap: keep focus on the close button
    if (e.key === "Tab") { e.preventDefault(); lbClose.focus(); }
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest ? e.target.closest(".lightbox-trigger") : null;
    if (trigger) {
      e.preventDefault();
      var img = trigger.querySelector("img");
      openLightbox(trigger.getAttribute("href"),
                   img ? img.alt : "",
                   trigger.getAttribute("data-caption") || (img ? img.alt : ""));
    }
  });
  lbClose.addEventListener("click", closeLightbox);
  // click outside the image closes
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
})();

/*
 * Aetos One - animated aurora background behind ALL dashboards.
 * A fixed, blurred, slowly-drifting aurora sits at the very back. The dashboard
 * content layer is made translucent (via --primary-background-color) so the
 * aurora shows through behind the cards, while the sidebar, header and cards
 * keep their own solid backgrounds for readability. Runtime + update-proof.
 */
(function () {
  "use strict";
  if (document.getElementById("aetos-dash-aurora-style")) return;

  var st = document.createElement("style");
  st.id = "aetos-dash-aurora-style";
  st.textContent =
    // The very-back aurora must be visible: clear html/body paint.
    "html,body{background:transparent!important;background-color:transparent!important}" +
    // Dashboard view/content area transparent-ish so the aurora shows behind cards.
    ":root,html{--lovelace-background:transparent!important;--view-background:transparent!important;" +
    "--primary-background-color:rgba(246,248,253,0.45)!important;" +
    // keep chrome solid for readability
    "--sidebar-background-color:#FFFFFF!important;--app-header-background-color:#FFFFFF!important;" +
    "--card-background-color:#FFFFFF!important;--ha-card-background:#FFFFFF!important}" +
    "@media (prefers-color-scheme:dark){:root,html{--primary-background-color:rgba(14,19,48,0.55)!important;" +
    "--sidebar-background-color:#141a34!important;--app-header-background-color:#141a34!important;" +
    "--card-background-color:#171d3a!important;--ha-card-background:#171d3a!important}}" +
    // the aurora layer
    "#aetos-dash-aurora{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}" +
    "#aetos-dash-aurora span{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;will-change:transform}" +
    "#aetos-dash-aurora .a1{width:56vmax;height:56vmax;background:#273A80;top:-14vh;left:-10vw;animation:aDaur1 24s ease-in-out infinite alternate}" +
    "#aetos-dash-aurora .a2{width:50vmax;height:50vmax;background:#E6701C;bottom:-16vh;right:-8vw;animation:aDaur2 28s ease-in-out infinite alternate}" +
    "#aetos-dash-aurora .a3{width:44vmax;height:44vmax;background:#3D55B0;top:26vh;right:16vw;animation:aDaur3 32s ease-in-out infinite alternate}" +
    "@keyframes aDaur1{from{transform:translate(0,0) scale(1)}to{transform:translate(9vw,11vh) scale(1.18)}}" +
    "@keyframes aDaur2{from{transform:translate(0,0) scale(1)}to{transform:translate(-11vw,-9vh) scale(1.12)}}" +
    "@keyframes aDaur3{from{transform:translate(0,0) scale(1)}to{transform:translate(7vw,-13vh) scale(1.22)}}" +
    "@media (prefers-reduced-motion:reduce){#aetos-dash-aurora span{animation:none}}";
  (document.head || document.documentElement).appendChild(st);

  function mount() {
    if (document.getElementById("aetos-dash-aurora")) return;
    if (!document.body) return;
    var d = document.createElement("div");
    d.id = "aetos-dash-aurora";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = "<span class='a1'></span><span class='a2'></span><span class='a3'></span>";
    document.body.insertBefore(d, document.body.firstChild);
  }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", mount);
  else mount();
  setInterval(mount, 3000);
})();

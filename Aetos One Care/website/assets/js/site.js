/* Aetos One Care — site behaviour */
(function () {
  'use strict';

  /* theme */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('aoc-theme'); } catch (e) {}
  if (stored) root.setAttribute('data-theme', stored);
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('aoc-theme', next); } catch (e) {}
  };

  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    /* nav */
    var nav = document.querySelector('.nav');
    var onScroll = function () {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var burger = document.querySelector('.burger');
    var links = document.querySelector('.nav-links');
    if (burger && links) {
      burger.addEventListener('click', function () { links.classList.toggle('open'); });
    }

    /* active link */
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      if (a.getAttribute('href') === here) a.classList.add('active');
    });

    /* scroll reveal */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 70 + 'ms';
      io.observe(el);
    });
    /* fail-safe: never leave content invisible */
    setTimeout(function () {
      document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight * 1.2) el.classList.add('in');
      });
    }, 1200);
    window.addEventListener('load', function () {
      setTimeout(function () {
        document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
          if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in');
        });
      }, 300);
    });

    /* pointer glow on cards */
    document.querySelectorAll('.card').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });

    /* count-up */
    var nums = document.querySelectorAll('[data-count]');
    var nio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, target = parseFloat(el.dataset.count),
            suffix = el.dataset.suffix || '', dec = parseInt(el.dataset.dec || '0', 10),
            t0 = performance.now(), dur = 1400;
        (function step(now) {
          var p = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * e).toFixed(dec) + suffix;
          if (p < 1) requestAnimationFrame(step);
        })(t0);
        nio.unobserve(el);
      });
    }, { threshold: 0.5 });
    var noMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var settle = function (el) {
      var t = parseFloat(el.dataset.count), d = parseInt(el.dataset.dec || '0', 10);
      el.textContent = t.toFixed(d) + (el.dataset.suffix || '');
    };
    nums.forEach(function (n) { if (noMotion) { settle(n); } else { nio.observe(n); } });
    setTimeout(function () {
      nums.forEach(function (n) { if (n.textContent === '0') settle(n); });
    }, 2200);

    /* live vitals ticker in hero mock */
    var hr = document.getElementById('v-hr');
    var spo = document.getElementById('v-spo2');
    if (hr) {
      setInterval(function () {
        var b = 72 + Math.round(Math.sin(Date.now() / 2600) * 5 + (Math.random() * 3 - 1.5));
        hr.firstChild.nodeValue = b + ' ';
        if (spo) spo.firstChild.nodeValue = (97 + Math.round(Math.random())) + ' ';
      }, 1400);
    }

    /* comparison filter (compare.html) */
    var filter = document.getElementById('cmp-filter');
    if (filter) {
      filter.addEventListener('change', function () {
        var v = filter.value;
        document.querySelectorAll('tbody tr[data-seg]').forEach(function (tr) {
          tr.hidden = !(v === 'all' || tr.dataset.seg === v || tr.classList.contains('us'));
        });
      });
    }

    /* demo form */
    document.querySelectorAll('form[data-demo]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var out = f.querySelector('[data-result]');
        if (out) {
          out.hidden = false;
          out.textContent = 'Thanks — this is a static prototype, so nothing was sent. Wire this form to your backend or CRM before launch.';
        }
      });
    });
  });
})();

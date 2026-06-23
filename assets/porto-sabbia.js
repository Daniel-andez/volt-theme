/**
 * porto-sabbia.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactions for the Porto Sabbia luxury landing page.
 * Vanilla JS, zero dependencies, idempotent (safe if loaded more than once).
 *   • Reveal-on-scroll (graceful no-JS fallback via `.porto-js` html class)
 *   • Animated stat counters
 *   • FAQ accordion (+ a11y)
 *   • Gallery lightbox (keyboard + swipe)
 *   • Smooth in-page anchor scroll
 *   • UTM / referrer capture into lead-form hidden fields
 *   • Sticky conversion bar reveal
 *   • Lead form submit UX
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // Mark JS as active ASAP so reveal elements can hide (no-JS keeps them visible).
  document.documentElement.classList.add('porto-js');

  // Idempotency guard — the asset may be referenced by several sections.
  if (window.__portoSabbiaInit) return;
  window.__portoSabbiaInit = true;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ───────────────────────── Reveal on scroll ───────────────────────── */
  function initReveal() {
    var els = document.querySelectorAll('.porto [data-reveal]');
    if (!els.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
        if (delay) el.style.setProperty('--porto-delay', delay + 'ms');
        el.classList.add('is-in');
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ───────────────────────── Animated counters ──────────────────────── */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count-to'));
    if (isNaN(target)) return;
    var decimals = parseInt(el.getAttribute('data-count-decimals') || '0', 10);
    var prefix = el.getAttribute('data-count-prefix') || '';
    var suffix = el.getAttribute('data-count-suffix') || '';
    var dur = 1600;
    var start = null;

    if (reduceMotion) {
      el.textContent = prefix + target.toFixed(decimals) + suffix;
      return;
    }

    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      var val = (target * eased).toFixed(decimals);
      el.textContent = prefix + val + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initCounters() {
    var counters = document.querySelectorAll('.porto [data-count-to]');
    if (!counters.length) return;
    if (!('IntersectionObserver' in window)) {
      counters.forEach(animateCount);
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { io.observe(el); });
  }

  /* ───────────────────────────── FAQ ────────────────────────────────── */
  function initFaq() {
    document.querySelectorAll('.porto-faq__q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.porto-faq__item');
        var panel = item.querySelector('.porto-faq__a');
        var open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.style.maxHeight = open ? panel.scrollHeight + 'px' : null;
      });
    });
    // Recalculate open panel height on resize.
    window.addEventListener('resize', function () {
      document.querySelectorAll('.porto-faq__item.is-open .porto-faq__a').forEach(function (panel) {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      });
    });
  }

  /* ─────────────────────────── Lightbox ─────────────────────────────── */
  function initLightbox() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.porto-gallery__item[data-full]'));
    if (!items.length) return;

    var box = document.createElement('div');
    box.className = 'porto-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Galería Porto Sabbia');
    box.innerHTML =
      '<button class="porto-lightbox__close" aria-label="Cerrar">' +
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M17 3L3 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
      '<button class="porto-lightbox__nav porto-lightbox__nav--prev" aria-label="Anterior">' +
      '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M14 4l-7 7 7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<img alt="">' +
      '<button class="porto-lightbox__nav porto-lightbox__nav--next" aria-label="Siguiente">' +
      '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M8 4l7 7-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    document.body.appendChild(box);

    var imgEl = box.querySelector('img');
    var current = 0;

    function show(i) {
      current = (i + items.length) % items.length;
      imgEl.src = items[current].getAttribute('data-full');
      imgEl.alt = items[current].getAttribute('data-alt') || 'Porto Sabbia';
    }
    function open(i) { show(i); box.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    function close() { box.classList.remove('is-open'); document.body.style.overflow = ''; }

    items.forEach(function (item, i) {
      item.addEventListener('click', function () { open(i); });
      item.setAttribute('tabindex', '0');
      item.setAttribute('role', 'button');
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });

    box.querySelector('.porto-lightbox__close').addEventListener('click', close);
    box.querySelector('.porto-lightbox__nav--prev').addEventListener('click', function () { show(current - 1); });
    box.querySelector('.porto-lightbox__nav--next').addEventListener('click', function () { show(current + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });

    // Swipe
    var sx = 0;
    box.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ──────────────────── Smooth in-page anchor scroll ────────────────── */
  function initSmoothScroll() {
    document.querySelectorAll('.porto [data-porto-scroll]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var sel = link.getAttribute('href');
        if (!sel || sel.charAt(0) !== '#') return;
        var target = document.querySelector(sel);
        if (!target) return;
        e.preventDefault();
        // Optionally pre-select the project of interest in the lead form.
        var project = link.getAttribute('data-porto-project');
        if (project) {
          var select = document.getElementById('porto-proyecto');
          if (select) {
            for (var i = 0; i < select.options.length; i++) {
              if (select.options[i].value === project) { select.selectedIndex = i; break; }
            }
          }
        }
        var headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
        var top = target.getBoundingClientRect().top + window.pageYOffset - headerH - 12;
        window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
        var focusable = target.querySelector('input, select, textarea, button, a[href]');
        if (focusable && target.hasAttribute('data-porto-focus')) {
          setTimeout(function () { focusable.focus({ preventScroll: true }); }, 500);
        }
      });
    });
  }

  /* ──────────────── UTM / referrer capture for lead form ────────────── */
  function initTracking() {
    var params = new URLSearchParams(window.location.search);
    var map = {
      'porto-utm-source': params.get('utm_source') || '',
      'porto-utm-medium': params.get('utm_medium') || '',
      'porto-utm-campaign': params.get('utm_campaign') || '',
      'porto-utm-term': params.get('utm_term') || '',
      'porto-utm-content': params.get('utm_content') || '',
      'porto-landing': window.location.pathname,
      'porto-referrer': document.referrer || 'directo'
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = map[id];
    });
  }

  /* ─────────────────────── Sticky conversion bar ────────────────────── */
  function initSticky() {
    var bar = document.querySelector('[data-porto-sticky]');
    if (!bar) return;
    var hero = document.querySelector('.porto-hero');
    var threshold = hero ? hero.offsetHeight * 0.7 : 600;
    var ticking = false;
    function update() {
      var show = window.pageYOffset > threshold;
      // Hide once the lead form is on screen to avoid covering it.
      var form = document.getElementById('contacto');
      if (form) {
        var r = form.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) show = false;
      }
      bar.classList.toggle('is-visible', show);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ─────────────────────────── Lead form UX ─────────────────────────── */
  function initForm() {
    document.querySelectorAll('[data-porto-form]').forEach(function (form) {
      form.addEventListener('submit', function () {
        var btn = form.querySelector('[type="submit"]');
        if (btn) {
          btn.setAttribute('aria-busy', 'true');
          btn.dataset.label = btn.textContent;
          btn.textContent = 'Enviando…';
        }
      });
    });
    // Scroll to the success/error banner if present after redirect.
    var status = document.querySelector('[data-porto-form-status]');
    if (status) {
      setTimeout(function () {
        status.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }, 200);
    }
  }

  ready(function () {
    initReveal();
    initCounters();
    initFaq();
    initLightbox();
    initSmoothScroll();
    initTracking();
    initSticky();
    initForm();
  });
})();

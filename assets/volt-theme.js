/**
 * volt-theme.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vanilla ES6+ — zero dependencies.
 * Modules (all self-initialising via init() called at bottom):
 *   • VoltUtils          — shared helpers
 *   • VoltHeader         — sticky, transparent, scroll-shrink, search panel
 *   • VoltMobileNav      — mobile drawer + expand/collapse
 *   • VoltCartDrawer     — slide-out cart, live count, notes
 *   • VoltProductForm    — variant picker, quantity, ATC, product recommendations
 *   • VoltAgeVerifier    — cookie-backed age gate
 *   • VoltPromoPopup     — timed popup with session storage dismiss
 *   • VoltCountdown      — product-page countdown timer
 *   • VoltPredictive     — predictive search
 *   • VoltBackToTop      — scroll-triggered back-to-top button
 *   • VoltAnnouncement   — dismissible announcement bar
 *   • VoltQuickView      — quick view modal (lazy-loads product HTML)
 *   • VoltInfiniteScroll — intersection-observer-based pagination
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   VoltUtils — helpers used across modules
═══════════════════════════════════════════════════════════════════════════ */
const VoltUtils = {
  /** Debounce a function */
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },

  /** Trap focus inside an element (for a11y modals/drawers) */
  trapFocus(el) {
    const focusable = el.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    el._trapHandler = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
    };
    el.addEventListener('keydown', el._trapHandler);
    first?.focus();
  },

  /** Remove focus trap */
  removeFocusTrap(el) {
    if (el._trapHandler) { el.removeEventListener('keydown', el._trapHandler); delete el._trapHandler; }
  },

  /** Money formatting (mirrors Shopify's money_format) */
  formatMoney(cents, format = '${{amount}}') {
    const amount = (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return format.replace('{{amount}}', amount);
  },

  /** GET JSON from Shopify API with error handling */
  async fetchJSON(url) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  /** Announce to screen readers via live region */
  announce(message) {
    let region = document.getElementById('zap-live-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'zap-live-region';
      region.setAttribute('aria-live', 'assertive');
      region.setAttribute('aria-atomic', 'true');
      region.className = 'sr-only';
      document.body.appendChild(region);
    }
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = message; });
  },

  getCookie: (name) => document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=')[1],
  setCookie: (name, value, days) => {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${exp}; path=/; SameSite=Lax`;
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltHeader — sticky behaviour, transparent home, search panel
═══════════════════════════════════════════════════════════════════════════ */
const VoltHeader = {
  init() {
    this.header      = document.getElementById('site-header');
    this.searchBtn   = document.querySelector('[data-toggle-search]');
    this.searchPanel = document.getElementById('search-panel');
    if (!this.header) return;

    this._setHeight();
    window.addEventListener('resize', VoltUtils.debounce(() => this._setHeight(), 200));

    if (this.header.classList.contains('site-header--sticky')) {
      window.addEventListener('scroll', this._onScroll.bind(this), { passive: true });
    }

    this.searchBtn?.addEventListener('click', () => this._toggleSearch());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeSearch(); });
  },

  _setHeight() {
    const h = this.header.offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
  },

  _onScroll() {
    const scrolled = window.scrollY > 10;
    this.header.classList.toggle('site-header--scrolled', scrolled);
  },

  _toggleSearch() {
    const isOpen = this.searchPanel && !this.searchPanel.hidden;
    isOpen ? this._closeSearch() : this._openSearch();
  },

  _openSearch() {
    if (!this.searchPanel) return;
    this.searchPanel.hidden = false;
    this.searchBtn?.setAttribute('aria-expanded', 'true');
    this.searchPanel.querySelector('input')?.focus();
  },

  _closeSearch() {
    if (!this.searchPanel) return;
    this.searchPanel.hidden = true;
    this.searchBtn?.setAttribute('aria-expanded', 'false');
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltMobileNav — drawer open/close + sub-menu accordion
═══════════════════════════════════════════════════════════════════════════ */
const VoltMobileNav = {
  init() {
    this.toggle   = document.querySelector('[data-menu-toggle]');
    this.close    = document.querySelector('[data-menu-close]');
    this.nav      = document.getElementById('mobile-nav');
    this.overlay  = document.getElementById('mobile-nav-overlay');
    if (!this.toggle || !this.nav) return;

    this.toggle.addEventListener('click', () => this.open());
    this.close?.addEventListener('click',  () => this.close_());
    this.overlay?.addEventListener('click', () => this.close_());

    this.nav.querySelectorAll('.mobile-nav__expand').forEach(btn => {
      btn.addEventListener('click', () => this._toggleSub(btn));
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close_(); });
  },

  open() {
    this.nav.setAttribute('aria-hidden', 'false');
    this.nav.removeAttribute('inert');
    this.overlay?.classList.add('is-active');
    this.toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    VoltUtils.trapFocus(this.nav);
  },

  close_() {
    this.nav.setAttribute('aria-hidden', 'true');
    this.nav.setAttribute('inert', '');
    this.overlay?.classList.remove('is-active');
    this.toggle?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    VoltUtils.removeFocusTrap(this.nav);
    this.toggle?.focus();
  },

  _toggleSub(btn) {
    const sub = btn.closest('.mobile-nav__item').querySelector('.mobile-nav__sub');
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', !expanded);
    if (sub) sub.hidden = expanded;
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltCartDrawer — open/close, fetch cart, update count, render items
═══════════════════════════════════════════════════════════════════════════ */
const VoltCartDrawer = {
  init() {
    this.drawer   = document.getElementById('cart-drawer');
    this.overlay  = document.getElementById('cart-overlay');
    this.items    = document.getElementById('cart-drawer-items');
    this.subtotal = document.getElementById('cart-subtotal');
    this.count    = document.getElementById('cart-count');
    this.noteEl   = document.getElementById('cart-note');

    if (!this.drawer) return; // cart type is not drawer

    document.querySelectorAll('[data-open-cart]').forEach(btn =>
      btn.addEventListener('click', () => this.open())
    );
    this.overlay?.addEventListener('click',  () => this.close());
    document.querySelector('[data-close-cart]')?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });

    // Cart note debounced save
    this.noteEl?.addEventListener('input', VoltUtils.debounce(() => this._saveNote(), 800));

    // Listen for custom ATC events from VoltProductForm
    document.addEventListener('volt:cart:updated', () => this._fetchCart());
  },

  open() {
    this.drawer.classList.add('is-open');
    this.overlay?.classList.add('is-active');
    this.drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    VoltUtils.trapFocus(this.drawer);
    this._fetchCart();
  },

  close() {
    this.drawer.classList.remove('is-open');
    this.overlay?.classList.remove('is-active');
    this.drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    VoltUtils.removeFocusTrap(this.drawer);
    document.querySelector('[data-open-cart]')?.focus();
  },

  async _fetchCart() {
    try {
      const cart = await VoltUtils.fetchJSON('/cart.js');
      this._renderItems(cart);
      this._updateCount(cart.item_count);
    } catch (err) {
      console.warn('[VoltCart] fetch error', err);
    }
  },

  _renderItems(cart) {
    if (!this.items) return;

    if (cart.item_count === 0) {
      this.items.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--volt-text-secondary)">Your cart is empty.</p>`;
      if (this.subtotal) this.subtotal.textContent = VoltUtils.formatMoney(0);
      return;
    }

    const html = cart.items.map(item => `
      <div class="cart-item" data-cart-item data-key="${item.key}">
        <a href="${item.url}" class="cart-item__image-link">
          <img src="${item.image ? item.image.replace('.jpg', '_80x80.jpg') : ''}" alt="${item.product_title}" width="72" height="72" loading="lazy" class="cart-item__img">
        </a>
        <div class="cart-item__details">
          <a href="${item.url}" class="cart-item__title">${item.product_title}</a>
          ${item.variant_title && item.variant_title !== 'Default Title' ? `<p class="cart-item__variant">${item.variant_title}</p>` : ''}
          <div class="cart-item__bottom">
            <div class="quantity-selector quantity-selector--small">
              <button type="button" class="quantity-selector__btn" data-qty="-1" data-key="${item.key}">−</button>
              <input type="number" value="${item.quantity}" min="0" class="quantity-selector__input" data-qty-input data-key="${item.key}" aria-label="Quantity for ${item.product_title}">
              <button type="button" class="quantity-selector__btn" data-qty="+1" data-key="${item.key}">+</button>
            </div>
            <span class="cart-item__price">${VoltUtils.formatMoney(item.final_line_price)}</span>
          </div>
        </div>
        <button class="cart-item__remove" data-remove="${item.key}" aria-label="Remove ${item.product_title}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `).join('');

    this.items.innerHTML = `<div class="cart-items">${html}</div>`;
    if (this.subtotal) this.subtotal.textContent = VoltUtils.formatMoney(cart.total_price);

    // Restore note value
    if (this.noteEl && cart.note) this.noteEl.value = cart.note;

    // Attach qty listeners
    this.items.querySelectorAll('[data-qty]').forEach(btn => {
      btn.addEventListener('click', () => this._changeQty(btn.dataset.key, parseInt(btn.dataset.qty, 10)));
    });
    this.items.querySelectorAll('[data-qty-input]').forEach(input => {
      input.addEventListener('change', () => this._setQty(input.dataset.key, parseInt(input.value, 10)));
    });
    this.items.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => this._setQty(btn.dataset.remove, 0));
    });
  },

  async _changeQty(key, delta) {
    try {
      const cart  = await VoltUtils.fetchJSON('/cart.js');
      const item  = cart.items.find(i => i.key === key);
      if (!item) return;
      await this._setQty(key, item.quantity + delta);
    } catch (err) { console.warn('[VoltCart] qty error', err); }
  },

  async _setQty(key, qty) {
    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity: qty }),
      });
      const cart = await res.json();
      this._renderItems(cart);
      this._updateCount(cart.item_count);
    } catch (err) { console.warn('[VoltCart] setQty error', err); }
  },

  _updateCount(count) {
    if (!this.count) return;
    this.count.textContent  = count;
    this.count.hidden       = count === 0;
    document.querySelectorAll('[data-open-cart]').forEach(btn =>
      btn.setAttribute('aria-label', `Cart (${count})`)
    );
  },

  async _saveNote() {
    if (!this.noteEl) return;
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: this.noteEl.value }),
    });
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltProductForm — variant selection, qty, ATC, recommendations
═══════════════════════════════════════════════════════════════════════════ */
const VoltProductForm = {
  init() {
    this.forms = document.querySelectorAll('[data-product-form]');
    this.forms.forEach(form => this._initForm(form));
    this._initRecommendations();
    this._initCrossSell();
    this._initCountdown();
  },

  _initForm(form) {
    const section    = form.closest('[data-section-id]');
    const variantId  = form.querySelector('#selected-variant-id');
    const atcBtn     = form.querySelector('[data-add-to-cart]');
    const atcText    = form.querySelector('.product-form__atc-text');
    const priceBlock = section?.querySelector('[id^="price-"]');
    const stockBlock = section?.querySelector('#stock-counter');

    // ── Variant radio listeners ──
    form.querySelectorAll('input[type="radio"]').forEach(input => {
      input.addEventListener('change', () => this._onVariantChange(form, variantId, atcBtn, atcText, priceBlock, stockBlock));
    });

    // ── Qty +/- ──
    form.querySelector('[data-qty-minus]')?.addEventListener('click', () => {
      const input = form.querySelector('#quantity-input');
      if (input && parseInt(input.value) > 1) input.value = parseInt(input.value) - 1;
    });
    form.querySelector('[data-qty-plus]')?.addEventListener('click', () => {
      const input = form.querySelector('#quantity-input');
      if (input) input.value = parseInt(input.value) + 1;
    });

    // ── ATC submit ──
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (atcBtn?.disabled) return;
      await this._addToCart(form, atcBtn, atcText);
    });
  },

  _onVariantChange(form, variantIdInput, atcBtn, atcText, priceBlock) {
    const productData = this._getProductData(form);
    if (!productData) return;

    const selectedValues = {};
    form.querySelectorAll('input[type="radio"]:checked').forEach(input => {
      selectedValues[input.name] = input.value;
    });

    // Update selected labels
    Object.entries(selectedValues).forEach(([name, value]) => {
      form.querySelectorAll('.product-option__selected').forEach(el => {
        if (el.closest('fieldset')?.getAttribute('name') === name) el.textContent = value;
      });
    });

    const variant = productData.variants.find(v =>
      v.options.every((opt, i) => opt === selectedValues[productData.options[i]])
    );

    if (!variant) return;

    // Update hidden variant id
    if (variantIdInput) variantIdInput.value = variant.id;

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('variant', variant.id);
    history.replaceState({}, '', url);

    // Update price
    if (priceBlock) {
      const priceEl   = priceBlock.querySelector('.product-price__regular, .product-price__sale');
      const compareEl = priceBlock.querySelector('.product-price__compare');
      if (variant.compare_at_price > variant.price) {
        if (priceEl)   { priceEl.className   = 'product-price__sale';    priceEl.textContent = VoltUtils.formatMoney(variant.price); }
        if (compareEl) { compareEl.textContent = VoltUtils.formatMoney(variant.compare_at_price); compareEl.hidden = false; }
      } else {
        if (priceEl)   { priceEl.className   = 'product-price__regular'; priceEl.textContent = VoltUtils.formatMoney(variant.price); }
        if (compareEl) { compareEl.hidden = true; }
      }
      priceBlock.querySelector('[itemprop="price"]')?.setAttribute('content', (variant.price / 100).toFixed(2));
    }

    // Update ATC button
    if (atcBtn && atcText) {
      const available = variant.available;
      atcBtn.disabled = !available;
      atcBtn.setAttribute('aria-disabled', !available);
      atcBtn.classList.toggle('btn--disabled', !available);
      atcText.textContent = available ? 'Add to cart' : 'Sold out';
    }

    // Update gallery to match variant's featured image
    if (variant.featured_media) {
      const target = document.querySelector(`[data-media-id="${variant.featured_media.id}"]`);
      if (target) {
        document.querySelectorAll('.product-media-gallery__item').forEach(i => i.classList.remove('is-active'));
        document.querySelectorAll('.product-media-thumbs__item').forEach(i => i.classList.remove('is-active'));
        target.classList.add('is-active');
        document.querySelector(`[data-thumb-target="${variant.featured_media.id}"]`)?.classList.add('is-active');
      }
    }
  },

  _getProductData(form) {
    const script = form.closest('[data-section-id]')?.querySelector('[data-product-json]');
    if (!script) return null;
    try { return JSON.parse(script.textContent); } catch { return null; }
  },

  async _addToCart(form, atcBtn, atcText) {
    const formData = new FormData(form);
    const originalText = atcText?.textContent;

    if (atcBtn) {
      atcBtn.disabled  = true;
      if (atcText) atcText.textContent = 'Adding…';
    }

    try {
      const res = await fetch('/cart/add.js', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Could not add to cart');

      // Signal cart update
      document.dispatchEvent(new CustomEvent('volt:cart:updated'));

      // Open drawer if applicable
      const cartType = document.documentElement.dataset.cartType;
      if (cartType === 'drawer') {
        VoltCartDrawer.open();
      } else {
        VoltUtils.announce('Item added to cart');
        if (atcText) {
          atcText.textContent = 'Added!';
          setTimeout(() => { if (atcText) atcText.textContent = originalText; atcBtn.disabled = false; }, 1500);
          return;
        }
      }
    } catch (err) {
      console.warn('[VoltATC] error', err);
      VoltUtils.announce('Could not add item to cart. Please try again.');
    } finally {
      if (atcBtn && atcText) {
        atcBtn.disabled = false;
        if (atcText.textContent === 'Adding…') atcText.textContent = originalText;
      }
    }
  },

  async _initRecommendations() {
    const container = document.querySelector('.product-recommendations');
    if (!container) return;
    const url = container.dataset.recommendationsUrl;
    if (!url) return;
    try {
      const res  = await fetch(url);
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      const recs = doc.querySelector('.product-recommendations');
      if (recs?.innerHTML.trim()) container.innerHTML = recs.innerHTML;
    } catch (err) { console.warn('[VoltRecs]', err); }
  },

  async _initCrossSell() {
    const container = document.querySelector('[data-cross-sell-product]');
    if (!container) return;
    const productId = container.dataset.crossSellProduct;
    const itemsEl   = container.querySelector('[id^="cross-sell-items"]');
    if (!itemsEl) return;
    try {
      const data = await VoltUtils.fetchJSON(`/recommendations/products.json?product_id=${productId}&limit=4&intent=complementary`);
      if (!data.products?.length) { container.hidden = true; return; }
      itemsEl.innerHTML = data.products.map(p => `
        <a href="${p.url}" class="cross-sell-card">
          <img src="${p.featured_image}" alt="${p.title}" width="72" height="72" loading="lazy">
          <span class="cross-sell-card__title">${p.title}</span>
          <span class="cross-sell-card__price">${VoltUtils.formatMoney(p.price)}</span>
        </a>
      `).join('');
    } catch { container.hidden = true; }
  },

  _initCountdown() {
    const el = document.querySelector('[data-countdown-end]');
    if (!el) return;
    const endDate = new Date(el.dataset.countdownEnd).getTime();
    const hours   = el.querySelector('#cd-hours');
    const minutes = el.querySelector('#cd-minutes');
    const seconds = el.querySelector('#cd-seconds');
    if (!hours) return;

    const tick = () => {
      const diff = endDate - Date.now();
      if (diff <= 0) { el.hidden = true; return; }
      const h  = Math.floor(diff / 36e5);
      const m  = Math.floor((diff % 36e5) / 6e4);
      const s  = Math.floor((diff % 6e4) / 1000);
      hours.textContent   = String(h).padStart(2, '0');
      minutes.textContent = String(m).padStart(2, '0');
      seconds.textContent = String(s).padStart(2, '0');
    };
    tick();
    setInterval(tick, 1000);
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltAgeVerifier — cookie-backed age gate
═══════════════════════════════════════════════════════════════════════════ */
const VoltAgeVerifier = {
  COOKIE: 'zap_age_verified',

  init() {
    this.el = document.getElementById('age-verifier');
    if (!this.el) return;
    if (VoltUtils.getCookie(this.COOKIE)) { this.el.classList.add('is-hidden'); return; }
    document.body.style.overflow = 'hidden';
    VoltUtils.trapFocus(this.el);
  },

  accept() {
    VoltUtils.setCookie(this.COOKIE, '1', 365);
    this.el?.classList.add('is-hidden');
    document.body.style.overflow = '';
    VoltUtils.removeFocusTrap(this.el);
  },
};
window.__zap = { ageVerifier: VoltAgeVerifier };

/* ═══════════════════════════════════════════════════════════════════════════
   VoltPromoPopup — session-storage dismiss, delayed open
═══════════════════════════════════════════════════════════════════════════ */
const VoltPromoPopup = {
  KEY: 'zap_popup_dismissed',

  init() {
    this.popup = document.getElementById('promo-popup');
    if (!this.popup) return;
    if (sessionStorage.getItem(this.KEY)) return;

    const delay = parseInt(this.popup.dataset.delay || '5000', 10);
    setTimeout(() => this._open(), delay);

    this.popup.querySelectorAll('[data-close-popup]').forEach(el =>
      el.addEventListener('click', () => this._close())
    );
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._close(); });
  },

  _open() {
    this.popup.classList.add('is-active');
    VoltUtils.trapFocus(this.popup);
  },

  _close() {
    this.popup.classList.remove('is-active');
    sessionStorage.setItem(this.KEY, '1');
    VoltUtils.removeFocusTrap(this.popup);
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltPredictive — predictive search
═══════════════════════════════════════════════════════════════════════════ */
const VoltPredictive = {
  init() {
    const input   = document.querySelector('[data-predictive-search]');
    const results = document.getElementById('predictive-results');
    if (!input || !results) return;

    input.addEventListener('input', VoltUtils.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      try {
        const data = await VoltUtils.fetchJSON(
          `/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=5`
        );
        const products = data.resources?.results?.products || [];
        results.innerHTML = products.length
          ? `<ul class="predictive-list" role="listbox">${products.map(p => `
              <li role="option">
                <a href="${p.url}" class="predictive-item">
                  ${p.image ? `<img src="${p.image}" alt="${p.title}" width="48" height="48" loading="lazy">` : ''}
                  <span class="predictive-item__title">${p.title}</span>
                  <span class="predictive-item__price">${VoltUtils.formatMoney(p.price)}</span>
                </a>
              </li>`).join('')}
            </ul>`
          : `<p class="predictive-empty">No results for "${q}"</p>`;
      } catch { results.innerHTML = ''; }
    }, 250));
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltBackToTop — scroll-triggered button
═══════════════════════════════════════════════════════════════════════════ */
const VoltBackToTop = {
  init() {
    this.btn = document.getElementById('back-to-top');
    if (!this.btn) return;
    window.addEventListener('scroll', VoltUtils.debounce(() => {
      const show = window.scrollY > 400;
      this.btn.hidden = !show;
    }, 100), { passive: true });
    this.btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltAnnouncement — dismissible announcement bar
═══════════════════════════════════════════════════════════════════════════ */
const VoltAnnouncement = {
  KEY: 'zap_announcement_dismissed',

  init() {
    const bar = document.querySelector('.announcement-bar');
    const btn = document.querySelector('[data-dismiss-announcement]');
    if (!bar || !btn) return;
    if (sessionStorage.getItem(this.KEY)) { bar.hidden = true; return; }
    btn.addEventListener('click', () => {
      bar.hidden = true;
      sessionStorage.setItem(this.KEY, '1');
    });
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltMediaGallery — thumbnail switching + touch/swipe carousel
═══════════════════════════════════════════════════════════════════════════ */
const VoltMediaGallery = {
  init() {
    document.querySelectorAll('.product-media-gallery').forEach(gallery => this._initGallery(gallery));
  },

  _initGallery(gallery) {
    const thumbs = gallery.closest('.main-product__media')?.querySelectorAll('.product-media-thumbs__item');
    if (!thumbs?.length) return;

    thumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        const targetId = thumb.dataset.thumbTarget;
        gallery.querySelectorAll('.product-media-gallery__item').forEach(i => i.classList.remove('is-active'));
        thumbs.forEach(t => t.classList.remove('is-active'));
        gallery.querySelector(`[data-media-id="${targetId}"]`)?.classList.add('is-active');
        thumb.classList.add('is-active');
      });
    });

    // Touch swipe for mobile
    let startX = 0;
    gallery.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    gallery.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40) return;
      const items = [...gallery.querySelectorAll('.product-media-gallery__item')];
      const active = items.findIndex(i => i.classList.contains('is-active'));
      const next = dx < 0 ? Math.min(active + 1, items.length - 1) : Math.max(active - 1, 0);
      if (next === active) return;
      items[active].classList.remove('is-active');
      items[next].classList.add('is-active');
      thumbs[active]?.classList.remove('is-active');
      thumbs[next]?.classList.add('is-active');
    }, { passive: true });
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltSizeGuide — <dialog> modal
═══════════════════════════════════════════════════════════════════════════ */
const VoltSizeGuide = {
  init() {
    this.dialog = document.getElementById('size-guide-modal');
    if (!this.dialog) return;

    document.querySelector('[data-open-size-guide]')?.addEventListener('click', () => this.dialog.showModal());
    document.querySelector('[data-close-size-guide]')?.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.dialog.close(); });
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltInfiniteScroll — intersection-observer pagination
═══════════════════════════════════════════════════════════════════════════ */
const VoltInfiniteScroll = {
  init() {
    this.sentinel = document.getElementById('infinite-scroll-sentinel');
    if (!this.sentinel) return;
    this.loading  = false;

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !this.loading) this._loadMore();
    }, { rootMargin: '200px' });
    observer.observe(this.sentinel);
  },

  async _loadMore() {
    const nextUrl = this.sentinel.dataset.nextUrl;
    if (!nextUrl) { this.sentinel.hidden = true; return; }
    this.loading = true;
    this.sentinel.querySelector('.infinite-loader')?.removeAttribute('hidden');

    try {
      const res  = await fetch(nextUrl);
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      const grid = document.querySelector('.collection-grid');
      const newItems = doc.querySelectorAll('.product-card');
      newItems.forEach(item => grid?.appendChild(item));

      const nextSentinel = doc.getElementById('infinite-scroll-sentinel');
      this.sentinel.dataset.nextUrl = nextSentinel?.dataset.nextUrl || '';
      if (!nextSentinel?.dataset.nextUrl) this.sentinel.hidden = true;
    } catch (err) {
      console.warn('[VoltInfiniteScroll]', err);
    } finally {
      this.loading = false;
      this.sentinel.querySelector('.infinite-loader')?.setAttribute('hidden', '');
    }
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltFilters — collection filter form (live update via fetch)
═══════════════════════════════════════════════════════════════════════════ */
const VoltFilters = {
  init() {
    this.form = document.getElementById('collection-filters-form');
    if (!this.form) return;

    this.form.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('change', () => this._applyFilters());
    });

    // Sort selector
    document.getElementById('sort-by')?.addEventListener('change', e => {
      const url = new URL(window.location);
      url.searchParams.set('sort_by', e.target.value);
      this._navigateTo(url.toString());
    });
  },

  _applyFilters() {
    const url = new URL(window.location);
    const data = new FormData(this.form);
    // Clear existing filter params
    [...url.searchParams.keys()].filter(k => k.startsWith('filter.')).forEach(k => url.searchParams.delete(k));
    for (const [key, value] of data) { if (value) url.searchParams.set(key, value); }
    url.searchParams.delete('page');
    this._navigateTo(url.toString());
  },

  _navigateTo(url) {
    window.location.href = url;
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   VoltSlideshow — hero section autoplay + touch
═══════════════════════════════════════════════════════════════════════════ */
const VoltSlideshow = {
  init() {
    document.querySelectorAll('.slideshow[data-autoplay]').forEach(ss => this._initSlideshow(ss));
  },

  _initSlideshow(ss) {
    const slides  = ss.querySelectorAll('.slideshow__slide');
    const dots    = ss.querySelectorAll('.slideshow__dot');
    const prevBtn = ss.querySelector('[data-slide-prev]');
    const nextBtn = ss.querySelector('[data-slide-next]');
    if (slides.length < 2) return;

    let current  = 0;
    let interval = null;
    const speed  = parseInt(ss.dataset.autoplaySpeed || '5000', 10);
    const auto   = ss.dataset.autoplay === 'true';

    const goTo = (i) => {
      slides[current].classList.remove('is-active');
      dots[current]?.classList.remove('is-active');
      current = (i + slides.length) % slides.length;
      slides[current].classList.add('is-active');
      dots[current]?.classList.add('is-active');
      dots[current]?.setAttribute('aria-current', 'true');
    };

    const startAuto = () => { if (auto) interval = setInterval(() => goTo(current + 1), speed); };
    const stopAuto  = () => clearInterval(interval);

    prevBtn?.addEventListener('click', () => { stopAuto(); goTo(current - 1); startAuto(); });
    nextBtn?.addEventListener('click', () => { stopAuto(); goTo(current + 1); startAuto(); });
    dots.forEach((dot, i) => dot.addEventListener('click', () => { stopAuto(); goTo(i); startAuto(); }));

    // Pause on hover
    ss.addEventListener('mouseenter', stopAuto);
    ss.addEventListener('mouseleave', startAuto);

    // Touch swipe
    let tx = 0;
    ss.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    ss.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 50) { stopAuto(); goTo(current + (dx < 0 ? 1 : -1)); startAuto(); }
    }, { passive: true });

    // Keyboard
    ss.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { stopAuto(); goTo(current - 1); startAuto(); }
      if (e.key === 'ArrowRight') { stopAuto(); goTo(current + 1); startAuto(); }
    });

    // Respect reduced motion
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startAuto();
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   Bootstrap — DOMContentLoaded
═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  VoltHeader.init();
  VoltMobileNav.init();
  VoltCartDrawer.init();
  VoltProductForm.init();
  VoltAgeVerifier.init();
  VoltPromoPopup.init();
  VoltPredictive.init();
  VoltBackToTop.init();
  VoltAnnouncement.init();
  VoltMediaGallery.init();
  VoltSizeGuide.init();
  VoltInfiniteScroll.init();
  VoltFilters.init();
  VoltSlideshow.init();
});

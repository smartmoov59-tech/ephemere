/* ==========================================================================
   Éphémère · animations (GSAP + ScrollTrigger + Lenis, tout en local)
   Règles : courbes douces (power3 / expo), uniquement transform + opacity pour le
   scroll, respect de prefers-reduced-motion, animations lourdes simplifiées sur mobile.
   ========================================================================== */
(function () {
  'use strict';

  var d = document, html = d.documentElement;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var reduce = html.classList.contains('reduce');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var isMobile = function () { return window.matchMedia('(max-width: 820px)').matches; };
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var lenis = null;

  /* ====================================================================
     1) FONCTIONS « SOCLE » (toujours actives, même sans animations)
     ==================================================================== */

  // année du pied de page
  var yearEl = $('#year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

  // vidéo du hero : version légère sur petit écran / économie de données, image fixe si mouvement réduit
  (function heroVideo() {
    var v = $('#heroVideo'); if (!v) return;
    var conn = navigator.connection || {};
    if (reduce) { v.removeAttribute('autoplay'); v.pause(); return; }
    if (conn.saveData || window.innerWidth < 700) {
      var src = $('source', v); if (src) { src.src = v.getAttribute('data-sd'); v.load(); }
    }
    var p = v.play(); if (p && p.catch) p.catch(function () { /* l'image de secours (poster) reste affichée */ });
  })();

  // vidéo de la section réservation : chargée et lue seulement quand elle est visible
  (function bookVideo() {
    var v = $('.book__bg video'); if (!v || reduce || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting) { if (!v.src) v.src = v.getAttribute('data-src'); var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else if (v.src) v.pause();
      });
    }, { rootMargin: '200px' }).observe(v);
  })();

  // horaires : ligne du jour + statut ouvert / fermé
  (function hours() {
    var H = { 0: [570, 750], 1: [570, 1140], 2: [570, 1140], 3: [570, 1140], 4: [570, 1140], 5: [570, 1140], 6: [540, 1200] };
    var days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var el = $('#hoursStatus'); if (!el) return;
    function fmt(m) { var h = Math.floor(m / 60), mm = m % 60; return h + 'h' + (mm < 10 ? '0' : '') + mm; }
    function update() {
      var now = new Date(), day = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
      $$('.hours__table tr').forEach(function (tr) { tr.classList.toggle('is-today', +tr.getAttribute('data-d') === day); });
      var h = H[day], txt, cls;
      if (h && mins >= h[0] && mins < h[1]) {
        cls = 'is-open'; txt = (h[1] - mins <= 45 ? 'Ouvert · ferme bientôt, à ' : 'Ouvert maintenant · jusqu\'à ') + fmt(h[1]);
      } else {
        cls = 'is-closed';
        if (h && mins < h[0]) txt = 'Fermé · ouvre aujourd\'hui à ' + fmt(h[0]);
        else {
          var n = (day + 1) % 7; txt = 'Fermé · ouvre ' + (n === (day + 1) % 7 ? 'demain' : days[n]) + ' à ' + fmt(H[n][0]);
        }
      }
      el.className = 'hours__status ' + cls; el.querySelector('span').textContent = txt;
    }
    update(); setInterval(update, 60000);
  })();

  // menu mobile
  var menu = $('#menu'), burger = $('.burger'), nav = $('#nav'), menuOpen = false, menuTl = null;
  (function prepMenu() {
    $$('.menu__nav a').forEach(function (a) {
      Array.prototype.slice.call(a.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && n.textContent.trim()) { var b = d.createElement('b'); b.style.fontWeight = '400'; b.textContent = n.textContent; a.replaceChild(b, n); }
      });
    });
  })();
  function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    nav.classList.toggle('is-open', open);
    if (open) { menu.style.visibility = 'visible'; menu.removeAttribute('inert'); menu.setAttribute('aria-hidden', 'false'); if (lenis) lenis.stop(); else html.style.overflow = 'hidden'; }
    else { menu.setAttribute('aria-hidden', 'true'); menu.setAttribute('inert', ''); if (lenis) lenis.start(); else html.style.overflow = ''; }
    if (hasGsap && !reduce) {
      if (menuTl) menuTl.kill();
      if (open) {
        menuTl = gsap.timeline();
        menuTl.fromTo(menu, { yPercent: -100 }, { yPercent: 0, duration: .9, ease: 'expo.inOut' })
          .fromTo('.menu__nav a b', { yPercent: 115 }, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: .06 }, '-=.45')
          .fromTo('.menu__nav a span, .menu__foot > *', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .7, ease: 'power3.out', stagger: .05 }, '-=.8');
      } else {
        menuTl = gsap.timeline({ onComplete: function () { menu.style.visibility = 'hidden'; } });
        menuTl.to(menu, { yPercent: -100, duration: .7, ease: 'expo.inOut' });
      }
    } else { menu.style.visibility = open ? 'visible' : 'hidden'; }
  }
  if (burger) burger.addEventListener('click', function () { setMenu(!menuOpen); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });
  window.addEventListener('resize', function () { if (menuOpen && window.innerWidth > 1100) setMenu(false); });

  // défilement vers les ancres (Lenis si dispo)
  function scrollToEl(t) {
    if (lenis) lenis.scrollTo(t, { duration: 1.8, easing: function (x) { return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); } });
    else t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }
  d.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href'); if (id.length < 2) return;
    var t = id === '#top' ? d.body : $(id); if (!t) return;
    e.preventDefault();
    var go = function () { if (id === '#top') { if (lenis) lenis.scrollTo(0, { duration: 1.6 }); else window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); } else scrollToEl(t); };
    if (menuOpen) { setMenu(false); setTimeout(go, hasGsap && !reduce ? 650 : 0); } else go();
  });

  // barre de navigation : fond au scroll (version sans animation)
  function navSolid(y) { nav.classList.toggle('is-solid', y > 60); }
  if (!hasGsap || reduce) { window.addEventListener('scroll', function () { navSolid(window.scrollY); }, { passive: true }); navSolid(window.scrollY); }

  // visionneuse (galerie)
  var lb = $('#lightbox'), gItems = $$('.g-item'), lbIdx = 0;
  function lbShow(i, first) {
    lbIdx = (i + gItems.length) % gItems.length;
    var it = gItems[lbIdx], im = $('img', it), img = $('img', lb);
    img.src = im.currentSrc || im.src; img.alt = im.alt; $('figcaption', lb).textContent = $('.g-cap', it).textContent;
    if (hasGsap && !reduce) {
      gsap.fromTo(img, { opacity: 0, scale: .96, x: first ? 0 : 30 }, { opacity: 1, scale: 1, x: 0, duration: .7, ease: 'power3.out' });
      if (first) gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: .4 });
    }
  }
  function lbOpen(i) { if (typeof lb.showModal !== 'function') return; if (lenis) lenis.stop(); lb.showModal(); lbShow(i, true); }
  gItems.forEach(function (it, i) { $('.g-btn', it).addEventListener('click', function () { lbOpen(i); }); });
  if (lb) {
    $('.lightbox__close', lb).addEventListener('click', function () { lb.close(); });
    $('.lightbox__nav--prev', lb).addEventListener('click', function () { lbShow(lbIdx - 1); });
    $('.lightbox__nav--next', lb).addEventListener('click', function () { lbShow(lbIdx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener('close', function () { if (lenis) lenis.start(); });
    lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') lbShow(lbIdx - 1); if (e.key === 'ArrowRight') lbShow(lbIdx + 1); });
  }

  if (!hasGsap || reduce) {
    // état final pour les compteurs / anneaux
    $$('.figures__ring .fg').forEach(function (r) { r.style.strokeDashoffset = 1 - parseFloat(r.getAttribute('data-ring')); });
    $$('.story__ring-fg').forEach(function (r) { r.style.strokeDashoffset = .25; });
    if (!hasGsap) { var l = $('.loader'); if (l) l.remove(); }
    return;
  }

  /* ====================================================================
     2) MOUVEMENT
     ==================================================================== */
  gsap.registerPlugin(ScrollTrigger, window.Draggable);
  gsap.config({ autoRound: false });   // sinon les valeurs 0–1 (stroke-dashoffset des anneaux) sont arrondies à 0 ou 1
  ScrollTrigger.config({ ignoreMobileResize: true });
  var mm = gsap.matchMedia();
  var clamp = gsap.utils.clamp;

  // ---------- Lenis (défilement doux) ----------
  lenis = new Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, wheelMultiplier: .9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);
  lenis.stop();

  // ---------- découpage de texte ----------
  function splitChars(el) {
    var txt = el.textContent; el.textContent = '';
    txt.split('').forEach(function (c) {
      var o = d.createElement('span'); o.className = 'ch'; var i = d.createElement('span');
      i.textContent = c === ' ' ? ' ' : c; o.appendChild(i); el.appendChild(o);
    });
    return $$('.ch > span', el);
  }
  function splitWords(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) frag.appendChild(d.createTextNode(' '));
            else { var w = d.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true'); var i = d.createElement('span'); i.textContent = p; w.appendChild(i); frag.appendChild(w); }
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(el);
    return $$('.w > span', el);
  }
  function onView(els, cb, margin) {
    if (!('IntersectionObserver' in window)) { els.forEach(cb); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); cb(en.target); } });
    }, { rootMargin: margin || '0px 0px -10% 0px', threshold: .01 });
    els.forEach(function (e) { io.observe(e); });
  }

  // ---------- éléments décoratifs : branches d'eucalyptus + pétales ----------
  function branchSVG(flip) {
    var P0 = [14, 500], P1 = [34, 250], P2 = [310, 60], n = 14, leaves = '', i;
    var cols = ['#8C9C7C', '#A8B598', '#718468', '#B7C2A8', '#7C8F70'];
    function q(t) { var a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return [a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1]]; }
    function tang(t) { var x = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), y = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]); return Math.atan2(y, x) * 180 / Math.PI; }
    for (i = 0; i < n; i++) {
      var t = .08 + i * (.86 / n), p = q(t), ang = tang(t), side = i % 2 ? 1 : -1, s = 1.05 - t * .5;
      leaves += '<g transform="translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ') rotate(' + (ang + side * 58).toFixed(1) + ')"><path d="M0 0C8 -' + (16 * s).toFixed(1) + ' ' + (38 * s).toFixed(1) + ' -' + (20 * s).toFixed(1) + ' ' + (62 * s).toFixed(1) + ' 0C' + (38 * s).toFixed(1) + ' ' + (20 * s).toFixed(1) + ' 8 ' + (16 * s).toFixed(1) + ' 0 0Z" fill="' + cols[i % cols.length] + '"/></g>';
    }
    var tip = q(.98);
    var blooms = '<circle cx="' + (tip[0] - 14).toFixed(0) + '" cy="' + (tip[1] + 18).toFixed(0) + '" r="11" fill="#B89BE0"/><circle cx="' + (tip[0] + 6).toFixed(0) + '" cy="' + (tip[1] + 6).toFixed(0) + '" r="9" fill="#EBB9C6"/><circle cx="' + (tip[0] - 30).toFixed(0) + '" cy="' + (tip[1] + 44).toFixed(0) + '" r="8" fill="#E7DCF5"/>';
    return '<svg class="branch ' + (flip ? 'branch--r' : 'branch--l') + '" viewBox="0 0 400 520" aria-hidden="true"><path d="M14 500Q34 250 310 60" fill="none" stroke="#5E6E54" stroke-width="5" stroke-linecap="round"/>' + leaves + blooms + '</svg>';
  }
  $('.hero__fore').innerHTML = branchSVG(false) + branchSVG(true);

  function makePetals() {
    var wrap = $('.hero__petals'), n = isMobile() ? 8 : 16, cols = ['#EBB9C6', '#B89BE0', '#F7F1EA', '#E7DCF5', '#D79AB0'];
    for (var i = 0; i < n; i++) {
      var p = d.createElement('i'); p.className = 'petal';
      p.style.cssText = '--s:' + gsap.utils.random(14, 36).toFixed(0) + 'px;--c:' + cols[i % cols.length] + ';--o:' + gsap.utils.random(.5, .92).toFixed(2);
      wrap.appendChild(p);
      var dur = gsap.utils.random(11, 21);
      gsap.set(p, { x: gsap.utils.random(0, window.innerWidth), rotation: gsap.utils.random(0, 360) });
      gsap.fromTo(p, { y: -90 }, { y: window.innerHeight + 90, duration: dur, ease: 'none', repeat: -1, delay: -gsap.utils.random(0, dur) });
      gsap.to(p, { x: '+=' + gsap.utils.random(-140, 140), rotation: '+=' + gsap.utils.random(140, 380), duration: gsap.utils.random(4, 8), ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }
  }
  makePetals();

  // ---------- état initial du hero + intro ----------
  var heroChars = splitChars($('.hero__title'));
  function buildIntro() {
    var tl = gsap.timeline({ paused: true });
    tl.from('.hero__media', { scale: 1.3, duration: 2.6, ease: 'expo.out' }, 0)
      .from(heroChars, { yPercent: 125, rotate: 7, duration: 1.6, ease: 'expo.out', stagger: .07 }, .1)
      .from('.hero__eyebrow', { y: 24, opacity: 0, duration: 1, ease: 'power3.out' }, .5)
      .from('.hero__tag', { y: 32, opacity: 0, duration: 1.1, ease: 'power3.out' }, .7)
      .from('.hero__cta > *', { y: 32, opacity: 0, duration: 1, ease: 'power3.out', stagger: .1 }, .85)
      .from('.badge', { scale: .3, opacity: 0, rotate: -120, duration: 1.6, ease: 'expo.out' }, .9)
      .from('.hero__scroll', { opacity: 0, duration: 1 }, 1.4)
      .from('.nav', { y: -90, opacity: 0, duration: 1.1, ease: 'power3.out' }, .9)
      .from('.branch--l', { xPercent: -45, yPercent: 35, duration: 2.2, ease: 'expo.out' }, .2)
      .from('.branch--r', { xPercent: 45, yPercent: 35, duration: 2.2, ease: 'expo.out' }, .3)
      .from('.fab', { y: 120, opacity: 0, duration: 1, ease: 'power3.out' }, 1.6);
    return tl;
  }
  var intro = buildIntro();

  // ---------- préchargeur ----------
  (function loader() {
    var loader = $('.loader'); if (!loader) { lenis.start(); intro.play(); return; }
    var lp = $$('.lp'), lc = $('.lc'), count = $('.loader__count span'), nameChars = splitChars($('.loader__name'));
    gsap.set(lp, { fill: '#B89BE0', fillOpacity: 0 });
    gsap.set(nameChars, { yPercent: 115 });
    var obj = { v: 0 };
    var tl = gsap.timeline();
    tl.to(lp, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', stagger: .09 }, 0)
      .to(lc, { strokeDashoffset: 0, duration: .8, ease: 'power2.out' }, 1)
      .to(lp, { fillOpacity: .28, duration: .9, ease: 'power2.out', stagger: .05 }, 1.5)
      .to('.loader__flower', { rotation: 45, duration: 2.6, ease: 'power2.inOut', transformOrigin: '50% 50%' }, 0)
      .to(nameChars, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .05 }, .5)
      .to(obj, { v: 100, duration: 2.5, ease: 'power2.inOut', onUpdate: function () { count.textContent = Math.round(obj.v); } }, 0);
    var video = $('#heroVideo');
    var ready = Promise.race([
      Promise.all([
        d.fonts ? d.fonts.ready : Promise.resolve(),
        new Promise(function (res) { if (!video || video.readyState >= 2) return res(); video.addEventListener('loadeddata', res, { once: true }); })
      ]),
      new Promise(function (res) { setTimeout(res, 4500); })
    ]);
    tl.eventCallback('onComplete', function () {
      ready.then(function () {
        gsap.timeline({ onComplete: function () { loader.remove(); lenis.start(); ScrollTrigger.refresh(); } })
          .to('.loader__inner', { opacity: 0, scale: .9, duration: .6, ease: 'power3.in' })
          .to('.loader__strips i', { yPercent: -104, duration: 1.25, ease: 'expo.inOut', stagger: { each: .08, from: 'center' } }, '-=.25')
          .add(function () { intro.play(); }, '-=.95');
      });
    });
  })();

  // ---------- barre de progression + navigation ----------
  gsap.to('.progress i', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .2 } });
  (function navBehaviour() {
    var hidden = false;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var y = self.scroll(); navSolid(y);
        if (menuOpen) return;
        var hide = self.direction === 1 && y > 220;
        if (hide !== hidden) { hidden = hide; gsap.to(nav, { yPercent: hide ? -115 : 0, duration: .6, ease: 'power3.inOut', overwrite: 'auto' }); }
      }
    });
    // boutons flottants mobile : masqués pendant la réservation et au pied de page
    ['#reserver', '.foot'].forEach(function (sel) {
      ScrollTrigger.create({ trigger: sel, start: 'top 75%', end: 'bottom top', toggleClass: { targets: '.fab', className: 'is-hidden' } });
    });
  })();

  // ---------- hero : parallax multicouche ----------
  (function heroParallax() {
    var st = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero__video', { yPercent: 14, scale: 1.14, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__petals', { yPercent: -16, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__content', { yPercent: -16, opacity: .15, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });
    gsap.to('.branch--l', { y: -120, rotate: -8, ease: 'none', scrollTrigger: st });
    gsap.to('.branch--r', { y: -150, rotate: 8, ease: 'none', scrollTrigger: st });
    // parallaxe au pointeur
    if (fine) {
      var layers = [
        { el: '.hero__video', k: 14 }, { el: '.hero__petals', k: 26 }, { el: '.hero__content', k: -10 }, { el: '.hero__fore', k: -34 }
      ].map(function (l) { var e = $(l.el); return { xt: gsap.quickTo(e, 'x', { duration: 1.4, ease: 'power3' }), yt: gsap.quickTo(e, 'y', { duration: 1.4, ease: 'power3' }), k: l.k }; });
      $('.hero').addEventListener('pointermove', function (e) {
        var nx = e.clientX / window.innerWidth - .5, ny = e.clientY / window.innerHeight - .5;
        layers.forEach(function (l) { l.xt(nx * l.k); l.yt(ny * l.k * .6); });
      });
    }
  })();

  // ---------- marquee (vitesse + sens réagissent au scroll) + badge ----------
  (function marquee() {
    var tweens = $$('.marquee__row').map(function (row, i) {
      var track = $('.marquee__track', row), dir = i % 2 ? 1 : -1;
      var tw = gsap.fromTo(track, { xPercent: dir < 0 ? 0 : -50 }, { xPercent: dir < 0 ? -50 : 0, ease: 'none', duration: 42 - i * 8, repeat: -1 });
      return { tw: tw, rel: i % 2 ? -1 : 1, set: gsap.quickTo(tw, 'timeScale', { duration: .5, ease: 'power3' }) };
    });
    var spin = gsap.to('.badge__ring', { rotation: 360, duration: 24, ease: 'none', repeat: -1 });
    var spinTo = gsap.quickTo(spin, 'timeScale', { duration: .6, ease: 'power3' });
    var rel;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var boost = Math.min(7, Math.abs(self.getVelocity()) / 240), dir = self.direction || 1;
        tweens.forEach(function (t) { t.set(dir * t.rel * (1 + boost)); });
        spinTo(1 + boost * 1.4);
        clearTimeout(rel);
        rel = setTimeout(function () { tweens.forEach(function (t) { t.set(dir * t.rel); }); spinTo(1); }, 140);
      }
    });
  })();

  // ---------- titres : révélation mot par mot ----------
  $$('.split').forEach(function (h) {
    var words = splitWords(h);
    gsap.set(words, { yPercent: 118, rotate: 3 });
    onView([h], function () { gsap.to(words, { yPercent: 0, rotate: 0, duration: 1.25, ease: 'expo.out', stagger: .055 }); });
  });

  // ---------- apparitions douces ----------
  (function fades() {
    var sel = ['.story__text > .eyebrow', '.services__head .eyebrow', '.services__note', '.gallery__head .eyebrow', '.gallery__note', '.reviews__head .eyebrow', '.rating',
      '.reviews__ctrl', '.book__intro .eyebrow', '.book__lead', '.book__how li', '.book__or', '.book__panel', '.contact__info .eyebrow', '.contact__addr', '.contact__tels',
      '.hours', '.contact__notes li', '.contact__btns', '.foot__col', '.foot__bottom'];
    var els = $$(sel.join(','));
    gsap.set(els, { autoAlpha: 0, y: 36 });
    var queue = [], timer;
    onView(els, function (el) {
      queue.push(el); clearTimeout(timer);
      timer = setTimeout(function () {
        gsap.to(queue, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: .09, overwrite: 'auto' }); queue = [];
      }, 30);
    }, '0px 0px -8% 0px');
    // carte : le cercle qui s'agrandit
    var map = $('.map');
    gsap.set(map, { clipPath: 'circle(0% at 50% 100%)' });
    // on observe le conteneur : un élément entièrement masqué par clip-path n'est pas détecté
    onView([$('.contact__map')], function () { gsap.to(map, { clipPath: 'circle(150% at 50% 100%)', duration: 1.8, ease: 'expo.inOut' }); }, '0px 0px -15% 0px');
  })();

  // ---------- l'atelier : section pinnée en 4 temps ----------
  mm.add('(min-width: 1px)', function () {
    var steps = $$('.step'), wraps = $$('.arch__img'), imgs = wraps.map(function (w) { return w.firstElementChild; });
    var dots = $$('.story__dots li'), ring = $('.story__ring-fg'), n = steps.length;
    gsap.set(steps.slice(1), { autoAlpha: 0, y: 36 });
    gsap.set(wraps.slice(1), { yPercent: 100 });
    gsap.set(imgs.slice(1), { yPercent: -100 });
    gsap.set(ring, { strokeDashoffset: 1 - 1 / n });
    var ts = [0], span = 1.5;
    var tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: '.story__pin', start: 'top top', end: function () { return '+=' + window.innerHeight * (isMobile() ? 2.4 : 3.3); },
        pin: true, scrub: .7, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function () {
          var tm = tl.time(), idx = 0;
          for (var j = 1; j < n; j++) if (tm >= ts[j] + .35) idx = j;
          dots.forEach(function (dt, k) { dt.classList.toggle('is-on', k === idx); });
        }
      }
    });
    for (var i = 1; i < n; i++) {
      var t = i * span; ts[i] = t;
      tl.to(steps[i - 1], { autoAlpha: 0, y: -36, duration: .45, ease: 'power2.in' }, t)
        .to(wraps[i], { yPercent: 0, duration: .95, ease: 'power3.inOut' }, t)
        .to(imgs[i], { yPercent: 0, duration: .95, ease: 'power3.inOut' }, t)
        .to(imgs[i - 1], { scale: 1.18, duration: .95, ease: 'power3.inOut' }, t)
        .fromTo(steps[i], { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: .55, ease: 'power2.out' }, t + .4)
        .to(ring, { strokeDashoffset: 1 - (i + 1) / n, duration: .95, ease: 'power2.inOut' }, t);
    }
    tl.to({}, { duration: .7 }); // temps de lecture final
  });

  // ---------- créations : défilement horizontal piloté par le scroll vertical ----------
  mm.add('(min-width: 821px)', function () {
    var track = $('.services__track'), pin = $('.services__pin'), bar = $('.services__bar i');
    var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
    var tween = gsap.to(track, {
      x: function () { return -dist(); }, ease: 'none',
      scrollTrigger: {
        trigger: pin, start: 'top top', end: function () { return '+=' + dist(); }, pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function (s) { gsap.set(bar, { scaleX: s.progress }); }
      }
    });
    $$('.card__media img').forEach(function (img) {
      gsap.fromTo(img, { xPercent: -4.5 }, { xPercent: 4.5, ease: 'none', scrollTrigger: { trigger: img.closest('.card'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
    });
    gsap.from('.card', { y: 70, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .09, scrollTrigger: { trigger: pin, start: 'top 75%', once: true } });
  });

  // ---------- mariages : les portes lilas s'ouvrent ----------
  mm.add('(min-width: 821px)', function () {
    var items = $$('.reveal-item'), reveal = $('.wedding__reveal');
    gsap.set(items, { y: 46, autoAlpha: 0 }); gsap.set(reveal, { scale: .94 });
    var tl = gsap.timeline({ scrollTrigger: { trigger: '.wedding__pin', start: 'top top', end: '+=240%', pin: true, scrub: .7, anticipatePin: 1, invalidateOnRefresh: true } });
    tl.to('.doors__title', { autoAlpha: 0, scale: .9, duration: .35, ease: 'power2.in' }, 0)
      .to('.door--l', { rotateY: -118, duration: 1.15, ease: 'power2.inOut' }, .2)
      .to('.door--r', { rotateY: 118, duration: 1.15, ease: 'power2.inOut' }, .2)
      .to(reveal, { scale: 1, duration: 1.15, ease: 'power2.out' }, .2)
      .to(items, { y: 0, autoAlpha: 1, duration: .65, stagger: .07, ease: 'power3.out' }, .8)
      .set('.doors', { autoAlpha: 0 }, 1.45)
      .to({}, { duration: .6 });
  });
  mm.add('(max-width: 820px)', function () {
    var items = $$('.reveal-item');
    gsap.set(items, { y: 40, autoAlpha: 0 });
    var tl = gsap.timeline({ scrollTrigger: { trigger: '.wedding', start: 'top 55%', end: 'top -35%', scrub: .6 } });
    tl.to('.doors__title', { autoAlpha: 0, scale: .9, duration: .3 }, 0)
      .to('.door--l', { rotateY: -112, duration: 1, ease: 'power2.inOut' }, .15)
      .to('.door--r', { rotateY: 112, duration: 1, ease: 'power2.inOut' }, .15)
      .set('.doors', { autoAlpha: 0 }, 1.2);
    onView(items, function (el) { gsap.to(el, { y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out' }); }, '0px 0px -5% 0px');
    return function () { gsap.set('.doors', { clearProps: 'all' }); };
  });

  // ---------- chiffres clés ----------
  $$('.figures__list li').forEach(function (li, i) {
    var span = $('[data-count]', li), ring = $('.fg', li);
    var target = parseFloat(span.getAttribute('data-count')), dec = +(span.getAttribute('data-decimals') || 0), obj = { v: 0 };
    var fmt = function (v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); };
    span.textContent = fmt(0);
    gsap.set(ring, { strokeDashoffset: 1 });
    onView([li], function () {
      gsap.to(obj, { v: target, duration: 2.4, ease: 'power3.out', delay: i * .12, onUpdate: function () { span.textContent = fmt(obj.v); } });
      gsap.to(ring, { strokeDashoffset: 1 - parseFloat(ring.getAttribute('data-ring')), duration: 2.4, ease: 'power3.out', delay: i * .12 });
    }, '0px 0px -12% 0px');
  });

  // ---------- galerie ----------
  (function gallery() {
    $$('.g-item').forEach(function (it) {
      var cover = $('.g-cover', it), img = $('img', it);
      gsap.set(cover, { scaleY: 1 });
      onView([it], function () {
        gsap.to(cover, { scaleY: 0, duration: 1.3, ease: 'expo.inOut' });
        gsap.fromTo(img, { scale: 1.3 }, { scale: 1, duration: 2, ease: 'expo.out' });
      }, '0px 0px -8% 0px');
      gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: it, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  })();
  mm.add('(min-width: 821px)', function () {
    $$('.gcol').forEach(function (c) {
      var s = +c.getAttribute('data-speed');
      gsap.fromTo(c, { y: 70 * s }, { y: -70 * s, ease: 'none', scrollTrigger: { trigger: '.gallery__cols', start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  });

  // ---------- avis : carrousel animé ----------
  (function reviews() {
    var vp = $('.reviews__viewport'), track = $('.reviews__track'), cards = $$('.review', track), bar = $('.reviews__bar i');
    var idx = 0, hover = false, inView = false, drag;
    function padL() { return parseFloat(getComputedStyle(vp).paddingLeft) || 0; }
    function minX() { return Math.min(0, -(track.scrollWidth - (vp.clientWidth - padL() * 2))); }
    function snapX(i) { return Math.max(minX(), -(cards[i].offsetLeft - track.offsetLeft)); }
    function prog() { var m = minX(); return m === 0 ? 1 : clamp(0, 1, gsap.getProperty(track, 'x') / m); }
    function upd() { gsap.set(bar, { scaleX: .12 + .88 * prog() }); }
    var timer = gsap.delayedCall(6.5, function () { go(idx >= cards.length - 1 ? 0 : idx + 1); });
    timer.pause();
    function go(i) {
      idx = clamp(0, cards.length - 1, i);
      gsap.to(track, { x: snapX(idx), duration: 1.15, ease: 'power3.out', overwrite: true, onUpdate: upd });
      if (inView && !hover) timer.restart(true);
    }
    function nearest() {
      var x = gsap.getProperty(track, 'x'), best = 0, bd = 1e9;
      cards.forEach(function (c, k) { var dd = Math.abs(snapX(k) - x); if (dd < bd) { bd = dd; best = k; } });
      return best;
    }
    if (window.Draggable) {
      drag = Draggable.create(track, {
        type: 'x', bounds: { minX: minX(), maxX: 0 }, edgeResistance: .9, allowContextMenu: true, cursor: 'grab', activeCursor: 'grabbing',
        onPress: function () { timer.pause(); gsap.killTweensOf(track); },
        onDrag: upd, onThrowUpdate: upd,
        onRelease: function () { go(nearest()); }
      })[0];
    }
    $$('.reviews__btns .round').forEach(function (b) { b.addEventListener('click', function () { go(idx + (+b.getAttribute('data-dir'))); }); });
    vp.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { go(idx + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { go(idx - 1); e.preventDefault(); } });
    vp.addEventListener('pointerenter', function () { hover = true; timer.pause(); });
    vp.addEventListener('pointerleave', function () { hover = false; if (inView) timer.restart(true); });
    ScrollTrigger.create({ trigger: vp, start: 'top 85%', end: 'bottom 15%', onToggle: function (s) { inView = s.isActive; if (inView && !hover) timer.restart(true); else timer.pause(); } });
    ScrollTrigger.addEventListener('refreshInit', function () { if (drag) drag.applyBounds({ minX: minX(), maxX: 0 }); });
    ScrollTrigger.addEventListener('refresh', function () { if (drag) drag.applyBounds({ minX: minX(), maxX: 0 }); gsap.set(track, { x: Math.max(minX(), gsap.getProperty(track, 'x')) }); upd(); });
    gsap.from(cards, { x: 140, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: .1, scrollTrigger: { trigger: vp, start: 'top 85%', once: true } });
    upd();
  })();

  // ---------- pied de page : grand nom ----------
  (function footer() {
    var chars = splitChars($('.foot__big'));
    gsap.set(chars, { yPercent: 118 });
    onView([$('.foot__big')], function () { gsap.to(chars, { yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: .07 }); }, '0px 0px -5% 0px');
  })();

  // ---------- micro-interactions ----------
  if (fine) {
    // boutons magnétiques
    $$('.magnetic').forEach(function (b) {
      var xt = gsap.quickTo(b, 'x', { duration: .7, ease: 'power3' }), yt = gsap.quickTo(b, 'y', { duration: .7, ease: 'power3' });
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        xt((e.clientX - (r.left + r.width / 2)) * .3); yt((e.clientY - (r.top + r.height / 2)) * .38);
      });
      b.addEventListener('pointerleave', function () { xt(0); yt(0); });
    });
    // inclinaison 3D + reflet lumineux
    function tilt(el, max, glare) {
      gsap.set(el, { transformPerspective: 900 });
      var rx = gsap.quickTo(el, 'rotationX', { duration: .7, ease: 'power3' }), ry = gsap.quickTo(el, 'rotationY', { duration: .7, ease: 'power3' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        ry(px * max); rx(-py * max);
        if (glare) { el.style.setProperty('--mx', (px + .5) * 100 + '%'); el.style.setProperty('--my', (py + .5) * 100 + '%'); }
      });
      el.addEventListener('pointerleave', function () { rx(0); ry(0); });
    }
    $$('.card[data-tilt]').forEach(function (c) { tilt(c, 10, true); });
    $$('.g-item').forEach(function (g) { tilt(g, 7, false); });
    // curseur « pétale »
    var cur = $('.cursor'), dot = $('.cursor__dot'), ringEl = $('.cursor__ring'), lab = $('b', ringEl);
    var dx = gsap.quickTo(dot, 'x', { duration: .12, ease: 'power3' }), dy = gsap.quickTo(dot, 'y', { duration: .12, ease: 'power3' });
    var rx = gsap.quickTo(ringEl, 'x', { duration: .55, ease: 'power3' }), ry = gsap.quickTo(ringEl, 'y', { duration: .55, ease: 'power3' });
    window.addEventListener('pointermove', function (e) { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); }, { passive: true });
    d.addEventListener('pointerover', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (t) { lab.textContent = t.getAttribute('data-cursor'); cur.classList.add('is-label'); cur.classList.remove('is-link'); return; }
      cur.classList.remove('is-label');
      cur.classList.toggle('is-link', !!(e.target.closest && e.target.closest('a, button, label, input, textarea, .card')));
    });
  }

  // ---------- recalcul une fois polices et images prêtes ----------
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();

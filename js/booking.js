/* ==========================================================================
   Éphémère · module de réservation
   100 % statique, sans back-end ni service tiers : la demande part du téléphone
   du client (SMS pré-rempli vers la boutique), avec fichier agenda (.ics),
   appel direct ou message à copier. La boutique confirme ensuite le créneau.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('booking-root');
  if (!root) return;

  var SMS_NUMBER = '+33625367078';
  var PHONE_LABEL = '06 25 36 70 78';
  var SHOP_ADDRESS = 'Éphémère, Centre commercial Carrefour Market, Rue du Petit Chemin d\'Aix, 13120 Gardanne';
  var SLOT_STEP = 30;                // minutes
  var MAX_MONTHS_AHEAD = 12;
  var MIN_LEAD_MIN = 60;             // un créneau doit être à plus d'1 h dans le futur

  /* Horaires d'ouverture (getDay : 0 = dimanche) — source : fiche Google Maps.
     Mercredi : à confirmer avec la boutique (la fiche affichait « fermé » pour l'Armistice). */
  var HOURS = {
    0: ['09:30', '12:30'], 1: ['09:30', '19:00'], 2: ['09:30', '19:00'], 3: ['09:30', '19:00'],
    4: ['09:30', '19:00'], 5: ['09:30', '19:00'], 6: ['09:00', '20:00']
  };
  /* Jours de fermeture connus (mois 0-11, jour). */
  var CLOSED = [[0, 1], [10, 11], [11, 25]];

  var KINDS = [
    { id: 'bouquet', icon: '#flower', label: 'Un bouquet à retirer', small: 'Composé sur place, prêt à l\'heure choisie.', verb: 'passer chercher un bouquet', ics: 'Retrait de bouquet', title: 'Quand passez-vous le chercher\u00a0?', min: 15 },
    { id: 'mariage', icon: '#star', label: 'Mariage\u00a0: rendez-vous devis', small: 'À partir de 300\u00a0€ · idéalement 3 mois avant.', verb: 'prendre rendez-vous pour un devis mariage', ics: 'Rendez-vous devis mariage', title: 'Quand voulez-vous nous rencontrer\u00a0?', min: 45 },
    { id: 'evenement', icon: '#cal', label: 'Fête ou événement', small: 'Baptême, anniversaire, soirée, entreprise…', verb: 'prendre rendez-vous pour un événement', ics: 'Rendez-vous événement', title: 'Quand voulez-vous en parler\u00a0?', min: 30 },
    { id: 'plantes', icon: '#petal', label: 'Plantes, orchidées, cadeau', small: 'Je passe choisir en boutique.', verb: 'passer à la boutique pour des plantes ou un cadeau', ics: 'Passage en boutique', title: 'Quand passez-vous\u00a0?', min: 20 },
    { id: 'autre', icon: '#chat', label: 'Une autre demande', small: 'Dites-nous tout dans votre message.', verb: 'vous voir à la boutique', ics: 'Visite à la boutique', title: 'Quand êtes-vous disponible\u00a0?', min: 30 }
  ];

  var state = { pane: 0, kind: null, date: null, time: null, name: '', phone: '', msg: '' };
  var today = new Date();
  var view = { y: today.getFullYear(), m: today.getMonth() };
  var reduceMotion = document.documentElement.classList.contains('reduce');
  var isTouch = window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  /* ---------- utilitaires ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function kindById(id) { return KINDS.filter(function (k) { return k.id === id; })[0]; }
  function fullDate(s) { return parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function hLabel(t) { return t.replace(':', 'h'); }
  function esc(str) { return String(str).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isClosedDay(d) { return CLOSED.some(function (c) { return d.getMonth() === c[0] && d.getDate() === c[1]; }); }

  function slotsFor(dateStr) {
    var d = parse(dateStr), h = HOURS[d.getDay()];
    if (!h || isClosedDay(d)) return [];
    var o = h[0].split(':'), c = h[1].split(':');
    var start = +o[0] * 60 + +o[1], end = +c[0] * 60 + +c[1];
    var out = [], limit = Date.now() + MIN_LEAD_MIN * 60000;
    for (var t = start; t <= end - SLOT_STEP; t += SLOT_STEP) {
      var s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, t, 0, 0);
      if (s.getTime() < limit) continue;
      out.push(pad(Math.floor(t / 60)) + ':' + pad(t % 60));
    }
    return out;
  }
  function dayAvailable(d) {
    var startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    if (d < startOfToday) return false;
    return slotsFor(key(d)).length > 0;
  }

  /* ---------- squelette ---------- */
  var STEPS = ['Envie', 'Moment', 'Vous', 'Envoi'];
  root.insertAdjacentHTML('beforeend',
    '<form class="bk" novalidate aria-label="Réservation">' +
      '<ol class="bk__steps" aria-hidden="true">' + STEPS.map(function (s, i) { return '<li' + (i === 0 ? ' class="is-on"' : '') + '>' + (i + 1) + '. ' + s + '</li>'; }).join('') + '</ol>' +
      '<div class="bk__panes" aria-live="polite">' +
        '<section class="bk__pane" data-pane="0">' +
          '<h3 class="bk__title" tabindex="-1">Qu\'est-ce qui vous ferait plaisir\u00a0?</h3>' +
          '<div class="bk__choices" role="radiogroup" aria-label="Type de demande">' +
            KINDS.map(function (k) {
              return '<label class="choice"><input type="radio" name="kind" value="' + k.id + '"><span class="choice__body"><svg class="ico" aria-hidden="true"><use href="' + k.icon + '"/></svg><strong>' + k.label + '</strong><small>' + k.small + '</small></span></label>';
            }).join('') +
          '</div>' +
          '<div class="bk__nav"><span></span><button type="button" class="btn btn--dark bk__next" data-go="1" disabled><span>Choisir un jour</span><svg class="ico" aria-hidden="true"><use href="#arrow"/></svg></button></div>' +
        '</section>' +
        '<section class="bk__pane" data-pane="1" hidden>' +
          '<h3 class="bk__title" tabindex="-1" id="bk-when-title">Quand\u00a0?</h3>' +
          '<div class="bk__when">' +
            '<div class="cal" id="bk-cal"></div>' +
            '<div class="slots-wrap"><p class="slots-title" id="bk-slots-title">Choisissez d\'abord un jour</p><div class="slots" id="bk-slots"></div></div>' +
          '</div>' +
          '<div class="bk__nav"><button type="button" class="bk__back" data-go="0"><svg class="ico" aria-hidden="true"><use href="#arrow-l"/></svg>Retour</button><button type="button" class="btn btn--dark bk__next" data-go="2" disabled><span>Mes coordonnées</span><svg class="ico" aria-hidden="true"><use href="#arrow"/></svg></button></div>' +
        '</section>' +
        '<section class="bk__pane" data-pane="2" hidden>' +
          '<h3 class="bk__title" tabindex="-1">Un prénom et un numéro, c\'est tout</h3>' +
          '<div class="bk__fields">' +
            '<div class="field"><label for="bk-name">Prénom</label><input id="bk-name" name="name" type="text" autocomplete="given-name" maxlength="40" aria-describedby="bk-name-err"><p class="field__err" id="bk-name-err"></p></div>' +
            '<div class="field"><label for="bk-phone">Téléphone</label><input id="bk-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="06 12 34 56 78" aria-describedby="bk-phone-err"><p class="field__err" id="bk-phone-err"></p></div>' +
            '<div class="field"><label for="bk-msg">Un détail à nous dire\u00a0? <span style="font-weight:500;opacity:.65">(facultatif)</span></label><textarea id="bk-msg" name="msg" maxlength="400" placeholder="Occasion, couleurs, budget, date de l\'événement…"></textarea></div>' +
          '</div>' +
          '<p class="bk__note">Rien n\'est enregistré sur ce site\u00a0: votre demande part de votre téléphone, directement vers la boutique.</p>' +
          '<div class="bk__nav"><button type="button" class="bk__back" data-go="1"><svg class="ico" aria-hidden="true"><use href="#arrow-l"/></svg>Retour</button><button type="button" class="btn btn--dark bk__next" data-go="3"><span>Voir le récapitulatif</span><svg class="ico" aria-hidden="true"><use href="#arrow"/></svg></button></div>' +
        '</section>' +
        '<section class="bk__pane" data-pane="3" hidden>' +
          '<h3 class="bk__title" tabindex="-1">Tout est prêt, il ne reste qu\'à envoyer</h3>' +
          '<dl class="recap" id="bk-recap"></dl>' +
          '<div class="field"><label for="bk-final">Votre message</label><textarea id="bk-final" class="bk__msg" readonly></textarea></div>' +
          '<div class="bk__actions">' +
            '<a class="btn btn--dark btn--full" id="bk-sms" href="#"><svg class="ico" aria-hidden="true"><use href="#chat"/></svg><span>Envoyer ma demande par SMS</span></a>' +
            '<button type="button" class="btn btn--outline" id="bk-ics"><svg class="ico" aria-hidden="true"><use href="#cal"/></svg><span>Ajouter à mon agenda</span></button>' +
            '<button type="button" class="btn btn--outline" id="bk-copy"><svg class="ico" aria-hidden="true"><use href="#copy"/></svg><span>Copier le message</span></button>' +
            '<a class="btn btn--outline btn--full" href="tel:' + SMS_NUMBER + '"><svg class="ico" aria-hidden="true"><use href="#phone"/></svg><span>Je préfère appeler le ' + PHONE_LABEL + '</span></a>' +
          '</div>' +
          '<p class="bk__status" id="bk-status" role="status" hidden><svg class="ico" aria-hidden="true"><use href="#check"/></svg><span></span></p>' +
          '<p class="bk__note" id="bk-help"></p>' +
          '<div class="bk__nav"><button type="button" class="bk__back" data-go="2"><svg class="ico" aria-hidden="true"><use href="#arrow-l"/></svg>Modifier</button><span></span></div>' +
        '</section>' +
      '</div>' +
    '</form>');

  var form = root.querySelector('.bk');
  var panes = [].slice.call(root.querySelectorAll('.bk__pane'));
  var stepEls = [].slice.call(root.querySelectorAll('.bk__steps li'));
  var calEl = root.querySelector('#bk-cal');
  var slotsEl = root.querySelector('#bk-slots');
  var slotsTitle = root.querySelector('#bk-slots-title');
  var nameIn = root.querySelector('#bk-name'), phoneIn = root.querySelector('#bk-phone'), msgIn = root.querySelector('#bk-msg');

  form.addEventListener('submit', function (e) { e.preventDefault(); });

  /* ---------- étape 1 : type ---------- */
  function setKind(id, silent) {
    state.kind = id;
    var input = root.querySelector('input[name="kind"][value="' + id + '"]');
    if (input) input.checked = true;
    root.querySelector('[data-pane="0"] .bk__next').disabled = false;
    root.querySelector('#bk-when-title').textContent = kindById(id).title;
    if (!silent) { state.time = null; }
  }
  root.querySelectorAll('input[name="kind"]').forEach(function (inp) {
    inp.addEventListener('change', function () { setKind(inp.value); });
  });

  /* ---------- étape 2 : calendrier + créneaux ---------- */
  function renderCal() {
    var first = new Date(view.y, view.m, 1);
    var offset = (first.getDay() + 6) % 7;
    var count = new Date(view.y, view.m + 1, 0).getDate();
    var minView = today.getFullYear() * 12 + today.getMonth();
    var cur = view.y * 12 + view.m;
    var html = '<div class="cal__head">' +
      '<button type="button" class="round cal__nav" data-cal="-1" aria-label="Mois précédent"' + (cur <= minView ? ' disabled' : '') + '><svg class="ico" aria-hidden="true"><use href="#arrow-l"/></svg></button>' +
      '<p class="cal__month" aria-live="polite">' + first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + '</p>' +
      '<button type="button" class="round cal__nav" data-cal="1" aria-label="Mois suivant"' + (cur >= minView + MAX_MONTHS_AHEAD ? ' disabled' : '') + '><svg class="ico" aria-hidden="true"><use href="#arrow"/></svg></button>' +
      '</div><div class="cal__grid" role="group" aria-label="Jours du mois">';
    ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].forEach(function (d) { html += '<span class="cal__dow" aria-hidden="true">' + d + '</span>'; });
    for (var i = 0; i < offset; i++) html += '<span class="cal__day is-empty" aria-hidden="true"></span>';
    for (var day = 1; day <= count; day++) {
      var d = new Date(view.y, view.m, day), k = key(d), ok = dayAvailable(d);
      var cls = 'cal__day' + (k === key(today) ? ' is-today' : '');
      html += '<button type="button" class="' + cls + '" data-date="' + k + '"' + (ok ? '' : ' disabled') + ' aria-pressed="' + (state.date === k) + '" aria-label="' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (ok ? '' : ', indisponible') + '">' + day + '</button>';
    }
    html += '</div><p class="cal__legend">Jours grisés&nbsp;: boutique fermée ou créneau trop proche.</p>';
    calEl.innerHTML = html;
  }
  calEl.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-cal]');
    if (nav && !nav.disabled) {
      var m = view.m + (+nav.dataset.cal), y = view.y;
      if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
      view = { y: y, m: m }; renderCal(); return;
    }
    var btn = e.target.closest('.cal__day[data-date]');
    if (btn && !btn.disabled) { state.date = btn.dataset.date; state.time = null; renderCal(); renderSlots(); updateNext1(); }
  });

  function renderSlots() {
    if (!state.date) { slotsTitle.textContent = 'Choisissez d\'abord un jour'; slotsEl.innerHTML = ''; return; }
    var kind = kindById(state.kind) || KINDS[0];
    slotsTitle.textContent = fullDate(state.date).replace(/^./, function (c) { return c.toUpperCase(); });
    var slots = slotsFor(state.date);
    if (!slots.length) { slotsEl.innerHTML = '<p class="slots__empty">Plus de créneau ce jour-là, essayez une autre date.</p>'; return; }
    var morning = slots.filter(function (s) { return s < '12:30'; }), after = slots.filter(function (s) { return s >= '12:30'; });
    function group(label, list) {
      return list.length ? '<div role="group" aria-label="' + label + '" style="width:100%"><p class="cal__legend" style="margin-bottom:.4rem">' + label + '</p><div class="slots">' + list.map(function (s) { return '<button type="button" class="slot" data-time="' + s + '" aria-pressed="' + (state.time === s) + '">' + hLabel(s) + '</button>'; }).join('') + '</div></div>' : '';
    }
    slotsEl.innerHTML = '<div style="display:grid;gap:.9rem;width:100%">' + group(kind.id === 'bouquet' ? 'Matin · heure de retrait' : 'Matin', morning) + group(kind.id === 'bouquet' ? 'Après-midi · heure de retrait' : 'Après-midi', after) + '</div>';
  }
  slotsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.slot'); if (!b) return;
    state.time = b.dataset.time;
    slotsEl.querySelectorAll('.slot').forEach(function (s) { s.setAttribute('aria-pressed', s === b ? 'true' : 'false'); });
    updateNext1();
  });
  function updateNext1() { root.querySelector('[data-pane="1"] .bk__next').disabled = !(state.date && state.time); }

  /* ---------- étape 3 : coordonnées ---------- */
  function validate() {
    var ok = true;
    var name = nameIn.value.trim(), phone = phoneIn.value.replace(/[\s.\-()]/g, '');
    var nameErr = root.querySelector('#bk-name-err'), phoneErr = root.querySelector('#bk-phone-err');
    nameIn.setAttribute('aria-invalid', 'false'); phoneIn.setAttribute('aria-invalid', 'false'); nameErr.textContent = ''; phoneErr.textContent = '';
    if (name.length < 2) { nameIn.setAttribute('aria-invalid', 'true'); nameErr.textContent = 'Indiquez votre prénom.'; ok = false; }
    if (!/^(\+|00)?\d{9,14}$/.test(phone)) { phoneIn.setAttribute('aria-invalid', 'true'); phoneErr.textContent = 'Indiquez un numéro valide (ex. 06 12 34 56 78).'; ok = false; }
    if (ok) { state.name = name; state.phone = phoneIn.value.trim(); state.msg = msgIn.value.trim().replace(/\s*\n\s*/g, ' '); }
    else { (name.length < 2 ? nameIn : phoneIn).focus(); }
    return ok;
  }

  /* ---------- étape 4 : récapitulatif + envoi ---------- */
  function buildMessage() {
    var k = kindById(state.kind);
    var lines = [
      'Bonjour Éphémère,',
      'je souhaite ' + k.verb + ' le ' + fullDate(state.date) + ' à ' + hLabel(state.time) + '.'
    ];
    if (state.msg) lines.push('Précisions : ' + state.msg);
    lines.push('Prénom : ' + state.name + ' · Tél : ' + state.phone);
    lines.push('Pouvez-vous me confirmer le créneau\u00a0? Merci\u00a0!');
    return lines.join('\n');
  }
  function renderRecap() {
    var k = kindById(state.kind), msg = buildMessage();
    root.querySelector('#bk-recap').innerHTML =
      '<div><dt>Envie</dt><dd>' + esc(k.label) + '</dd></div>' +
      '<div><dt>Quand</dt><dd>' + esc(fullDate(state.date)) + ' à ' + hLabel(state.time) + '</dd></div>' +
      '<div><dt>Vous</dt><dd>' + esc(state.name) + ' · ' + esc(state.phone) + '</dd></div>' +
      (state.msg ? '<div><dt>Détail</dt><dd>' + esc(state.msg) + '</dd></div>' : '');
    root.querySelector('#bk-final').value = msg;
    root.querySelector('#bk-sms').setAttribute('href', 'sms:' + SMS_NUMBER + '?&body=' + encodeURIComponent(msg));
    root.querySelector('#bk-status').hidden = true;
    root.querySelector('#bk-help').innerHTML = isTouch
      ? 'Une fois le SMS envoyé, la boutique vous confirme le créneau (ou vous propose un autre horaire). Votre demande n\'est validée qu\'à sa réponse.'
      : 'Vous êtes sur ordinateur\u00a0: copiez le message ci-dessus et envoyez-le depuis votre téléphone au <strong>' + PHONE_LABEL + '</strong>, ou appelez la boutique. Votre demande n\'est validée qu\'à la réponse de la boutique.';
  }
  function showStatus(text) {
    var st = root.querySelector('#bk-status'); st.querySelector('span').textContent = text; st.hidden = false;
  }
  root.querySelector('#bk-sms').addEventListener('click', function () {
    showStatus(isTouch ? 'Votre messagerie s\'ouvre avec le message prêt à envoyer. Appuyez sur « envoyer ».' : 'Si votre messagerie ne s\'est pas ouverte, copiez le message et envoyez-le au ' + PHONE_LABEL + '.');
  });
  root.querySelector('#bk-copy').addEventListener('click', function () {
    var txt = root.querySelector('#bk-final');
    var done = function () { showStatus('Message copié. Collez-le dans un SMS au ' + PHONE_LABEL + '.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt.value).then(done, function () { txt.select(); document.execCommand('copy'); done(); }); }
    else { txt.select(); try { document.execCommand('copy'); } catch (e) {} done(); }
  });
  root.querySelector('#bk-ics').addEventListener('click', function () {
    var k = kindById(state.kind), s = parse(state.date), t = state.time.split(':');
    var start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), +t[0], +t[1]);
    var end = new Date(start.getTime() + k.min * 60000);
    function f(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; }
    function ic(str) { return String(str).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
    var stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ephemere Gardanne//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@ephemere-gardanne', 'DTSTAMP:' + stamp, 'DTSTART:' + f(start), 'DTEND:' + f(end),
      'SUMMARY:' + ic(k.ics + ' · Éphémère'), 'LOCATION:' + ic(SHOP_ADDRESS),
      'DESCRIPTION:' + ic('Demande envoyée par SMS au ' + PHONE_LABEL + '. À confirmer par la boutique.\n' + (state.msg || '')),
      'STATUS:TENTATIVE', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Éphémère dans 1 heure', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ephemere-' + state.date + '.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    showStatus('Fichier agenda téléchargé (à confirmer par la boutique).');
  });

  /* ---------- navigation entre étapes ---------- */
  function go(n) {
    if (n === state.pane) return;
    if (n > state.pane) {
      if (state.pane === 0 && !state.kind) return;
      if (state.pane === 1 && !(state.date && state.time)) return;
      if (state.pane === 2 && !validate()) return;
      if (n === 1) { renderCal(); renderSlots(); updateNext1(); }
      if (n === 3) { if (state.pane !== 2 && !validate()) return; renderRecap(); }
    }
    var from = panes[state.pane], to = panes[n], dir = n > state.pane ? 1 : -1;
    var swap = function () {
      from.hidden = true; to.hidden = false; state.pane = n;
      stepEls.forEach(function (li, i) { li.classList.toggle('is-on', i === n); li.classList.toggle('is-done', i < n); });
      var title = to.querySelector('.bk__title'); if (title && !reduceMotion) { try { title.focus({ preventScroll: true }); } catch (e) {} }
      if (window.gsap && !reduceMotion) { gsap.fromTo(to.children, { y: 22 * dir, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: 'power3.out', stagger: .06, clearProps: 'transform,opacity' }); }
      if (window.ScrollTrigger) setTimeout(function () { ScrollTrigger.refresh(); }, 60);
    };
    if (window.gsap && !reduceMotion) { gsap.to(from.children, { y: -14 * dir, opacity: 0, duration: .25, ease: 'power2.in', stagger: .02, onComplete: function () { gsap.set(from.children, { clearProps: 'transform,opacity' }); swap(); } }); }
    else swap();
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (b && !b.disabled) { e.preventDefault(); go(+b.dataset.go); }
  });
  [nameIn, phoneIn].forEach(function (inp) { inp.addEventListener('input', function () { inp.setAttribute('aria-invalid', 'false'); }); });

  /* ---------- raccourcis « Réserver » du site ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-book]');
    if (!a) return;
    var id = a.getAttribute('data-book');
    if (kindById(id)) { setKind(id); if (state.pane !== 0) go(0); }
  });

  window.EphemereBooking = { preselect: function (id) { if (kindById(id)) setKind(id); } };
})();

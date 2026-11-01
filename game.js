'use strict';
/* ===== Puissance 4 — ChadGangGames =====
   Partie en ligne à 2 (salle du hub) ou "même écran".
   L'état complet est versionné et envoyé avec keep:true après chaque coup. */
(function () {

  const ROWS = 6, COLS = 7, CELLS = 42;
  const $ = (id) => document.getElementById(id);
  const SDK = window.ChadGang || null;
  const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const COLORS = { 1: '#ffd426', 2: '#ff4d6d' };
  const COLOR_NAMES = { 1: 'Jaune', 2: 'Rouge' };
  const EMOTES = ['😎', '🔥', '😂', '😭', '👏', '🤡'];
  const LOCAL_SEATS = [{ id: 'L1', name: 'Jaune' }, { id: 'L2', name: 'Rouge' }];

  /* ================= SON ================= */
  const Snd = {
    ctx: null, on: true,
    load() { try { this.on = localStorage.getItem('p4_sound') !== '0'; } catch (e) {} },
    save() { try { localStorage.setItem('p4_sound', this.on ? '1' : '0'); } catch (e) {} },
    wake() {
      try {
        if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {}
    },
    tone(freq, start, dur, type, vol, endFreq) {
      if (!this.on || !this.ctx) return;
      try {
        const t = this.ctx.currentTime + start;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t);
        if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + dur + 0.03);
      } catch (e) {}
    },
    drop(r) { this.tone(230 - r * 14, 0, 0.17, 'sine', 0.4, 70); this.tone(1100, 0, 0.04, 'square', 0.05, 500); },
    threat() { this.tone(660, 0, 0.12, 'square', 0.08); this.tone(880, 0.14, 0.12, 'square', 0.08); this.tone(660, 0.28, 0.16, 'square', 0.08); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, k * 0.11, 0.3, 'triangle', 0.16)); this.tone(1047, 0.6, 0.6, 'square', 0.05); },
    lose() { [392, 330, 262, 196].forEach((f, k) => this.tone(f, k * 0.17, 0.3, 'triangle', 0.14)); },
    draw() { this.tone(300, 0, 0.25, 'triangle', 0.14); this.tone(300, 0.3, 0.35, 'triangle', 0.14); },
    pop() { this.tone(520, 0, 0.14, 'sine', 0.18, 960); },
    release() { this.tone(500, 0, 0.7, 'sawtooth', 0.05, 80); },
    nope() { this.tone(150, 0, 0.14, 'sawtooth', 0.08); }
  };

  /* ================= EFFETS (canvas) ================= */
  const cv = $('fx');
  const g2 = cv.getContext('2d');
  let parts = [], rings = [], raf = 0, lastT = 0;
  const fxTimers = [];

  function resizeCanvas() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(innerWidth * d);
    cv.height = Math.floor(innerHeight * d);
    g2.setTransform(d, 0, 0, d, 0, 0);
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = Math.min(2.5, (t - lastT) / 16.67); lastT = t;
    g2.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      const dr = Math.pow(p.drag, dt);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      g2.globalAlpha = Math.min(1, p.life / 20);
      g2.fillStyle = p.color;
      if (p.shape === 'r') {
        g2.save(); g2.translate(p.x, p.y); g2.rotate(p.rot);
        g2.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g2.restore();
      } else {
        g2.beginPath(); g2.arc(p.x, p.y, Math.max(0.5, p.size * Math.min(1, p.life / 30 + 0.2)), 0, 6.283); g2.fill();
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt; r.r += r.vr * dt;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      g2.globalAlpha = Math.max(0, r.life / r.max);
      g2.strokeStyle = r.color; g2.lineWidth = 5 * (r.life / r.max) + 1;
      g2.beginPath(); g2.arc(r.x, r.y, r.r, 0, 6.283); g2.stroke();
    }
    g2.globalAlpha = 1;
    if (parts.length || rings.length) raf = requestAnimationFrame(loop);
    else { raf = 0; g2.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function sparks(x, y, color, n, speed, grav) {
    if (REDUCED) n = Math.ceil(n / 3);
    if (parts.length > 700) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.3 + Math.random() * 0.7);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: grav == null ? 0.18 : grav, drag: 0.985,
        life: 35 + Math.random() * 30, size: 2 + Math.random() * 3, color, shape: 'c', rot: 0, vr: 0 });
    }
    kick();
  }
  function confetti(x, y, deg, spread, n, power, colors) {
    if (REDUCED) n = Math.ceil(n / 3);
    if (parts.length > 700) return;
    for (let i = 0; i < n; i++) {
      const a = (deg + (Math.random() - 0.5) * spread) * Math.PI / 180;
      const s = power * (0.4 + Math.random() * 0.6);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.22, drag: 0.975,
        life: 110 + Math.random() * 70, size: 7 + Math.random() * 7, color: colors[(Math.random() * colors.length) | 0],
        shape: 'r', rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 0.4 });
    }
    kick();
  }
  function ring(x, y, color, max) {
    rings.push({ x, y, r: 4, vr: max / 16, life: 22, max: 22, color });
    kick();
  }
  function firework(x, y, color) { sparks(x, y, color, 46, 8, 0.12); sparks(x, y, '#ffffff', 16, 5, 0.1); }
  function stopFx() { while (fxTimers.length) clearTimeout(fxTimers.pop()); }
  function later(fn, ms) { const id = setTimeout(fn, ms); fxTimers.push(id); return id; }

  function party(big, winner) {
    const cols = [COLORS[winner], '#ffffff', '#7cf2ff', '#ffd426', '#ff4d6d'];
    const W = innerWidth, H = innerHeight;
    confetti(W * 0.05, H, -65, 40, big ? 70 : 24, 17, cols);
    confetti(W * 0.95, H, -115, 40, big ? 70 : 24, 17, cols);
    const rain = big ? 14 : 4;
    for (let k = 0; k < rain; k++) {
      later(() => confetti(Math.random() * W, -10, 90, 50, 12, 4, cols), 250 + k * 230);
    }
    const shows = big ? 9 : 2;
    for (let k = 0; k < shows; k++) {
      later(() => {
        const col = cols[(Math.random() * cols.length) | 0];
        firework(W * (0.12 + Math.random() * 0.76), H * (0.1 + Math.random() * 0.45), col);
        Snd.tone(300 + Math.random() * 300, 0, 0.25, 'sawtooth', 0.04, 80);
      }, 500 + k * 380);
    }
  }

  let shakeTimer = 0;
  function shake(amp) {
    if (REDUCED) return;
    const el = $('layout');
    el.style.setProperty('--amp', amp + 'px');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    clearTimeout(shakeTimer); shakeTimer = setTimeout(() => el.classList.remove('shake'), 450);
  }
  function flash() { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  let bannerTimer = 0;
  function banner(text, kind, ms) {
    const b = $('banner');
    b.className = 'banner ' + (kind || '');
    b.textContent = text;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), ms || 1500);
  }
  function hideBanner() { clearTimeout(bannerTimer); $('banner').classList.remove('show'); }
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ================= RÈGLES ================= */
  const idx = (r, c) => r * COLS + c;

  function dropRow(b, c) {
    for (let r = ROWS - 1; r >= 0; r--) if (!b[idx(r, c)]) return r;
    return -1;
  }
  function lineAt(b, r, c) {
    const p = b[idx(r, c)];
    if (!p) return null;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [idx(r, c)];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[idx(rr, cc)] === p) {
          cells.push(idx(rr, cc)); rr += dr * s; cc += dc * s;
        }
      }
      if (cells.length >= 4) return cells.sort((a, b2) => a - b2);
    }
    return null;
  }
  // Colonnes où le joueur p gagnerait immédiatement
  function winningCols(b, p) {
    const out = [];
    for (let c = 0; c < COLS; c++) {
      const r = dropRow(b, c);
      if (r < 0) continue;
      b[idx(r, c)] = p;
      if (lineAt(b, r, c)) out.push(c);
      b[idx(r, c)] = 0;
    }
    return out;
  }
  function newPartieId() {
    const base = mode === 'online' ? roomCode : 'LOC';
    return (base + '-' + Date.now().toString(36)).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
  }
  function fresh(seats, prev, partie) {
    return {
      v: (prev ? prev.v : 0) + 1, partie, seats,
      board: new Array(CELLS).fill(0), turn: 1, moves: [], last: -1,
      status: 'play', winner: 0, line: [], wins: prev ? prev.wins : {}
    };
  }
  function playMove(s, c) {
    if (s.status !== 'play') return null;
    const r = dropRow(s.board, c);
    if (r < 0) return null;
    const p = s.turn;
    const n = Object.assign({}, s, { v: s.v + 1, board: s.board.slice(), moves: s.moves.concat(c), last: idx(r, c), line: [] });
    n.board[idx(r, c)] = p;
    const line = lineAt(n.board, r, c);
    if (line) {
      n.status = 'won'; n.winner = p; n.line = line;
      const wid = s.seats[p - 1].id;
      n.wins = Object.assign({}, s.wins); n.wins[wid] = (n.wins[wid] || 0) + 1;
    } else if (n.moves.length === CELLS) {
      n.status = 'draw';
    } else {
      n.turn = p === 1 ? 2 : 1;
    }
    return n;
  }

  /* ================= ÉTAT ================= */
  let mode = null;            // 'online' | 'local'
  let S = null;               // état de la partie
  let room = null, roomCode = '', ready = false, myId = '', meInfo = null;
  let players = [];           // [{id,name}] dans l'ordre d'arrivée (le premier = hôte)
  const avatars = {};         // id -> url
  const reported = new Set();
  let discs = new Array(CELLS).fill(null);
  let uiHold = false;         // on attend la fin de la chute du dernier jeton
  let hoverCol = 3;
  let cell = 56;
  let lineInfo = null;
  let rematchAsked = false;
  let lastNope = 0, lastEmote = 0;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanName = (n) => String(n || 'Joueur').slice(0, 24);
  const present = (id) => players.some((p) => p.id === id);

  function mySeat(s) {
    s = s || S;
    if (mode !== 'online' || !s || !myId) return 0;
    return s.seats.findIndex((x) => x.id === myId) + 1;
  }
  function controllerId() {
    if (!S) return '';
    const ids = S.seats.map((x) => x.id);
    const p = players.find((x) => ids.includes(x.id));
    return p ? p.id : '';
  }
  function opponentPresent() {
    const seat = mySeat();
    if (!seat) return false;
    return present(S.seats[seat === 1 ? 1 : 0].id);
  }
  function canPlay() {
    if (!S || S.status !== 'play' || uiHold) return false;
    if (mode === 'local') return true;
    const seat = mySeat();
    return !!seat && seat === S.turn && opponentPresent();
  }

  /* ================= PLATEAU ================= */
  function layout() {
    const area = $('boardArea');
    const w = area.clientWidth, h = area.clientHeight;
    cell = Math.floor(Math.max(24, Math.min(w / 7.5, h / 7.5)));
    const root = document.documentElement;
    root.style.setProperty('--cell', cell + 'px');
    root.style.setProperty('--pad', Math.round(cell * 0.1) + 'px');
    drawLine();
  }
  function cellCenter(i) {
    const b = $('board').getBoundingClientRect();
    const pad = Math.round(cell * 0.1);
    return { x: b.left + pad + (i % COLS + 0.5) * cell, y: b.top + pad + (Math.floor(i / COLS) + 0.5) * cell };
  }
  function makeDisc(i, p) {
    const el = document.createElement('div');
    el.className = 'disc p' + p;
    el.style.setProperty('--r', Math.floor(i / COLS));
    el.style.setProperty('--c', i % COLS);
    el.appendChild(document.createElement('i'));
    return el;
  }
  function animateDrop(el, r, slow) {
    const fall = (250 + 62 * r) * (slow ? 1.4 : 1);
    const total = fall / 0.64;
    const start = -(r + 1.05) * cell;
    el.animate([
      { transform: 'translateY(' + start + 'px)', offset: 0, easing: 'cubic-bezier(.5,0,.9,.55)' },
      { transform: 'translateY(0)', offset: 0.64, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: 'translateY(' + (-cell * 0.16) + 'px)', offset: 0.78, easing: 'cubic-bezier(.6,0,.9,.6)' },
      { transform: 'translateY(0)', offset: 0.88, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: 'translateY(' + (-cell * 0.05) + 'px)', offset: 0.94, easing: 'cubic-bezier(.6,0,.9,.6)' },
      { transform: 'translateY(0)', offset: 1 }
    ], { duration: total, fill: 'backwards' });
    return fall;
  }
  function resetBoard(animated) {
    stopFx(); hideBanner();
    lineInfo = null; drawLine();
    if (animated && !REDUCED) Snd.release();
    discs.forEach((el, k) => {
      if (!el) return;
      if (animated && !REDUCED) {
        el.style.setProperty('--d', ((Math.random() * 220) | 0) + 'ms');
        void el.offsetWidth;
        el.classList.add('out');
        setTimeout(() => el.remove(), 1400);
      } else el.remove();
    });
    discs = new Array(CELLS).fill(null);
  }
  function markLast() {
    discs.forEach((el) => el && el.classList.remove('last'));
    if (S && S.last >= 0 && discs[S.last]) discs[S.last].classList.add('last');
  }
  function showLine(cells, p, animate) { lineInfo = { cells, p, animate }; drawLine(); }
  function drawLine() {
    const svg = $('lineFx');
    if (!lineInfo) { svg.innerHTML = ''; return; }
    const pad = Math.round(cell * 0.1);
    const W = 7 * cell + 2 * pad, H = 6 * cell + 2 * pad;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const pos = (i) => [pad + (i % COLS + 0.5) * cell, pad + (Math.floor(i / COLS) + 0.5) * cell];
    const a = pos(lineInfo.cells[0]), b = pos(lineInfo.cells[lineInfo.cells.length - 1]);
    const cls = lineInfo.animate ? 'anim' : '';
    const mk = (stroke, w, op) => '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] +
      '" pathLength="1" class="' + cls + '" stroke="' + stroke + '" stroke-width="' + w + '" opacity="' + op + '"/>';
    svg.innerHTML = mk('#ffffff', cell * 0.2, 0.9) + mk(COLORS[lineInfo.p], cell * 0.1, 1);
    lineInfo.animate = false;
  }

  /* ================= ÉTAPES D'UN COUP ================= */
  function handleState(s) {
    const prev = S;
    S = s;
    const isNew = !prev || prev.partie !== s.partie;
    if (isNew) { resetBoard(!!prev); rematchAsked = false; }
    const animIdx = (!isNew && prev && s.moves.length === prev.moves.length + 1) ? s.last : -1;

    const layer = $('discs');
    for (let i = 0; i < CELLS; i++) {
      if (s.board[i] && !discs[i]) {
        const el = makeDisc(i, s.board[i]);
        discs[i] = el; layer.appendChild(el);
      }
    }
    markLast();

    if (animIdx >= 0) {
      uiHold = s.status !== 'play';
      const wait = animateDrop(discs[animIdx], Math.floor(animIdx / COLS), s.status === 'won');
      setTimeout(() => onLand(s, animIdx), wait);
    } else if (s.status === 'won') {
      uiHold = false;
      celebrate(s, true);
      report(s);
    } else if (s.status === 'draw') {
      uiHold = false;
      report(s);
    } else {
      uiHold = false;
    }
    renderUI();
  }

  function onLand(s, i) {
    if (!S || S.partie !== s.partie) return;
    const r = Math.floor(i / COLS), p = s.board[i];
    const pt = cellCenter(i);
    Snd.drop(r);
    sparks(pt.x, pt.y + cell * 0.3, COLORS[p], 10 + r * 2, 3 + r * 0.4, 0.2);
    shake(1.5 + r * 0.7);
    uiHold = false;
    if (s.status === 'won') { celebrate(s, false); report(s); }
    else if (s.status === 'draw') { drawEnd(); report(s); }
    else {
      const cols = winningCols(s.board.slice(), p);
      if (cols.length >= 2) { banner('DOUBLE MENACE !', 'warn', 1500); Snd.threat(); shake(7); }
    }
    renderUI();
  }

  function celebrate(s, quiet) {
    s.line.forEach((i) => discs[i] && discs[i].classList.add('win'));
    showLine(s.line, s.winner, !quiet);
    if (quiet) return;
    const seat = mySeat(s);
    const mine = seat === s.winner;
    flash(); shake(11);
    s.line.forEach((i, k) => {
      later(() => {
        const pt = cellCenter(i);
        ring(pt.x, pt.y, COLORS[s.winner], cell * 1.7);
        sparks(pt.x, pt.y, '#ffffff', 12, 6);
        Snd.tone(600 + k * 140, 0, 0.12, 'triangle', 0.12);
      }, k * 110);
    });
    const wname = cleanName(s.seats[s.winner - 1].name).slice(0, 14).toUpperCase();
    if (mode === 'online' && seat) {
      if (mine) { banner('VICTOIRE !', 'win', 2800); Snd.win(); party(true, s.winner); }
      else { banner('DÉFAITE…', 'lose', 2600); Snd.lose(); party(false, s.winner); }
    } else {
      banner(wname + ' GAGNE !', 'win', 2800); Snd.win(); party(true, s.winner);
    }
  }

  // Match nul : on "ouvre la trappe", tous les jetons tombent
  function drawEnd() {
    banner('MATCH NUL !', 'draw', 2000);
    Snd.draw();
    setTimeout(() => {
      if (!S || S.status !== 'draw') return;
      Snd.release();
      discs.forEach((el, i) => {
        if (!el) return;
        el.style.setProperty('--d', (Math.floor(i / COLS) * 40 + Math.random() * 120 | 0) + 'ms');
        void el.offsetWidth;
        el.classList.add('out');
        setTimeout(() => el.remove(), 1500);
      });
      discs = new Array(CELLS).fill(null);
      markLast();
    }, 1300);
  }

  function report(s) {
    const seat = mySeat(s);
    if (mode !== 'online' || !seat || s.status === 'play') return;
    if (reported.has(s.partie)) return;
    reported.add(s.partie);
    if (SDK && SDK.finPartie) {
      const win = s.status === 'won' && s.winner === seat;
      const o = { gagne: win, partie: s.partie };
      if (win) o.score = Math.max(1, 43 - s.moves.length);   // plus la victoire est rapide, plus le score est haut
      try { const pr = SDK.finPartie(o); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
    }
  }

  /* ================= ACTIONS ================= */
  function tryMove(c) {
    Snd.wake();
    if (!canPlay()) {
      if (S && S.status === 'play' && mode === 'online' && mySeat() && mySeat() !== S.turn && Date.now() - lastNope > 1500) {
        lastNope = Date.now(); Snd.nope(); toast('Ce n\'est pas ton tour 😉');
      }
      return;
    }
    const n = playMove(S, c);
    if (!n) { Snd.nope(); toast('Colonne pleine !'); return; }
    handleState(n);
    if (mode === 'online') sendState(n);
  }
  function sendState(s) {
    if (room) { try { room.send({ t: 'state', s }, { keep: true }); } catch (e) {} }
  }
  function rematch() {
    if (!S) return;
    const n = fresh([S.seats[1], S.seats[0]], S, newPartieId());   // on inverse : l'autre commence
    handleState(n);
    if (mode === 'online') sendState(n);
  }
  function askRematch() {
    Snd.wake();
    if (!S || S.status === 'play') return;
    if (mode === 'local' || controllerId() === myId) { rematch(); return; }
    if (room) { try { room.send({ t: 'rematch' }); } catch (e) {} }
    rematchAsked = true;
    toast('Revanche demandée…');
    renderUI();
  }
  function sendEmote(e) {
    Snd.wake();
    if (!room || Date.now() - lastEmote < 700) return;
    lastEmote = Date.now();
    try { room.send({ t: 'emo', e }); } catch (er) {}
  }
  function floatEmoji(e, fromId) {
    if (!EMOTES.includes(e)) return;
    let x = innerWidth / 2, y = innerHeight * 0.6;
    if (S) {
      const k = S.seats.findIndex((s) => s.id === fromId);
      if (k >= 0) {
        const r = $(k === 0 ? 'pc1' : 'pc2').getBoundingClientRect();
        x = r.left + r.width / 2; y = r.bottom;
      }
    }
    const el = document.createElement('div');
    el.className = 'float'; el.textContent = e;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    $('floatLayer').appendChild(el);
    setTimeout(() => el.remove(), 2000);
    Snd.pop();
  }

  /* ================= RÉSEAU ================= */
  function saveRoom(code) { try { localStorage.setItem('p4_room', JSON.stringify({ code, t: Date.now() })); } catch (e) {} }
  function clearRoom() { try { localStorage.removeItem('p4_room'); } catch (e) {} }
  function savedRoom() {
    try {
      const o = JSON.parse(localStorage.getItem('p4_room') || 'null');
      if (o && o.code && Date.now() - o.t < 2 * 3600 * 1000) return o.code;
    } catch (e) {}
    return null;
  }
  function genCode() {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += a[(Math.random() * a.length) | 0];
    return s;
  }
  const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  function sendHi() {
    if (room && meInfo && meInfo.avatar) { try { room.send({ t: 'hi', a: meInfo.avatar }); } catch (e) {} }
  }
  function maybeStart() {
    if (mode !== 'online' || !ready || S) return;
    if (players.length >= 2 && players[0].id === myId) {
      const seats = [players[0], players[1]].map((p) => ({ id: p.id, name: cleanName(p.name) }));
      const n = fresh(seats, null, newPartieId());
      handleState(n); sendState(n);
    }
  }
  function receive(s) {
    if (!s || !Array.isArray(s.board) || !s.seats) return;
    if (S && s.v <= S.v) return;
    handleState(s);
  }

  function connect(code, create) {
    if (!SDK || !SDK.join) { toast('Hub introuvable : mode même écran seulement.'); return; }
    disconnect();
    mode = 'online'; roomCode = code; ready = false; S = null; players = [];
    resetBoard(false);
    showScreen('game');
    renderUI();
    let mine;
    try { mine = room = SDK.join(code, { create: !!create }); }
    catch (e) { toast('Impossible de rejoindre la salle.'); toLobby(true); return; }

    mine.on('ready', (info) => {
      if (room !== mine) return;
      ready = true; myId = info.me || myId;
      players = info.players || [];
      saveRoom(code);
      const last = info.last;
      if (last) receive(last.t === 'state' ? last.s : (last.board ? last : null));
      sendHi(); maybeStart(); renderUI();
    });
    mine.on('players', (list) => {
      if (room !== mine) return;
      players = list || [];
      sendHi(); maybeStart(); renderUI();
    });
    mine.on('message', (d, from) => {
      if (room !== mine || !d) return;
      if (d.t === 'state') receive(d.s);
      else if (d.t === 'emo') floatEmoji(d.e, from && from.id);
      else if (d.t === 'rematch') { if (S && S.status !== 'play' && controllerId() === myId) rematch(); }
      else if (d.t === 'hi' && from && typeof d.a === 'string' && /^(https?:\/\/|\/)/.test(d.a) && d.a.length < 400) {
        avatars[from.id] = d.a; renderUI();
      }
    });
    mine.on('error', (msg) => {
      if (room !== mine) return;
      toast(typeof msg === 'string' && msg ? msg : 'Salle introuvable ou pleine.');
      toLobby(true);
    });
  }
  function disconnect() {
    if (room) { try { room.leave(); } catch (e) {} room = null; }
  }

  function startLocal() {
    disconnect();
    mode = 'local'; ready = true; S = null; players = [];
    resetBoard(false);
    showScreen('game');
    handleState(fresh(LOCAL_SEATS.map((x) => ({ id: x.id, name: x.name })), null, newPartieId()));
  }

  function showScreen(name) {
    $('lobby').hidden = name !== 'lobby';
    $('game').hidden = name !== 'game';
    if (name === 'game') requestAnimationFrame(layout);
  }
  function toLobby(clear) {
    disconnect();
    mode = null; S = null; ready = false; players = []; uiHold = false;
    resetBoard(false);
    if (clear) clearRoom();
    showScreen('lobby');
  }

  /* ================= INTERFACE ================= */
  function setAvatar(box, p) {
    const url = p ? (p.id === myId && meInfo && meInfo.avatar ? meInfo.avatar : avatars[p.id]) : null;
    const key = (p ? p.id : '') + '|' + (url || '');
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    box.textContent = '';
    box.removeAttribute('data-chadgang-id');
    if (!p) { box.textContent = '?'; return; }
    if (url) {
      const img = new Image();
      img.src = url; img.alt = '';
      img.setAttribute('data-chadgang-id', p.id);
      box.appendChild(img);
    } else {
      box.setAttribute('data-chadgang-id', p.id);
      box.textContent = cleanName(p.name).charAt(0).toUpperCase();
    }
  }

  function seatPlayer(n) {
    if (S) return S.seats[n - 1];
    if (mode === 'online') return players[n - 1] || null;
    return null;
  }

  function setStatus(main, sub, mine) {
    const m = $('statusMain');
    m.textContent = main; m.className = mine ? 'mine' : '';
    $('statusSub').textContent = sub || '';
  }

  function renderUI() {
    const online = mode === 'online';
    $('roomChip').hidden = !online;
    $('roomCode').textContent = roomCode;
    $('emotes').hidden = !online;
    $('btnLeave').title = online ? 'Quitter la salle' : 'Retour';

    for (const n of [1, 2]) {
      const p = seatPlayer(n);
      const card = $('pc' + n);
      let name = p ? cleanName(p.name) : (online ? 'En attente…' : '—');
      if (p && online && p.id === myId) name += ' (toi)';
      $('pn' + n).textContent = name;
      $('w' + n).textContent = p && S ? (S.wins[p.id] || 0) : 0;
      setAvatar($('av' + n), p);
      card.classList.toggle('turn', !!(S && S.status === 'play' && S.turn === n && !uiHold));
      card.classList.toggle('off', !!(online && ready && p && !present(p.id)));
    }
    if (uiHold) return;

    // ----- statut -----
    const seat = mySeat();
    if (online && !ready) setStatus('Connexion à la salle…', '');
    else if (online && !S) {
      if (players.length < 2) setStatus('En attente d\'un adversaire…', 'Code : ' + roomCode + ' — ou bouton « Inviter » du hub');
      else setStatus('Lancement de la partie…', '');
    } else if (S.status === 'play') {
      const cur = cleanName(S.seats[S.turn - 1].name);
      if (online && seat) {
        const opp = S.seats[seat === 1 ? 1 : 0];
        if (!present(opp.id)) setStatus('⏳ ' + cleanName(opp.name) + ' est parti…', 'On l\'attend, la partie est en pause');
        else if (seat === S.turn) setStatus('À toi de jouer !', '', true);
        else setStatus('Tour de ' + cur + '…', '');
      } else if (online) setStatus('Tour de ' + cur, 'Tu regardes la partie 👀');
      else setStatus('Tour de ' + COLOR_NAMES[S.turn], '');
    } else if (S.status === 'won') {
      const w = cleanName(S.seats[S.winner - 1].name);
      if (online && seat) setStatus(seat === S.winner ? '🏆 Tu as gagné !' : '😤 ' + w + ' a gagné', '');
      else setStatus('🏆 ' + w + ' gagne !', '');
    } else setStatus('🤝 Match nul !', '');

    // ----- boutons de fin -----
    const btn = $('btnRematch');
    const over = !!S && S.status !== 'play';
    const canAsk = over && (mode === 'local' || (online && seat));
    btn.hidden = !canAsk;
    if (canAsk) {
      const ctl = mode === 'local' || controllerId() === myId;
      btn.disabled = rematchAsked && !ctl;
      btn.textContent = rematchAsked && !ctl ? '⏳ Revanche demandée…' : '🔄 Revanche';
    }

    // ----- colonnes -----
    $('cols').classList.toggle('off', !canPlay());
    updateGhost();
  }

  function updateGhost() {
    const gh = $('ghost');
    const show = canPlay();
    gh.hidden = !show;
    document.querySelectorAll('.col').forEach((el, k) => el.classList.toggle('hov', show && k === hoverCol && lastPointer === 'kbd'));
    if (!show) return;
    const p = mode === 'local' ? S.turn : mySeat();
    gh.className = 'disc ghost p' + p;
    gh.style.setProperty('--c', hoverCol);
  }

  /* ================= ÉVÉNEMENTS ================= */
  let lastPointer = 'mouse';

  function buildStatic() {
    const cols = $('cols');
    for (let c = 0; c < COLS; c++) {
      const b = document.createElement('button');
      b.className = 'col'; b.type = 'button';
      b.setAttribute('aria-label', 'Colonne ' + (c + 1));
      b.addEventListener('pointerenter', () => { lastPointer = 'mouse'; hoverCol = c; updateGhost(); });
      b.addEventListener('pointerdown', () => { hoverCol = c; updateGhost(); });
      b.addEventListener('click', () => tryMove(c));
      cols.appendChild(b);
    }
    const em = $('emotes');
    EMOTES.forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = e; b.title = 'Réaction';
      b.addEventListener('click', () => sendEmote(e));
      em.appendChild(b);
    });
  }

  function bind() {
    document.addEventListener('pointerdown', () => Snd.wake(), { passive: true });

    $('btnCreate').addEventListener('click', () => { Snd.wake(); connect(genCode(), true); });
    $('joinForm').addEventListener('submit', (e) => {
      e.preventDefault(); Snd.wake();
      const c = cleanCode($('code').value);
      if (c.length < 4) { toast('Entre le code à 4 lettres de ton pote.'); return; }
      connect(c, false);
    });
    $('btnLocal').addEventListener('click', () => { Snd.wake(); startLocal(); });
    $('btnLeave').addEventListener('click', () => toLobby(true));
    $('btnRematch').addEventListener('click', askRematch);
    $('btnCopy').addEventListener('click', () => {
      try { navigator.clipboard.writeText(roomCode).then(() => toast('Code copié : ' + roomCode)).catch(() => toast('Code : ' + roomCode)); }
      catch (e) { toast('Code : ' + roomCode); }
    });
    $('btnSound').addEventListener('click', () => { Snd.on = !Snd.on; Snd.save(); syncSoundBtn(); Snd.wake(); });

    document.addEventListener('keydown', (e) => {
      if ($('game').hidden || (e.target && e.target.tagName === 'INPUT')) return;
      if (e.key === 'ArrowLeft') { lastPointer = 'kbd'; hoverCol = (hoverCol + COLS - 1) % COLS; updateGhost(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { lastPointer = 'kbd'; hoverCol = (hoverCol + 1) % COLS; updateGhost(); e.preventDefault(); }
      else if (/^[1-7]$/.test(e.key)) tryMove(+e.key - 1);
      else if (e.key === 'ArrowDown' || ((e.key === 'Enter' || e.key === ' ') && !(document.activeElement && document.activeElement.classList.contains('col')))) {
        e.preventDefault(); tryMove(hoverCol);
      }
    });

    window.addEventListener('resize', () => { resizeCanvas(); layout(); });
    if (window.ResizeObserver) new ResizeObserver(layout).observe($('boardArea'));
  }
  function syncSoundBtn() { $('btnSound').textContent = Snd.on ? '🔊' : '🔇'; }

  /* ================= DÉMARRAGE ================= */
  async function init() {
    Snd.load(); syncSoundBtn();
    buildStatic(); bind(); resizeCanvas(); layout();

    if (!SDK || !SDK.join) {
      $('onlineBox').hidden = true;
      $('lobbyHint').textContent = 'Hors du hub : seul le mode « même écran » est disponible.';
    } else {
      try {
        meInfo = await Promise.race([SDK.me(), new Promise((res) => setTimeout(() => res(null), 3000))]);
      } catch (e) { meInfo = null; }
      if (meInfo && meInfo.id) myId = meInfo.id;
      $('lobbyHint').textContent = 'Crée une salle, puis clique sur « Inviter » dans la barre du hub pour appeler tes potes.';
      const inv = cleanCode(SDK.room && SDK.room());
      if (inv.length >= 4) { connect(inv, false); return; }
      const saved = savedRoom();
      if (saved) { connect(saved, false); return; }
    }
    showScreen('lobby');
  }

  init();
})();

'use strict';
// ===== A Aventura do Menino Saltitante =====
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), scr = document.getElementById('screen');
const W = 960, H = 540, GY = 460, PI = Math.PI;
if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };

// ---------- Sprites (imagens pré-processadas com fundo transparente) ----------
const SPR = {};
['boy', 'guerreira', 'rainha'].forEach(n => { const i = new Image(); i.src = n + '.png'; SPR[n] = i; });

// ---------- Sons + música de fundo (WebAudio, sem arquivos externos) ----------
let AC, MASTER, MUS = { on: true, i: 0, next: 0 };
function audio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  MASTER = AC.createGain(); MASTER.gain.value = MUS.on ? 1 : 0; MASTER.connect(AC.destination);
  MUS.next = AC.currentTime + .1;
}
function snd(f, d = .1, ty = 'square', to = 0, v = .05) {
  try {
    audio();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), n = AC.currentTime;
    o.type = ty; o.frequency.setValueAtTime(f, n);
    if (to) o.frequency.exponentialRampToValueAtTime(to, n + d);
    g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(.001, n + d);
    o.connect(g); g.connect(AC.destination); o.start(n); o.stop(n + d);
  } catch (e) {}
}
const S = {
  jump: () => snd(300, .18, 'square', 720),
  coin: () => { snd(988, .08); setTimeout(() => snd(1319, .16), 70); },
  stomp: () => snd(220, .15, 'sawtooth', 80),
  hurt: () => snd(420, .4, 'sawtooth', 60),
  nock: () => snd(280, .07, 'square', 0, .03),
  shoot: () => snd(1250, .12, 'triangle', 420),
  heart: () => [392, 523, 659].forEach((f, i) => setTimeout(() => snd(f, .12, 'triangle'), i * 60)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => snd(f, .22), i * 120))
};

// ---------- Música de fundo (chiptune estilo Mini Kong) ----------
// Melodia em números MIDI (0 = pausa), grid de colcheias — v2: aventura em Lá menor
const nf = n => 440 * Math.pow(2, (n - 69) / 12);
const MEL = [81, 0, 84, 81, 88, 84, 81, 76,  // lá, dó, mi... (Am)
             77, 0, 81, 77, 84, 81, 77, 72,  // fá maior (F)
             76, 0, 79, 76, 84, 79, 76, 72,  // dó maior (C)
             79, 83, 86, 83, 79, 83, 88, 86]; // sol maior (G) -> volta pro Am
const BAS = [33, 45, 45, 57,  29, 41, 41, 53,  36, 48, 48, 55,  31, 43, 43, 50]; // baixo oitavado por compasso
function mnote(f, d, ty, v, when) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = ty; o.frequency.setValueAtTime(f, when);
  g.gain.setValueAtTime(v, when); g.gain.exponentialRampToValueAtTime(.001, when + d);
  o.connect(g); g.connect(MASTER); o.start(when); o.stop(when + d);
}
function hat(when) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(6500, when);
  g.gain.setValueAtTime(.012, when); g.gain.exponentialRampToValueAtTime(.001, when + .04);
  o.connect(g); g.connect(MASTER); o.start(when); o.stop(when + .05);
}
function boom(when) { // bumbinho grave marcando o tempo
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(110, when); o.frequency.exponentialRampToValueAtTime(38, when + .12);
  g.gain.setValueAtTime(.09, when); g.gain.exponentialRampToValueAtTime(.001, when + .13);
  o.connect(g); g.connect(MASTER); o.start(when); o.stop(when + .14);
}
function musTick() {
  if (!AC || !MUS.on) return;
  const st = 60 / (124 + lv * 13) / 2;          // duração de uma colcheia (acelera por fase)
  const tp = [0, 3, 5][lv] || 0;                // sobe o tom da música a cada fase
  if (MUS.next < AC.currentTime - .4) MUS.next = AC.currentTime + .05; // voltou de aba oculta
  while (MUS.next < AC.currentTime + .3) {
    const i = MUS.i % MEL.length, m = MEL[i];
    if (m) mnote(nf(m + tp), st * .95, 'square', .036, MUS.next);
    if (i % 4 === 0) boom(MUS.next);                       // bumbo no 1º tempo
    if (i % 4 === 2) mnote(nf(BAS[i % BAS.length] + tp), st * 2.4, 'triangle', .065, MUS.next); // baixo no contratempo forte
    else if (i % 4 !== 0) hat(MUS.next);                   // chimbal sincopado
    MUS.next += st; MUS.i++;
  }
}

// ---------- Estado ----------
let state = 'menu', lv = 0, L, P, t = 0, cam = 0, lives = 3, score = 0, coins = 0, unlocked = 1, banner = 0, pts = [], cf = [], B, shake = 0, weapon = null, stairT = 0;
try { unlocked = Math.min(5, +localStorage.getItem('menino_fases') || 1); } catch (e) {}
const K = { l: 0, r: 0, j: 0, x: 0 };
const kd = e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') K.l = e.type === 'keydown' ? 1 : 0;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') K.r = e.type === 'keydown' ? 1 : 0;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') K.j = e.type === 'keydown' ? 1 : 0;
  if (e.code === 'KeyX') K.x = e.type === 'keydown' ? 1 : 0;
  if (e.code === 'KeyM' && e.type === 'keydown') { MUS.on = !MUS.on; if (MASTER) MASTER.gain.value = MUS.on ? 1 : 0; }
  if (e.code === 'KeyF' && e.type === 'keydown') toggleFull();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
};
addEventListener('keydown', kd); addEventListener('keyup', kd);
addEventListener('blur', () => { K.l = K.r = K.j = K.x = 0; });

// ---------- Tela cheia ----------
function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function goFull() {
  const el = document.getElementById('game');
  if (isFull() || !el) return;
  const r = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!r) return;
  try { const p = r.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function toggleFull() {
  if (isFull()) {
    const x = document.exitFullscreen || document.webkitExitFullscreen;
    if (x) { try { const p = x.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  } else goFull();
}

// ---------- Fases (dificuldade progressiva) ----------
// segs: [comprimento do chão, tamanho do buraco depois dele]
const CFG = [
  { name: 'Bosque Encantado', segs: [[880, 90], [560, 140], [700, 120], [860, 0]], dens: 520, sp: 1.15, pw: 150, mv: 1, p1: 328, p2: 374, dc: '#ff6b81', hc: '#5a3825' },
  { name: 'Caminho das Guloseimas', segs: [[700, 130], [520, 140], [460, 150], [520, 140], [460, 150], [700, 0]], dens: 260, sp: 1.7, pw: 110, mv: 0, p1: 335, p2: 360, dc: '#9b5de5', hc: '#ffd166' },
  { name: 'Castelo do Salto Alto', segs: [[650, 150], [420, 170], [420, 175], [420, 175], [420, 170], [1000, 0]], dens: 240, sp: 2.7, pw: 100, mv: 1, p1: 335, p2: 360, dc: '#e63946', hc: '#222233' },
  { name: 'Altar dos espelhos', segs: [[700, 130], [520, 160], [460, 170], [520, 160], [460, 170], [780, 0]], dens: 300, sp: 2, pw: 120, mv: 1, p1: 330, p2: 358, pr: 80, dc: '#c77dff', hc: '#ffd166' }
];
// Armas forjadas na Forja Real (de acordo com as moedas coletadas)
const ARMAS = {
  fist: { name: 'Porrete do Castelo', dmg: 1, range: 46, cd: 38, color: '#b94b4b' },
  dagger: { name: 'Adaga Esmeralda', dmg: 1, range: 64, cd: 26, color: '#7ef9d0' },
  sword: { name: 'Espada Rubi', dmg: 2, range: 76, cd: 34, color: '#ff6b81' },
  gold: { name: 'Arco Dourado', dmg: 3, range: 170, cd: 30, color: '#ffd23f', proj: 1 }
};
weapon = ARMAS.fist;
function mk(x, y, w, ax = 0, ay = 0, sp = .03) { return { x, y, w, h: 16, bx: x, by: y, ax, ay, sp, dx: 0, dy: 0 }; }
function build(n) {
  const c = CFG[n], o = { c, ground: [], plats: [], en: [], coins: [], ar: [], len: 0, got: 0 };
  let x = 0;
  c.segs.forEach(([len, gap], i) => {
    const last = i === c.segs.length - 1, fin = last && n === 2;
    o.ground.push({ x, y: GY, w: len, g: 1 });
    const k = Math.floor(len / (fin ? 200 : c.dens));
    for (let j = 0; j < k; j++) { // bonequinhas patrulhando
      const cx = x + len * (j + 1) / (k + 1) + (i === 0 ? 100 : 0);
      o.en.push({ x: cx, cx, r: fin ? 55 : (c.pr || 60 + n * 15), v: c.sp * (fin ? 1.2 : 1) * (j % 2 ? 1 : -1), dead: 0, cd: 80 + Math.random() * 140, wind: 0, aim: -1, ph: Math.random() * PI * 2 });
    }
    const pc = Math.floor(len / 400);
    for (let j = 0; j < pc; j++) { // plataformas flutuantes com moedas
      const px = x + len * (j + 1) / (pc + 1) - c.pw / 2, py = j % 2 ? c.p2 : c.p1;
      o.plats.push(mk(px, py, c.pw));
      for (let m = 0; m < 3; m++) o.coins.push({ x: px + c.pw * (m + 1) / 4, y: py - 30 });
    }
    for (let cx = x + 120; cx < x + len - 100; cx += 150) o.coins.push({ x: cx, y: GY - 30 });
    if (gap) {
      for (let m = 0; m < 4; m++) o.coins.push({ x: x + len + gap * (m + 1) / 5, y: GY - 50 - Math.sin(PI * (m + 1) / 5) * 80 });
      if (c.mv) o.plats.push(i % 2 ? mk(x + len + gap / 2 - 45, 415, 90, 40, 0, .035) : mk(x + len + gap / 2 - 45, 430, 90, 0, 45, .035));
    }
    x += len + gap;
  });
  o.len = x; o.goal = x - 120; o.totalCoins = o.coins.length;
  const hs = o.ground[1] || o.ground[0]; // um coração curativo por fase
  o.hearts = [{ x: hs.x + hs.w * .55, y: GY - 64, got: 0 }];
  return o;
}
function resetP() { P = { x: 80, y: 300, w: 30, h: 46, vx: 0, vy: 0, on: false, dir: 1, ph: 0, inv: 0, jh: true, ride: null, chk: 80, wasOn: false, ls: 0, at: 0, swing: 0, jb: 0, cy: 0 }; }

// ---------- Telas ----------
function show(title, text, btns) {
  scr.innerHTML = `<h1>${title}</h1><p>${text}</p><div class="btns"></div>`;
  const b = scr.querySelector('.btns');
  btns.forEach(([l, f, dis]) => {
    const e = document.createElement('button'); e.textContent = l; e.disabled = !!dis;
    e.onclick = () => { goFull(); snd(600, .05); f(); e.blur(); }; b.appendChild(e);
  });
  scr.classList.remove('hidden');
}
function capa() { // capa de entrada: história + botão pra abrir o lobby
  state = 'capa'; lv = 0; L = build(0); resetP(); cam = 0;
  scr.classList.add('capa');
  show('🌟 O Invasor de Saia', 'Nos tempos do antigo reino, um menino destemido invadiu o castelo onde a <b>Grande Rainha das Meninas</b> aprisiona os ritmos e cores...<br><small>Tecle M para ligar/desligar a música 🎵 • F para tela cheia ⛶</small>',
    [['⚔ Entrar no castelo', () => { scr.classList.remove('capa'); menu(); }]]);
}
function menu() {
  state = 'menu'; lv = 0; L = build(0); resetP(); cam = 0; scr.classList.remove('capa');
  show('🌟 O Invasor de Saia', 'Corra, pule e colete moedas! As guerreiras <b>disparam flechas</b> (o ⚠ aparece antes do tiro — salte por cima ou vença-as com um pulo na cabeça!).<br>❤️ Cada fase tem <b>1 coração</b> que devolve vida.<br>Na Fase 4 junte as moedas pra forjar a melhor arma e derrotar a 👑 Grande Rainha (ataque com <b>X</b>).<br><small>Tecle M para ligar/desligar a música 🎵 • F para tela cheia ⛶</small>',
    [['▶ Jogar', () => newGame(0)],
     ...[0, 1, 2, 3].map(i => ['Fase ' + (i + 1) + ' – ' + CFG[i].name + (i < unlocked ? '' : ' 🔒'), () => newGame(i), i >= unlocked]),
     ['👑 Soberania das Saias' + (unlocked >= 4 ? ' ⚔' : ' 🔒'), () => newGame(4), unlocked < 4]]);
}
function newGame(n) { lives = 3; score = 0; coins = 0; weapon = n === 4 ? ARMAS.dagger : ARMAS.fist; startLevel(n); }
function startLevel(n) { lv = n; L = n === 4 ? buildBoss() : build(n); resetP(); cam = 0; t = 0; pts = []; cf = []; shake = 0; banner = 180; state = 'play'; scr.classList.add('hidden'); }
function clearLvl() {
  S.win(); score += 500 + lives * 100;
  unlocked = Math.min(5, Math.max(unlocked, lv + 2));
  try { localStorage.setItem('menino_fases', unlocked); } catch (e) {}
  if (lv === 3) { startStairs(); } // sobe a escadaria até o Salão do Trono
  else {
    state = 'clear';
    show('⭐ Fase concluída!', `Pontos: ${score} &nbsp; Moedas: ${coins}`, [['Próxima fase ▶', () => startLevel(lv + 1)], ['Menu', menu]]);
  }
}
function startStairs() { state = 'stair'; stairT = 0; scr.classList.add('hidden'); P.vx = 0; P.vy = 0; P.inv = 0; }
function forjaScreen() { // loja da forja: arma conforme as moedas da fase
  state = 'clear';
  const frac = L.totalCoins ? L.got / L.totalCoins : 1;
  weapon = frac >= .98 ? ARMAS.gold : frac >= .6 ? ARMAS.sword : frac >= .3 ? ARMAS.dagger : ARMAS.fist;
  score += 200 + Math.round(frac * 300);
  show('⚔ A Forja Real', `A escada do salão subiu até o Salão do Trono!<br>Você pegou <b>${L.got} de ${L.totalCoins}</b> moedas — a forja forjou a <b>${weapon.name}</b>!<br>Ataque com <b>X</b>. A 👑 Grande Rainha das Meninas espera...`, [['⚔ Enfrentar a Rainha ▶', () => startLevel(4)], ['Menu', menu]]);
}
function hurt(pit) {
  if (P.inv > 0 && !pit) return;
  lives--; S.hurt(); burst(P.x + 15, P.y + 20, '#ff4d6d', 12);
  if (lives <= 0) {
    state = 'over';
    const again = lv === 4 ? ['⚔ Revanche! (mantém sua arma)', () => { lives = 3; startLevel(lv); }] : ['Tentar de novo', () => newGame(lv)];
    show(lv === 4 ? '💔 A Rainha venceu desta vez!' : '💔 Game Over', `Você fez ${score} pontos e juntou ${coins} moedas.`, [again, ['Menu', menu]]); return;
  }
  if (pit) { P.x = P.chk; P.y = 300; P.vx = P.vy = 0; } else { P.vy = -8; P.vx = -P.dir * 6; }
  P.inv = 120;
}
function burst(x, y, c, n) { for (let i = 0; i < n; i++) pts.push({ x, y, vx: (Math.random() - .5) * 6, vy: -Math.random() * 5, l: 30, c }); }

// ---------- Fase final: arena da Grande Rainha ----------
function buildBoss() {
  const o = { c: { name: 'Trono da Grande Rainha' }, ground: [{ x: 0, y: GY, w: 1500, g: 1 }], plats: [], en: [], coins: [], ar: [], hearts: [{ x: 430, y: GY - 70, got: 0 }], len: 1500, goal: 9e5, got: 0 };
  B = { x: 1120, hp: 14, max: 14, inv: 0, st: 0, tp: 300, wd: 0, dir: -1, sum: 420, dead: 0 };
  return o;
}
function bossTick() {
  if (B.dead) return;
  if (B.inv > 0) B.inv--;
  const dx = P.x + P.w / 2 - B.x, ad = Math.abs(dx), dir = dx > 0 ? 1 : -1;
  B.dir = dir;
  if (B.st === 0) { // marcha em direção ao herói
    B.x = Math.max(70, Math.min(L.len - 70, B.x + dir * 1.7));
    if (B.tp > 0) B.tp--;
    else {
      if (ad < 95) { B.st = 1; B.wd = 36; snd(230, .25, 'sawtooth', 90); }
      else { B.st = 2; B.wd = 34; snd(320, .3, 'triangle', 120); }
      B.tp = 240 + Math.random() * 80;
    }
  } else if (B.st === 1) { // golpe de cetro
    B.wd--;
    if (B.wd === 14) {
      shake = 10;
      if (ad < 108 && P.y + P.h > GY - 64) hurt();
    }
    if (B.wd <= 0) B.st = 0;
  } else { // vassoura encantada: 3 orbes em alturas diferentes
    B.wd--;
    if (B.wd === 18) {
      for (const y of [GY - 38, GY - 70, GY - 22]) L.ar.push({ x: B.x + dir * 18, y, vx: dir * 4.6, vy: 0, t: 170, orb: 1 });
      snd(640, .2, 'square', 210);
    }
    if (B.wd <= 0) B.st = 0;
  }
  B.sum--;
  if (B.sum <= 0 && L.en.length < 2) { // invoca arqueiras leais
    B.sum = 460;
    const cx = B.x + (Math.random() * 220 - 110);
    L.en.push({ x: cx, cx, r: 120, v: (Math.random() < .5 ? 1 : -1) * 2, dead: 0, cd: 46, wind: 0, aim: -1, ph: Math.random() * PI * 2 });
    burst(cx, GY - 30, '#c77dff', 10); snd(520, .2, 'square', 260);
  }
}
function hitBoss(d) {
  if (B.inv > 0 || B.dead) return;
  B.hp -= d; B.inv = 18; shake = 8;
  burst(B.x - 20 + Math.random() * 40, GY - 50 - Math.random() * 40, '#ffd6ff', 9);
  snd(170, .18, 'sawtooth', 70);
  if (B.hp <= 0) {
    B.dead = 1; L.ar.length = 0; score += 1500 + lives * 100; S.win(); shake = 14;
    for (let i = 0; i < 3; i++) setTimeout(() => { for (let k = 0; k < 3; k++) burst(B.x - 60 + Math.random() * 120, GY - 20 - Math.random() * 100, ['#ff4d6d', '#ffd23f', '#4cc9f0', '#c77dff'][Math.floor(Math.random() * 4)], 2); }, i * 260);
    setTimeout(() => {
      state = 'win';
      show('👑🏆 A Grande Rainha foi derrotada!', `O castelo está livre e o Miguel venceu!<br>⭐ Pontos: ${score} &nbsp; 🪙 Moedas: ${coins} &nbsp; ❤️ Vidas restantes: ${lives}`, [['Jogar de novo', () => newGame(0)], ['Menu', menu]]);
    }, 950);
  }
}

// ---------- Física e regras ----------
function update() {
  t++;
  L.plats.forEach(p => {
    if (p.ax || p.ay) { const nx = p.bx + p.ax * Math.sin(t * p.sp), ny = p.by + p.ay * Math.sin(t * p.sp); p.dx = nx - p.x; p.dy = ny - p.y; p.x = nx; p.y = ny; }
  });
  const tg = (K.r - K.l) * 4.4;
  if (lv === 4) { // arma da Forja: ataque com X
    if (K.x && P.at <= 0) {
      P.at = weapon.cd; P.swing = 10;
      if (weapon.proj) { L.ar.push({ x: P.x + P.w / 2 + P.dir * 12, y: P.y + 22, vx: P.dir * 8, vy: 0, t: 110, mine: 1 }); snd(1500, .1, 'triangle', 800); }
      else {
        if (!B.dead && Math.abs(B.x - (P.x + P.w / 2)) < weapon.range + 14 && P.y + P.h > GY - 125) hitBoss(weapon.dmg);
        snd(500, .08, 'square', 220);
      }
    }
    if (P.at > 0) P.at--; if (P.swing > 0) P.swing--;
  }
  const acc = P.on ? .27 : .17;              // controle mais-direto-que-o-mar
  P.vx += (tg - P.vx) * acc;
  if (!tg && Math.abs(P.vx) < .04) P.vx = 0;  // parada firme, sem tremor
  if (tg) P.dir = tg > 0 ? 1 : -1;
  if (P.ride) P.x += P.ride.dx;
  P.x = Math.max(0, Math.min(L.len - P.w, P.x + P.vx));
  // Pulo com coyote time (vale logo após a borda) e buffer (apertou um tiquinho antes no chão? pula do mesmo jeito)
  if (K.j && !P.jh) P.jb = 14; else if (P.jb > 0) P.jb--;
  P.jh = !!K.j;
  if (P.on) P.cy = 9; else if (P.cy > 0) P.cy--;
  if (P.jb > 0 && P.cy > 0) {
    P.vy = -13.8; P.jb = 0; P.cy = 0; P.on = false; S.jump();
    burst(P.x + P.w / 2, P.y + P.h - 2, '#d9b48f', 4); // poeirinha da decolagem
  }
  if (!K.j && P.vy < -6) P.vy = -6; // soltar = pulo curtinho (corte macio)
  const pb = P.y + P.h;
  const gv = P.vy < -1.5 ? .52 : P.vy > 2.5 ? .74 : .58; // gravidade: fluta no topo, despenca na queda
  P.vy = Math.min(P.vy + gv, 15); const vyB = P.vy; P.y += P.vy; P.on = false; P.ride = null;
  for (const s of L.ground.concat(L.plats)) {
    if (P.vy >= 0 && P.x + P.w > s.x + 3 && P.x < s.x + s.w - 3 && pb <= s.y + 10 && P.y + P.h >= s.y) {
      P.y = s.y - P.h; P.vy = 0; P.on = true;
      if (s.g) P.chk = Math.max(80, s.x + 40); else P.ride = s;
    }
  }
  if (P.on) {
    P.ph += Math.abs(P.vx) * .12;
    if (!P.wasOn && vyB > 7) { // aterrissagem: fumaça + squash
      P.ls = 14; burst(P.x + P.w / 2, P.y + P.h - 3, '#d9b48f', 6);
    }
    if (Math.abs(P.vx) > 3 && t % 8 === 0) pts.push({ x: P.x + P.w / 2 - P.dir * 9, y: P.y + P.h - 2, vx: -P.dir * (1 + Math.random()), vy: -Math.random() * .9, l: 13, c: '#cbb594' }); // poeirinha de corrida
  }
  P.wasOn = P.on; if (P.ls > 0) P.ls--;
  for (const e of L.en) {
    if (e.dead) { e.dead++; continue; }
    if (e.wind > 0) { // carregando o arco (pára de andar)
      e.wind--;
      if (e.wind === 0) { L.ar.push({ x: e.x + e.aim * 10, y: GY - 38, vx: e.aim * 4.6, vy: 0, t: 200 }); S.shoot(); }
    } else {
      if (e.cd > 0) e.cd--;
      if (e.cd <= 0 && Math.abs(P.x - e.x) < 340 && Math.abs(P.y + P.h - GY) < 70) { // pode acertar
        e.wind = 26; e.aim = P.x + 15 > e.x ? 1 : -1; e.cd = 150 + Math.random() * 80; S.nock();
      } else { e.x += e.v; e.ph += Math.abs(e.v) * .09; if (Math.abs(e.x - e.cx) > e.r) e.v = -e.v; }
    }
    if (P.x + P.w > e.x - 13 && P.x < e.x + 13 && P.y + P.h > GY - 42 && P.y < GY) {
      if (P.vy > 0 && pb <= GY - 42 + 16) { e.dead = 1; e.wind = 0; P.vy = -9.5; score += 100; S.stomp(); burst(e.x, GY - 25, '#ffd23f', 10); }
      else hurt();
    }
  }
  L.en = L.en.filter(e => e.dead < 14);
  for (const a of L.ar) { // voo das flechas e orbes
    a.x += a.vx; a.y += a.vy; a.t--;
    if (a.mine) { // tiro do jogador no boss
      if (!B.dead && Math.abs(a.x - B.x) < 54 && Math.abs(a.y - (GY - 58)) < 70) { a.t = 0; hitBoss(weapon.dmg); }
      continue;
    }
    if (P.inv <= 0 && a.y > P.y + 5 && a.y < P.y + P.h - 5 && Math.abs(a.x - (P.x + P.w / 2)) < 15) { a.t = 0; hurt(); }
  }
  L.ar = L.ar.filter(a => a.t > 0 && a.x > -30 && a.x < L.len + 30);
  if (lv === 4) bossTick();
  for (const k of L.coins) {
    if (!k.got && Math.hypot(P.x + P.w / 2 - k.x, P.y + P.h / 2 - k.y) < 28) {
      k.got = 1; L.got++; coins++; score += 10; S.coin(); burst(k.x, k.y, '#ffe14d', 6);
      if (coins % 30 === 0) { lives = Math.min(5, lives + 1); S.win(); }
    }
  }
  for (const h of L.hearts) { // corações curativos: 1 vida (não vira quando está cheio)
    if (h.got || lives >= 5) continue;
    if (Math.hypot(P.x + P.w / 2 - h.x, P.y + P.h / 2 - h.y) < 30) {
      h.got = 1; lives = Math.min(5, lives + 1); score += 50; S.heart();
      burst(h.x, h.y, '#ff8fc0', 10);
    }
  }
  if (P.inv > 0) P.inv--;
  if (P.y > H + 60) hurt(1);
  if (state === 'play' && P.x > L.goal) clearLvl();
}

// ---------- Desenho: utilidades ----------
const m3 = i => ((i % 3) + 3) % 3;
function circ(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function ell(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); }
function rr(x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function layer(f, pw, fn) { const o = -(cam * f) % pw; for (let x = o - pw; x < W + pw; x += pw) fn(x, Math.round((x + cam * f) / pw)); }
function cloud(x, y, s, c = '#fff') { circ(x, y, 24 * s, c); circ(x + 26 * s, y - 10 * s, 30 * s, c); circ(x + 56 * s, y, 24 * s, c); rr(x - 20 * s, y, 98 * s, 24 * s, 12 * s, c); }
function tri(x, y, w, h, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y - h); ctx.lineTo(x + w, y); ctx.fill(); }

// ---------- Cenários (cada fase com visual próprio) ----------
function bg() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (lv === 0) {
    g.addColorStop(0, '#4db8ff'); g.addColorStop(1, '#dff6ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    circ(820, 90, 62, 'rgba(255,240,150,.4)'); circ(820, 90, 42, '#fff3a0');
    layer(.1, 420, (x, i) => cloud(x + 40, 80 + (i & 1) * 70, 1 + m3(i) * .25));
    layer(.2, 560, x => { tri(x, GY, 460, 300, '#7fb3de'); tri(x + 220, GY, 360, 220, '#9cc7e8'); tri(x + 70, GY - 255, 80, 45, '#fff'); });
    layer(.4, 300, (x, i) => { circ(x + 100, GY + 30, 120, '#79d36a'); circ(x + 230, GY + 50, 90, '#66c25a'); });
    layer(.7, 230, (x, i) => { const s = 1 + m3(i) * .15; rr(x + 50, GY - 70 * s, 16, 70 * s, 4, '#8b5a2b'); circ(x + 58, GY - 85 * s, 38 * s, '#2fa84f'); circ(x + 36, GY - 65 * s, 26 * s, '#3cc05e'); circ(x + 82, GY - 65 * s, 26 * s, '#3cc05e'); });
  } else if (lv === 1) {
    g.addColorStop(0, '#ff8fd0'); g.addColorStop(1, '#c7a3ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    layer(.1, 400, (x, i) => cloud(x + 30, 70 + (i & 1) * 80, 1.1, 'rgba(255,255,255,.75)'));
    layer(.3, 380, (x, i) => { // pirulitos gigantes
      rr(x + 96, GY - 230, 8, 230, 3, '#fff'); const a = i & 1 ? ['#b46cff', '#fff'] : ['#ff4f9a', '#fff'];
      for (let r = 60, k = 0; r > 4; r -= 9, k++) circ(x + 100, GY - 250, r, a[k & 1]);
    });
    layer(.55, 300, (x, i) => { // árvores de doces
      for (let k = 0; k < 6; k++) rr(x + 112, GY - 100 + k * 17, 16, 17, 2, k & 1 ? '#fff' : '#ff6fb0');
      circ(x + 120, GY - 135, 40, '#ff93c9'); circ(x + 88, GY - 108, 28, '#c19bff'); circ(x + 152, GY - 108, 28, '#7fe4ff');
      for (let k = 0; k < 6; k++) circ(x + 100 + k * 9, GY - 130 + (k % 3) * 12, 2.5, '#fff');
    });
    for (let k = 0; k < 18; k++) { const sx = (k * 173 + 40) % W, sy = (k * 91) % 300 + 20, a = (Math.sin(t * .06 + k) + 1) / 2; ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(sx - 1, sy - 5, 2, 10); ctx.fillRect(sx - 5, sy - 1, 10, 2); }
  } else if (lv === 2) {
    g.addColorStop(0, '#12062b'); g.addColorStop(1, '#6a2f9a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 50; k++) { const a = .4 + Math.abs(Math.sin(t * .03 + k)) * .6; ctx.fillStyle = `rgba(255,255,230,${a})`; ctx.fillRect((k * 131) % W, (k * 53) % 300, 2, 2); }
    circ(780, 100, 48, '#fff6c8'); circ(798, 90, 44, '#2a1055'); circ(780, 100, 48, 'rgba(255,246,200,.0)');
    layer(.25, 900, x => { // castelo ao fundo
      const c = '#2a1252'; ctx.fillStyle = c; ctx.fillRect(x + 250, 240, 260, 230); ctx.fillRect(x + 200, 180, 60, 290); ctx.fillRect(x + 500, 180, 60, 290); ctx.fillRect(x + 340, 150, 80, 100);
      for (let k = 0; k < 5; k++) { ctx.fillRect(x + 200 + k * 12, 168, 8, 14); ctx.fillRect(x + 500 + k * 12, 168, 8, 14); }
      tri(x + 195, 180, 70, 70, '#3d1a73'); tri(x + 495, 180, 70, 70, '#3d1a73'); tri(x + 335, 150, 90, 70, '#3d1a73');
      ctx.fillStyle = '#ffd45c'; [[225, 215], [525, 215], [372, 185], [300, 290], [440, 290]].forEach(([a, b]) => ctx.fillRect(x + a, b, 10, 18));
    });
    layer(.5, 320, (x, i) => { // colunas com tochas
      rr(x + 140, GY - 190, 30, 190, 4, '#3b2166'); rr(x + 132, GY - 200, 46, 14, 4, '#4d2c87');
      const f = 10 + Math.sin(t * .3 + i) * 3; ell(x + 155, GY - 220, f * .8, f * 1.5, '#ff8a1f'); ell(x + 155, GY - 218, f * .4, f, '#ffe066');
    });
  } else if (lv === 3) {
    // ---- Salão do Castelo: vitrais, colunas de mármore e estandartes ----
    g.addColorStop(0, '#1d0e33'); g.addColorStop(1, '#452366'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    layer(.15, 760, (x, i) => { // janela em arco com vitral + feixe de luz
      const wx = x + 110, wy = 46, ww = 116, wh = 218;
      ctx.fillStyle = 'rgba(255,214,140,.09)'; // feixe de luz do vitral
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.lineTo(wx + ww + 200, GY); ctx.lineTo(wx - 140, GY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b1c4a'; ctx.beginPath();
      ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + 38); ctx.arc(wx + ww / 2, wy + 38, ww / 2, PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.closePath(); ctx.fill();
      ctx.save(); // vitral: vidros coloridos recortados no arco
      ctx.clip();
      const cols = ['#ff77b0', '#8b5cf6', '#fbbf24', '#38bdf8'];
      for (let s = 0; s < 4; s++) { ctx.globalAlpha = .6; ctx.fillStyle = cols[s]; ctx.fillRect(wx + s * ww / 4, wy, ww / 4, wh + 6); }
      ctx.globalAlpha = .85; circ(wx + ww / 2, wy + 38, ww / 2 - 4, '#ffd76b'); ctx.globalAlpha = .5;
      circ(wx + ww / 2, wy + 38, (ww / 2 - 4) * .5, '#fff1c0');
      ctx.globalAlpha = 1; ctx.restore();
      ctx.strokeStyle = '#17102c'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + 38); ctx.arc(wx + ww / 2, wy + 38, ww / 2, PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.stroke();
      for (let s = 1; s < 4; s++) { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(wx + s * ww / 4, wy + 10); ctx.lineTo(wx + s * ww / 4, wy + wh); ctx.stroke(); }
      ctx.strokeStyle = '#4d3b78'; ctx.lineWidth = 6; ctx.strokeRect(wx - 8, wy + wh, ww + 16, 14); // peitoril
    });
    layer(.55, 340, (x, i) => { // colunas de mármore + estandartes + castiçais
      const cxx = x + 60;
      rr(cxx - 24, GY - 316, 48, 16, 5, '#8a6fb5'); // capitel
      rr(cxx - 19, GY - 300, 38, 300, 4, '#6b548f');
      ctx.strokeStyle = 'rgba(40,26,70,.35)'; ctx.lineWidth = 2;
      for (const fz of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cxx + fz, GY - 296); ctx.lineTo(cxx + fz, GY - 12); ctx.stroke(); }
      rr(cxx - 28, GY - 14, 56, 14, 4, '#573f7e'); // base
      // estandarte vermelho com ponta dourada
      const bx = x + 210;
      ctx.fillStyle = '#b62b45'; ctx.beginPath();
      ctx.moveTo(bx, 72); ctx.lineTo(bx + 58, 72); ctx.lineTo(bx + 58, 196); ctx.lineTo(bx + 29, 172); ctx.lineTo(bx, 196); ctx.closePath(); ctx.fill();
      rr(bx - 4, 64, 66, 10, 4, '#d7b04a');
      ctx.strokeStyle = '#ffd76b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx + 4, 96); ctx.lineTo(bx + 54, 96); ctx.stroke();
      circ(bx + 29, 124, 10, '#ffd23f'); tri(bx + 21, 124, 16, 12, '#fff'); tri(bx + 29 - 4, 121, 8, 9, '#b62b45');
      // castiçal dourado com 3 chamas
      rr(x + 150, GY - 44, 5, 44, 2, '#d7b04a'); rr(x + 132, GY - 46, 42, 5, 2, '#c9a227');
      for (let f = 0; f < 3; f++) { const fx = x + 140 + f * 14, fs = 5 + Math.sin(t * .25 + i * 2 + f) * 1.6; ell(fx, GY - 55, fs * .7, fs * 1.4, '#ff9a3d'); ell(fx, GY - 53, fs * .35, fs, '#ffe066'); }
    });
  } else {
    // ---- Sala do Trono: painéis, retratos, lustres, pétalas ----
    g.addColorStop(0, '#2b0e30'); g.addColorStop(.65, '#4d1a37'); g.addColorStop(1, '#6d2340'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .07; // papel de parede: losangos dourados
    for (let dx = (-(cam * .12) % 56) - 56; dx < W + 56; dx += 56) for (let dy = 26; dy < GY - 60; dy += 62) {
      ctx.strokeStyle = '#ffd76b'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dx, dy + 16); ctx.lineTo(dx + 14, dy); ctx.lineTo(dx + 28, dy + 16); ctx.lineTo(dx + 14, dy + 32); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    layer(.08, 560, (x, i) => { // lustres de cristal pendurados
      const lx = x + 190, ly = -6 + Math.sin(t * .02 + i) * 3;
      ctx.strokeStyle = '#d7b04a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 54); ctx.stroke();
      ell(lx, ly + 66, 62, 10, '#c9a227'); circ(lx, ly + 60, 9, '#e8d48a');
      for (let c = 0; c < 5; c++) { const cxp = lx - 54 + c * 27, fl = 5 + Math.sin(t * .22 + c * 1.8 + i) * 1.5; ell(cxp, ly + 56, fl * .7, fl * 1.3, '#ff9a3d'); ell(cxp, ly + 54, fl * .35, fl, '#ffe9a8'); }
      for (let c = 0; c < 9; c++) { ctx.globalAlpha = .5 + Math.sin(t * .18 + c) * .4; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(lx - 50 + c * 12, ly + 72 + Math.abs(Math.sin(c * 2.2)) * 12, 3, 8 + (c % 3) * 3); }
      ctx.globalAlpha = 1;
    });
    layer(.25, 680, (x) => { // pilastras douradas + retratos ovais
      const pxx = x + 90;
      rr(pxx - 15, GY - 330, 30, 330, 8, '#7c5a26'); rr(pxx - 22, GY - 342, 44, 18, 6, '#c9a227');
      ctx.strokeStyle = 'rgba(255,224,130,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pxx - 5, GY - 326); ctx.lineTo(pxx - 5, GY - 10); ctx.stroke();
      const rx = x + 400, ry = 150; // retrato da precedente da dinastia
      ell(rx, ry, 52, 66, '#241028');
      ctx.strokeStyle = '#d7b04a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(rx, ry, 52, 66, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = '#e8cfd6'; ell(rx, ry + 22, 20, 16, '#e8cfd6'); // busto
      circ(rx, ry + 2, 13, '#f5e3e8'); ctx.fillStyle = '#5a2436'; tri(rx - 14, ry - 2, 28, 16, '#5a2436');
      circ(rx - 5, ry + 4, 2, '#2a1520'); circ(rx + 5, ry + 4, 2, '#2a1520');
      tri(rx - 7, ry - 16, 14, 8, '#ffd23f'); // mini coroa no retrato
      rr(x + 356, ry + 70, 88, 12, 3, '#c9a227'); //placa dourada
    });
    for (let i = 0; i < 16; i++) { // pétalas de rosa caindo
      const sp = (t * .55 + i * 71) % (H + 40), px = ((i * 167 + 30) % W) + Math.sin(t * .03 + i) * 26;
      ctx.globalAlpha = .8; ell(px, sp - 20, 4.4, 2.8, ['#ffb7c5', '#ffd6e8', '#f9a8d4'][i % 3]);
    }
    ctx.globalAlpha = 1;
    // cortinas reais nas bordas da cena
    for (const side of [0, 1]) {
      ctx.save(); if (side) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.fillStyle = '#8e1c3a';
      ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(74, 130, 26, 250); ctx.quadraticCurveTo(78, 380, 40, H + 8); ctx.lineTo(-8, H + 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d7b04a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.quadraticCurveTo(62, 130, 18, 250); ctx.quadraticCurveTo(70, 380, 34, H + 8); ctx.stroke();
      ctx.fillStyle = '#c9a227'; for (let fr = 0; fr < 6; fr++) circ(44 + Math.sin(fr * 2.4) * 18, 346 + fr * 34, 3.4, '#c9a227');
      ctx.restore();
    }
  }
}
function gnd(x, w) {
  if (lv === 0) {
    rr(x, GY, w, H - GY, 0, '#8b5a2b'); ctx.fillStyle = '#6d4520'; for (let i = 40; i < w; i += 90) { ell(x + i, GY + 50, 12, 6, '#6d4520'); }
    rr(x, GY, w, 16, 0, '#4cc04a'); ctx.fillStyle = '#3aa23a'; for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.arc(x + i + 10, GY + 16, 10, 0, PI); ctx.fill(); }
    for (let i = 50; i < w; i += 130) { rr(x + i, GY - 12, 3, 12, 1, '#2f8f35'); circ(x + i + 1, GY - 14, 5, i % 260 ? '#ff6b9d' : '#ffe14d'); circ(x + i + 1, GY - 14, 2, '#fff'); }
  } else if (lv === 1) {
    rr(x, GY, w, H - GY, 0, '#7a3f2a'); rr(x, GY, w, 26, 0, '#ff8cc6');
    ctx.fillStyle = '#fff'; for (let i = 0; i < w; i += 36) { ctx.beginPath(); ctx.roundRect(x + i + 4, GY + 14, 20, 20 + (i % 3) * 8, 10); ctx.fill(); }
    for (let i = 30; i < w; i += 70) circ(x + i, GY + 70 + (i % 3) * 10, 6, ['#ffd23f', '#7fe4ff', '#c19bff'][m3(i / 70)]);
  } else if (lv === 2) {
    rr(x, GY, w, H - GY, 0, '#5d5a7a'); ctx.strokeStyle = '#3f3b5c'; ctx.lineWidth = 2;
    for (let r = 0; r < 4; r++) for (let i = (r & 1) * 30; i < w; i += 60) ctx.strokeRect(x + i, GY + r * 20, 60, 20);
    rr(x, GY, w, 8, 0, '#8a85b0');
  } else if (lv === 3) {
    // piso do salão + tapete vermelho com bordas douradas
    rr(x, GY, w, H - GY, 0, '#5d4a8d'); ctx.strokeStyle = 'rgba(30,18,60,.5)'; ctx.lineWidth = 2;
    for (let r = 0; r < 4; r++) for (let i = (r & 1) * 40; i < w; i += 80) ctx.strokeRect(x + i, GY + r * 20, 80, 20);
    rr(x, GY, w, 7, 0, '#8f7ac2');
    ctx.fillStyle = '#a8263d'; ctx.fillRect(x, GY + 8, w, 13);
    ctx.fillStyle = '#ffd76b'; ctx.fillRect(x, GY + 8, w, 2.5); ctx.fillRect(x, GY + 18.5, w, 2.5);
  } else {
    // mármore claro polido + tapete de vinho com losangos ouro
    const mg = ctx.createLinearGradient(0, GY, 0, H); mg.addColorStop(0, '#e9def4'); mg.addColorStop(1, '#b3a2c9');
    rr(x, GY, w, H - GY, 0, mg);
    ctx.strokeStyle = 'rgba(120,96,150,.4)'; ctx.lineWidth = 1.5;
    for (let r = 0; r < 3; r++) for (let i = (r & 1) * 46; i < w; i += 92) ctx.strokeRect(x + i, GY + 18 + r * 22, 92, 22);
    ctx.strokeStyle = 'rgba(120,96,150,.25)';
    for (let i = 0; i < w; i += 60) { ctx.beginPath(); ctx.moveTo(x + i + 10, GY + 22 + (i % 3) * 26); ctx.lineTo(x + i + 46, GY + 42 + (i % 2) * 18); ctx.lineTo(x + i + 52, GY + 64); ctx.stroke(); }
    rr(x, GY, w, 6, 0, '#f6effc');
    ctx.fillStyle = '#7a1f3d'; ctx.fillRect(x, GY + 7, w, 16);
    ctx.fillStyle = '#ffd76b'; ctx.fillRect(x, GY + 7, w, 2.5); ctx.fillRect(x, GY + 20.5, w, 2.5);
    for (let i = 14; i < w - 12; i += 30) { // losangos do tapete
      ctx.fillStyle = '#ffd76b'; ctx.beginPath();
      ctx.moveTo(x + i, GY + 15); ctx.lineTo(x + i + 7, GY + 15.5); ctx.lineTo(x + i + 7, GY + 20.5); ctx.lineTo(x + i, GY + 21); ctx.closePath(); ctx.fill();
    }
  }
}
function plat(p) {
  ctx.save(); ctx.translate(p.x, p.y);
  if (lv === 0) { rr(0, 0, p.w, p.h + 6, 6, '#a0652d'); rr(0, -4, p.w, 11, 5, '#4cc04a'); }
  else if (lv === 1) { rr(0, 0, p.w, p.h, 8, '#ff7ab8'); ctx.fillStyle = '#fff'; for (let i = 6; i < p.w - 6; i += 18) ctx.fillRect(i, 3, 7, p.h - 6); rr(0, -3, p.w, 7, 4, '#fff5fb'); }
  else if (lv === 2) {
    rr(0, 0, p.w, p.h, 4, '#6d6a8f'); ctx.strokeStyle = '#4a4768'; ctx.strokeRect(0, 0, p.w, p.h); ctx.beginPath(); ctx.moveTo(p.w / 2, 0); ctx.lineTo(p.w / 2, p.h); ctx.stroke();
    if (p.ax || p.ay) { ctx.shadowColor = '#b86bff'; ctx.shadowBlur = 16; rr(0, p.h - 4, p.w, 4, 2, '#c58bff'); }
  } else if (lv === 3) {
    rr(0, 0, p.w, p.h, 5, '#6b548f'); rr(0, -4, p.w, 9, 4, '#9a85c2'); ctx.strokeStyle = 'rgba(40,26,70,.45)'; ctx.strokeRect(.5, .5, p.w - 1, p.h - 1);
    if (p.ax || p.ay) { ctx.shadowColor = '#b86bff'; ctx.shadowBlur = 16; rr(0, p.h - 4, p.w, 4, 2, '#c58bff'); ctx.shadowBlur = 0; }
  } else {
    rr(0, 0, p.w, p.h, 5, '#cbb9dd'); rr(0, -3, p.w, 8, 3, '#efe7f7'); ctx.strokeStyle = 'rgba(110,84,146,.5)'; ctx.strokeRect(.5, .5, p.w - 1, p.h - 1);
    if (p.ax || p.ay) { ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 16; rr(0, p.h - 4, p.w, 4, 2, '#ffd76b'); ctx.shadowBlur = 0; }
  }
  ctx.restore();
}
function goal() {
  const x = L.goal;
  if (lv >= 4) return;
  if (lv < 2) {
    // ---- Portal mágico ----
    const cx = x + 42, cy = GY - 92;
    const pul = 1 + Math.sin(t * .07) * .07, rot = t * .05;
    rr(x + 8, GY - 12, 68, 12, 5, 'rgba(90,55,140,.9)'); // pedestal de pedra
    ctx.save(); ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 28 + Math.sin(t * .1) * 8;
    ctx.strokeStyle = '#8a3cff'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.ellipse(cx, cy, 46 * pul, 78 * pul, 0, 0, 7); ctx.stroke();
    ctx.restore();
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 46 * pul);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#9d5cff'); g.addColorStop(.72, '#5b21b6'); g.addColorStop(1, 'rgba(30,10,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, 44 * pul, 76 * pul, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 2; k++) { // espirais girando
      ctx.strokeStyle = k ? 'rgba(64,224,255,.85)' : 'rgba(190,120,255,.85)';
      ctx.lineWidth = 4; ctx.beginPath();
      for (let a = 0, r; a < PI * 3.2; a += .18) {
        r = (a / (PI * 3.2)) * 40 * pul;
        ctx.lineTo(cx + Math.cos(a + rot + k * PI) * r, cy + Math.sin(a + rot + k * PI) * r * 1.6);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) { // faíscas orbitando
      const a = rot * 1.6 + i * PI * 2 / 9;
      ctx.globalAlpha = .55 + Math.sin(t * .2 + i) * .35;
      circ(cx + Math.cos(a) * 52 * pul, cy + Math.sin(a) * 52 * 1.55 * pul, i & 1 ? 2.6 : 3.8, i & 1 ? '#7ef9ff' : '#c084fc');
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 12; ctx.fillStyle = '#fff';
    ctx.fillText('PORTAL', cx, cy - 88); ctx.shadowBlur = 0; ctx.textAlign = 'left';
  } else if (lv === 3) {
    // ---- Forja Real: altar com a arma ----
    const cy = GY - 58, pul = 1 + Math.sin(t * .06) * .08;
    rr(x + 6, GY - 26, 94, 26, 6, '#4a3f66'); rr(x + 14, GY - 36, 78, 12, 4, '#5b4f7d');
    ctx.save(); ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 22 + Math.sin(t * .1) * 6;
    ctx.translate(x + 53, cy); ctx.rotate(Math.sin(t * .02) * .12); ctx.scale(pul, pul);
    ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, -28); ctx.stroke(); // lâmina
    ctx.strokeStyle = '#e0b13f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.stroke(); // guarda
    circ(0, 4, 3.6, '#fffbf0'); // pomo
    ctx.restore();
    for (let i = 0; i < 5; i++) { // faíscas na forja
      ctx.globalAlpha = .55 + Math.sin(t * .15 + i * 2) * .4;
      circ(x + 53 + Math.cos(t * .04 + i * 2.1) * 44, cy - 8 + Math.sin(t * .05 + i * 1.7) * 32, 2.4, '#fff7cf');
    }
    ctx.globalAlpha = 1;
  } else {
    rr(x - 20, GY - 170, 130, 170, 0, '#3b2a66'); for (let k = 0; k < 5; k++) rr(x - 20 + k * 28, GY - 184, 18, 16, 0, '#3b2a66');
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(x + 10, GY); ctx.lineTo(x + 10, GY - 80); ctx.arc(x + 45, GY - 80, 35, PI, 0); ctx.lineTo(x + 80, GY); ctx.fill();
    circ(x + 45, GY - 40, 4 + Math.sin(t * .1), '#fff3b0');
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
  if (lv === 2) ctx.fillText('SAÍDA', x + 45, GY - 205);
  if (lv === 3) ctx.fillText('FORJA', x + 53, GY - 112);
  ctx.textAlign = 'left';
}

// ---------- Personagens ----------
function boy() {
  if (P.inv > 0 && ((t >> 2) & 1)) return;
  const img = SPR.boy;
  if (!img.complete || !img.width) return;
  const mv = Math.abs(P.vx) > .6, bob = P.on && mv ? Math.abs(Math.sin(P.ph)) * 3 : 0;
  // animação: estica no pulo, esmaga ao cair e logo após aterrissar; inclina correndo / no pulo
  let st = !P.on ? Math.max(.82, Math.min(1.18, 1 - P.vy * .013)) : 1;
  if (P.ls > 4) st *= .84; // squash da aterrissagem
  let rock = 0;
  if (P.on && mv) rock = Math.sin(P.ph) * .09;                 // balanceio da corrida
  else if (!P.on) rock = Math.max(-.14, Math.min(.14, -P.vy * .011)); // leve mergulho/backflip
  const h = 52, w = h * img.width / img.height / st;
  ctx.save();
  ctx.translate(P.x + P.w / 2, P.y + P.h - bob);
  ctx.rotate(rock);
  ctx.scale(P.dir / st, st);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}
function doll(e) {
  const img = SPR.guerreira;
  if (!img.complete || !img.width) return;
  const sq = e.dead ? Math.max(.15, 1 - e.dead / 9) : 1;
  const h = 58, w = h * img.width / img.height / sq;
  const hop = e.dead ? 0 : Math.abs(Math.sin(e.ph)) * Math.min(3, Math.abs(e.v) * 2); // passinho suave de marcha
  const rock = e.dead ? 0 : Math.sin(e.ph * .5) * .05;  // leve balanço do corpo
  ctx.save();
  ctx.translate(e.x, GY - hop);
  ctx.rotate(rock);
  ctx.scale(e.v > 0 ? -1 / sq : 1 / sq, sq); // sprite nativo olha p/ a esquerda; achata ao morrer
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  if (!e.dead && e.wind > 0) { // engatilhando a flecha (telegraph)
    const pull = 1 - e.wind / 26;
    ctx.strokeStyle = '#5d3d1a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(e.x + e.aim * 2, GY - 38); ctx.lineTo(e.x + e.aim * (8 + pull * 19), GY - 38); ctx.stroke();
    circ(e.x + e.aim * (8 + pull * 19), GY - 38, 2.4, '#b7bec7');
    if (e.wind < 14) { circ(e.x, GY - 80, 9, '#ffd23f'); ctx.fillStyle = '#222'; ctx.font = 'bold 14px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, GY - 75); ctx.textAlign = 'left'; }
  }
}

function queen() {
  const img = SPR.rainha.complete && SPR.rainha.width ? SPR.rainha : SPR.guerreira;
  if (!img.complete || !img.width) return;
  const h = 132, w = h * img.width / img.height;
  const blink = B.inv > 0 && ((t >> 2) & 1);
  const leap = B.st === 1 && B.wd < 20 ? Math.sin((20 - B.wd) / 18 * PI) * 10 : 0; // dá um salto no golpe
  const lean = B.st === 1 ? (B.wd > 22 ? -.12 : .16) : Math.sin(t * .12) * .045;
  ctx.save();
  ctx.translate(B.x, GY - leap + Math.sin(t * .3) * 1.5);
  ctx.rotate(lean);
  ctx.scale(B.dir > 0 ? -1 : 1, 1);
  if (blink) ctx.globalAlpha = .5; else { ctx.shadowColor = '#ff5da2'; ctx.shadowBlur = 20; }
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  if (blink) { ctx.globalAlpha = .3; circ(B.x, GY - h * .55, 40, '#fff'); ctx.globalAlpha = 1; } // flash do dano
  if (B.st === 1 && B.wd > 20) { // alerta do golpe
    circ(B.x, GY - h - 20, 10, '#ff4d6d');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', B.x, GY - h - 15); ctx.textAlign = 'left';
  }
}

function heart(h) {
  if (h.got) return;
  const bob = Math.sin(t * .07) * 3.5, s = 1 + Math.sin(t * .14) * .07;
  ctx.save();
  ctx.translate(h.x, h.y + bob); ctx.scale(s, s);
  ctx.shadowColor = '#ff5bb0'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#ff6b9d';
  ctx.beginPath(); ctx.arc(-6, -5, 7.5, 0, 7); ctx.arc(6, -5, 7.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-12.8, -2); ctx.lineTo(12.8, -2); ctx.lineTo(0, 14.5); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; circ(-7.5, -8, 2.2, 'rgba(255,255,255,.85)');
  ctx.restore();
}

// ---------- Capa de entrada ----------
function drawCover() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070312'); g.addColorStop(.55, '#241046'); g.addColorStop(1, '#5a2582');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) { const a = .3 + Math.abs(Math.sin(t * .02 + k * 2.7)) * .7; ctx.fillStyle = `rgba(255,255,235,${a})`; ctx.fillRect((k * 149) % W, (k * 83) % (H - 180), 2, 2); }
  // lua recortada
  circ(150, 110, 56, '#fff2c4'); circ(150, 110, 56, 'rgba(255,242,196,.22)'); circ(176, 92, 44, '#13092d');
  // castelo central
  ctx.fillStyle = '#221248';
  ctx.fillRect(250, 210, 460, 330);
  ctx.fillRect(216, 140, 78, 400); ctx.fillRect(666, 140, 78, 400);
  ctx.fillRect(442, 100, 76, 440);
  for (let k = 0; k < 6; k++) { ctx.fillRect(214 + k * 13, 128, 9, 12); ctx.fillRect(664 + k * 13, 128, 9, 12); ctx.fillRect(440 + k * 13, 88, 9, 12); }
  tri(202, 142, 106, 78, '#0f0722'); tri(652, 142, 106, 78, '#0f0722'); tri(426, 102, 108, 70, '#150a2c');
  // fornalha do portão + muralha
  ctx.fillStyle = '#241245'; ctx.fillRect(250, 360, 460, 180);
  const bg2 = ctx.createLinearGradient(0, 380, 0, 540); bg2.addColorStop(0, '#1a0c38'); bg2.addColorStop(1, '#0d0520'); ctx.fillStyle = bg2; ctx.fillRect(250, 380, 460, 160);
  // janelas douradas piscando
  [[295, 260], [420, 250], [545, 260], [330, 330], [560, 330], [465, 165]].forEach(([wx, wy], i) => {
    const a = .45 + Math.abs(Math.sin(t * .045 + i * 1.3)) * .55;
    ctx.fillStyle = `rgba(255,209,90,${a})`; ctx.fillRect(wx, wy, 13, 21);
    ctx.fillStyle = `rgba(255,209,90,${a * .3})`; ctx.fillRect(wx - 2, wy - 2, 17, 25);
  });
  // a Grande Rainha no balcão central
  const q = SPR.guerreira;
  if (q.complete && q.width) {
    const h = 84, w = h * q.width / q.height;
    ctx.save(); ctx.shadowColor = '#ff5da2'; ctx.shadowBlur = 16;
    ctx.drawImage(q, 466 - w / 2, 246 - h, w, h);
    ctx.restore();
    ctx.save(); ctx.translate(466, 246 - h + 6);
    tri(-13, 0, 10, 11, '#ffc93c'); tri(4.5, 0, 10, 11, '#ffc93c'); tri(-4, 0, 10, 16, '#ffd23f'); rr(-13, -2, 27, 4, 2, '#e0a612');
    ctx.restore();
  }
  // faíscas mágicas subindo
  for (let i = 0; i < 14; i++) {
    const sp = (t * .8 + i * 97) % (H + 60);
    ctx.globalAlpha = .45 + Math.sin(t * .1 + i) * .4;
    circ((i * 211 + 60) % W, H - sp, 2.2, i % 2 ? '#ffd76b' : '#c77dff');
  }
  ctx.globalAlpha = 1;
  // solo
  const fg = ctx.createLinearGradient(0, H - 34, 0, H); fg.addColorStop(0, '#1d0e3c'); fg.addColorStop(1, '#0a0418');
  ctx.fillStyle = fg; ctx.fillRect(0, H - 34, W, 34);
  // o menino destemido em primeiro plano
  const img = SPR.boy;
  if (img.complete && img.width) {
    const h = 300, w = h * img.width / img.height;
    ctx.save(); ctx.shadowColor = '#7a3cff'; ctx.shadowBlur = 34;
    ctx.drawImage(img, W - 320, H - 30 - h, w, h);
    ctx.restore();
  }
  // moldura dourada
  ctx.strokeStyle = '#d7b04a'; ctx.lineWidth = 7; ctx.strokeRect(13, 11, W - 26, H - 24);
  ctx.strokeStyle = 'rgba(255,240,180,.7)'; ctx.lineWidth = 2; ctx.strokeRect(21, 19, W - 42, H - 40);
  // brilhos nos cantos
  for (const [cxp, cyp] of [[16, 14], [W - 16, 14], [16, H - 14], [W - 16, H - 14]]) { circ(cxp, cyp, 5, '#ffe9a8'); circ(cxp, cyp, 2, '#fff'); }
}

// ---------- Cutscene: escadaria até a Sala do Trono ----------
const STAIR_STEPS = 16, STAIR_X0 = 300, STAIR_W = 19, STAIR_H = 13, STAIR_XE = STAIR_X0 + STAIR_STEPS * STAIR_W, STAIR_TOP = GY - STAIR_STEPS * STAIR_H;
function stairBoy() {
  const img = SPR.boy;
  if (!img.complete || !img.width) return;
  const p = stairT; let x, y, a = 1;
  if (p < 140) { const f = p / 140; x = 40 + f * 260; y = GY; }
  else { // sobe os degraus de verdade (o pé encosta no topo de cada degrau)
    const f = Math.min(1, (p - 140) / 250);
    x = STAIR_X0 + f * (STAIR_XE - STAIR_X0);
    const step = Math.min(STAIR_STEPS, Math.max(0, Math.ceil((x - STAIR_X0) / STAIR_W)));
    y = GY - step * STAIR_H;
  }
  if (p > 402) a = Math.max(0, 1 - (p - 402) / 28); // some na porta
  const h = 50, w = h * img.width / img.height;
  ctx.save(); ctx.globalAlpha = a;
  ctx.shadowColor = '#ffd76b'; ctx.shadowBlur = 14;
  ctx.drawImage(img, x - w / 2, y - h + (p % 24 < 12 ? 0 : 2), w, h); // passinhos
  ctx.restore();
}
function chan(cx, cy) { // lustre de cristal (cena da escadaria)
  ctx.strokeStyle = '#d7b04a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy); ctx.stroke();
  ell(cx, cy + 10, 44, 8, '#c9a227'); circ(cx, cy + 4, 7, '#e8d48a');
  for (let c = 0; c < 4; c++) { const fx = cx - 33 + c * 22, fl = 4 + Math.sin(t * .22 + c * 1.7) * 1.3; ell(fx, cy + 1, fl * .7, fl * 1.3, '#ff9a3d'); ell(fx, cy, fl * .35, fl, '#ffe9a8'); }
  for (let c = 0; c < 7; c++) { ctx.globalAlpha = .5 + Math.sin(t * .18 + c) * .35; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(cx - 36 + c * 11, cy + 14 + Math.abs(Math.sin(c * 2.1)) * 10, 3, 7 + (c % 3) * 3); }
  ctx.globalAlpha = 1;
}
function drawStairs() {
  // véu sonhador sobre o salão
  ctx.fillStyle = 'rgba(10,4,26,.68)'; ctx.fillRect(0, 0, W, H);
  // porta dourada ao topo
  const dw = 150, dh = 148, dx2 = STAIR_XE - 46, dy2 = STAIR_TOP - dh;
  const glow = Math.min(1, Math.max(0, (stairT - 260) / 140)); // a luz da porta cresce com a chegada
  ctx.fillStyle = '#5b451c'; ctx.beginPath();
  ctx.moveTo(dx2 - 10, dy2 + dh); ctx.lineTo(dx2 - 10, dy2 + 40); ctx.arc(dx2 + dw / 2, dy2 + 40, dw / 2 + 10, PI, 0); ctx.lineTo(dx2 + dw + 10, dy2 + dh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a6a2a';
  ctx.beginPath(); ctx.moveTo(dx2, dy2 + dh); ctx.lineTo(dx2, dy2 + 40); ctx.arc(dx2 + dw / 2, dy2 + 40, dw / 2, PI, 0); ctx.lineTo(dx2 + dw, dy2 + dh); ctx.closePath(); ctx.fill();
  // fresta de luz dourada entre as portas dobradiças
  ctx.save();
  ctx.globalAlpha = .35 + glow * .65; ctx.shadowColor = '#ffdf8a'; ctx.shadowBlur = 20 + glow * 26;
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(dx2 + dw / 2 - 4, dy2 + 26, 8, dh - 26);
  ctx.restore();
  // maçanetas
  circ(dx2 + dw / 2 - 13, dy2 + 92, 3.4, '#ffe9a8'); circ(dx2 + dw / 2 + 13, dy2 + 92, 3.4, '#ffe9a8');
  // placa SALA DO TRONO
  rr(dx2 + dw / 2 - 78, dy2 - 30, 156, 24, 6, '#c9a227');
  ctx.fillStyle = '#3d2408'; ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('SALA DO TRONO', dx2 + dw / 2, dy2 - 13); ctx.textAlign = 'left';

  // escadaria de mármore: degraus empilhados até o chão
  const CA = 428, CB = 502; // faixa do tapete (desce em linha reta pelo meio)
  for (let i = 0; i < STAIR_STEPS; i++) {
    const sx = STAIR_X0 + i * STAIR_W, ty = GY - STAIR_H * (i + 1), ww = STAIR_XE - sx;
    rr(sx, ty, ww, STAIR_H, 0, '#cfc3df');      // face do degrau
    rr(sx, ty, ww, 4, 0, '#efe8f8');            // piso claro
    const cl = Math.max(sx, CA), cr = Math.min(STAIR_XE, CB);
    if (cr > cl) { ctx.fillStyle = '#a8263d'; ctx.fillRect(cl, ty + 4, cr - cl, 3); ctx.fillStyle = '#ffd76b'; ctx.fillRect(cl, ty + 4, cr - cl, 1.2); }
    ctx.strokeStyle = 'rgba(90,70,120,.25)'; ctx.lineWidth = 1; ctx.strokeRect(sx + .5, ty + .5, ww, STAIR_H);
  }
  // guarda-corpo dourado
  ctx.strokeStyle = '#d7b04a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(STAIR_X0 - 2, GY - 40); ctx.lineTo(STAIR_XE, STAIR_TOP - 40); ctx.stroke();
  for (let i = 0; i <= STAIR_STEPS; i++) {
    const px = STAIR_X0 + i * STAIR_W, py = GY - STAIR_H * i;
    rr(px - 2, py - 40, 4, 40, 2, '#b8912f');
  }
  circ(STAIR_X0 - 2, GY - 42, 5, '#ffe9a8'); circ(STAIR_XE, STAIR_TOP - 42, 5, '#ffe9a8');
  // candelabros na base
  for (const bx of [86, 880]) {
    rr(bx - 3, GY - 74, 6, 74, 2, '#d7b04a'); rr(bx - 24, GY - 78, 48, 6, 3, '#c9a227'); ell(bx, GY - 6, 14, 6, '#b8912f');
    for (let f = 0; f < 3; f++) { const fx = bx - 18 + f * 18, fs = 6 + Math.sin(t * .25 + f * 2.1) * 2; ell(fx, GY - 88, fs * .7, fs * 1.5, '#ff9a3d'); ell(fx, GY - 85, fs * .35, fs, '#ffe9a8'); }
  }
  chan(180, 86); chan(700, 66); chan(880, 120);
}

// ---------- Trono dourado da Grande Rainha ----------
function throneDraw(x) {
  // degraus dourados
  rr(x - 10, GY - 12, 120, 12, 4, '#b8912f'); rr(x - 5, GY - 24, 110, 12, 4, '#d7b04a');
  ctx.save(); // encosto alto em arco
  ctx.shadowColor = '#ffcf4d'; ctx.shadowBlur = 18 + Math.sin(t * .08) * 5;
  ctx.fillStyle = '#e8c766';
  ctx.beginPath(); ctx.moveTo(x, GY - 28); ctx.lineTo(x, GY - 148); ctx.arc(x + 48, GY - 148, 48, PI, 0); ctx.lineTo(x + 96, GY - 28); ctx.closePath(); ctx.fill();
  ctx.restore();
  // veludo carmesim
  rr(x + 10, GY - 118, 76, 88, 12, '#8e2440');
  rr(x + 10, GY - 132, 76, 26, 12, '#b02a52');
  ctx.strokeStyle = '#ffd7a1'; ctx.lineWidth = 1.6; // filigrana
  ctx.beginPath(); ctx.roundRect(x + 17, GY - 111, 62, 74, 9); ctx.stroke();
  ctx.save(); ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 12; circ(x + 48, GY - 74, 6, '#ff3b5c'); ctx.restore();
  circ(x + 48, GY - 74, 2.2, '#fff');
  // braços com esferas douradas
  rr(x - 8, GY - 64, 17, 22, 6, '#d7b04a'); rr(x + 87, GY - 64, 17, 22, 6, '#d7b04a');
  circ(x + 0.5, GY - 68, 7, '#ffd76b'); circ(x + 95.5, GY - 68, 7, '#ffd76b');
  // raios de luz por trás
  ctx.globalAlpha = .14; ctx.fillStyle = '#ffe9a8';
  for (let i = 0; i < 3; i++) { const a = (i - 1) * .5; ctx.save(); ctx.translate(x + 48, GY - 150); ctx.rotate(a); ctx.fillRect(-5, -70, 10, 210); ctx.restore(); }
  ctx.globalAlpha = 1;
}

// ---------- Quadro ----------
function draw() {
  if (state === 'capa') { drawCover(); return; }
  bg();
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  L.ground.forEach(s => gnd(s.x, s.w)); L.plats.forEach(plat); goal();
  if (lv === 4) throneDraw(L.len - 140); // o trono aguarda na arena
  for (const a of L.ar) {
    if (a.orb) { // orbes mágicos da Rainha
      ctx.save(); ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 12;
      const r = 6 + Math.sin(t * .45 + a.x) * 1.6;
      circ(a.x, a.y, r, '#c77dff'); circ(a.x, a.y, r * .45, '#fff');
      ctx.restore(); continue;
    }
    const wob = Math.sin(t * .5 + a.x * .05) * 1.5;
    ctx.save(); ctx.translate(a.x, a.y + wob); ctx.scale(a.vx < 0 ? -1 : 1, 1);
    if (a.mine) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 10; }
    ctx.strokeStyle = a.mine ? '#ffd23f' : '#6b4423'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.strokeStyle = a.mine ? '#fff3ae' : '#9aa0a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(14, 0); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-13, -2.5); ctx.lineTo(-9, 0); ctx.lineTo(-13, 2.5); ctx.fill();
    ctx.restore();
  }
  for (const k of L.coins) if (!k.got) { const w = 12 * Math.abs(Math.cos(t * .08 + k.x)); ell(k.x, k.y, w + 1, 12, '#ffb703'); ell(k.x, k.y, w, 10.5, '#ffe14d'); if (w > 5) ell(k.x, k.y, w * .45, 6, '#ffc833'); }
  L.hearts.forEach(heart);
  L.en.forEach(doll); if (lv === 4) queen(); if (state !== 'stair') boy();
  if (lv === 4 && P.swing > 0) { // golpe da arma
    const pr = 1 - P.swing / 10;
    ctx.save(); ctx.translate(P.x + P.w / 2, P.y + 24); ctx.scale(P.dir, 1); ctx.globalAlpha = P.swing / 10;
    if (weapon.proj) { // arco dourado
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(6, 2, 17, -PI * .42, PI * .42); ctx.stroke();
      ctx.strokeStyle = '#fff8d2'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(11, -11); ctx.lineTo(11, 15); ctx.stroke();
    } else { // weapons de corte
      ctx.strokeStyle = weapon.color; ctx.lineWidth = 6; ctx.lineCap = 'round';
      const ang = -PI * .5 + pr * 1.7;
      ctx.beginPath(); ctx.arc(4, 0, weapon.range * .82, ang - .8, ang + .25); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();
  }
  pts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .25; p.l--; ctx.globalAlpha = Math.max(0, p.l / 30); circ(p.x, p.y, 4, p.c); }); ctx.globalAlpha = 1;
  pts = pts.filter(p => p.l > 0);
  ctx.restore();
  if (state === 'stair') { drawStairs(); stairBoy(); }
  if (state !== 'menu' && state !== 'capa' && state !== 'stair') hud();
  if (state === 'win') {
    for (let i = 0; i < 3; i++) cf.push({ x: Math.random() * W, y: -10, v: 1.5 + Math.random() * 3, c: ['#ff4d6d', '#ffd23f', '#4cc9f0', '#80ed99', '#c77dff'][Math.floor(Math.random() * 5)] });
    cf.forEach(p => { p.y += p.v; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 8, 5); }); cf = cf.filter(p => p.y < H);
  }
}
function hud() {
  rr(10, 10, W - 20, 40, 14, 'rgba(30,10,70,.55)');
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px "Trebuchet MS", sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(`❤️ ${lives}     🪙 ${coins}     ⭐ ${score}     ${MUS.on ? '🔊' : '🔇 M'}`, 28, 31);
  ctx.textAlign = 'right'; ctx.fillText(`Fase ${lv + 1}: ${L.c.name}`, W - 28, 31); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (lv === 4 && B) {
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#ffe98a';
    ctx.fillText('⚔ ' + weapon.name + '  (X)', W - 28, 62); ctx.textAlign = 'left';
    const bx = W / 2 - 160;
    rr(bx, 56, 320, 14, 7, 'rgba(10,0,20,.6)');
    const f = Math.max(0, B.hp / B.max);
    if (f > 0) rr(bx + 2, 58, 316 * f, 10, 5, '#ff4d90');
    ctx.fillStyle = '#ffd6e8'; ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('👑 A Grande Rainha das Meninas', W / 2, 90); ctx.textAlign = 'left';
  }
  if (banner > 0 && state === 'play') {
    banner--; ctx.globalAlpha = Math.min(1, banner / 40); ctx.textAlign = 'center'; ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
    ctx.lineWidth = 8; ctx.strokeStyle = '#4a1d96'; ctx.strokeText(`Fase ${lv + 1} — ${L.c.name}`, W / 2, 140); ctx.fillStyle = '#ffd23f'; ctx.fillText(`Fase ${lv + 1} — ${L.c.name}`, W / 2, 140);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
}

// ---------- Loop principal (passo fixo de 60 FPS) ----------
let last = 0, acc = 0;
function loop(ts) {
  acc += Math.min(100, ts - last); last = ts;
  while (acc >= 16.67) {
    if (state === 'play') update();
    else if (state === 'stair') { t++; if (++stairT >= 430) forjaScreen(); }
    else t++;
    if (state !== 'menu' && state !== 'play') { /* telas congeladas, sem mover o menino */ }
    acc -= 16.67;
  }
  musTick();
  const target = Math.max(0, Math.min(L.len - W, P.x - W * .4));
  cam += (target - cam) * .12;
  if (shake > 0) { cam += (Math.random() - .5) * shake; shake -= .7; }
  draw(); requestAnimationFrame(loop);
}
capa();
requestAnimationFrame(loop);
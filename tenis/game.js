/* ============================================================
   game.js — Tênis em PRIMEIRA PESSOA (p5.js, canvas 2D).
   Você está atrás da linha de base olhando para a rede e a CPU.
   A raquete fica em primeiro plano (base da tela) e segue o celular
   (objeto global `Phone` em net.js) ou, sem celular, o MOUSE move e
   ESPAÇO/clique dá a raquetada.

   Mundo:  cx ∈ [-1,1] largura · cy ∈ [0,1] (0=você, 1=CPU, rede=0.5)
           z ≥ 0 altura.   Câmera pinhole atrás da base do jogador.
   Ajustes do jogador ficam em window.cfg (ver calib.js).
   ============================================================ */

// ── Câmera em primeira pessoa ─────────────────────────────
const COURT_HALF_W = 5.4;   // cx=1  -> 5.4 unidades de mundo
const COURT_LEN    = 19;    // comprimento (profundidade) da quadra
const CAM_CY       = -0.16; // câmera um pouco atrás da base do jogador
const CAM_H        = 1.55;  // altura do olho (unidades)
const Z_UNIT       = 2.6;   // z do jogo -> unidades de altura
const FOV          = 0.92;  // foco: f = width * FOV
function focal()    { return width * FOV; }
function horizonY() { return height * 0.42; }

function project(cx, cy, z) {
  const depth = (cy - CAM_CY) * COURT_LEN;
  const vis = depth > 0.35;
  const scale = vis ? focal() / depth : 0;
  return {
    x: width / 2 + (cx * COURT_HALF_W) * scale,
    y: horizonY() - (z * Z_UNIT - CAM_H) * scale,
    scale, depth, vis,
  };
}

// ── Ajustes de jogabilidade ───────────────────────────────
const NET_CY        = 0.5;
const NET_H         = 0.32;
const GRAV          = 5.2;
const RESTITUTION   = 0.62;
const PLAYER_LINE   = 0.12;
const AI_LINE       = 0.88;
const SWING_WINDOW  = 260;   // ms — janela da raquetada
const WIN_SCORE     = 11;

const AI_SPEED      = 1.6;
const AI_REACH      = 0.34;
const AI_MISS       = 0.12;

// Config do jogador (sensibilidade/latência). calib.js cria window.cfg;
// aqui garantimos um default caso calib.js não tenha carregado.
window.cfg = window.cfg || {
  sensitivity: 38, smoothing: 0.35, reach: 0.30, invertX: false,
  swingThreshold: 14, rotThreshold: 320, sendRate: 60,
};

// ── Estado ────────────────────────────────────────────────
let ball;
let playerX = 0, aiX = 0;
let swing = { t: -9999, power: 1 };
let scoreP = 0, scoreC = 0;
let state = 'serve';            // 'serve' | 'rally' | 'over'
let mode = 'match';            // 'match' | 'training'
let serveAt = 0;
let msg = '';
let lastSwingFx = -9999;

function newBall() {
  return {
    cx: 0, cy: 0.5, z: 0.5, vx: 0, vy: 0, vz: 0,
    bounces: 0, bounceSide: 0, attemptP: false, attemptC: false, trail: [],
  };
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  ball = newBall();
  startServe('cpu');
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); }

// ── Saque / alimentação ───────────────────────────────────
function startServe(by) {
  state = 'serve';
  ball = newBall();
  if (by === 'cpu') { ball.cx = random(-0.45, 0.45); ball.cy = 0.95; ball.z = 0.6; }
  else { ball.cx = random(-0.45, 0.45); ball.cy = 0.05; ball.z = 0.6; }
  ball._serveBy = by;
  serveAt = millis() + (mode === 'training' ? 700 : 1100);
  msg = mode === 'training' ? 'treino — calibre e rebata' : (by === 'cpu' ? 'CPU vai sacar…' : 'seu saque…');
}

function launchServe() {
  const by = ball._serveBy;
  const target = random(-0.5, 0.5);
  if (by === 'cpu') { ball.vy = -1.05; ball.vx = (target - ball.cx) * 0.9; ball.vz = 1.7; }
  else { ball.vy = 1.05; ball.vx = (target - ball.cx) * 0.9; ball.vz = 1.7; }
  state = 'rally';
  if (mode !== 'training') msg = '';
}

// ── Raquetada do jogador ──────────────────────────────────
function doSwing(power) {
  swing.t = millis();
  swing.power = constrain(power, 0.6, 2.2);
  lastSwingFx = millis();
}

function playerReturn() {
  const aim = constrain((playerX - ball.cx) * 1.4 + playerX * 0.5, -1.2, 1.2);
  const pw = swing.power;
  ball.vy = 1.0 + 0.35 * pw;
  ball.vx = aim;
  ball.vz = 1.5 + 0.35 * pw;
  ball.bounces = 0; ball.bounceSide = 0;
  ball.attemptC = false;
  ball.cy = PLAYER_LINE;
}

function aiReturn() {
  const aim = random(-0.7, 0.7) - aiX * 0.4;
  ball.vy = -1.05 - random(0, 0.25);
  ball.vx = aim;
  ball.vz = 1.55 + random(0, 0.3);
  ball.bounces = 0; ball.bounceSide = 0;
  ball.attemptP = false;
  ball.cy = AI_LINE;
}

function awardPoint(winner) {
  if (mode === 'training') { startServe('cpu'); return; } // só re-alimenta
  if (winner === 'p') scoreP++; else scoreC++;
  if (scoreP >= WIN_SCORE || scoreC >= WIN_SCORE) {
    state = 'over';
    msg = scoreP > scoreC ? 'VOCÊ VENCEU! 🏆  (ENTER joga de novo)'
                          : 'CPU venceu.  (ENTER joga de novo)';
    return;
  }
  startServe('cpu');
}

// ── Física ────────────────────────────────────────────────
function updatePhysics(dt) {
  if (state === 'serve') { if (millis() >= serveAt) launchServe(); return; }
  if (state !== 'rally') return;

  ball.vz -= GRAV * dt;
  ball.cx += ball.vx * dt;
  ball.cy += ball.vy * dt;
  ball.z  += ball.vz * dt;

  ball.trail.push({ cx: ball.cx, cy: ball.cy, z: ball.z });
  if (ball.trail.length > 12) ball.trail.shift();

  if (ball.z <= 0 && ball.vz < 0) {
    ball.z = 0;
    ball.vz = -ball.vz * RESTITUTION;
    ball.vx *= 0.92;
    const side = ball.cy < NET_CY ? -1 : 1;
    if (side === ball.bounceSide) ball.bounces++;
    else { ball.bounceSide = side; ball.bounces = 1; }
    if (ball.bounces >= 2) { awardPoint(side === -1 ? 'c' : 'p'); return; }
  }

  if (crossedNet() && ball.z < NET_H) { awardPoint(ball.vy > 0 ? 'c' : 'p'); return; }
  if (abs(ball.cx) > 1.15) { awardPoint(ball.vy > 0 ? 'c' : 'p'); return; }

  if (ball.vy < 0 && ball.cy <= PLAYER_LINE && !ball.attemptP) {
    ball.attemptP = true;
    const inTime = millis() - swing.t < SWING_WINDOW;
    const inReach = abs(ball.cx - playerX) < window.cfg.reach;
    if (inTime && inReach && ball.z < 1.05) playerReturn();
  }
  if (ball.cy < -0.06) { awardPoint('c'); return; }

  if (ball.vy > 0 && ball.cy >= AI_LINE && !ball.attemptC) {
    ball.attemptC = true;
    if (abs(ball.cx - aiX) < AI_REACH && random() > AI_MISS && ball.z < 1.1) aiReturn();
  }
  if (ball.cy > 1.06) { awardPoint('p'); return; }
}

let _prevCy = 0.5;
function crossedNet() {
  const was = _prevCy, now = ball.cy; _prevCy = now;
  return (was < NET_CY && now >= NET_CY) || (was > NET_CY && now <= NET_CY);
}

function updateAI(dt) {
  let target = ball.vy > 0 ? ball.cx : ball.cx * 0.3;
  target = constrain(target, -1, 1);
  const step = AI_SPEED * dt;
  aiX += constrain(target - aiX, -step, step);
}

// ── Controle do jogador ───────────────────────────────────
function updatePlayer() {
  const c = window.cfg;
  let target;
  if (window.Phone && Phone.connected) {
    let g = Phone.gamma; if (c.invertX) g = -g;
    target = g / c.sensitivity;
    if (Phone.swing) { doSwing(Phone.swing.power); Phone.swing = null; }
  } else {
    target = map(mouseX, 0, width, -1, 1, true);
    if (c.invertX) target = -target;
  }
  playerX = lerp(playerX, constrain(target, -1, 1), c.smoothing);
}

function keyPressed() {
  if (key === ' ') doSwing(1.2);
  if (keyCode === ENTER && state === 'over') { scoreP = 0; scoreC = 0; startServe('cpu'); }
}
function mousePressed() {
  if (mouseY > 0 && state === 'rally') doSwing(1.1);
}

// Alterna partida/treino (chamado pelo painel de calibração).
window.setMode = function (m) {
  mode = m;
  scoreP = 0; scoreC = 0;
  startServe('cpu');
};

// ── Desenho ───────────────────────────────────────────────
function draw() {
  const dt = Math.min(deltaTime / 1000, 0.05);
  updatePlayer();
  updateAI(dt);
  updatePhysics(dt);

  drawBackground();
  drawCourt();
  drawCPU();
  drawNet();
  drawShadow();
  drawBall();
  drawForegroundRacket();
  drawHUD();
}

function drawBackground() {
  const hy = horizonY();
  noStroke();
  // céu
  fill(126, 178, 214); rect(0, 0, width, hy);
  // arquibancada / parede ao fundo
  fill(74, 92, 96); rect(0, hy * 0.5, width, hy * 0.5);
  fill(60, 76, 80); rect(0, hy * 0.78, width, hy * 0.22);
  // piso de entorno (surround) abaixo do horizonte
  fill(36, 104, 78); rect(0, hy, width, height - hy);
}

function drawCourt() {
  // piso da quadra (azul) — quad com cantos projetados (perto = largo embaixo)
  const fL = project(-1, 1, 0), fR = project(1, 1, 0);
  const nL = project(-1, 0, 0), nR = project(1, 0, 0);
  noStroke();
  fill(38, 116, 168);
  quad(fL.x, fL.y, fR.x, fR.y, nR.x, nR.y, nL.x, nL.y);

  stroke(238, 243, 248, 230);
  strokeWeight(2);
  courtLine(-1, 0, -1, 1); courtLine(1, 0, 1, 1);    // laterais
  courtLine(-1, 0, 1, 0);  courtLine(-1, 1, 1, 1);    // bases
  courtLine(-1, 0.28, 1, 0.28); courtLine(-1, 0.72, 1, 0.72); // linhas de saque
  courtLine(0, 0.28, 0, 0.72);                         // central
}
function courtLine(cx1, cy1, cx2, cy2) {
  const a = project(cx1, cy1, 0), b = project(cx2, cy2, 0);
  line(a.x, a.y, b.x, b.y);
}

function drawNet() {
  const L0 = project(-1.05, NET_CY, 0), R0 = project(1.05, NET_CY, 0);
  const Lt = project(-1.05, NET_CY, NET_H), Rt = project(1.05, NET_CY, NET_H);
  push();
  stroke(225, 233, 240, 120); strokeWeight(1);
  const segs = 30;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    line(lerp(L0.x, R0.x, t), lerp(L0.y, R0.y, t), lerp(Lt.x, Rt.x, t), lerp(Lt.y, Rt.y, t));
  }
  // malha horizontal
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    line(lerp(L0.x, Lt.x, t), lerp(L0.y, Lt.y, t), lerp(R0.x, Rt.x, t), lerp(R0.y, Rt.y, t));
  }
  stroke(245); strokeWeight(3); line(Lt.x, Lt.y, Rt.x, Rt.y); // faixa superior
  stroke(70); strokeWeight(5);
  line(L0.x, L0.y, Lt.x, Lt.y); line(R0.x, R0.y, Rt.x, Rt.y);   // postes
  pop();
}

function drawCPU() {
  const feet = project(aiX, AI_LINE, 0);
  if (!feet.vis) return;
  const s = feet.scale;
  const bodyH = 1.7 * s; // unidades -> px
  push();
  translate(feet.x, feet.y);
  noStroke();
  // sombra
  fill(0, 0, 0, 60); ellipse(0, 0, 1.2 * s, 0.4 * s);
  // corpo
  fill(232, 107, 90);
  rect(-0.18 * s, -bodyH, 0.36 * s, bodyH * 0.62, 3); // tronco
  fill(225, 195, 165);
  circle(0, -bodyH - 0.12 * s, 0.34 * s);              // cabeça
  // pernas
  stroke(40, 40, 50); strokeWeight(Math.max(2, 0.12 * s));
  line(-0.08 * s, -bodyH * 0.38, -0.1 * s, 0);
  line(0.08 * s, -bodyH * 0.38, 0.1 * s, 0);
  // raquete
  noFill(); stroke(40, 40, 50); strokeWeight(Math.max(1.5, 0.06 * s));
  ellipse(0.3 * s, -bodyH * 0.7, 0.5 * s, 0.7 * s);
  pop();
}

function drawShadow() {
  const p = project(ball.cx, ball.cy, 0);
  if (!p.vis) return;
  const a = map(ball.z, 0, 2, 95, 18, true);
  noStroke(); fill(0, 0, 0, a);
  ellipse(p.x, p.y, 0.5 * p.scale, 0.18 * p.scale);
}

function drawBall() {
  noStroke();
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const p = project(t.cx, t.cy, t.z);
    if (!p.vis) continue;
    const k = i / ball.trail.length;
    fill(223, 245, 90, k * 80);
    circle(p.x, p.y, 0.16 * p.scale * k);
  }
  const p = project(ball.cx, ball.cy, ball.z);
  if (!p.vis) return;
  const r = Math.max(3, 0.13 * p.scale);
  fill(223, 245, 90); circle(p.x, p.y, r);
  fill(255, 255, 255, 130); circle(p.x - r * 0.18, p.y - r * 0.18, r * 0.4);
  // costura
  noFill(); stroke(180, 200, 60); strokeWeight(Math.max(1, r * 0.06));
  arc(p.x, p.y, r * 0.9, r * 0.9, -0.6, 0.9);
}

// Raquete em primeiro plano (espaço de tela, segue o celular/mouse)
function drawForegroundRacket() {
  const swingT = millis() - lastSwingFx;
  const swinging = swingT < 200;
  const rx = width / 2 + playerX * width * 0.40;
  const ry = height * 0.95;
  const sz = Math.min(width, height) * 0.0014; // escala base
  push();
  translate(rx, ry);
  let rot = -0.32 + playerX * 0.18;
  if (swinging) rot += Math.sin((swingT / 200) * Math.PI) * -1.5;
  rotate(rot);
  const W = 150 * sz, H = 200 * sz;

  // antebraço / mão
  noStroke(); fill(225, 195, 165);
  rect(-14 * sz, H * 0.35, 28 * sz, 160 * sz, 14 * sz);
  // cabo
  stroke(30, 24, 18); strokeWeight(18 * sz); strokeCap(ROUND);
  line(0, H * 0.45, 0, H * 0.05);
  // aro
  noFill(); stroke(swinging ? '#ffd86b' : '#d4b87a'); strokeWeight((swinging ? 12 : 9) * sz);
  ellipse(0, -H * 0.18, W, H);
  // cordas
  stroke(255, 255, 255, 90); strokeWeight(1.4 * sz);
  for (let i = -3; i <= 3; i++) line(i * W * 0.13, -H * 0.62, i * W * 0.13, H * 0.24);
  for (let j = -3; j <= 3; j++) line(-W * 0.46, -H * 0.18 + j * H * 0.12, W * 0.46, -H * 0.18 + j * H * 0.12);
  pop();
}

function drawHUD() {
  textFont('IBM Plex Mono, monospace');
  noStroke();

  // placar
  textAlign(CENTER, TOP);
  fill(255, 255, 255, 230); textSize(13);
  text('VOCÊ', width / 2 - 70, 60); text('CPU', width / 2 + 70, 60);
  textSize(32);
  fill(212, 184, 122); text(scoreP, width / 2 - 70, 76);
  fill(232, 107, 90);  text(scoreC, width / 2 + 70, 76);
  fill(255, 255, 255, 120); textSize(18); text('—', width / 2, 84);

  // latência + modo
  textAlign(LEFT, TOP); textSize(12);
  const lat = (window.Phone && Phone.connected && Phone.latency != null) ? Math.round(Phone.latency) + ' ms' : '—';
  fill(255, 255, 255, 150);
  text((mode === 'training' ? 'TREINO' : 'PARTIDA') + '   latência: ' + lat, 20, 22);

  // dica de controle
  textAlign(LEFT, BOTTOM); textSize(11);
  const connected = window.Phone && Phone.connected;
  fill(connected ? color(127, 224, 160) : color(255, 255, 255, 110));
  text(connected ? '📱 incline para mover · balance para rebater · [C] calibrar'
                 : 'mouse move · ESPAÇO/clique rebate · [C] calibrar', 20, height - 16);

  if (msg) {
    textAlign(CENTER, CENTER); textSize(state === 'over' ? 30 : 18);
    fill(255, 255, 255, 235); text(msg, width / 2, height * 0.30);
  }
}

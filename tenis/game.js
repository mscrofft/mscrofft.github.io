/* ============================================================
   game.js — Tênis em 3D real (p5.js WEBGL), primeira pessoa.
   Câmera fixa atrás da linha de base; a raquete em primeiro plano
   segue o celular (global `Phone` em net.js) ou o MOUSE; ESPAÇO/clique
   rebate. HUD é overlay em HTML (#hud). Ajustes em window.cfg (calib.js).

   Mundo do jogo:  cx ∈ [-1,1] · cy ∈ [0,1] (0=você, 1=CPU, rede=0.5) · z≥0 altura.
   Mundo 3D (metros, y para baixo → altura = -y):
     X = cx*CW · Z = cy*CL · Yup = z*HU  (worldY = -Yup)
   ============================================================ */

// ── Dimensões do mundo 3D (metros) ────────────────────────
const CW = 4.115;   // meia-largura da quadra (singles 8.23)
const CL = 23.77;   // comprimento
const HU = 2.6;     // z do jogo -> metros de altura
// Convenção: câmera com up=(0,-1,0) -> +Y é para cima na tela; câmera olha p/ -Z.
// Quadra recua em -Z; altura sobe em +Y.
function wx(cx) { return cx * CW; }
function wz(cy) { return -cy * CL; }      // cy=0 perto (z=0) .. cy=1 longe (-CL)
function wyTop(z) { return z * HU; }      // altura sobe = +y

// ── Ajustes de jogabilidade (idênticos à versão anterior) ──
const NET_CY = 0.5, NET_H = 0.34, GRAV = 5.2, RESTITUTION = 0.62;
const PLAYER_LINE = 0.12, AI_LINE = 0.88, SWING_WINDOW = 260, WIN_SCORE = 11;
const AI_SPEED = 1.6, AI_REACH = 0.34, AI_MISS = 0.12;
const NET_WORLD_H = NET_H * HU;

window.cfg = window.cfg || {
  sensitivity: 38, smoothing: 0.35, reach: 0.30, invertX: false,
  swingThreshold: 14, rotThreshold: 320, sendRate: 60,
};

// ── Estado ────────────────────────────────────────────────
let ball;
let playerX = 0, aiX = 0;
let swing = { t: -9999, power: 1 };
let scoreP = 0, scoreC = 0;
let state = 'serve', mode = 'match';
let serveAt = 0, msg = '', lastSwingFx = -9999;

// texturas / hud
let courtTex, netTex, boardTex, _boardKey = '';
let hud = {};

function newBall() {
  return { cx: 0, cy: 0.5, z: 0.5, vx: 0, vy: 0, vz: 0,
           bounces: 0, bounceSide: 0, attemptP: false, attemptC: false, trail: [] };
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  setAttributes('antialias', true);
  courtTex = makeCourtTexture();
  netTex = makeNetTexture();
  boardTex = createGraphics(256, 110);
  cacheHud();
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
  const by = ball._serveBy, target = random(-0.5, 0.5);
  if (by === 'cpu') { ball.vy = -1.05; ball.vx = (target - ball.cx) * 0.9; ball.vz = 1.7; }
  else { ball.vy = 1.05; ball.vx = (target - ball.cx) * 0.9; ball.vz = 1.7; }
  state = 'rally';
  if (mode !== 'training') msg = '';
}

// ── Raquetada ─────────────────────────────────────────────
function doSwing(power) { swing.t = millis(); swing.power = constrain(power, 0.6, 2.2); lastSwingFx = millis(); }
function playerReturn() {
  const aim = constrain((playerX - ball.cx) * 1.4 + playerX * 0.5, -1.2, 1.2), pw = swing.power;
  ball.vy = 1.0 + 0.35 * pw; ball.vx = aim; ball.vz = 1.5 + 0.35 * pw;
  ball.bounces = 0; ball.bounceSide = 0; ball.attemptC = false; ball.cy = PLAYER_LINE;
}
function aiReturn() {
  ball.vy = -1.05 - random(0, 0.25); ball.vx = random(-0.7, 0.7) - aiX * 0.4; ball.vz = 1.55 + random(0, 0.3);
  ball.bounces = 0; ball.bounceSide = 0; ball.attemptP = false; ball.cy = AI_LINE;
}
function awardPoint(winner) {
  if (mode === 'training') { startServe('cpu'); return; }
  if (winner === 'p') scoreP++; else scoreC++;
  if (scoreP >= WIN_SCORE || scoreC >= WIN_SCORE) {
    state = 'over';
    msg = scoreP > scoreC ? 'VOCÊ VENCEU! 🏆  (ENTER joga de novo)' : 'CPU venceu.  (ENTER joga de novo)';
    return;
  }
  startServe('cpu');
}

// ── Física ────────────────────────────────────────────────
function updatePhysics(dt) {
  if (state === 'serve') { if (millis() >= serveAt) launchServe(); return; }
  if (state !== 'rally') return;
  ball.vz -= GRAV * dt;
  ball.cx += ball.vx * dt; ball.cy += ball.vy * dt; ball.z += ball.vz * dt;
  ball.trail.push({ cx: ball.cx, cy: ball.cy, z: ball.z });
  if (ball.trail.length > 10) ball.trail.shift();

  if (ball.z <= 0 && ball.vz < 0) {
    ball.z = 0; ball.vz = -ball.vz * RESTITUTION; ball.vx *= 0.92;
    const side = ball.cy < NET_CY ? -1 : 1;
    if (side === ball.bounceSide) ball.bounces++; else { ball.bounceSide = side; ball.bounces = 1; }
    if (ball.bounces >= 2) { awardPoint(side === -1 ? 'c' : 'p'); return; }
  }
  if (crossedNet() && ball.z < NET_H) { awardPoint(ball.vy > 0 ? 'c' : 'p'); return; }
  if (abs(ball.cx) > 1.15) { awardPoint(ball.vy > 0 ? 'c' : 'p'); return; }

  if (ball.vy < 0 && ball.cy <= PLAYER_LINE && !ball.attemptP) {
    ball.attemptP = true;
    const inTime = millis() - swing.t < SWING_WINDOW;
    if (inTime && abs(ball.cx - playerX) < window.cfg.reach && ball.z < 1.05) playerReturn();
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
  let target = constrain(ball.vy > 0 ? ball.cx : ball.cx * 0.3, -1, 1);
  aiX += constrain(target - aiX, -AI_SPEED * dt, AI_SPEED * dt);
}
function updatePlayer() {
  const c = window.cfg; let target;
  if (window.Phone && Phone.connected) {
    let g = Phone.gamma; if (c.invertX) g = -g;
    target = g / c.sensitivity;
    if (Phone.swing) { doSwing(Phone.swing.power); Phone.swing = null; }
  } else {
    target = map(mouseX, 0, width, -1, 1, true); if (c.invertX) target = -target;
  }
  playerX = lerp(playerX, constrain(target, -1, 1), c.smoothing);
}
function keyPressed() {
  if (key === ' ') doSwing(1.2);
  if (keyCode === ENTER && state === 'over') { scoreP = 0; scoreC = 0; startServe('cpu'); }
}
function mousePressed() { if (mouseY > 0 && state === 'rally') doSwing(1.1); }
window.setMode = function (m) { mode = m; scoreP = 0; scoreC = 0; startServe('cpu'); };

// ── Texturas ──────────────────────────────────────────────
function makeCourtTexture() {
  const w = 360, h = Math.round(360 * CL / (2 * CW));
  const g = createGraphics(w, h);
  g.background(48, 132, 196);
  g.stroke(255); g.strokeWeight(6); g.noFill();
  const m = 8;
  g.rect(m, m, w - 2 * m, h - 2 * m);                 // laterais + bases
  // linhas de saque (a 6.40 m da rede dos dois lados → frações)
  const s1 = h * ((CL / 2 - 6.40) / CL), s2 = h * ((CL / 2 + 6.40) / CL);
  g.line(m, s1, w - m, s1); g.line(m, s2, w - m, s2);
  g.line(w / 2, s1, w / 2, s2);                       // central de saque
  g.strokeWeight(6);
  g.line(w / 2, m, w / 2, m + 18); g.line(w / 2, h - m, w / 2, h - m - 18); // marcas centrais
  return g;
}
function makeNetTexture() {
  const w = 256, h = 80; const g = createGraphics(w, h);
  g.clear();
  g.stroke(255, 255, 255, 150); g.strokeWeight(1);
  for (let x = 0; x <= w; x += 7) g.line(x, 6, x, h);
  for (let y = 6; y <= h; y += 7) g.line(0, y, w, y);
  g.noStroke(); g.fill(255); g.rect(0, 0, w, 6);      // faixa superior
  return g;
}
function updateBoard() {
  const key = scoreP + '-' + scoreC;
  if (key === _boardKey) return; _boardKey = key;
  const g = boardTex;
  g.background(10, 18, 30); g.noStroke();
  g.fill(40, 60, 90); g.rect(0, 0, 256, 26);
  g.fill(230); g.textFont('monospace'); g.textSize(15); g.textAlign(g.LEFT, g.CENTER);
  g.text('PLAYER', 14, 52); g.text('CPU', 14, 84);
  g.textAlign(g.RIGHT, g.CENTER);
  g.fill(212, 184, 122); g.text(scoreP, 238, 52);
  g.fill(232, 107, 90); g.text(scoreC, 238, 84);
  g.fill(180); g.textSize(11); g.textAlign(g.CENTER, g.CENTER); g.text('TÊNIS', 128, 13);
}

// ── Render ────────────────────────────────────────────────
function draw() {
  const dt = Math.min(deltaTime / 1000, 0.05);
  updatePlayer(); updateAI(dt); updatePhysics(dt);

  background(150, 200, 233);
  perspective(radians(66), width / height, 0.1, 400);
  // câmera elevada atrás da base, inclinada ~20° para baixo (abre a quadra)
  // eye atrás da base (z=+5, 3.4m acima), olhando para baixo e para -Z
  camera(0, 3.4, 5, 0, 0.55, -8, 0, -1, 0);
  ambientLight(225);
  directionalLight(70, 70, 75, -0.3, 1, -0.3);
  noStroke();

  drawArena();
  drawCourt();
  drawNet();
  drawCPU();
  drawBall();
  drawFPRacket();

  updateBoard();
  drawScoreboard();
  updateHUD();
}

function drawArena() {
  // chão de entorno (verde-azulado) logo abaixo da quadra
  push(); translate(0, -0.02, -(CL / 2 - 2)); rotateX(HALF_PI);
  fill(34, 96, 96); plane(46, 64); pop();
  // paredes indoor
  fill(150, 168, 165);
  push(); translate(0, 6, -(CL + 10)); box(52, 16, 1); pop();   // fundo
  push(); translate(-14, 6, -CL / 2); box(1, 16, 64); pop();    // esquerda
  push(); translate(14, 6, -CL / 2); box(1, 16, 64); pop();     // direita
  // arquibancadas em degraus (tan)
  fill(198, 174, 136);
  for (let t = 0; t < 3; t++) {
    const yb = 1.0 + t * 1.5, xb = 10.5 + t * 1.4;
    push(); translate(-xb, yb, -CL / 2); box(1.4, 1.1, 60); pop();
    push(); translate(xb, yb, -CL / 2); box(1.4, 1.1, 60); pop();
  }
}

function drawCourt() {
  push();
  translate(0, 0.03, -CL / 2); rotateX(HALF_PI);
  texture(courtTex);
  plane(2 * CW, CL);
  pop();
}

function drawNet() {
  // malha
  push();
  translate(0, wyTop(NET_H) / 2, wz(NET_CY));
  texture(netTex);
  // plane no plano XY (de frente p/ z) — altura = NET_WORLD_H
  plane(2 * CW + 0.3, NET_WORLD_H);
  pop();
  // postes
  fill(60);
  for (const sx of [-(CW + 0.18), CW + 0.18]) {
    push(); translate(sx, wyTop(NET_H) / 2, wz(NET_CY)); cylinder(0.05, NET_WORLD_H); pop();
  }
}

function drawCPU() {
  const x = wx(aiX), z = wz(AI_LINE);
  // sombra
  push(); translate(x, 0.05, z); rotateX(HALF_PI); fill(0, 0, 0, 70); ellipse(0, 0, 1.3, 0.7); pop();
  push();
  translate(x, 0, z);
  fill(232, 107, 90);
  push(); translate(0, 0.95, 0); box(0.42, 1.0, 0.26); pop();    // tronco
  fill(230, 200, 170);
  push(); translate(0, 1.7, 0); sphere(0.17); pop();             // cabeça
  fill(40, 40, 55);
  push(); translate(-0.12, 0.35, 0); box(0.14, 0.8, 0.14); pop(); // pernas
  push(); translate(0.12, 0.35, 0); box(0.14, 0.8, 0.14); pop();
  // raquete
  push(); translate(0.45, 1.1, 0.05); rotateY(0.5); fill(70); torus(0.26, 0.02); pop();
  pop();
}

function drawBall() {
  // rastro
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i], k = i / ball.trail.length;
    push(); translate(wx(t.cx), wyTop(t.z), wz(t.cy));
    fill(223, 245, 90, 120 * k); sphere(0.04 + 0.05 * k); pop();
  }
  // sombra
  push(); translate(wx(ball.cx), 0.05, wz(ball.cy)); rotateX(HALF_PI);
  const sa = map(ball.z, 0, 2, 90, 16, true); fill(0, 0, 0, sa);
  ellipse(0, 0, 0.5, 0.34); pop();
  // bola
  push(); translate(wx(ball.cx), wyTop(ball.z), wz(ball.cy));
  fill(223, 245, 90); specularMaterial(120); shininess(20);
  sphere(0.11); pop();
}

function drawFPRacket() {
  const swingT = millis() - lastSwingFx, swinging = swingT < 200;
  // perto da câmera (eye z=+5), à frente dela (-Z) e baixa
  const x = playerX * 1.9, y = 1.15, z = 2.3;
  push();
  translate(x, y, z);
  rotateX(-0.5);
  let rz = -0.3 + playerX * 0.25;
  if (swinging) rz += Math.sin((swingT / 200) * Math.PI) * -1.4;
  rotateZ(rz);
  // cabo (sai de baixo, da mão)
  fill(30, 24, 18);
  push(); translate(0, -0.34, 0); cylinder(0.022, 0.46); pop();
  // aro (em cima)
  fill(swinging ? color(255, 216, 107) : color(212, 184, 122));
  push(); translate(0, 0.14, 0); torus(0.2, 0.022); pop();
  // cordas (disco translúcido)
  push(); translate(0, 0.14, 0); rotateX(HALF_PI);
  fill(255, 255, 255, 45); noStroke(); ellipse(0, 0, 0.36, 0.36); pop();
  pop();
}

function drawScoreboard() {
  push();
  translate(0, 4.2, -(CL + 9.2));
  scale(-1, -1, 1);            // corrige o giro de 180° do texto
  texture(boardTex);
  plane(7, 3);
  pop();
}

// ── HUD (DOM) ─────────────────────────────────────────────
function cacheHud() {
  hud.mode = document.getElementById('hud-mode');
  hud.lat = document.getElementById('hud-lat');
  hud.hp = document.getElementById('hud-hp');
  hud.hc = document.getElementById('hud-hc');
  hud.msg = document.getElementById('hud-msg');
  hud.hint = document.getElementById('hud-hint');
}
function updateHUD() {
  if (!hud.hp) return;
  const connected = window.Phone && Phone.connected;
  hud.mode.textContent = mode === 'training' ? 'TREINO' : 'PARTIDA';
  hud.lat.textContent = (connected && Phone.latency != null) ? Math.round(Phone.latency) + ' ms' : '—';
  hud.hp.textContent = scoreP; hud.hc.textContent = scoreC;
  hud.msg.textContent = msg;
  hud.hint.textContent = connected
    ? '📱 incline para mover · balance para rebater · [C] calibrar'
    : 'mouse move · ESPAÇO/clique rebate · [C] calibrar';
}

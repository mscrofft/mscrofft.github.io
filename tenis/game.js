/* ============================================================
   game.js — Jogo de tênis em perspectiva pseudo-3D (p5.js).
   Você (base inferior) joga contra a CPU (base superior).
   Controle: celular como raquete (objeto global `Phone` em net.js)
   ou, sem celular, MOUSE move e ESPAÇO dá a raquetada.

   Sistema de coordenadas de "mundo":
     cx : -1 (esquerda) .. +1 (direita)   — largura da quadra
     cy :  0 (base do jogador) .. 1 (base da CPU)   — rede em 0.5
     z  :  0 (chão) para cima              — altura da bola
   ============================================================ */

// ── Ajustes de jogabilidade ───────────────────────────────
const NET_CY        = 0.5;    // posição da rede
const NET_H         = 0.32;   // altura da rede (mundo)
const GRAV          = 5.2;    // gravidade (unidades/s²)
const RESTITUTION   = 0.62;   // quique no chão
const PLAYER_LINE   = 0.12;   // linha onde o jogador rebate
const AI_LINE       = 0.88;   // linha onde a CPU rebate
const RACKET_REACH  = 0.30;   // alcance lateral da raquete do jogador
const SWING_WINDOW  = 260;    // ms — janela da raquetada para conectar
const WIN_SCORE     = 11;

// Dificuldade da CPU
const AI_SPEED      = 1.6;    // velocidade de deslocamento (cx/s)
const AI_REACH      = 0.34;   // alcance da CPU
const AI_MISS       = 0.12;   // chance de errar mesmo no alcance

// ── Projeção perspectiva ──────────────────────────────────
function depthScale(cy) { return 1 / (1 + cy * 2.1); }
const DS1 = 1 / (1 + 2.1); // depthScale(1)

function projX(cx, cy) { return width * 0.5 + cx * (width * 0.46) * depthScale(cy); }
function projY(cy) {
  const nearY = height * 0.90, farY = height * 0.17;
  const t = (1 - depthScale(cy)) / (1 - DS1);
  return nearY + (farY - nearY) * t;
}
function projH(z, cy) { return z * height * 0.30 * depthScale(cy); }

// ── Estado ────────────────────────────────────────────────
let ball;
let playerX = 0, aiX = 0;           // posição lateral das raquetes (cx)
let swing = { t: -9999, power: 1 }; // última raquetada do jogador
let scoreP = 0, scoreC = 0;
let state = 'serve';                // 'serve' | 'rally' | 'over'
let serveAt = 0;
let msg = '';
let lastSwingFx = -9999;

function newBall() {
  return {
    cx: 0, cy: 0.5, z: 0.5,
    vx: 0, vy: 0, vz: 0,
    bounces: 0, bounceSide: 0, // -1 lado jogador, +1 lado CPU
    attemptP: false, attemptC: false,
    alive: true, trail: [],
  };
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  ball = newBall();
  startServe('cpu'); // a CPU sempre saca para o jogador
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); }

// ── Saque ─────────────────────────────────────────────────
function startServe(by) {
  state = 'serve';
  ball = newBall();
  if (by === 'cpu') { ball.cx = random(-0.4, 0.4); ball.cy = 0.95; ball.z = 0.6; }
  else { ball.cx = random(-0.4, 0.4); ball.cy = 0.05; ball.z = 0.6; }
  ball._serveBy = by;
  serveAt = millis() + 1100;
  msg = by === 'cpu' ? 'CPU vai sacar…' : 'seu saque…';
}

function launchServe() {
  const by = ball._serveBy;
  const target = random(-0.5, 0.5);
  if (by === 'cpu') {
    ball.vy = -1.05; ball.vx = (target - ball.cx) * 0.9; ball.vz = 1.7;
  } else {
    ball.vy = 1.05; ball.vx = (target - ball.cx) * 0.9; ball.vz = 1.7;
  }
  state = 'rally';
  msg = '';
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
  ball.cy = PLAYER_LINE; // garante que saiu da zona
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
  if (winner === 'p') scoreP++; else scoreC++;
  if (scoreP >= WIN_SCORE || scoreC >= WIN_SCORE) {
    state = 'over';
    msg = scoreP > scoreC ? 'VOCÊ VENCEU! 🏆  (ENTER joga de novo)'
                          : 'CPU venceu.  (ENTER joga de novo)';
    return;
  }
  // quem perdeu o ponto recebe o próximo saque do adversário
  startServe('cpu');
}

// ── Física ────────────────────────────────────────────────
function updatePhysics(dt) {
  if (state === 'serve') {
    if (millis() >= serveAt) launchServe();
    return;
  }
  if (state !== 'rally') return;

  ball.vz -= GRAV * dt;
  ball.cx += ball.vx * dt;
  ball.cy += ball.vy * dt;
  ball.z  += ball.vz * dt;

  // rastro
  ball.trail.push({ cx: ball.cx, cy: ball.cy, z: ball.z });
  if (ball.trail.length > 12) ball.trail.shift();

  // quique no chão
  if (ball.z <= 0 && ball.vz < 0) {
    ball.z = 0;
    ball.vz = -ball.vz * RESTITUTION;
    ball.vx *= 0.92;
    const side = ball.cy < NET_CY ? -1 : 1;
    if (side === ball.bounceSide) ball.bounces++;
    else { ball.bounceSide = side; ball.bounces = 1; }
    // dois quiques do mesmo lado = ponto do adversário
    if (ball.bounces >= 2) {
      awardPoint(side === -1 ? 'c' : 'p');
      return;
    }
  }

  // colisão com a rede
  if (crossedNet(dt)) {
    const netY = projY(NET_CY);
    if (ball.z < NET_H) {
      // bateu na rede — ponto de quem rebateu por último vai para o outro
      awardPoint(ball.vy > 0 ? 'c' : 'p');
      return;
    }
  }

  // saída lateral (fora)
  if (abs(ball.cx) > 1.15) {
    awardPoint(ball.vy > 0 ? 'c' : 'p');
    return;
  }

  // zona de rebatida do jogador (bola vindo, perto da base inferior)
  if (ball.vy < 0 && ball.cy <= PLAYER_LINE && !ball.attemptP) {
    ball.attemptP = true;
    const inTime = millis() - swing.t < SWING_WINDOW;
    const inReach = abs(ball.cx - playerX) < RACKET_REACH;
    const goodH = ball.z < 1.05;
    if (inTime && inReach && goodH) playerReturn();
  }
  if (ball.cy < -0.06) { awardPoint('c'); return; } // passou da base do jogador

  // zona de rebatida da CPU
  if (ball.vy > 0 && ball.cy >= AI_LINE && !ball.attemptC) {
    ball.attemptC = true;
    const inReach = abs(ball.cx - aiX) < AI_REACH;
    const lucky = random() > AI_MISS;
    if (inReach && lucky && ball.z < 1.1) aiReturn();
  }
  if (ball.cy > 1.06) { awardPoint('p'); return; } // passou da base da CPU
}

let _prevCy = 0.5;
function crossedNet(dt) {
  const was = _prevCy, now = ball.cy;
  _prevCy = now;
  return (was < NET_CY && now >= NET_CY) || (was > NET_CY && now <= NET_CY);
}

// ── IA: movimentação ──────────────────────────────────────
function updateAI(dt) {
  // segue a bola quando ela está indo para o lado da CPU
  let target = 0;
  if (ball.vy > 0) target = ball.cx;
  else target = ball.cx * 0.3; // descansa perto do centro
  target = constrain(target, -1, 1);
  const step = AI_SPEED * dt;
  aiX += constrain(target - aiX, -step, step);
}

// ── Controle do jogador ───────────────────────────────────
function updatePlayer() {
  let target;
  if (window.Phone && Phone.connected) {
    target = constrain(Phone.gamma / 38, -1, 1); // gamma ~ ±38° -> ±1
    if (Phone.swing) {
      doSwing(Phone.swing.power);
      Phone.swing = null;
    }
  } else {
    target = map(mouseX, 0, width, -1, 1, true);
  }
  playerX = lerp(playerX, constrain(target, -1, 1), 0.28);
}

function keyPressed() {
  if (key === ' ') doSwing(1.2);
  if (keyCode === ENTER) {
    if (state === 'over') { scoreP = 0; scoreC = 0; startServe('cpu'); }
  }
}
function mousePressed() {
  // clique também conta como raquetada (útil no desktop)
  if (mouseY > 0 && state === 'rally') doSwing(1.1);
}

// ── Desenho ───────────────────────────────────────────────
function draw() {
  const dt = Math.min(deltaTime / 1000, 0.05);
  updatePlayer();
  updateAI(dt);
  updatePhysics(dt);

  drawBackground();
  drawCourt();
  drawNetBack();
  drawShadow();
  drawAIRacket();
  drawNetFront();
  drawBall();
  drawPlayerRacket();
  drawHUD();
}

function drawBackground() {
  background(8, 22, 36);
  noStroke();
  // arquibancada/horizonte
  fill(13, 30, 48);
  rect(0, 0, width, projY(1) - 6);
}

function drawCourt() {
  // piso da quadra (trapézio)
  const TL = [projX(-1, 1), projY(1)];
  const TR = [projX(1, 1), projY(1)];
  const BR = [projX(1, 0), projY(0)];
  const BL = [projX(-1, 0), projY(0)];
  noStroke();
  fill(34, 96, 140); // quadra azul (hard court)
  quad(TL[0], TL[1], TR[0], TR[1], BR[0], BR[1], BL[0], BL[1]);

  // entorno
  noFill();
  // linhas
  stroke(235, 240, 245, 220);
  strokeWeight(2);
  courtLine(-1, 0, -1, 1); // lateral esq
  courtLine(1, 0, 1, 1);   // lateral dir
  courtLine(-1, 0, 1, 0);  // base jogador
  courtLine(-1, 1, 1, 1);  // base CPU
  // linhas de saque
  courtLine(-1, 0.28, 1, 0.28);
  courtLine(-1, 0.72, 1, 0.72);
  courtLine(0, 0.28, 0, 0.72); // central de saque
}

function courtLine(cx1, cy1, cx2, cy2) {
  line(projX(cx1, cy1), projY(cy1), projX(cx2, cy2), projY(cy2));
}

function drawNetBack() { drawNet(true); }
function drawNetFront() { drawNet(false); }
function drawNet(back) {
  // postes + faixa da rede em cy=0.5
  const yBase = projY(NET_CY);
  const xL = projX(-1.05, NET_CY), xR = projX(1.05, NET_CY);
  const topL = yBase - projH(NET_H, NET_CY);
  push();
  // malha
  stroke(220, 230, 238, back ? 60 : 130);
  strokeWeight(1);
  const segs = 26;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = lerp(xL, xR, t);
    line(x, topL, x, yBase);
  }
  // faixa superior
  stroke(245); strokeWeight(3);
  line(xL, topL, xR, topL);
  // postes
  strokeWeight(5); stroke(230);
  line(xL, yBase, xL, topL);
  line(xR, yBase, xR, topL);
  pop();
}

function drawShadow() {
  const x = projX(ball.cx, ball.cy);
  const y = projY(ball.cy);
  const s = depthScale(ball.cy);
  const a = map(ball.z, 0, 2, 90, 18, true);
  noStroke();
  fill(0, 0, 0, a);
  ellipse(x, y, 26 * s, 10 * s);
}

function drawBall() {
  // rastro
  noStroke();
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const s = depthScale(t.cy);
    const x = projX(t.cx, t.cy);
    const y = projY(t.cy) - projH(t.z, t.cy);
    fill(223, 245, 90, (i / ball.trail.length) * 90);
    circle(x, y, (8 + 12 * s) * (i / ball.trail.length));
  }
  const x = projX(ball.cx, ball.cy);
  const y = projY(ball.cy) - projH(ball.z, ball.cy);
  const r = 8 + 13 * depthScale(ball.cy);
  noStroke();
  fill(223, 245, 90);
  circle(x, y, r);
  // brilho
  fill(255, 255, 255, 120);
  circle(x - r * 0.18, y - r * 0.18, r * 0.4);
}

function drawPlayerRacket() {
  const cy = PLAYER_LINE - 0.02;
  drawRacket(playerX, cy, '#d4b87a', millis() - lastSwingFx < 130);
}
function drawAIRacket() {
  drawRacket(aiX, AI_LINE + 0.02, '#e86b5a', false);
}
function drawRacket(cx, cy, col, hot) {
  const x = projX(cx, cy);
  const y = projY(cy);
  const s = depthScale(cy);
  const w = 70 * s, h = 96 * s;
  push();
  translate(x, y);
  // cabo
  stroke(40, 30, 20); strokeWeight(6 * s);
  line(0, 0, 0, h * 0.6);
  // aro
  noFill();
  stroke(col); strokeWeight((hot ? 7 : 4) * s);
  ellipse(0, -h * 0.15, w, h);
  // cordas
  stroke(255, 255, 255, 70); strokeWeight(1);
  for (let i = -2; i <= 2; i++) line(i * w * 0.16, -h * 0.6, i * w * 0.16, h * 0.28);
  for (let j = -2; j <= 2; j++) line(-w * 0.45, -h * 0.15 + j * h * 0.16, w * 0.45, -h * 0.15 + j * h * 0.16);
  pop();
}

function drawHUD() {
  // placar
  textFont('IBM Plex Mono, monospace');
  textAlign(CENTER, TOP);
  noStroke();
  fill(255, 255, 255, 230);
  textSize(13);
  text('VOCÊ', width / 2 - 70, 64);
  text('CPU', width / 2 + 70, 64);
  textSize(34);
  fill(212, 184, 122);
  text(scoreP, width / 2 - 70, 80);
  fill(232, 107, 90);
  text(scoreC, width / 2 + 70, 80);
  fill(255, 255, 255, 120);
  textSize(20);
  text('—', width / 2, 90);

  // indicador de controle
  textAlign(LEFT, BOTTOM);
  textSize(11);
  const connected = window.Phone && Phone.connected;
  fill(connected ? color(127, 224, 160) : color(255, 255, 255, 110));
  text(connected ? '📱 celular conectado — incline para mover, balance para rebater'
                 : 'mouse move · ESPAÇO/clique rebate', 20, height - 18);

  // mensagem central (saque / fim de jogo)
  if (msg) {
    textAlign(CENTER, CENTER);
    textSize(state === 'over' ? 30 : 18);
    fill(255, 255, 255, 235);
    text(msg, width / 2, height * 0.42);
  }
}

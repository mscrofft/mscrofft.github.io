/* ============================================================
   control.js — lado CELULAR (a raquete).
   Pede permissão dos sensores (iOS 13+ exige toque + HTTPS),
   lê deviceorientation (posição/ângulo) e devicemotion (raquetada),
   e envia para o computador via PeerJS.
   ============================================================ */

(function () {
  const $ = (id) => document.getElementById(id);
  const codeIn = $('codeIn');
  const startBtn = $('start');
  const statusEl = $('status');
  const status2 = $('status2');
  const meterFill = $('meterFill');
  const swingFx = $('swingFx');

  // código pelo hash do QR: control.html#ABC123
  const hashCode = (location.hash || '').replace('#', '').toUpperCase();
  if (hashCode) codeIn.value = hashCode;

  let conn = null;
  let connected = false;
  let lastOrientSent = 0;
  let lastSwing = 0;

  // config (ajustada pelo host via mensagem 'config')
  let sendInterval = 1000 / 60;   // 60 Hz
  let swingThreshold = 14;        // m/s²
  let rotThreshold = 320;         // °/s
  let neutralGamma = 0;           // offset de centro (recalibrar)
  let lastGamma = 0;

  function setStatus(el, msg, cls) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  // ── Conexão ─────────────────────────────────────────────
  function connect(code) {
    setStatus(statusEl, 'conectando…');
    const peer = new Peer({ debug: 1 });
    peer.on('open', () => {
      conn = peer.connect(code, { reliable: false });
      conn.on('open', () => {
        connected = true;
        $('setup').style.display = 'none';
        $('play').classList.add('on');
        setStatus(status2, 'conectado — pode jogar!', 'ok');
      });
      conn.on('data', onHostData);
      conn.on('close', () => {
        connected = false;
        setStatus(status2, 'desconectado', 'err');
      });
      conn.on('error', () => setStatus(statusEl, 'erro na conexão', 'err'));
    });
    peer.on('error', (err) => {
      console.warn(err);
      const m = err && err.type === 'peer-unavailable'
        ? 'código não encontrado — confira no computador'
        : 'falha de conexão (' + (err.type || '?') + ')';
      setStatus(statusEl, m, 'err');
    });
  }

  function send(obj) {
    if (connected && conn && conn.open) {
      try { conn.send(obj); } catch (e) {}
    }
  }

  // mensagens vindas do host (computador)
  function onHostData(d) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'config') {
      if (d.swingThreshold != null) swingThreshold = d.swingThreshold;
      if (d.rotThreshold != null) rotThreshold = d.rotThreshold;
      if (d.sendRate) sendInterval = 1000 / d.sendRate;
    } else if (d.type === 'ping') {
      send({ type: 'pong', t: d.t });        // devolve o timestamp p/ medir RTT
    } else if (d.type === 'center') {
      neutralGamma = lastGamma;               // ângulo atual vira o "centro"
      if (navigator.vibrate) navigator.vibrate(20);
    }
  }

  // ── Sensores ────────────────────────────────────────────
  function onOrient(e) {
    lastGamma = e.gamma || 0;
    const now = performance.now();
    if (now - lastOrientSent < sendInterval) return; // taxa configurável (default 60Hz)
    lastOrientSent = now;
    const g = lastGamma - neutralGamma; // aplica o centro recalibrado
    send({ type: 'orient', gamma: g, beta: e.beta || 0, alpha: e.alpha || 0 });
    // feedback visual: barra mostra inclinação lateral
    const gc = Math.max(-38, Math.min(38, g));
    if (meterFill) meterFill.style.width = (50 + (gc / 38) * 50) + '%';
  }

  function onMotion(e) {
    const now = performance.now();
    // aceleração sem gravidade quando disponível; senão usa a com gravidade
    const a = e.acceleration && e.acceleration.x != null ? e.acceleration : e.accelerationIncludingGravity;
    let accMag = 0;
    if (a) accMag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    // se veio com gravidade, remove a base ~9.8
    if (!(e.acceleration && e.acceleration.x != null)) accMag = Math.abs(accMag - 9.8);

    const r = e.rotationRate;
    let rotMag = 0;
    if (r) rotMag = Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0);

    const isSwing = (accMag > swingThreshold || rotMag > rotThreshold);
    if (isSwing && now - lastSwing > 280) {
      lastSwing = now;
      const power = Math.min(2.2, 0.8 + accMag / 22 + rotMag / 900);
      send({ type: 'swing', power: power, dir: 0 });
      flashSwing();
      if (navigator.vibrate) navigator.vibrate(30);
    }
  }

  function flashSwing() {
    if (!swingFx) return;
    swingFx.classList.add('hit');
    setTimeout(() => swingFx.classList.remove('hit'), 130);
  }

  // ── Permissão dos sensores (iOS) + arranque ─────────────
  async function requestSensors() {
    let ok = true;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const p = await DeviceOrientationEvent.requestPermission();
        ok = ok && p === 'granted';
      }
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const p = await DeviceMotionEvent.requestPermission();
        ok = ok && p === 'granted';
      }
    } catch (e) { ok = false; }
    return ok;
  }

  startBtn.addEventListener('click', async () => {
    const code = (codeIn.value || '').trim().toUpperCase();
    if (code.length < 4) { setStatus(statusEl, 'digite o código do computador', 'err'); return; }

    const granted = await requestSensors();
    if (!granted) {
      setStatus(statusEl, 'sensores negados — habilite o movimento no navegador', 'err');
      return;
    }
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('devicemotion', onMotion);
    connect(code);
  });

  // segurança: precisa de HTTPS para os sensores em celulares
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    setStatus(statusEl, '⚠ abra esta página por HTTPS para os sensores funcionarem', 'err');
  }
})();

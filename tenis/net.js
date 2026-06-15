/* ============================================================
   net.js — lado HOST (computador) da conexão com o celular.
   Cria um Peer (PeerJS / WebRTC), mostra QR + código e expõe
   um objeto global `Phone` que o game.js lê a cada frame.
   ============================================================ */

(function (global) {
  // Estado lido pelo jogo:
  const Phone = {
    connected: false,
    gamma: 0,          // inclinação esquerda/direita (-90..90)
    beta: 0,           // inclinação frente/trás
    swing: null,       // {power, dir, t} quando chega uma raquetada; o jogo consome
  };

  const $ = (id) => document.getElementById(id);
  const panel = $('conn');
  const statusEl = $('status');
  const codeEl = $('code');
  const flashEl = $('flash');

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('err', !!isErr);
  }

  function showPanel() { panel && panel.classList.remove('hidden'); }
  function hidePanel() { panel && panel.classList.add('hidden'); }

  function flash() {
    if (!flashEl) return;
    flashEl.classList.add('show');
    setTimeout(() => flashEl.classList.remove('show'), 2200);
  }

  // Código curto e legível para o id do Peer (evita ambíguos: 0/O, 1/I).
  function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function controlURL(code) {
    return new URL('control.html', location.href).href + '#' + code;
  }

  function drawQR(url) {
    const box = $('qr');
    if (!box || !global.QRCode) return;
    box.innerHTML = '';
    // API do davidshimjs/qrcodejs: new QRCode(elemento, {...})
    new global.QRCode(box, {
      text: url,
      width: 188,
      height: 188,
      correctLevel: global.QRCode.CorrectLevel.M,
    });
  }

  function handleData(d) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'orient') {
      Phone.gamma = d.gamma || 0;
      Phone.beta = d.beta || 0;
    } else if (d.type === 'swing') {
      Phone.swing = { power: d.power || 1, dir: d.dir || 0, t: performance.now() };
    }
  }

  let peer = null;
  let conn = null;
  let triesLeft = 6; // se o código colidir no broker, tenta outro

  function start() {
    const code = makeCode();
    if (codeEl) codeEl.textContent = code;

    setStatus('conectando ao servidor…');
    peer = new Peer(code, { debug: 1 });

    peer.on('open', (id) => {
      setStatus('aguardando o celular…');
      drawQR(controlURL(id));
    });

    peer.on('connection', (c) => {
      conn = c;
      setStatus('pareando…');
      c.on('open', () => {
        Phone.connected = true;
        setStatus('conectado!');
        hidePanel();
        flash();
      });
      c.on('data', handleData);
      c.on('close', () => {
        Phone.connected = false;
        setStatus('celular desconectou', true);
        showPanel();
      });
      c.on('error', () => { Phone.connected = false; });
    });

    peer.on('error', (err) => {
      console.warn('peer error', err);
      if (err && err.type === 'unavailable-id' && triesLeft-- > 0) {
        // código já em uso — recria com outro
        try { peer.destroy(); } catch (e) {}
        start();
        return;
      }
      if (err && err.type === 'network') {
        setStatus('sem conexão com o servidor — você ainda pode jogar com mouse + ESPAÇO', true);
      } else {
        setStatus('erro de conexão — jogue com mouse + ESPAÇO', true);
      }
    });

    peer.on('disconnected', () => {
      setStatus('reconectando…', true);
      try { peer.reconnect(); } catch (e) {}
    });
  }

  // ENTER fecha o painel para jogar no teclado/mouse sem celular.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hidePanel();
  });

  if (global.Peer) start();
  else setStatus('falha ao carregar PeerJS', true);

  global.Phone = Phone;
})(window);

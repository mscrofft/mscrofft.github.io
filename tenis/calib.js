/* ============================================================
   calib.js — config do jogador + painel de calibração.
   Define window.cfg (sensibilidade/latência/raquetada), persiste em
   localStorage e monta um painel de sliders sobre a tela do host.
   Mudanças são aplicadas em tempo real; as que afetam o celular
   (limiar da raquetada, taxa de envio) são reenviadas via net.js.
   ============================================================ */

(function (global) {
  const KEY = 'tenis-cfg';
  const DEFAULTS = {
    sensitivity: 38,   // graus de inclinação p/ curso total da raquete
    smoothing: 0.35,   // fator de suavização (↑ = mais responsivo / menos latência)
    reach: 0.30,       // alcance lateral da raquete
    invertX: false,    // inverter eixo esquerda/direita
    swingThreshold: 14, // m/s² — força mínima da raquetada (celular)
    rotThreshold: 320,  // °/s — giro mínimo do pulso (celular)
    sendRate: 60,       // Hz — taxa de envio da orientação (celular)
  };

  let cfg;
  try { cfg = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { cfg = Object.assign({}, DEFAULTS); }
  global.cfg = cfg;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  // Sliders: [chave, rótulo, min, max, passo, sufixo, afetaCelular]
  const FIELDS = [
    ['sensitivity', 'Sensibilidade (graus p/ curso)', 12, 70, 1, '°', false],
    ['smoothing', 'Responsividade (↑ menos latência)', 0.08, 1, 0.01, '', false],
    ['reach', 'Alcance da raquete', 0.15, 0.6, 0.01, '', false],
    ['swingThreshold', 'Força da raquetada (celular)', 6, 28, 1, '', true],
    ['rotThreshold', 'Giro da raquetada (celular)', 150, 600, 10, '°/s', true],
    ['sendRate', 'Taxa de envio (celular)', 20, 90, 5, 'Hz', true],
  ];

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'calib';
    panel.className = 'hidden';
    panel.innerHTML = '<div class="calib-head">⚙ Calibração</div>';

    // modo
    const modeRow = document.createElement('div');
    modeRow.className = 'calib-mode';
    modeRow.innerHTML =
      '<button data-mode="training" class="on">Treino</button>' +
      '<button data-mode="match">Partida</button>';
    panel.appendChild(modeRow);
    modeRow.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        modeRow.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        if (global.setMode) global.setMode(b.dataset.mode);
      });
    });

    // sliders
    FIELDS.forEach(([key, label, min, max, step, suffix, phone]) => {
      const row = document.createElement('div');
      row.className = 'calib-row';
      const val = document.createElement('span');
      val.className = 'calib-val';
      const fmt = () => (step < 1 ? cfg[key].toFixed(2) : cfg[key]) + suffix;
      val.textContent = fmt();
      const lab = document.createElement('label');
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.value = cfg[key];
      input.addEventListener('input', () => {
        cfg[key] = parseFloat(input.value);
        val.textContent = fmt();
        save();
        if (phone && global.NetSendConfig) global.NetSendConfig();
      });
      lab.appendChild(val);
      row.appendChild(lab);
      row.appendChild(input);
      panel.appendChild(row);
    });

    // inverter eixo
    const inv = document.createElement('label');
    inv.className = 'calib-check';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cfg.invertX;
    cb.addEventListener('change', () => { cfg.invertX = cb.checked; save(); });
    inv.appendChild(cb); inv.appendChild(document.createTextNode(' Inverter esquerda/direita'));
    panel.appendChild(inv);

    // botões
    const actions = document.createElement('div');
    actions.className = 'calib-actions';
    const center = document.createElement('button');
    center.textContent = '🎯 Recalibrar centro';
    center.addEventListener('click', () => { if (global.NetRecenter) global.NetRecenter(); });
    const reset = document.createElement('button');
    reset.textContent = '↺ Padrões';
    reset.addEventListener('click', () => {
      Object.assign(cfg, DEFAULTS); save();
      if (global.NetSendConfig) global.NetSendConfig();
      panel.remove(); buildPanel(); togglePanel(true);
    });
    actions.appendChild(center); actions.appendChild(reset);
    panel.appendChild(actions);

    document.body.appendChild(panel);
    return panel;
  }

  let panelEl = null;
  function togglePanel(force) {
    if (!panelEl) panelEl = document.getElementById('calib') || buildPanel();
    const show = force != null ? force : panelEl.classList.contains('hidden');
    panelEl.classList.toggle('hidden', !show);
  }

  // tecla C abre/fecha; botão de engrenagem também
  document.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') togglePanel();
  });

  function init() {
    panelEl = buildPanel();
    const gear = document.getElementById('calib-gear');
    if (gear) gear.addEventListener('click', () => togglePanel());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.UICalib = { toggle: togglePanel };
})(window);

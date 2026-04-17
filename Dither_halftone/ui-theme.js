/* ============================================================
   ui-theme.js  —  sistema de tema padronizado para sketches p5.js
   Fonte: IBM Plex Mono
   Modo padrão: fundo preto, texto branco
   ============================================================ */

const UITheme = (() => {

  /* ── tokens de design ─────────────────────────────────── */
  const FONT_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap';
  const FONT_FAMILY = "'IBM Plex Mono', monospace";

  const THEMES = {
    dark:  { bg: '#000000', fg: '#ffffff', bgCanvas: '#0b0b0d' },
    light: { bg: '#ffffff', fg: '#000000', bgCanvas: '#f0f0ee' },
  };

  let currentTheme = 'dark';
  let onToggle = null; // callback externo

  /* ── injeção da fonte ──────────────────────────────────── */
  function _loadFont() {
    if (document.querySelector('link[data-ui-theme-font]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    link.setAttribute('data-ui-theme-font', '');
    document.head.appendChild(link);
  }

  /* ── CSS base injetado uma vez ─────────────────────────── */
  function _injectBaseCSS() {
    if (document.querySelector('style[data-ui-theme]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-ui-theme', '');
    style.textContent = `
      :root {
        --ui-bg:       #000000;
        --ui-fg:       #ffffff;
        --ui-bg-panel: rgba(0,0,0,0.82);
        --ui-border:   rgba(255,255,255,0.12);
        --ui-accent:   #ffffff;
        --ui-muted:    rgba(255,255,255,0.45);
        --ui-font:     ${FONT_FAMILY};
        --ui-radius:   2px;
        --ui-transition: 180ms ease;
      }
      body[data-theme="light"] {
        --ui-bg:       #ffffff;
        --ui-fg:       #000000;
        --ui-bg-panel: rgba(255,255,255,0.88);
        --ui-border:   rgba(0,0,0,0.12);
        --ui-accent:   #000000;
        --ui-muted:    rgba(0,0,0,0.45);
      }

      /* reset global de fonte */
      body { font-family: var(--ui-font); }

      /* ── painel lateral ──────────────────────────────── */
      #ui-panel {
        position: fixed;
        top: 0; right: 0;
        width: 230px;
        height: 100vh;
        overflow-y: auto;
        overflow-x: hidden;
        background: var(--ui-bg-panel);
        border-left: 1px solid var(--ui-border);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 100;
        padding: 0 0 24px 0;
        box-sizing: border-box;
        transition: background var(--ui-transition), border-color var(--ui-transition);
        scrollbar-width: thin;
        scrollbar-color: var(--ui-border) transparent;
      }
      #ui-panel::-webkit-scrollbar { width: 4px; }
      #ui-panel::-webkit-scrollbar-thumb { background: var(--ui-border); border-radius: 2px; }

      /* cabeçalho do painel */
      #ui-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 14px 10px;
        border-bottom: 1px solid var(--ui-border);
        margin-bottom: 6px;
      }
      #ui-panel-title {
        font-family: var(--ui-font);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ui-fg);
        opacity: 0.9;
      }

      /* botão inverter cores */
      #ui-theme-toggle {
        display: flex;
        align-items: center;
        gap: 5px;
        font-family: var(--ui-font);
        font-size: 9px;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ui-fg);
        background: transparent;
        border: 1px solid var(--ui-border);
        border-radius: var(--ui-radius);
        padding: 4px 8px;
        cursor: pointer;
        transition: background var(--ui-transition), border-color var(--ui-transition), color var(--ui-transition);
        white-space: nowrap;
      }
      #ui-theme-toggle:hover {
        background: var(--ui-fg);
        color: var(--ui-bg);
        border-color: var(--ui-fg);
      }
      #ui-theme-toggle svg {
        width: 10px; height: 10px;
        fill: currentColor;
        flex-shrink: 0;
      }

      /* ── seções/pastas ───────────────────────────────── */
      .ui-section {
        margin: 0;
        border-bottom: 1px solid var(--ui-border);
      }
      .ui-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        cursor: pointer;
        user-select: none;
      }
      .ui-section-label {
        font-family: var(--ui-font);
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ui-muted);
      }
      .ui-section-arrow {
        font-size: 8px;
        color: var(--ui-muted);
        transition: transform 150ms ease;
      }
      .ui-section.collapsed .ui-section-arrow { transform: rotate(-90deg); }
      .ui-section-body {
        padding: 4px 0 10px;
      }
      .ui-section.collapsed .ui-section-body { display: none; }

      /* ── controles ──────────────────────────────────── */
      .ui-row {
        display: flex;
        align-items: center;
        padding: 3px 14px;
        gap: 8px;
        min-height: 26px;
      }
      .ui-row.hidden { display: none !important; }

      .ui-label {
        font-family: var(--ui-font);
        font-size: 10px;
        color: var(--ui-fg);
        opacity: 0.75;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* slider */
      .ui-slider {
        -webkit-appearance: none;
        appearance: none;
        flex: 1.2;
        height: 2px;
        background: var(--ui-border);
        border-radius: 1px;
        outline: none;
        cursor: pointer;
        accent-color: var(--ui-fg);
      }
      .ui-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px; height: 10px;
        border-radius: 50%;
        background: var(--ui-fg);
        cursor: pointer;
        transition: transform 120ms ease;
      }
      .ui-slider:hover::-webkit-slider-thumb { transform: scale(1.3); }

      .ui-value {
        font-family: var(--ui-font);
        font-size: 9px;
        color: var(--ui-muted);
        min-width: 28px;
        text-align: right;
      }

      /* select */
      .ui-select {
        font-family: var(--ui-font);
        font-size: 9px;
        color: var(--ui-fg);
        background: transparent;
        border: 1px solid var(--ui-border);
        border-radius: var(--ui-radius);
        padding: 3px 6px;
        flex: 1.2;
        cursor: pointer;
        outline: none;
        transition: border-color var(--ui-transition);
        -webkit-appearance: none;
      }
      .ui-select:focus { border-color: var(--ui-fg); }
      .ui-select option { background: var(--ui-bg); color: var(--ui-fg); }

      /* color swatch */
      .ui-color {
        width: 22px; height: 14px;
        border-radius: 1px;
        border: 1px solid var(--ui-border);
        cursor: pointer;
        outline: none;
        padding: 0;
        flex-shrink: 0;
        -webkit-appearance: none;
        background: none;
      }
      .ui-color::-webkit-color-swatch-wrapper { padding: 0; }
      .ui-color::-webkit-color-swatch { border: none; border-radius: 1px; }

      /* botão de ação */
      .ui-btn {
        font-family: var(--ui-font);
        font-size: 9px;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ui-fg);
        background: transparent;
        border: 1px solid var(--ui-border);
        border-radius: var(--ui-radius);
        padding: 4px 10px;
        cursor: pointer;
        white-space: nowrap;
        transition: background var(--ui-transition), color var(--ui-transition);
        width: 100%;
        text-align: left;
      }
      .ui-btn:hover {
        background: var(--ui-fg);
        color: var(--ui-bg);
        border-color: var(--ui-fg);
      }

      /* ── hint ───────────────────────────────────────── */
      #hint {
        font-family: var(--ui-font) !important;
        font-size: 10px !important;
        color: var(--ui-muted) !important;
        background: var(--ui-bg-panel) !important;
        border: 1px solid var(--ui-border) !important;
        border-radius: var(--ui-radius) !important;
      }
    `;
    document.head.appendChild(style);
  }

  /* ── aplica tema ao document e canvas ─────────────────── */
  function _applyTheme() {
    const t = THEMES[currentTheme];
    document.body.setAttribute('data-theme', currentTheme);
    document.body.style.background = t.bgCanvas;

    // atualiza canvas p5 se existir
    const c = document.querySelector('canvas');
    if (c) c.style.background = t.bgCanvas;
  }

  /* ── toggle público ────────────────────────────────────── */
  function toggle() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    _applyTheme();
    if (typeof onToggle === 'function') onToggle(currentTheme, THEMES[currentTheme]);
  }

  /* ── getters ────────────────────────────────────────────── */
  function get() { return { ...THEMES[currentTheme], name: currentTheme }; }
  function bg()  { return THEMES[currentTheme].bg; }
  function fg()  { return THEMES[currentTheme].fg; }

  /* ── init ───────────────────────────────────────────────── */
  function init(opts = {}) {
    _loadFont();
    _injectBaseCSS();
    if (opts.onToggle) onToggle = opts.onToggle;
    if (opts.initial)  currentTheme = opts.initial;
    _applyTheme();
  }

  return { init, toggle, get, bg, fg };
})();


/* ============================================================
   UIPanel  —  painel lateral customizado (substitui dat.GUI)
   ============================================================ */

const UIPanel = (() => {

  let _panel = null;

  function _createPanel(title) {
    const panel = document.createElement('div');
    panel.id = 'ui-panel';

    const header = document.createElement('div');
    header.id = 'ui-panel-header';

    const titleEl = document.createElement('span');
    titleEl.id = 'ui-panel-title';
    titleEl.textContent = title || 'Controls';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'ui-theme-toggle';
    toggleBtn.innerHTML = `<svg viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 0 1 8 2.5v11a5.5 5.5 0 0 1 0-11z"/></svg> Inverter`;
    toggleBtn.title = 'Inverter cores (B&W)';
    toggleBtn.addEventListener('click', () => UITheme.toggle());

    header.appendChild(titleEl);
    header.appendChild(toggleBtn);
    panel.appendChild(header);

    document.body.appendChild(panel);
    _panel = panel;
    return panel;
  }

  /* ── seção colapsável ──────────────────────────────────── */
  function section(label, opts = {}) {
    const sec = document.createElement('div');
    sec.className = 'ui-section';
    if (opts.collapsed) sec.classList.add('collapsed');

    const hdr = document.createElement('div');
    hdr.className = 'ui-section-header';
    hdr.innerHTML = `<span class="ui-section-label">${label}</span><span class="ui-section-arrow">▼</span>`;
    hdr.addEventListener('click', () => sec.classList.toggle('collapsed'));

    const body = document.createElement('div');
    body.className = 'ui-section-body';

    sec.appendChild(hdr);
    sec.appendChild(body);
    _panel.appendChild(sec);

    /* helpers para adicionar controles dentro da seção */
    const api = {
      _body: body,

      button(label, fn) {
        const row = _makeRow();
        const btn = document.createElement('button');
        btn.className = 'ui-btn';
        btn.textContent = label;
        btn.addEventListener('click', fn);
        row.appendChild(btn);
        body.appendChild(row);
        return { row, btn };
      },

      slider(label, opts = {}) {
        const { min = 0, max = 100, step = 1, value = 50, onChange } = opts;
        const row = _makeRow();

        const lbl = document.createElement('span');
        lbl.className = 'ui-label';
        lbl.textContent = label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'ui-slider';
        slider.min = min; slider.max = max;
        slider.step = step; slider.value = value;

        const val = document.createElement('span');
        val.className = 'ui-value';
        val.textContent = value;

        slider.addEventListener('input', () => {
          val.textContent = slider.value;
          if (onChange) onChange(+slider.value);
        });

        row.append(lbl, slider, val);
        body.appendChild(row);
        return {
          row, slider,
          setValue(v) { slider.value = v; val.textContent = v; },
          hide() { row.classList.add('hidden'); },
          show() { row.classList.remove('hidden'); },
        };
      },

      select(label, choices, opts = {}) {
        const { value, onChange } = opts;
        const row = _makeRow();

        const lbl = document.createElement('span');
        lbl.className = 'ui-label';
        lbl.textContent = label;

        const sel = document.createElement('select');
        sel.className = 'ui-select';
        choices.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c; opt.textContent = c;
          if (c === value) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => { if (onChange) onChange(sel.value); });

        row.append(lbl, sel);
        body.appendChild(row);
        return {
          row, select: sel,
          setValue(v) { sel.value = v; },
          hide() { row.classList.add('hidden'); },
          show() { row.classList.remove('hidden'); },
        };
      },

      color(label, opts = {}) {
        const { value = '#ffffff', onChange } = opts;
        const row = _makeRow();

        const lbl = document.createElement('span');
        lbl.className = 'ui-label';
        lbl.textContent = label;

        const inp = document.createElement('input');
        inp.type = 'color';
        inp.className = 'ui-color';
        inp.value = value;
        inp.addEventListener('input', () => { if (onChange) onChange(inp.value); });

        row.append(lbl, inp);
        body.appendChild(row);
        return {
          row, input: inp,
          setValue(v) { inp.value = v; },
        };
      },
    };

    return api;
  }

  function _makeRow() {
    const row = document.createElement('div');
    row.className = 'ui-row';
    return row;
  }

  function init(title) {
    _createPanel(title);
  }

  return { init, section };
})();

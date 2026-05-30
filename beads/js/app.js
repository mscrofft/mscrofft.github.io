// Bootstrap geral

const App = {
  init() {
    applyI18n();
    document.getElementById('lang-select').value = currentLang;
    Palette.render();
    Grid.init(document.getElementById('grid-canvas'));

    // Tenta restaurar do localStorage (migração transparente da chave antiga 'beeds-pattern')
    const saved = localStorage.getItem('beads-pattern') || localStorage.getItem('beeds-pattern');
    if (saved) {
      try { Grid.restore(JSON.parse(saved)); History.reset(Grid.snapshot()); }
      catch { Grid.newPattern('peyote-even', 30, 40); }
    } else {
      Grid.newPattern('peyote-even', 30, 40);
    }
    document.getElementById('stitch-select').value = Grid.stitch;

    Tools.set('brush');
    this.bindEvents();
    this.autosaveLoop();
    this.initCloud();
  },

  currentCloudId: null, // id do padrão atual se carregado/salvo da nuvem

  initCloud() {
    if (!Cloud.init()) return;
    Cloud.onAuthChange(user => {
      const loggedIn = !!user;
      document.getElementById('btn-cloud-login').style.display = loggedIn ? 'none' : '';
      document.getElementById('btn-cloud-logout').style.display = loggedIn ? '' : 'none';
      document.getElementById('btn-cloud-save').style.display = loggedIn ? '' : 'none';
      document.getElementById('btn-cloud-list').style.display = loggedIn ? '' : 'none';
      const userEl = document.getElementById('cloud-user');
      userEl.style.display = loggedIn ? '' : 'none';
      userEl.textContent = loggedIn ? user.email : '';
    });

    // Login modal
    document.getElementById('btn-cloud-login').addEventListener('click', () => {
      document.getElementById('login-status').textContent = '';
      document.getElementById('modal-login').classList.remove('hidden');
    });
    document.getElementById('btn-login-cancel').addEventListener('click', () => {
      document.getElementById('modal-login').classList.add('hidden');
    });
    document.getElementById('btn-login-send').addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      if (!email) return;
      const status = document.getElementById('login-status');
      status.textContent = '...';
      try {
        await Cloud.signIn(email);
        status.textContent = t('linkSent');
      } catch (err) { status.textContent = err.message || String(err); }
    });

    // Logout
    document.getElementById('btn-cloud-logout').addEventListener('click', async () => {
      await Cloud.signOut();
      this.currentCloudId = null;
    });

    // Save cloud
    const updateBtn = document.getElementById('btn-save-cloud-update');
    const newBtn = document.getElementById('btn-save-cloud-new');
    document.getElementById('btn-cloud-save').addEventListener('click', () => {
      // Mostra "Atualizar" só se já existe um padrão carregado da nuvem
      const hasLoaded = !!this.currentCloudId;
      updateBtn.style.display = hasLoaded ? '' : 'none';
      document.getElementById('cloud-title').value = this.currentCloudTitle || '';
      document.getElementById('modal-save-cloud').classList.remove('hidden');
    });
    document.getElementById('btn-save-cloud-cancel').addEventListener('click', () => {
      document.getElementById('modal-save-cloud').classList.add('hidden');
    });
    const doSave = async (id) => {
      const title = document.getElementById('cloud-title').value.trim() || t('untitled');
      try {
        const saved = await Cloud.savePattern({ id, title, snapshot: Grid.snapshot(), thumbnail: generateThumbnail() });
        this.currentCloudId = saved.id;
        this.currentCloudTitle = saved.title;
        document.getElementById('modal-save-cloud').classList.add('hidden');
      } catch (err) { alert(err.message || String(err)); }
    };
    updateBtn.addEventListener('click', () => doSave(this.currentCloudId));
    newBtn.addEventListener('click', () => doSave(null));

    // List patterns
    document.getElementById('btn-cloud-list').addEventListener('click', async () => {
      const modal = document.getElementById('modal-patterns');
      const grid = document.getElementById('patterns-grid');
      grid.innerHTML = '...';
      modal.classList.remove('hidden');
      try {
        const list = await Cloud.listPatterns();
        if (!list.length) { grid.innerHTML = `<p style="opacity:0.6">${t('noPatterns')}</p>`; return; }
        grid.innerHTML = '';
        list.forEach(p => {
          const card = document.createElement('div');
          card.className = 'pattern-card';
          card.innerHTML = `
            <img src="${p.thumbnail || ''}" alt="" />
            <div class="pc-title">${escapeHtml(p.title)}</div>
            <div class="pc-meta">${p.cols}×${p.rows} · ${p.stitch}</div>
            <div class="pc-actions">
              <button class="pc-open">${t('open')}</button>
              <button class="pc-del">×</button>
            </div>`;
          card.querySelector('.pc-open').addEventListener('click', async () => {
            const snap = await Cloud.loadPattern(p.id);
            Grid.restore(snap);
            History.reset(Grid.snapshot());
            document.getElementById('stitch-select').value = Grid.stitch;
            this.currentCloudId = p.id;
            this.currentCloudTitle = p.title;
            modal.classList.add('hidden');
          });
          card.querySelector('.pc-del').addEventListener('click', async () => {
            if (!confirm(t('confirmDelete'))) return;
            await Cloud.deletePattern(p.id);
            if (this.currentCloudId === p.id) this.currentCloudId = null;
            card.remove();
          });
          grid.appendChild(card);
        });
      } catch (err) { grid.innerHTML = `<p style="color:#f88">${err.message || err}</p>`; }
    });
    document.getElementById('btn-patterns-close').addEventListener('click', () => {
      document.getElementById('modal-patterns').classList.add('hidden');
    });
  },

  bindEvents() {
    // Language
    document.getElementById('lang-select').addEventListener('change', e => setLang(e.target.value));

    // Stitch change (mantém dimensões)
    document.getElementById('stitch-select').addEventListener('change', e => {
      Grid.stitch = e.target.value;
      Grid.render();
      History.push(Grid.snapshot());
    });

    // Palette
    document.getElementById('palette-select').addEventListener('change', e => Palette.setActive(e.target.value));
    document.getElementById('btn-palette-delete').addEventListener('click', () => Palette.toggleDeleteMode());
    document.getElementById('btn-prune-unused').addEventListener('click', () => Grid.removeUnusedSwatches());
    document.getElementById('btn-reduce-colors').addEventListener('click', () => {
      const cur = Grid.swatchMap.length;
      if (cur < 2) return;
      const ans = prompt(t('howManyColors'), Math.max(2, cur - 1));
      if (ans === null) return;
      const k = parseInt(ans, 10);
      if (!isFinite(k) || k < 1 || k >= cur) return;
      Grid.reduceColors(k);
    });
    document.getElementById('btn-add-custom').addEventListener('click', () => {
      Palette.addCustom(document.getElementById('custom-color').value);
      document.getElementById('palette-select').value = 'custom';
      Palette.setActive('custom');
    });

    // Tools
    document.querySelectorAll('.tool').forEach(b => {
      b.addEventListener('click', () => Tools.set(b.dataset.tool));
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (confirm(t('confirmNew'))) {
        Grid.cells = Array.from({ length: Grid.rows }, () => Array(Grid.cols).fill(-1));
        Grid.render();
        History.push(Grid.snapshot());
      }
    });

    // Zoom
    document.getElementById('zoom').addEventListener('input', e => {
      Grid.cellPx = parseInt(e.target.value, 10);
      Grid.render();
    });

    // Mostrar números
    document.getElementById('show-numbers').addEventListener('change', e => {
      Grid.showNumbers = e.target.checked;
      Grid.render();
    });

    // Canvas pointer events (mouse + touch + pen unificados)
    const canvas = document.getElementById('grid-canvas');
    const canvasArea = document.querySelector('.canvas-area');
    const getCell = e => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      return hitTestCell(Grid.stitch, x, y, Grid.cols, Grid.rows, Grid.cellPx);
    };
    // Estado de multi-touch
    const pointers = new Map(); // pointerId → {x, y}
    let pinch = null; // {startDist, startCellPx, startMid, startScrollLeft, startScrollTop}

    const pointerListSnapshot = () => {
      const arr = Array.from(pointers.values());
      const dx = arr[0].x - arr[1].x, dy = arr[0].y - arr[1].y;
      return {
        dist: Math.hypot(dx, dy),
        mid: { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 }
      };
    };

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const cell = getCell(e);
        if (cell) Tools.handleDown(cell.row, cell.col);
      } else if (pointers.size === 2) {
        // Segundo dedo entrou — cancela pintura, inicia pinch+pan
        Tools.cancel();
        const snap = pointerListSnapshot();
        pinch = {
          startDist: snap.dist,
          startCellPx: Grid.cellPx,
          startMid: snap.mid,
          startScrollLeft: canvasArea.scrollLeft,
          startScrollTop: canvasArea.scrollTop
        };
      }
    });

    canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && !pinch) {
        const cell = getCell(e);
        if (cell) Tools.handleMove(cell.row, cell.col);
      } else if (pointers.size === 2 && pinch) {
        const snap = pointerListSnapshot();
        // Pinch zoom
        const scale = snap.dist / pinch.startDist;
        const newPx = Math.max(6, Math.min(40, Math.round(pinch.startCellPx * scale)));
        if (newPx !== Grid.cellPx) {
          Grid.cellPx = newPx;
          document.getElementById('zoom').value = newPx;
          Grid.render();
        }
        // Pan (delta do midpoint)
        canvasArea.scrollLeft = pinch.startScrollLeft - (snap.mid.x - pinch.startMid.x);
        canvasArea.scrollTop = pinch.startScrollTop - (snap.mid.y - pinch.startMid.y);
      }
    });

    const endPointer = e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        const cell = getCell(e);
        Tools.handleUp(cell?.row, cell?.col);
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', endPointer);

    // Brush size e shape
    document.getElementById('brush-size').addEventListener('input', e => {
      Tools.setBrushSize(parseInt(e.target.value, 10));
    });
    document.querySelectorAll('.brush-shape-btn').forEach(b => {
      b.addEventListener('click', () => Tools.setBrushShape(b.dataset.shape));
    });

    // Presets
    const presetSelect = document.getElementById('preset-select');
    const presetParams = document.getElementById('preset-params');
    const PRESET_PARAMS = {
      stripesH: [{ key: 'width', label: 'paramWidth', type: 'number', default: 1, min: 1, max: 30 }],
      stripesV: [{ key: 'width', label: 'paramWidth', type: 'number', default: 1, min: 1, max: 30 }],
      diagonalSlash: [{ key: 'width', label: 'paramWidth', type: 'number', default: 1, min: 1, max: 30 }],
      diagonalBackslash: [{ key: 'width', label: 'paramWidth', type: 'number', default: 1, min: 1, max: 30 }],
      checker: [{ key: 'size', label: 'paramSize', type: 'number', default: 1, min: 1, max: 20 }],
      diamond: [{ key: 'size', label: 'paramSize', type: 'number', default: 0.6, min: 0.1, max: 1, step: 0.1 }],
      diamondsTiled: [{ key: 'size', label: 'paramSize', type: 'number', default: 6, min: 2, max: 30 }],
      squaresTiled: [
        { key: 'size', label: 'paramSize', type: 'number', default: 4, min: 1, max: 30 },
        { key: 'gap', label: 'paramGap', type: 'number', default: 2, min: 0, max: 20 }
      ],
      waves: [
        { key: 'amp', label: 'paramAmp', type: 'number', default: 4, min: 1, max: 30 },
        { key: 'period', label: 'paramPeriod', type: 'number', default: 10, min: 2, max: 60 },
        { key: 'thickness', label: 'paramThickness', type: 'number', default: 1, min: 1, max: 10 }
      ]
    };
    const renderPresetParams = () => {
      presetParams.innerHTML = '';
      const conf = PRESET_PARAMS[presetSelect.value];
      if (!conf) return;
      conf.forEach(p => {
        const wrap = document.createElement('div');
        const lab = document.createElement('label');
        lab.textContent = t(p.label) + ':';
        const inp = document.createElement('input');
        inp.type = p.type;
        inp.id = 'preset-param-' + p.key;
        inp.value = p.default;
        if (p.min !== undefined) inp.min = p.min;
        if (p.max !== undefined) inp.max = p.max;
        if (p.step !== undefined) inp.step = p.step;
        wrap.appendChild(lab); wrap.appendChild(inp);
        presetParams.appendChild(wrap);
      });
    };
    presetSelect.addEventListener('change', renderPresetParams);
    document.getElementById('btn-preset-apply').addEventListener('click', () => {
      const name = presetSelect.value;
      if (!name) return;
      const params = {};
      (PRESET_PARAMS[name] || []).forEach(p => {
        const el = document.getElementById('preset-param-' + p.key);
        if (el) params[p.key] = parseFloat(el.value);
      });
      Grid.applyPreset(name, params);
    });

    // Drawers mobile
    const backdrop = document.getElementById('drawer-backdrop');
    const toolsPanel = document.querySelector('.tools-panel');
    const palettePanel = document.querySelector('.palette-panel');
    const closeDrawers = () => {
      toolsPanel.classList.remove('open');
      palettePanel.classList.remove('open');
      backdrop.classList.add('hidden');
    };
    document.getElementById('btn-toggle-tools').addEventListener('click', () => {
      palettePanel.classList.remove('open');
      toolsPanel.classList.toggle('open');
      backdrop.classList.toggle('hidden', !toolsPanel.classList.contains('open'));
    });
    document.getElementById('btn-toggle-palette').addEventListener('click', () => {
      toolsPanel.classList.remove('open');
      palettePanel.classList.toggle('open');
      backdrop.classList.toggle('hidden', !palettePanel.classList.contains('open'));
    });
    backdrop.addEventListener('click', closeDrawers);

    // Undo/redo
    document.getElementById('btn-undo').addEventListener('click', () => { const s = History.undo(); if (s) Grid.restore(s); });
    document.getElementById('btn-redo').addEventListener('click', () => { const s = History.redo(); if (s) Grid.restore(s); });
    window.addEventListener('keydown', e => {
      // Ignora se foco está em input
      const tag = (e.target.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); const s = History.undo(); if (s) Grid.restore(s); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); const s = History.redo(); if (s) Grid.restore(s); return; }

      if (isInput) return;

      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (Selection.active && Clipboard.copyFromSelection()) e.preventDefault();
        return;
      }
      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (!Clipboard.isEmpty()) { Clipboard.startPaste(); e.preventDefault(); }
        return;
      }
      // Delete (apaga células dentro da seleção)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (Selection.active && Selection.mask) {
          Selection.mask.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            Grid.erase(r, c);
          });
          History.push(Grid.snapshot());
          Grid.render();
          e.preventDefault();
        }
        return;
      }
      // Esc — cascade: paste mode → palette delete mode → selection
      if (e.key === 'Escape') {
        if (Clipboard.pasteMode) { Clipboard.cancelPaste(); return; }
        if (Palette.deleteMode) { Palette.exitDeleteMode(); return; }
        if (Selection.active) { Selection.clear(); return; }
      }
    });

    // Transformações do clipboard
    document.getElementById('btn-flip-h').addEventListener('click', () => { Clipboard.flipH(); Grid.render(); });
    document.getElementById('btn-flip-v').addEventListener('click', () => { Clipboard.flipV(); Grid.render(); });
    document.getElementById('btn-rotate').addEventListener('click', () => { Clipboard.rotateCW(); Grid.render(); });

    // Novo
    document.getElementById('btn-new').addEventListener('click', () => {
      document.getElementById('new-stitch').value = Grid.stitch;
      document.getElementById('new-width').value = Grid.cols;
      document.getElementById('new-height').value = Grid.rows;
      document.getElementById('modal-new').classList.remove('hidden');
    });
    document.getElementById('btn-new-cancel').addEventListener('click', () => document.getElementById('modal-new').classList.add('hidden'));
    document.getElementById('btn-new-create').addEventListener('click', () => {
      const st = document.getElementById('new-stitch').value;
      const w = parseInt(document.getElementById('new-width').value, 10);
      const h = parseInt(document.getElementById('new-height').value, 10);
      Grid.newPattern(st, w, h);
      document.getElementById('stitch-select').value = st;
      document.getElementById('modal-new').classList.add('hidden');
      App.currentCloudId = null;
      App.currentCloudTitle = null;
    });

    // Importar imagem (reabre com imagem em memória se houver)
    document.getElementById('btn-import-img').addEventListener('click', () => {
      document.getElementById('modal-import').classList.remove('hidden');
      if (ImageImport.image) {
        // Pré-preenche com as dimensões atuais do padrão
        document.getElementById('img-width').value = Grid.cols;
        document.getElementById('img-height').value = Grid.rows;
        const k = Math.max(2, Math.min(32, Grid.swatchMap.length || 8));
        document.getElementById('img-colors').value = k;
        // Re-render do preview com a imagem que já está em memória
        setTimeout(() => refreshPreview(), 0);
      }
    });
    document.getElementById('btn-import-cancel').addEventListener('click', () => document.getElementById('modal-import').classList.add('hidden'));
    let importGrid = null;
    // Proporção de uma célula (w/h) por ponto, para compensar geometrias não-quadradas
    const cellAspect = (stitch) => {
      const g = Stitches[stitch](0, 0);
      return g.w / g.h;
    };
    const imgAspect = () => ImageImport.image ? ImageImport.image.width / ImageImport.image.height : 1;
    const wInput = document.getElementById('img-width');
    const hInput = document.getElementById('img-height');
    const lockInput = document.getElementById('img-lock-ratio');

    const recalcHeightFromWidth = () => {
      if (!ImageImport.image || !lockInput.checked) return;
      const w = parseInt(wInput.value, 10);
      // pattern_w_mm / pattern_h_mm = (w * cellW) / (h * cellH) = imgAspect
      // => h = w * cellAspect / imgAspect
      const h = Math.max(2, Math.round(w * cellAspect(Grid.stitch) / imgAspect()));
      hInput.value = h;
    };
    const recalcWidthFromHeight = () => {
      if (!ImageImport.image || !lockInput.checked) return;
      const h = parseInt(hInput.value, 10);
      const w = Math.max(2, Math.round(h * imgAspect() / cellAspect(Grid.stitch)));
      wInput.value = w;
    };

    const refreshPreview = () => {
      if (!ImageImport.image) return;
      const w = parseInt(wInput.value, 10);
      const h = parseInt(hInput.value, 10);
      const k = parseInt(document.getElementById('img-colors').value, 10);
      importGrid = ImageImport.preview(document.getElementById('img-preview'), w, h, k);
    };
    document.getElementById('img-file').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      ImageImport.load(f, () => { recalcHeightFromWidth(); refreshPreview(); });
    });
    wInput.addEventListener('input', () => { recalcHeightFromWidth(); refreshPreview(); });
    hInput.addEventListener('input', () => { recalcWidthFromHeight(); refreshPreview(); });
    document.getElementById('img-colors').addEventListener('input', refreshPreview);
    lockInput.addEventListener('change', () => { if (lockInput.checked) { recalcHeightFromWidth(); refreshPreview(); } });
    document.getElementById('btn-import-apply').addEventListener('click', () => {
      if (importGrid) {
        ImageImport.apply(importGrid, Grid.stitch);
        document.getElementById('modal-import').classList.add('hidden');
        App.currentCloudId = null;
        App.currentCloudTitle = null;
      }
    });

    // Export PNG
    document.getElementById('btn-export-png').addEventListener('click', () => Export.png());

    // Export PDF
    document.getElementById('btn-export-pdf').addEventListener('click', () => document.getElementById('modal-pdf').classList.remove('hidden'));
    document.getElementById('btn-pdf-cancel').addEventListener('click', () => document.getElementById('modal-pdf').classList.add('hidden'));
    document.getElementById('btn-pdf-generate').addEventListener('click', () => {
      Export.pdf({
        title: document.getElementById('pdf-title').value,
        author: document.getElementById('pdf-author').value,
        legend: document.getElementById('pdf-legend').checked,
        wordChart: document.getElementById('pdf-wordchart').checked,
        labelMode: document.getElementById('pdf-label-mode').value
      });
      document.getElementById('modal-pdf').classList.add('hidden');
    });

    // Save / Load JSON
    document.getElementById('btn-save-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(Grid.snapshot())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `beads-${Date.now()}.json`;
      a.click();
    });
    document.getElementById('btn-load-json').addEventListener('click', () => document.getElementById('json-file-input').click());
    document.getElementById('json-file-input').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const snap = JSON.parse(ev.target.result);
          Grid.restore(snap);
          History.reset(Grid.snapshot());
          document.getElementById('stitch-select').value = Grid.stitch;
          App.currentCloudId = null;
          App.currentCloudTitle = null;
        } catch (err) { alert('Invalid file'); }
      };
      reader.readAsText(f);
    });
  },

  autosaveLoop() {
    let last = '';
    setInterval(() => {
      const s = JSON.stringify(Grid.snapshot());
      if (s !== last) { localStorage.setItem('beads-pattern', s); last = s; }
    }, 1500);
  }
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

window.addEventListener('DOMContentLoaded', () => App.init());

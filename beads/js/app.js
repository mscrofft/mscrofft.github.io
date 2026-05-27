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

    // Canvas mouse
    const canvas = document.getElementById('grid-canvas');
    const getCell = e => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      return hitTestCell(Grid.stitch, x, y, Grid.cols, Grid.rows, Grid.cellPx);
    };
    canvas.addEventListener('mousedown', e => {
      const cell = getCell(e);
      if (cell) Tools.handleDown(cell.row, cell.col);
    });
    canvas.addEventListener('mousemove', e => {
      const cell = getCell(e);
      if (cell) Tools.handleMove(cell.row, cell.col);
    });
    window.addEventListener('mouseup', e => {
      const cell = getCell(e);
      Tools.handleUp(cell?.row, cell?.col);
    });

    // Undo/redo
    document.getElementById('btn-undo').addEventListener('click', () => { const s = History.undo(); if (s) Grid.restore(s); });
    document.getElementById('btn-redo').addEventListener('click', () => { const s = History.redo(); if (s) Grid.restore(s); });
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); const s = History.undo(); if (s) Grid.restore(s); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); const s = History.redo(); if (s) Grid.restore(s); }
    });

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
    });

    // Importar imagem
    document.getElementById('btn-import-img').addEventListener('click', () => document.getElementById('modal-import').classList.remove('hidden'));
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

window.addEventListener('DOMContentLoaded', () => App.init());

// Tipografia: rasteriza texto numa imagem auxiliar e converte em beads
// amostrando o centro físico de cada célula via Stitches[stitch]. Funciona
// otimizado pra peyote (offset por coluna) preservando legibilidade.

const TextTool = {
  state: {
    text: 'BEADS',
    fontFamily: "'Press Start 2P', monospace",
    heightBeads: 9,
    bgEnabled: false,
  },
  textCanvas: null,        // OffscreenCanvas/HTMLCanvasElement com texto rasterizado
  placeMode: false,
  anchorR: 0,
  anchorC: 0,
  PX_PER_UNIT: 100,        // resolução: px por unidade de bead

  // Renderiza o texto numa canvas auxiliar (em preto sobre branco).
  rasterize() {
    const s = this.state;
    if (!s.text || s.text.length === 0) { this.textCanvas = null; return; }
    // Altura em pixels: heightBeads * cell.h * PX_PER_UNIT
    const cellH = Stitches[Grid.stitch](0, 0).h;
    const fontPx = Math.max(8, Math.round(s.heightBeads * cellH * this.PX_PER_UNIT));
    // Mede largura
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = `${fontPx}px ${s.fontFamily}`;
    const w = Math.ceil(meas.measureText(s.text).width);
    const h = Math.ceil(fontPx * 1.25); // margem pros descendentes
    if (w <= 0 || h <= 0) { this.textCanvas = null; return; }
    const canvas = document.createElement('canvas');
    canvas.width = w + 4;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = `${fontPx}px ${s.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillText(s.text, 2, fontPx * 0.05);
    this.textCanvas = canvas;
  },

  startPlaceMode() {
    if (!this.textCanvas) this.rasterize();
    if (!this.textCanvas) return;
    this.placeMode = true;
    // Âncora inicial: aproximadamente o centro do grid (canto sup-esq do bbox do texto)
    this.anchorR = Math.max(0, Math.floor(Grid.rows / 2) - Math.floor(this.state.heightBeads / 2));
    this.anchorC = Math.max(0, Math.floor(Grid.cols / 2) - Math.floor(this.textBeadsWidth() / 2));
    Grid.render();
  },

  cancelPlace() {
    if (!this.placeMode) return;
    this.placeMode = false;
    Grid.render();
  },

  setAnchor(r, c) {
    if (!this.placeMode) return;
    this.anchorR = r;
    this.anchorC = c;
    Grid.render();
  },

  commitPlace() {
    if (!this.placeMode || !this.textCanvas) return;
    const fgIdx = Grid.ensureSwatch(Palette.active, Palette.selectedIndex);
    const bgIdx = this.state.bgEnabled ? fgIdx : null;
    // Se bg habilitado, usuária deve ter selecionado uma cor diferente; usamos
    // a cor selecionada como bg, e o "fg" da letra fica como a cor "complementar"
    // — escolhemos: bg = swatch atual, fg = preto/branco contrastante.
    // Simplificação: deixa bg = swatch atual; fg também = swatch atual NÃO faz sentido.
    // Decisão: fgIdx = selected, bgIdx = se habilitado, usa segunda cor "preta/branca".
    // Melhor UX: usuária seleciona cor de letra; se bg habilitado, pintamos a região
    // do bbox do texto com a cor anterior (não a selecionada) ou uma cor fixa.
    // Para simplicidade v1: bg = cor "branca" do swatchMap se existe, senão sem bg.
    // Mas isso é frágil. Vamos manter simples: a cor de fundo é a "última cor usada"
    // antes da selecionada — ou se houver só 1, ignora bg.
    // ATO: cor de fundo = primeiro swatch diferente da fg no swatchMap, senão null.
    let realBg = null;
    if (this.state.bgEnabled) {
      // Tenta achar primeiro swatch que não seja a cor de letra
      const other = Grid.swatchMap.findIndex((_, i) => i !== fgIdx);
      if (other >= 0) realBg = other;
    }
    this.beadify(this.anchorR, this.anchorC, fgIdx, realBg);
    History.push(Grid.snapshot());
    this.placeMode = false;
    Grid.render();
  },

  textBeadsWidth() {
    if (!this.textCanvas) return 0;
    const cellW = Stitches[Grid.stitch](0, 0).w;
    const pxToUnit = 1 / this.PX_PER_UNIT;
    return Math.ceil(this.textCanvas.width * pxToUnit / cellW);
  },

  beadify(anchorR, anchorC, fgIdx, bgIdx) {
    if (!this.textCanvas) return;
    const ctx = this.textCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, this.textCanvas.width, this.textCanvas.height).data;
    const tcW = this.textCanvas.width, tcH = this.textCanvas.height;
    const gAnchor = Stitches[Grid.stitch](anchorR, anchorC);
    const px = this.PX_PER_UNIT;

    // Estima footprint em (r, c) baseado em quantos beads cabem na largura/altura do textCanvas
    const cellW = gAnchor.w, cellH = gAnchor.h;
    const widthBeads = Math.ceil((tcW / px) / cellW) + 2;
    const heightBeads = Math.ceil((tcH / px) / cellH) + 2;

    for (let dr = -1; dr <= heightBeads; dr++) {
      for (let dc = -1; dc <= widthBeads; dc++) {
        const r = anchorR + dr, c = anchorC + dc;
        if (r < 0 || r >= Grid.rows || c < 0 || c >= Grid.cols) continue;
        const g = Stitches[Grid.stitch](r, c);
        const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
        const tx = Math.round((cx - gAnchor.x) * px);
        const ty = Math.round((cy - gAnchor.y) * px);
        if (tx < 0 || tx >= tcW || ty < 0 || ty >= tcH) {
          // Fora do bbox do texto — se bg habilitado, ainda assim não pinta
          continue;
        }
        const i = (ty * tcW + tx) * 4;
        const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (luminance < 128) {
          Grid.paint(r, c, fgIdx);
        } else if (bgIdx !== null) {
          Grid.paint(r, c, bgIdx);
        }
      }
    }
  },

  // Preview translúcido durante place mode
  drawPreview(ctx, cellPx) {
    if (!this.placeMode || !this.textCanvas) return;
    const data = this.textCanvas.getContext('2d').getImageData(0, 0, this.textCanvas.width, this.textCanvas.height).data;
    const tcW = this.textCanvas.width, tcH = this.textCanvas.height;
    const gAnchor = Stitches[Grid.stitch](this.anchorR, this.anchorC);
    const px = this.PX_PER_UNIT;
    const cellW = gAnchor.w, cellH = gAnchor.h;
    const widthBeads = Math.ceil((tcW / px) / cellW) + 2;
    const heightBeads = Math.ceil((tcH / px) / cellH) + 2;

    ctx.save();
    ctx.globalAlpha = 0.6;
    const fgSwatch = Grid.swatchMap[Grid.ensureSwatch(Palette.active, Palette.selectedIndex)];
    const fgHex = fgSwatch ? fgSwatch.hex : '#f7b955';

    for (let dr = -1; dr <= heightBeads; dr++) {
      for (let dc = -1; dc <= widthBeads; dc++) {
        const r = this.anchorR + dr, c = this.anchorC + dc;
        if (r < 0 || r >= Grid.rows || c < 0 || c >= Grid.cols) continue;
        const g = Stitches[Grid.stitch](r, c);
        const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
        const tx = Math.round((cx - gAnchor.x) * px);
        const ty = Math.round((cy - gAnchor.y) * px);
        if (tx < 0 || tx >= tcW || ty < 0 || ty >= tcH) continue;
        const i = (ty * tcW + tx) * 4;
        const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (luminance < 128) {
          drawStitchCell(ctx, Grid.stitch, r, c, fgHex, cellPx, { stroke: '#f7b955', lineWidth: 1 });
        }
      }
    }
    ctx.restore();
  }
};

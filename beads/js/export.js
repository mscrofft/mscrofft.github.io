const Export = {
  png() {
    Grid.canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `beads-${Grid.stitch}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  },

  pdf({ title = '', author = '', legend = true, wordChart = true, labelMode = 'both' } = {}) {
    const swatchLabel = (idx) => {
      const s = Grid.swatchMap[idx];
      const hasName = s.name && s.name !== s.code;
      if (labelMode === 'code') return s.code;
      if (labelMode === 'name') return hasName ? s.name : s.code;
      return hasName ? `${s.name} (${s.code})` : s.code;
    };
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const margin = 12;
    const pageW = 210, pageH = 297;

    // Cabeçalho
    doc.setFontSize(16);
    doc.text(title || 'Beeds', margin, margin + 4);
    if (author) {
      doc.setFontSize(10);
      doc.text(author, margin, margin + 10);
    }
    doc.setFontSize(9);
    doc.text(`${t(Grid.stitch)} — ${Grid.cols} × ${Grid.rows}`, pageW - margin, margin + 4, { align: 'right' });

    // ===== Layout da página 1: chart + legenda juntos =====
    const counts = countByColor();
    const usedSwatches = Grid.swatchMap
      .map((s, idx) => ({ s, idx, n: counts.get(idx) || 0 }))
      .filter(e => e.n > 0);

    // Calcula altura da legenda (se for incluir)
    const wantLegend = legend && usedSwatches.length > 0;
    const legendCols = usedSwatches.length <= 16 ? 2 : 3;
    const legendRowH = 5.5;       // mm por linha
    const legendHeaderH = 10;     // mm pro título "Legenda de cores"
    const legendRows = Math.ceil(usedSwatches.length / legendCols);
    const legendH = wantLegend ? (legendHeaderH + legendRows * legendRowH + 4) : 0;

    // Área de chart (reserva legendH no fim da página)
    const chartTop = margin + 16;
    const chartMaxW = pageW - margin * 2;
    const chartMaxH = pageH - margin - chartTop - legendH - 4;

    const dataUrl = Grid.canvas.toDataURL('image/png');
    const ratio = Grid.canvas.width / Grid.canvas.height;
    let w = chartMaxW, h = chartMaxW / ratio;
    if (h > chartMaxH) { h = chartMaxH; w = h * ratio; }
    doc.addImage(dataUrl, 'PNG', margin + (chartMaxW - w) / 2, chartTop, w, h);

    // Legenda na mesma página, abaixo do chart
    if (wantLegend) {
      const legendTop = pageH - margin - legendH + legendHeaderH;
      doc.setFontSize(12);
      doc.text(t('colorLegend'), margin, pageH - margin - legendH + 6);
      doc.setFontSize(9);
      const colW = (pageW - margin * 2) / legendCols;
      usedSwatches.forEach((e, i) => {
        const col = i % legendCols;
        const rowIdx = Math.floor(i / legendCols);
        const x = margin + col * colW;
        const y = legendTop + rowIdx * legendRowH;
        const rgb = hexToRgb(e.s.hex);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(x, y - 3, 4, 4, 'F');
        doc.setTextColor(0);
        const label = swatchLabel(e.idx);
        const countStr = `${e.n}`;
        // Trunca rótulo pra caber: espaço total colW - 6 (swatch+gap) - 8 (count à direita)
        const maxTextW = colW - 14;
        const truncated = truncateText(doc, label, maxTextW);
        doc.text(truncated, x + 6, y);
        doc.text(countStr, x + colW - 2, y, { align: 'right' });
      });
    }

    // Word chart na ordem real de costura do ponto
    if (wordChart) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text(t('wordChart'), margin, margin + 4);
      doc.setFontSize(9);
      let y = margin + 14;
      const maxY = pageH - margin;
      const seqFn = (typeof Sequencer !== 'undefined' && Sequencer[Grid.stitch]) || null;
      const sequence = seqFn ? seqFn(Grid.cells, Grid.cols, Grid.rows) : [];
      for (const row of sequence) {
        const txt = `${row.label}: ` + (row.beads.length === 0 ? '—' : row.beads.map(s => `${s.count}×${swatchLabel(s.idx)}`).join(', '));
        const lines = doc.splitTextToSize(txt, pageW - margin * 2);
        if (y + lines.length * 4 > maxY) { doc.addPage(); y = margin + 10; }
        doc.text(lines, margin, y);
        y += lines.length * 4 + 1;
      }
    }

    doc.save(`beads-${Date.now()}.pdf`);
  }
};

// Trunca texto se exceder largura, adicionando "…"
function truncateText(doc, text, maxW) {
  if (doc.getTextWidth(text) <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (doc.getTextWidth(text.slice(0, mid) + '…') <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

function countByColor() {
  const m = new Map();
  Grid.cells.forEach(row => row.forEach(v => {
    if (v >= 0) m.set(v, (m.get(v) || 0) + 1);
  }));
  return m;
}

function rowSegments(row) {
  const cells = Grid.cells[row];
  const out = [];
  let cur = null, count = 0;
  for (let c = 0; c < cells.length; c++) {
    const v = cells[c];
    if (v === cur) count++;
    else {
      if (cur !== null) out.push({ idx: cur, count });
      cur = v; count = 1;
    }
  }
  if (cur !== null) out.push({ idx: cur, count });
  return out.filter(s => s.idx >= 0);
}

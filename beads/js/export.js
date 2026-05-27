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

    // Chart: usa o canvas atual via toDataURL para fidelidade
    const dataUrl = Grid.canvas.toDataURL('image/png');
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2 - 20;
    const ratio = Grid.canvas.width / Grid.canvas.height;
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    doc.addImage(dataUrl, 'PNG', margin + (maxW - w) / 2, margin + 16, w, h);

    // Legenda
    if (legend && Grid.swatchMap.length) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text(t('colorLegend'), margin, margin + 4);
      const counts = countByColor();
      let y = margin + 14;
      doc.setFontSize(10);
      Grid.swatchMap.forEach((s, idx) => {
        const n = counts.get(idx) || 0;
        if (n === 0) return;
        const rgb = hexToRgb(s.hex);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(margin, y - 4, 6, 6, 'F');
        doc.setTextColor(0);
        doc.text(swatchLabel(idx), margin + 9, y);
        doc.text(`${n} ${t('beads')}`, pageW - margin, y, { align: 'right' });
        y += 7;
        if (y > pageH - margin) { doc.addPage(); y = margin + 10; }
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

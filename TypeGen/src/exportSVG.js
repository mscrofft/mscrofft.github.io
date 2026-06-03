/* exportSVG.js — converte contornos em em-units num SVG string. */
(function (global) {
  function contoursToSVG(contours, advanceWidth, opts = {}) {
    const m = (global.TG.fontSource && global.TG.fontSource.metrics()) || { ascender: 800, descender: -200 };
    const asc = m.ascender;
    const desc = m.descender;
    const totalH = asc - desc;
    // SVG y cresce p/ baixo; convertemos: svgY = asc - emY (já que asc é topo).
    let d = '';
    for (const c of contours) {
      if (!c || c.length < 3) continue;
      d += `M ${c[0][0].toFixed(2)} ${(asc - c[0][1]).toFixed(2)} `;
      for (let i = 1; i < c.length; i++) {
        d += `L ${c[i][0].toFixed(2)} ${(asc - c[i][1]).toFixed(2)} `;
      }
      d += 'Z ';
    }
    const w = advanceWidth;
    const h = totalH;
    const fill = opts.fill || '#000';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"><path fill="${fill}" fill-rule="evenodd" d="${d.trim()}"/></svg>`;
  }

  function downloadSVG(svgString, filename) {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.TG.exportSVG = { contoursToSVG, downloadSVG };
})(window);

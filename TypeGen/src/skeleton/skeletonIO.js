/* skeletonIO.js — import/export do esqueleto editado (TypeGen Skeleton, .tgsk.json).
   Estrutura:
   {
     format: 'typegen-skeleton',
     version: 1,
     name, author,
     grid:   { w, h },
     metrics:{ unitsPerEm, ascender, descender, sideBearing },
     glyphs: { 'A': [prim...], 'B': [prim...], ... },
     presets: [...]   // opcional
   } */
(function (global) {
  const TG = global.TG;

  function exportData(opts = {}) {
    const G = TG.grid.GRID;
    const Alpha = TG.alphabet;
    const glyphs = {};
    // built-in alphabet + overrides aplicados por cima
    for (const ch of Alpha.listChars()) {
      const prims = Alpha.get(ch); // já considera override e composição
      if (Array.isArray(prims) && prims.length) glyphs[ch] = prims;
    }
    return {
      format: 'typegen-skeleton',
      version: 1,
      name: opts.name || 'TypeGen Skeleton',
      author: opts.author || '',
      grid:    { w: Alpha.W, h: Alpha.H },
      metrics: {
        unitsPerEm: G.unitsPerEm,
        ascender:   G.ascender,
        descender:  G.descender,
        sideBearing: G.sideBearing,
      },
      glyphs,
      presets: opts.includePresets ? TG.presets.load() : undefined,
    };
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importData(obj) {
    if (!obj || obj.format !== 'typegen-skeleton') throw new Error('Formato inválido (não é typegen-skeleton)');
    if (obj.version !== 1) throw new Error('Versão não suportada: ' + obj.version);
    const Alpha = TG.alphabet;
    const localW = Alpha.W, localH = Alpha.H;
    const fileW = (obj.grid && obj.grid.w) || localW;
    const fileH = (obj.grid && obj.grid.h) || localH;
    const sx = localW / fileW;
    const sy = localH / fileH;

    function scalePoint(p) { return [p[0] * sx, p[1] * sy]; }
    function scalePrim(pr) {
      if (pr.type === 'line') return { type: 'line', a: scalePoint(pr.a), b: scalePoint(pr.b) };
      if (pr.type === 'arc') return { type: 'arc', c: scalePoint(pr.c), r: pr.r * Math.min(sx, sy), a0: pr.a0, a1: pr.a1 };
      if (pr.type === 'bezier') return { type: 'bezier', a: scalePoint(pr.a), c1: scalePoint(pr.c1), c2: scalePoint(pr.c2), b: scalePoint(pr.b) };
      return pr;
    }

    // garante source built-in
    if (TG.fontSource.isImported()) TG.fontSource.useBuiltin();

    // só seta override pra glyphs definidos no arquivo
    const glyphs = obj.glyphs || {};
    for (const ch of Object.keys(glyphs)) {
      const prims = glyphs[ch];
      if (!Array.isArray(prims)) continue;
      const scaled = prims.map(scalePrim);
      TG.overrides.set(ch, { kind: 'skeleton', prims: scaled, advanceWidth: TG.grid.glyphAdvanceWidth() });
    }
    // presets opcionais
    if (Array.isArray(obj.presets)) {
      const existing = TG.presets.load();
      const names = new Set(existing.map(p => p.name));
      for (const p of obj.presets) if (!names.has(p.name)) existing.push(p);
      TG.presets.save(existing);
    }
  }

  function importJSONText(text) {
    return importData(JSON.parse(text));
  }

  async function importSVGFiles(fileList) {
    if (!TG.svgImport) throw new Error('svgImport.js não carregado');
    if (TG.fontSource.isImported()) TG.fontSource.useBuiltin();
    const map = await TG.svgImport.importFiles(fileList);
    let count = 0;
    for (const ch of Object.keys(map)) {
      const prims = map[ch];
      if (!Array.isArray(prims)) continue;
      TG.overrides.set(ch, { kind: 'skeleton', prims, advanceWidth: TG.grid.glyphAdvanceWidth() });
      count++;
    }
    return count;
  }

  TG.skeletonIO = { exportData, downloadJSON, importData, importJSONText, importSVGFiles };
})(window);

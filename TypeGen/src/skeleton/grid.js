/* grid.js — mapeia coordenadas da grade do esqueleto para unidades de em.
   Grade nominal: x in [0, W], y in [0, H], y=0 no topo (cap height), y=H na descender.
   Mapeamento para opentype (y=0 baseline, y cresce p/ cima): emY = ascender - (y/H)*(asc+desc). */
(function (global) {
  const GRID = {
    W: 5,            // largura nominal da grade do glyph
    H: 7,            // altura total (cap height + descender)
    capRows: 7,      // linhas da baseline ao topo (caps)
    descRows: 0,     // descender adicional (não usado nesta versão simples)
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    sideBearing: 80, // em unidades de em
  };

  function cellW() { return GRID.unitsPerEm * 0.6 / GRID.W; } // largura de uma célula em em-units (~120)
  function cellH() { return (GRID.ascender - GRID.descender) / GRID.H; } // ~143 com 7 linhas

  function gridToEm(x, y) {
    // x,y na grade -> coordenadas em em-units (baseline em y=0, y cresce para cima)
    const ex = GRID.sideBearing + x * cellW();
    const ey = GRID.ascender - y * cellH();
    return [ex, ey];
  }

  function glyphAdvanceWidth() {
    return GRID.sideBearing * 2 + GRID.W * cellW();
  }

  global.TG = global.TG || {};
  global.TG.grid = { GRID, cellW, cellH, gridToEm, glyphAdvanceWidth };
})(window);

/* fontSource.js — abstrai a origem dos glyphs: 'builtin' (esqueleto monoline)
   ou 'imported' (.ttf/.otf via opentype.js).
   Cada glyph é exposto como { kind:'skeleton'|'contour', ... } unificado. */
(function (global) {
  const TG = global.TG;

  const _state = {
    kind: 'builtin',            // 'builtin' | 'imported'
    font: null,                 // opentype.Font (quando imported)
    fileName: null,
    sourceId: 'builtin',
  };

  function metrics() {
    if (_state.kind === 'imported' && _state.font) {
      const f = _state.font;
      return {
        unitsPerEm: f.unitsPerEm,
        ascender:   f.ascender,
        descender:  f.descender,
      };
    }
    const G = TG.grid.GRID;
    return { unitsPerEm: G.unitsPerEm, ascender: G.ascender, descender: G.descender };
  }

  function defaultAdvance() {
    if (_state.kind === 'imported' && _state.font) {
      return _state.font.unitsPerEm * 0.5;
    }
    return TG.grid.glyphAdvanceWidth();
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const font = opentype.parse(reader.result);
          _state.kind = 'imported';
          _state.font = font;
          _state.fileName = file.name;
          _state.sourceId = 'font:' + file.name;
          resolve(_state);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function useBuiltin() {
    _state.kind = 'builtin';
    _state.font = null;
    _state.fileName = null;
    _state.sourceId = 'builtin';
  }

  function state() { return _state; }
  function isImported() { return _state.kind === 'imported'; }

  function listChars() {
    if (_state.kind === 'builtin') return TG.alphabet.listChars();
    // imported: extrair unicode de cada glyph; uniq + sort
    const seen = new Set();
    const out = [];
    const glyphs = _state.font.glyphs.glyphs || _state.font.glyphs;
    const n = _state.font.glyphs.length || Object.keys(glyphs).length;
    for (let i = 0; i < n; i++) {
      const g = _state.font.glyphs.get ? _state.font.glyphs.get(i) : glyphs[i];
      if (!g || g.unicode == null) continue;
      const cp = g.unicode;
      if (seen.has(cp)) continue;
      seen.add(cp);
      out.push(String.fromCodePoint(cp));
    }
    out.sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
    return out;
  }

  // Converte path.commands do opentype em paths (array de subpaths), cada um com
  // commands no formato { type, x, y, x1?, y1?, x2?, y2? }.
  function commandsToPaths(cmds) {
    const paths = [];
    let cur = null;
    for (const c of cmds) {
      if (c.type === 'M') {
        cur = [{ type: 'M', x: c.x, y: c.y }];
        paths.push(cur);
      } else if (c.type === 'L') {
        if (!cur) { cur = []; paths.push(cur); }
        cur.push({ type: 'L', x: c.x, y: c.y });
      } else if (c.type === 'Q') {
        cur.push({ type: 'Q', x1: c.x1, y1: c.y1, x: c.x, y: c.y });
      } else if (c.type === 'C') {
        cur.push({ type: 'C', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, x: c.x, y: c.y });
      } else if (c.type === 'Z') {
        cur.push({ type: 'Z' });
      }
    }
    return paths;
  }

  // Achata paths em polylines (array de [x,y]); preserva subpaths.
  function flattenPaths(paths, steps = 20) {
    const out = [];
    for (const sp of paths) {
      const pl = [];
      let x0 = 0, y0 = 0, sx = 0, sy = 0;
      for (const cmd of sp) {
        if (cmd.type === 'M') {
          pl.push([cmd.x, cmd.y]);
          x0 = sx = cmd.x; y0 = sy = cmd.y;
        } else if (cmd.type === 'L') {
          pl.push([cmd.x, cmd.y]);
          x0 = cmd.x; y0 = cmd.y;
        } else if (cmd.type === 'Q') {
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const x = mt*mt*x0 + 2*mt*t*cmd.x1 + t*t*cmd.x;
            const y = mt*mt*y0 + 2*mt*t*cmd.y1 + t*t*cmd.y;
            pl.push([x, y]);
          }
          x0 = cmd.x; y0 = cmd.y;
        } else if (cmd.type === 'C') {
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const x = mt*mt*mt*x0 + 3*mt*mt*t*cmd.x1 + 3*mt*t*t*cmd.x2 + t*t*t*cmd.x;
            const y = mt*mt*mt*y0 + 3*mt*mt*t*cmd.y1 + 3*mt*t*t*cmd.y2 + t*t*t*cmd.y;
            pl.push([x, y]);
          }
          x0 = cmd.x; y0 = cmd.y;
        } else if (cmd.type === 'Z') {
          pl.push([sx, sy]);
          x0 = sx; y0 = sy;
        }
      }
      if (pl.length >= 2) out.push(pl);
    }
    return out;
  }

  // Retorna { kind, ... } para o char atual considerando override (kind-aware).
  function getSource(ch) {
    const ov = TG.overrides && TG.overrides.get(ch);
    if (ov) {
      // formato novo: { kind, ... } ; formato antigo: array de prims
      if (Array.isArray(ov)) return { kind: 'skeleton', prims: ov, advanceWidth: defaultAdvance() };
      return ov;
    }
    if (_state.kind === 'builtin') {
      return { kind: 'skeleton', prims: TG.alphabet.get(ch), advanceWidth: defaultAdvance() };
    }
    // imported
    const g = _state.font.charToGlyph(ch);
    if (!g || g.name === '.notdef') {
      return { kind: 'contour', paths: [], advanceWidth: g ? g.advanceWidth : defaultAdvance() };
    }
    const paths = commandsToPaths(g.path.commands || []);
    return { kind: 'contour', paths, advanceWidth: g.advanceWidth || defaultAdvance(), glyphName: g.name };
  }

  function familyHint() {
    if (_state.kind === 'imported' && _state.font && _state.font.names && _state.font.names.fontFamily) {
      const n = _state.font.names.fontFamily;
      return n.en || Object.values(n)[0] || 'TypeGen';
    }
    return 'TypeGen';
  }

  TG.fontSource = {
    state, metrics, defaultAdvance, loadFile, useBuiltin, isImported,
    listChars, getSource, flattenPaths, commandsToPaths, familyHint,
  };
})(window);

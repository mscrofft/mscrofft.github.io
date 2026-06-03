/* presets.js — armazena presets em localStorage e provê import/export JSON. */
(function (global) {
  const KEY = 'typegen.presets';

  const FACTORY = [
    { name: 'Dots Coarse 45°', mode: 'stroke', stroke: { strokeWidth: 60, cap: 'round', join: 'round' }, halftone: { shape: 'dots', spacing: 40, angle: 45, size: 28, gamma: 1.0 } },
    { name: 'Lines Fine 0°',   mode: 'stroke', stroke: { strokeWidth: 50, cap: 'butt',  join: 'round' }, halftone: { shape: 'lines', spacing: 18, angle: 0,  size: 8,  gamma: 1.0 } },
    { name: 'Newsprint Bold',  mode: 'stroke', stroke: { strokeWidth: 90, cap: 'round', join: 'round' }, halftone: { shape: 'dots', spacing: 22, angle: 30, size: 18, gamma: 0.8 } },
    { name: 'Pin Stripe Path', mode: 'path',   stroke: { strokeWidth: 40, cap: 'round', join: 'round' }, halftone: { shape: 'dots', spacing: 22, angle: 0,  size: 14, gamma: 1.0 } },
    { name: 'Microdots 90°',   mode: 'stroke', stroke: { strokeWidth: 30, cap: 'round', join: 'round' }, halftone: { shape: 'dots',  spacing: 8,  angle: 90, size: 4,  gamma: 1.0 } },
    { name: 'Comic Diagonal',  mode: 'stroke', stroke: { strokeWidth: 70, cap: 'round', join: 'round' }, halftone: { shape: 'dots',  spacing: 14, angle: 45, size: 8,  gamma: 1.4 } },
    { name: 'Risograph Lines', mode: 'stroke', stroke: { strokeWidth: 80, cap: 'round', join: 'round' }, halftone: { shape: 'lines', spacing: 12, angle: 0,  size: 4,  gamma: 1.0 } },
    { name: 'Path Pearl',      mode: 'path',   stroke: { strokeWidth: 40, cap: 'round', join: 'round' }, halftone: { shape: 'dots',  spacing: 30, angle: 0,  size: 22, gamma: 1.0 } },
    { name: 'Gradient Sparse', mode: 'stroke', stroke: { strokeWidth: 50, cap: 'round', join: 'round' }, halftone: { shape: 'dots',  spacing: 50, angle: 30, size: 30, gamma: 2.0 } },
    { name: 'Halo Lines',      mode: 'path',   stroke: { strokeWidth: 40, cap: 'round', join: 'round' }, halftone: { shape: 'lines', spacing: 16, angle: 0,  size: 3,  gamma: 1.0 } },
  ];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return FACTORY.slice();
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return FACTORY.slice();
      // merge: garante que presets de fábrica novos apareçam mesmo após upgrade
      const names = new Set(list.map(p => p.name));
      for (const f of FACTORY) if (!names.has(f.name)) list.push(f);
      return list;
    } catch (e) { return FACTORY.slice(); }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  function upsert(preset) {
    const list = load();
    const i = list.findIndex(p => p.name === preset.name);
    if (i >= 0) list[i] = preset; else list.push(preset);
    save(list);
    return list;
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(text) {
    const list = JSON.parse(text);
    if (Array.isArray(list)) save(list);
    return load();
  }

  global.TG.presets = { load, save, upsert, exportJSON, importJSON, FACTORY };
})(window);

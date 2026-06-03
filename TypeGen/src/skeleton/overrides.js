/* overrides.js — edições por glyph em localStorage, com namespace por sourceId.
   Aceita tanto array de primitivas (skeleton, formato legado) quanto
   objeto { kind:'skeleton'|'contour', ... } (novo). */
(function (global) {
  const ROOT = 'typegen.glyphs';
  const caches = {};

  function _sourceId() {
    return (global.TG.fontSource && global.TG.fontSource.state().sourceId) || 'builtin';
  }
  function _key(sourceId) { return ROOT + '.' + sourceId; }

  function _load(sourceId) {
    if (caches[sourceId]) return caches[sourceId];
    try {
      const raw = localStorage.getItem(_key(sourceId));
      caches[sourceId] = raw ? JSON.parse(raw) : {};
    } catch (e) { caches[sourceId] = {}; }
    return caches[sourceId];
  }
  function _save(sourceId) {
    try { localStorage.setItem(_key(sourceId), JSON.stringify(caches[sourceId])); } catch (e) {}
  }

  function get(ch) { return _load(_sourceId())[ch] || null; }
  function set(ch, data) { const s = _sourceId(); _load(s); caches[s][ch] = data; _save(s); }
  function clear(ch) { const s = _sourceId(); _load(s); delete caches[s][ch]; _save(s); }
  function has(ch) { return !!_load(_sourceId())[ch]; }
  function listOverridden() { return Object.keys(_load(_sourceId())); }
  function clearAll() {
    const s = _sourceId(); caches[s] = {}; _save(s);
  }

  global.TG.overrides = { get, set, clear, has, listOverridden, clearAll };
})(window);

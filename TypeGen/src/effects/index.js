/* effects/index.js — registry de efeitos.
   Cada efeito implementa apply({ mode, polylines, bbox, params }) -> array de contornos fechados
   (cada contorno = array de pontos [x,y] em em-units). */
(function (global) {
  const REGISTRY = {};
  function register(name, def) { REGISTRY[name] = def; }
  function get(name) { return REGISTRY[name]; }
  function list() { return Object.keys(REGISTRY); }
  global.TG.effects = { register, get, list, REGISTRY };
})(window);

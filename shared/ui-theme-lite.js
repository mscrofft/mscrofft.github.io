/* ============================================================
   ui-theme-lite.js — toggle de tema compartilhado
   Fornece apenas CSS-vars + botão Inverter.
   NÃO cria painel (cada página mantém seu DOM original).
   ============================================================ */

(function (global) {
  const KEY = 'ui-theme';

  function setTheme(name) {
    if (name !== 'dark' && name !== 'light') name = 'dark';
    document.body.setAttribute('data-theme', name);
    try { localStorage.setItem(KEY, name); } catch (e) {}
    document.dispatchEvent(new CustomEvent('ui-theme-change', { detail: { theme: name } }));
  }

  function getTheme() {
    return document.body.getAttribute('data-theme') || 'dark';
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  const INVERT_SVG = '<svg viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 0 1 8 2.5v11a5.5 5.5 0 0 1 0-11z"/></svg>';

  function makeInvertButton(label) {
    const btn = document.createElement('button');
    btn.className = 'ui-invert-btn';
    btn.type = 'button';
    btn.title = 'Inverter cores (B&W)';
    btn.innerHTML = INVERT_SVG + ' ' + (label || 'Inverter');
    btn.addEventListener('click', toggleTheme);
    return btn;
  }

  /**
   * Monta um botão Inverter dentro de um container existente.
   * @param {string|HTMLElement} target - seletor ou elemento
   * @param {object} [opts] - { label, prepend }
   */
  function mountInvertButton(target, opts) {
    opts = opts || {};
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    const btn = makeInvertButton(opts.label);
    if (opts.prepend) el.insertBefore(btn, el.firstChild);
    else el.appendChild(btn);
    return btn;
  }

  /**
   * Monta o header padrão do site (logo "MS." + título + Inverter).
   * @param {object} [opts]
   *   title  {string}  título da página (opcional)
   *   home   {string}  href do logo (default '../index.html')
   *   solid  {boolean} barra opaca em fluxo (apps); default: fixa transparente
   *   bar    {boolean} padrão v2: barra #e55ab6 em largura total (ativa body.ui-std)
   *   toggle {boolean} incluir botão Inverter (default true)
   *   mount  {string|HTMLElement} container; default: prepend no body
   * @returns {HTMLElement|null}
   */
  function mountHeader(opts) {
    opts = opts || {};
    const header = document.createElement('header');
    header.className = 'site-header' + (opts.solid ? ' site-header--solid' : '') + (opts.bar ? ' site-header--bar' : '');
    if (opts.bar) document.body.classList.add('ui-std');

    const logo = document.createElement('a');
    logo.className = 'site-logo';
    logo.href = opts.home || '../index.html';
    logo.innerHTML = 'MS<span>.</span>';
    logo.title = 'Voltar para a home';
    logo.addEventListener('click', function (e) { e.stopPropagation(); });
    header.appendChild(logo);

    if (opts.title) {
      const title = document.createElement('span');
      title.className = 'site-title';
      title.textContent = opts.title;
      header.appendChild(title);
    }

    if (opts.bar) {
      const back = document.createElement('a');
      back.className = 'site-back';
      back.href = opts.home || '../index.html';
      back.textContent = '← back';
      header.appendChild(back);
    }

    const spacer = document.createElement('span');
    spacer.className = 'site-spacer';
    header.appendChild(spacer);

    if (opts.toggle !== false) {
      const btn = makeInvertButton(opts.label);
      btn.addEventListener('click', function (e) { e.stopPropagation(); });
      header.appendChild(btn);
    }

    const target = typeof opts.mount === 'string'
      ? document.querySelector(opts.mount)
      : (opts.mount || document.body);
    if (!target) return null;
    target.insertBefore(header, target.firstChild);
    return header;
  }

  function initFromStorage() {
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    setTheme(stored === 'light' ? 'light' : 'dark');
  }

  // auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFromStorage);
  } else {
    initFromStorage();
  }

  global.UITheme = global.UITheme || {
    setTheme, getTheme, toggleTheme,
    makeInvertButton, mountInvertButton, mountHeader,
  };
})(window);

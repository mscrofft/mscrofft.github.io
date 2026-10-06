/* Liga botões [data-ui-invert] ao toggle de tema da página (UITheme.toggleTheme ou UITheme.toggle). */
(function () {
  function bind() {
    document.querySelectorAll('[data-ui-invert]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var T = window.UITheme || {};
        (T.toggleTheme || T.toggle || function () {})();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

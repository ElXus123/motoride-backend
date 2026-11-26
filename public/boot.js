// Tema claro/oscuro: se aplica antes de cargar el CSS para evitar parpadeo.
// Misma regla que src/lib/theme.ts: elección guardada en «motoride_theme»; si no hay, o es «system», sigue el sistema.
(function () {
  var root = document.documentElement;
  var dark = false;
  try {
    var stored = localStorage.getItem('motoride_theme');
    dark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) {
    dark = false;
  }
  var theme = dark ? 'dark' : 'light';
  var bar = dark ? '#0d0c0b' : '#f4efe6';
  root.setAttribute('data-theme', theme);
  root.style.backgroundColor = bar;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', bar);
  var scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', theme);
})();

window.global = window;
window.process = { env: {} };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW registered:', reg);
    }).catch(err => {
      console.log('SW registration failed:', err);
    });
  });
}

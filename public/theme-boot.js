// Sets the color theme before first paint to avoid a flash. Mirrors storage.ts
// (KEY.theme = 'fitflow.theme', stored as a JSON string). A file, not an inline
// script, so the Content-Security-Policy can stay script-src 'self'.
(function () {
  try {
    var raw = localStorage.getItem('fitflow.theme');
    var pref = raw ? JSON.parse(raw) : 'dark';
    var resolved = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : pref;
    document.documentElement.dataset.theme = resolved === 'light' ? 'light' : 'dark';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();

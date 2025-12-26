(() => {
  const STORAGE_KEY = "vbverse-theme"; // "dark" | "light"
  const root = document.documentElement;

  function applyTheme(theme) {
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme"); // dark is default
    }
  }

  function getSavedTheme() {
    const t = localStorage.getItem(STORAGE_KEY);
    return (t === "light" || t === "dark") ? t : "dark";
  }

  // Apply on every page load (index + timeline)
  applyTheme(getSavedTheme());

  // Wire up toggle if the button exists on this page
  const btn = document.getElementById("btnTheme");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
      const next = current === "light" ? "dark" : "light";
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
    });
  }
})();


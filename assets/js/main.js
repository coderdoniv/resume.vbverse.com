(function () {

  /* ==========================
     THEME HANDLING (keep yours)
     ========================== */
  const STORAGE_KEY = "vbverse-theme";
  const root = document.documentElement;

  function applyTheme(theme) {
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }

  applyTheme(localStorage.getItem(STORAGE_KEY) || "dark");

  const btnTheme = document.getElementById("btnTheme");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const next =
        root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
    });
  }

  /* ==========================
     PRINT HANDLING (FIX)
     ========================== */
  const btnPrint = document.getElementById("btnPrint");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      // Open the PDF resume in a new tab for printing
      window.open("assets/data/Resume.pdf", "_blank");
    });
  }

})();

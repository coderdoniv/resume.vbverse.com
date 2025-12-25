(() => {
  const root = document.documentElement;
  const btnPrint = document.getElementById("btnPrint");
  const btnTheme = document.getElementById("btnTheme");

  // Theme: default dark, persist choice
  const saved = localStorage.getItem("vbverse_resume_theme");
  if (saved === "light") root.setAttribute("data-theme", "light");

  btnTheme?.addEventListener("click", () => {
    const isLight = root.getAttribute("data-theme") === "light";
    if (isLight) {
      root.removeAttribute("data-theme");
      localStorage.setItem("vbverse_resume_theme", "dark");
    } else {
      root.setAttribute("data-theme", "light");
      localStorage.setItem("vbverse_resume_theme", "light");
    }
  });

  btnPrint?.addEventListener("click", () => window.print());
})();
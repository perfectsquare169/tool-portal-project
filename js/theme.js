// Light/dark theme toggle, shared by every page.
// Loaded in <head> (without "defer") so the saved theme is applied
// before the page is drawn, which avoids a flash of the wrong colours.

(function () {
  var STORAGE_KEY = "portal-theme";
  var root = document.documentElement;

  // Read the saved choice. Browser storage can be blocked (e.g. private
  // windows), so failures fall back to the default light theme.
  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // Not saved; the theme still applies to this page.
    }
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var button = document.querySelector(".theme-toggle");
    if (button) {
      var isDark = theme === "dark";
      button.setAttribute("aria-pressed", String(isDark));
      button.textContent = isDark ? "Light theme" : "Dark theme";
    }
  }

  applyTheme(getSavedTheme());

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getSavedTheme());
    var button = document.querySelector(".theme-toggle");
    if (!button) return;
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
    });
  });
})();

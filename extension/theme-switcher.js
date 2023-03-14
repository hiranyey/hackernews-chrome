function setTheme(themeName) {
  document.getElementById("btn_theme").src =
    themeName == "theme-light" ? "moon.svg" : "sun.svg";
  localStorage.setItem("theme", themeName);
  document.documentElement.className = themeName;
}
if (localStorage.getItem("theme") === "theme-light") {
  setTheme("theme-light");
} else {
  setTheme("theme-dark");
}
function switchTheme() {
  if (localStorage.getItem("theme") === "theme-light") {
    setTheme("theme-dark");
  } else {
    setTheme("theme-light");
  }
}
document.getElementById("btn_theme").addEventListener("click", () => {
  switchTheme();
});


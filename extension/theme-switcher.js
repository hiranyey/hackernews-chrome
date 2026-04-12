// Ordered as dark/light pairs so the 2-column grid puts dark on left, light on right
const THEMES = [
  {
    id: "midnight",
    name: "Midnight",
    colors: ["#0f172a", "#e2e8f0", "#38bdf8", "#1e293b"],
  },
  {
    id: "paper",
    name: "Paper",
    colors: ["#f8f4ed", "#2c2416", "#b8472a", "#fffcf7"],
  },
  {
    id: "terminal",
    name: "Terminal",
    colors: ["#0a0a0a", "#00ff41", "#00ff41", "#141414"],
  },
  {
    id: "frost",
    name: "Frost",
    colors: ["#f0f4f8", "#1a2332", "#0969da", "#ffffff"],
  },
  {
    id: "amber",
    name: "Amber",
    colors: ["#1c1200", "#ffb000", "#ffc233", "#261a00"],
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    colors: ["#fff0f6", "#3d1f33", "#e91e8c", "#ffffff"],
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    colors: ["#191724", "#e0def4", "#ebbcba", "#1f1d2e"],
  },
  {
    id: "lavender",
    name: "Lavender",
    colors: ["#f5f0fa", "#2d2340", "#7c3aed", "#ffffff"],
  },
];

const panel = document.getElementById("theme-panel");
const btn = document.getElementById("theme-btn");
let isOpen = false;

// Build theme picker UI
THEMES.forEach((theme) => {
  const opt = document.createElement("button");
  opt.className = "theme-option";
  opt.dataset.theme = theme.id;
  opt.innerHTML =
    '<div class="theme-swatches">' +
    theme.colors
      .map((c) => '<span style="background:' + c + '"></span>')
      .join("") +
    "</div>" +
    '<span class="theme-name">' +
    theme.name +
    "</span>";
  opt.addEventListener("click", () => applyTheme(theme.id));
  panel.appendChild(opt);
});

function applyTheme(id) {
  document.documentElement.setAttribute("data-theme", id);
  localStorage.setItem("hn-theme", id);
  panel.querySelectorAll(".theme-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.theme === id);
  });
  closePanel();
}

function openPanel() {
  isOpen = true;
  panel.classList.add("open");
}

function closePanel() {
  isOpen = false;
  panel.classList.remove("open");
}

btn.addEventListener("click", (e) => {
  e.stopPropagation();
  isOpen ? closePanel() : openPanel();
});

document.addEventListener("click", (e) => {
  if (isOpen && !panel.contains(e.target)) closePanel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isOpen) closePanel();
});

// Initialize with saved theme or default
const saved = localStorage.getItem("hn-theme") || "midnight";
applyTheme(saved);

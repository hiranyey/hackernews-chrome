// ========== FONT SIZE SLIDER ==========

(function () {
  var defaultSize = 18.75;
  var saved = localStorage.getItem("hn-font-size");
  var size = saved ? parseFloat(saved) : defaultSize;
  document.documentElement.style.fontSize = size + "px";

  var slider = document.getElementById("size-slider");
  var btn = document.getElementById("size-btn");
  var panel = document.getElementById("size-panel");
  var isOpen = false;

  slider.value = size;

  slider.addEventListener("input", function () {
    var val = parseFloat(slider.value);
    document.documentElement.style.fontSize = val + "px";
    localStorage.setItem("hn-font-size", val);
  });

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
  });

  document.addEventListener("click", function (e) {
    if (isOpen && !panel.contains(e.target)) {
      isOpen = false;
      panel.classList.remove("open");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) {
      isOpen = false;
      panel.classList.remove("open");
    }
  });
})();

// ========== MAIN ==========

const storiesDiv = document.querySelector("#stories");
const storyMap = new Map();
let currentView = "feed";
let currentStories = [];

// ========== VISITED TRACKING ==========

function getVisited() {
  try {
    return new Set(JSON.parse(localStorage.getItem("hn-visited") || "[]"));
  } catch {
    return new Set();
  }
}

function markVisited(id) {
  const visited = getVisited();
  visited.add(id);
  const arr = [...visited];
  if (arr.length > 500) arr.splice(0, arr.length - 500);
  localStorage.setItem("hn-visited", JSON.stringify(arr));
}

// ========== SAVED STORIES ==========

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem("hn-saved") || "[]");
  } catch {
    return [];
  }
}

function isSaved(id) {
  return getSaved().some((s) => s.id === id);
}

function toggleSave(id) {
  var saved = getSaved();
  var idx = saved.findIndex((s) => s.id === id);
  if (idx >= 0) {
    saved.splice(idx, 1);
  } else {
    var story = storyMap.get(id);
    if (story) saved.push(story);
  }
  localStorage.setItem("hn-saved", JSON.stringify(saved));
  updateSavedCount();
}

function updateSavedCount() {
  var count = getSaved().length;
  var el = document.getElementById("saved-count");
  if (!el) return;
  el.textContent = count > 0 ? count : "";
  el.style.display = count > 0 ? "inline-flex" : "none";
}

// ========== SVG ICONS ==========

var bookmarkOutline =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
var bookmarkFilled =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

// ========== RENDER ==========

var addStories = function (stories, savedView) {
  storiesDiv.innerHTML = "";
  var visited = getVisited();

  if (savedView) {
    var header = document.createElement("div");
    header.className = "view-header";
    header.textContent = "Saved Stories";
    storiesDiv.appendChild(header);
  }

  if (savedView && stories.length === 0) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      "No saved stories yet. Click the bookmark icon on any story to save it.";
    storiesDiv.appendChild(empty);
    return;
  }

  stories.forEach(function (story, i) {
    storyMap.set(story.id, story);

    var domain = "";
    if (story.url) {
      try {
        domain = new URL(story.url).hostname.replace(/^www\./, "");
      } catch (ex) {}
    }

    var storyURL = "https://news.ycombinator.com/item?id=" + story.id;
    try {
      new URL(story.url);
      storyURL = story.url;
    } catch (ex) {}

    var hnURL = "https://news.ycombinator.com/item?id=" + story.id;
    var userURL = "https://news.ycombinator.com/user?id=" + story.user;
    var saved = isSaved(story.id);

    var el = document.createElement("div");
    el.className = "story";
    el.dataset.id = story.id;
    if (visited.has(story.id)) el.classList.add("story-visited");

    el.innerHTML =
      '<span class="story-rank">' +
      (i + 1) +
      ".</span>" +
      '<div class="story-body">' +
      '<div class="story-header">' +
      '<a class="story-title" href="' +
      storyURL +
      '">' +
      story.title +
      "</a>" +
      (domain ? '<span class="story-domain">(' + domain + ")</span>" : "") +
      "</div>" +
      '<div class="story-meta">' +
      '<a class="story-points" href="' +
      hnURL +
      '">' +
      story.points +
      " pts</a>" +
      '<span class="sep">&middot;</span>' +
      '<a class="story-author" href="' +
      userURL +
      '">' +
      story.user +
      "</a>" +
      '<span class="sep">&middot;</span>' +
      '<a class="story-comments" href="' +
      hnURL +
      '">' +
      story.comment +
      "</a>" +
      "</div>" +
      "</div>" +
      '<button class="story-save' +
      (saved ? " saved" : "") +
      '" data-id="' +
      story.id +
      '" aria-label="' +
      (saved ? "Unsave" : "Save") +
      '">' +
      (saved ? bookmarkFilled : bookmarkOutline) +
      "</button>";

    storiesDiv.appendChild(el);
  });
};

// ========== EVENT DELEGATION ==========

storiesDiv.addEventListener("click", function (e) {
  // Bookmark click
  var saveBtn = e.target.closest(".story-save");
  if (saveBtn) {
    e.preventDefault();
    e.stopPropagation();
    var id = saveBtn.dataset.id;
    toggleSave(id);

    if (currentView === "saved") {
      addStories(getSaved(), true);
    } else {
      var nowSaved = isSaved(id);
      saveBtn.classList.toggle("saved", nowSaved);
      saveBtn.innerHTML = nowSaved ? bookmarkFilled : bookmarkOutline;
      saveBtn.setAttribute("aria-label", nowSaved ? "Unsave" : "Save");
    }
    return;
  }

  // Link click — track visited
  var link = e.target.closest("a");
  if (link) {
    var storyEl = link.closest(".story");
    if (storyEl && storyEl.dataset.id) {
      markVisited(storyEl.dataset.id);
      storyEl.classList.add("story-visited");
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (storyEl) storyEl.style.opacity = "0.3";
  }
});

// ========== SAVED VIEW TOGGLE ==========

document.getElementById("saved-btn").addEventListener("click", function () {
  if (currentView === "feed") {
    currentView = "saved";
    addStories(getSaved(), true);
    document.getElementById("saved-btn").classList.add("active");
  } else {
    currentView = "feed";
    addStories(currentStories, false);
    document.getElementById("saved-btn").classList.remove("active");
  }
});

// ========== INIT ==========

updateSavedCount();

if (
  localStorage.lastFetch &&
  localStorage.stories &&
  new Date() - localStorage.lastFetch < 1000 * 60
) {
  currentStories = JSON.parse(localStorage.stories);
  addStories(currentStories, false);
} else {
  if (localStorage.stories) {
    currentStories = JSON.parse(localStorage.stories);
    addStories(currentStories, false);
  }
  fetch("https://hn.hiranyey.dev/")
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      currentStories = data;
      if (currentView === "feed") {
        addStories(data, false);
      }
      localStorage.setItem("stories", JSON.stringify(data));
      localStorage.setItem("lastFetch", new Date().getTime());
    });
}

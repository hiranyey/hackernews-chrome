const storiesDiv = document.querySelector("#stories");

const addStories = (stories) => {
  for (let index in stories) {
    const story = stories[index];
    let originalURL = "";
    if (story.url != null) {
      try {
        originalURL = `<span class="origin">( ${
          new URL(story.url).origin
        } )</span>`;
      } catch (ex) {}
    }
    let storyURL = `https://news.ycombinator.com/item?id=${story.id}`;
    try {
      new URL(story.url);
      storyURL= story.url
    } catch (ex) {
    }
    let template = document.createElement("template");
    template.innerHTML = 
    `<div class="story">
      <a class="title" href=${storyURL}>${story.title}</a> ${originalURL}
      <div>
      <span>${story.points} Points by <span>
      <span class="author">${story.user},</span>
      <a class="comments" href="https://news.ycombinator.com/item?id=${story.id}">${story.comment}</a>
      </div>
    </div>`;
    storiesDiv.appendChild(template.content);
  }
};

if (
  localStorage.lastFetch &&
  localStorage.stories &&
  new Date() - localStorage.lastFetch < 1000 * 120
) {
  addStories(JSON.parse(localStorage.stories));
} else {
  if (localStorage.stories) {
    addStories(JSON.parse(localStorage.stories));
  }
  fetch("https://hackernewschrome.fly.dev")
    .then((response) => response.json())
    .then((data) => {
      if (!localStorage.stories) {
        addStories(data);
      }
      localStorage.setItem("stories", JSON.stringify(data));
      localStorage.setItem("lastFetch", new Date() - 1);
    });
}
document.addEventListener("click", function (e) {
  e.preventDefault();
  var anchor = e.target.closest("a");
  document.location.assign(anchor.href);
});

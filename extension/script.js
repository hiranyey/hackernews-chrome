const storiesDiv = document.querySelector("#stories");
document.addEventListener(`click`, e => {
  const origin = e.target.closest(`a`);
  if (origin) {
    origin.parentNode.innerHTML = "<div class='lds-dual-ring'></div>"
    e.preventDefault()
    window.location = origin.href
  }
});
const addStories = (stories) => {
  storiesDiv.innerHTML = ""
  stories.forEach(story => {
    let originalURL = "";
    if (story.url != null) {
      try {
        originalURL = `<span class="origin">(${new URL(story.url).origin
          })</span>`;
      } catch (ex) { }
    }

    let storyURL = `https://news.ycombinator.com/item?id=${story.id}`;
    try {
      new URL(story.url);
      storyURL = story.url
    } catch (ex) {
    }

    let hackernewURL = `https://news.ycombinator.com/item?id=${story.id}`
    let userURL = `https://news.ycombinator.com/user?id=${story.user}`

    let template = document.createElement("template");
    template.innerHTML =
      `<div class="story">
        <div class="story-header">
          <a class="points" href=${hackernewURL}>${story.points} points</a>
          <a class="title" href=${storyURL}>${story.title}</a>${originalURL}
        </div>
        <div class="story-footer">
          <a class="comments" href=${hackernewURL}>${story.comment}</a>
          <a class="author" href="${userURL}">${story.user}</a>
        </div>
      </div>`;

    storiesDiv.appendChild(template.content);
  });
};
if (
  localStorage.lastFetch &&
  localStorage.stories &&
  new Date() - localStorage.lastFetch < 1000 * 60
) {
  addStories(JSON.parse(localStorage.stories));
} else {
  if (localStorage.stories) {
    addStories(JSON.parse(localStorage.stories));
  }
  fetch("https://hn.hiranyey.dev/")
    .then((response) => response.json())
    .then((data) => {
      addStories(data);
      localStorage.setItem("stories", JSON.stringify(data));
      localStorage.setItem("lastFetch", new Date().getTime());
    });
}

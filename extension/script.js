const storiesDiv = document.querySelector("#stories");

const addStories = (stories) => {
  for (let index in stories) {
    const story = stories[index];
    let originalURL;
    if (story.url != null) {
      try {
        originalURL = `(<a class="origin" href=${story.url}>${
          new URL(story.url).origin
        }</a>)`;
      } catch (ex) {}
    }
    let template = document.createElement("template");
    template.innerHTML = `<div class="story">
      <a class="title" href="https://news.ycombinator.com/item?id=${story.id}">${story.title}</a> ${originalURL}
      <div>
      <span>${story.points} Points by <span><span class="author">${story.user},</span><span class="comments">${story.comment}</span>
      </div>
    </div>`;
    storiesDiv.appendChild(template.content.childNodes[0]);
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

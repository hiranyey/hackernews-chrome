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
      <a class="title" href="https://news.ycombinator.com/item?id=${story.objectID}">${story.title}</a> ${originalURL}
      <div>
      <span>${story.points} Points by <span><span class="author">${story.author},</span><span class="comments">${story.num_comments} Comments</span>
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
  fetch("https://hn.algolia.com/api/v1/search?tags=front_page")
    .then((response) => response.json())
    .then((data) => {
      if (!localStorage.stories) {
        addStories(data["hits"]);
      }
      localStorage.setItem("stories", JSON.stringify(data["hits"]));
      localStorage.setItem("lastFetch", new Date() - 1);
    });
}

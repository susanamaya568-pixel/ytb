let cache = {};
let currentUser = localStorage.getItem("user") || "guest";

async function search() {
  const q = document.getElementById("searchInput").value;
  const res = await fetch(`/api/search?q=${q}`);
  const data = await res.json();

  document.getElementById("list").innerHTML =
    data.map(v => `
      <div class="item-card" onclick="play('${v.url}')">
        <img class="item-thumb" src="${v.thumbnail}">
        <div class="item-title">${v.title}</div>
        <button onclick="event.stopPropagation(); save('${v.url}')">+</button>
      </div>
    `).join("");
}

async function play(url) {
  if (cache[url]) return render(cache[url]);

  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({url})
  });

  const data = await res.json();
  if (data.error) return alert("실패");

  cache[url] = data;
  render(data);
}

function render(v) {
  document.getElementById("player").innerHTML = `
    <video src="${v.stream_url}" controls autoplay style="width:100%"></video>
  `;
}

function save(url) {
  let list = JSON.parse(localStorage.getItem("lib") || "[]");
  list.push(url);
  localStorage.setItem("lib", JSON.stringify(list));
  alert("저장됨");
}

function showLibrary() {
  document.getElementById("list").style.display = "none";
  const list = JSON.parse(localStorage.getItem("lib") || "[]");

  document.getElementById("library").style.display = "block";
  document.getElementById("library").innerHTML =
    list.map(v => `
      <div onclick="play('${v}')">
        ${v}
        <button onclick="del('${v}')">-</button>
      </div>
    `).join("");
}

function del(url) {
  if (!confirm("삭제?")) return;
  let list = JSON.parse(localStorage.getItem("lib") || "[]");
  list = list.filter(v => v !== url);
  localStorage.setItem("lib", JSON.stringify(list));
  showLibrary();
}

function showHome() {
  document.getElementById("list").style.display = "block";
  document.getElementById("library").style.display = "none";
}
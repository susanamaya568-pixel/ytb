let current = null;

// 검색
async function search(){
  const q = document.getElementById("q").value;
  const res = await fetch(`/api/search?q=${q}`);
  const data = await res.json();

  list.innerHTML = data.map(v=>`
    <div class="item-card" onclick="play('${v.url}')">
      <img src="${v.thumbnail}">
      <div>${v.title}</div>
      <button onclick="event.stopPropagation();download('${v.url}')">⬇</button>
    </div>
  `).join('');
}

// 재생
async function play(url){
  const res = await fetch('/api/resolve',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url})
  });
  const data = await res.json();
  current = data;

  if(data.type==="stream"){
    player.innerHTML=`<video src="${data.stream_url}" controls autoplay></video>`;
  }else{
    player.innerHTML=`<iframe src="${data.url}" allow="autoplay"></iframe>`;
  }

  showMini();
}

// 미니 플레이어
function showMini(){
  mini.style.display="flex";
  mini.innerHTML=`
    <div>${current.title||'재생중'}</div>
    <button onclick="player.innerHTML=''">X</button>
  `;
}

// 다운로드 (stream만 가능)
async function download(url){
  const res = await fetch('/api/resolve',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url})
  });
  const data = await res.json();

  if(data.type!=="stream"){
    alert("다운로드 불가");
    return;
  }

  const blob = await fetch(data.stream_url).then(r=>r.blob());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "video.mp4";
  a.click();
}

// PWA 등록
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js');
}
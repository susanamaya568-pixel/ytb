import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, onSnapshot, query, orderBy,
  addDoc, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAkDP9ZFuzcojt1nI81CZOHfs4DchNPGOA",
  authDomain: "ytbe-e6df1.firebaseapp.com",
  databaseURL: "https://ytbe-e6df1-default-rtdb.firebaseio.com",
  projectId: "ytbe-e6df1",
  storageBucket: "ytbe-e6df1.firebasestorage.app",
  messagingSenderId: "692050446064",
  appId: "1:692050446064:web:7b16d69a0badb8d207e435"
};

const db = getFirestore(initializeApp(firebaseConfig));

let currentUser = localStorage.getItem('yt_user');
let currentTab = 'videos';
let currentItemForSave = null;
let libUnsubscribe = null;

const videoEl = document.getElementById('videoEl');

// 음악용 오디오 엘리먼트 동적 생성
let audioEl = document.getElementById('audioEl');
if (!audioEl) {
  audioEl = document.createElement('audio');
  audioEl.id = 'audioEl';
  audioEl.controls = true;
  audioEl.style.cssText = 'width:100%;display:none;';
  videoEl.parentNode.insertBefore(audioEl, videoEl.nextSibling);
}

// PIN
const pins = ['p1','p2','p3','p4'].map(id => document.getElementById(id));
pins.forEach((p, i) => {
  if (!p) return;
  p.oninput = (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (e.target.value && i < 3) pins[i + 1].focus();
  };
  p.onkeydown = (e) => {
    if (e.key === 'Backspace' && !e.target.value && i > 0) pins[i - 1].focus();
  };
});
document.getElementById('nickInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') pins[0].focus();
});

// 로그인
document.getElementById('loginBtn').onclick = async () => {
  const nick = document.getElementById('nickInput').value.trim().toLowerCase();
  const pin = pins.map(p => p.value).join('');
  if (!nick || pin.length < 4) { showToast("닉네임과 PIN 4자리를 모두 입력하세요"); return; }
  try {
    const userRef = doc(db, "users", nick);
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data().pin !== pin) {
      showToast("PIN 번호가 틀립니다");
      pins.forEach(p => { p.value = ''; });
      pins[0].focus();
      return;
    }
    if (!snap.exists()) await setDoc(userRef, { pin, createdAt: new Date() });
    currentUser = nick;
    localStorage.setItem('yt_user', nick);
    document.getElementById('loginOverlay').classList.add('hidden');
    showToast(`${nick}님, 환영합니다 👋`);
  } catch (err) {
    showToast("연결 오류가 발생했어요");
    console.error(err);
  }
};

if (currentUser) document.getElementById('loginOverlay').classList.add('hidden');

window.logout = () => {
  if (!confirm(`${currentUser}님, 로그아웃 하시겠어요?`)) return;
  localStorage.removeItem('yt_user');
  currentUser = null;
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('nickInput').value = '';
  pins.forEach(p => p.value = '');
};

window.showHome = () => {
  document.getElementById('homePage').style.display = 'block';
  document.getElementById('libraryPage').classList.add('hidden');
  document.getElementById('navHome').classList.add('active');
  document.getElementById('navLib').classList.remove('active');
};

window.showLibrary = () => {
  document.getElementById('homePage').style.display = 'none';
  document.getElementById('libraryPage').classList.remove('hidden');
  document.getElementById('navHome').classList.remove('active');
  document.getElementById('navLib').classList.add('active');
  loadLibrary(currentTab);
};

// 검색
document.getElementById('searchBtn').onclick = doSearch;
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});
document.getElementById('searchInput').addEventListener('focus', () => {
  if (!document.getElementById('libraryPage').classList.contains('hidden')) {
    showHome();
    setTimeout(() => document.getElementById('searchInput').focus(), 50);
  }
});

async function doSearch() {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;

  const list = document.getElementById('searchList');
  list.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  document.getElementById('emptyHome').classList.add('hidden');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('search failed');
    const results = await res.json();

    if (!results.length) {
      list.innerHTML = '';
      document.getElementById('emptyHome').classList.remove('hidden');
      return;
    }

    window._searchResults = results;

    list.innerHTML = results.map((item, idx) => `
      <div class="feed-item feed-item--row" onclick="playFromSearch(${idx})">
        <img class="feed-thumb-sm" src="${item.thumbnail}" alt="" loading="lazy">
        <div class="feed-info-row">
          <div class="feed-text">
            <div class="feed-title">${escHtml(item.title)}</div>
            <div class="feed-meta">${escHtml(item.channel)}</div>
          </div>
          <button class="feed-add-btn" onclick="event.stopPropagation(); openSaveModalFromSearch(${idx})" title="보관함 추가">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '';
    showToast("검색 중 오류가 발생했어요");
    console.error(err);
  }
}

// ══════════════════════════════════════════
//  resolve helper — server.py와 동일한 방식
// ══════════════════════════════════════════
async function resolveUrl(url, mode = 'video') {
  const res = await fetch('/api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, mode })
  });
  if (!res.ok) throw new Error('resolve failed');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ══════════════════════════════════════════
//  검색결과 클릭 → resolve → 즉시 재생
// ══════════════════════════════════════════
window.playFromSearch = async (idx) => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }
  const item = window._searchResults?.[idx];
  if (!item) return;

  const playerView = document.getElementById('playerView');
  const playerTitle = document.getElementById('playerTitle');
  const playerChannel = document.getElementById('playerChannel');

  playerView.classList.remove('hidden');
  playerTitle.textContent = '불러오는 중...';
  playerChannel.textContent = '';
  videoEl.pause(); videoEl.src = '';
  audioEl.pause(); audioEl.src = '';

  try {
    const data = await resolveUrl(item.url, 'video');

    playerTitle.textContent = data.title || '';
    playerChannel.textContent = data.channel || '';
    currentItemForSave = { ...data, url: item.url };

    audioEl.style.display = 'none';
    videoEl.style.display = 'block';
    videoEl.src = data.stream_url;
    videoEl.play().catch(() => {});
    playerView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast("영상을 불러올 수 없어요");
    playerView.classList.add('hidden');
    console.error(err);
  }
};

// ══════════════════════════════════════════
//  보관함 재생 — 저장된 stream_url 바로 사용
//  (server.py 방식과 동일)
// ══════════════════════════════════════════
window.playFromLibrary = (streamUrl, audioUrl, title, channel, tabType) => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }

  const playerView = document.getElementById('playerView');
  const playerTitle = document.getElementById('playerTitle');
  const playerChannel = document.getElementById('playerChannel');

  playerView.classList.remove('hidden');
  playerTitle.textContent = title || '';
  playerChannel.textContent = channel || '';
  videoEl.pause(); videoEl.src = '';
  audioEl.pause(); audioEl.src = '';

  const isMusicTab = tabType === 'music';

  if (isMusicTab && audioUrl) {
    audioEl.style.display = 'block';
    videoEl.style.display = 'none';
    audioEl.src = audioUrl;
    audioEl.play().catch(() => {});
  } else {
    videoEl.style.display = 'block';
    audioEl.style.display = 'none';
    videoEl.src = streamUrl;
    videoEl.play().catch(() => {});
  }

  playerView.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

document.getElementById('saveFromPlayer').onclick = () => {
  if (!currentItemForSave) return;
  document.getElementById('saveModal').classList.remove('hidden');
};

// ══════════════════════════════════════════
//  보관함 저장 — resolve 후 stream_url까지 저장
//  (server.py의 addUrl과 동일한 방식)
// ══════════════════════════════════════════
window.openSaveModalFromSearch = (idx) => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }
  const item = window._searchResults?.[idx];
  if (!item) return;
  currentItemForSave = {
    id: item.id,
    title: item.title,
    channel: item.channel,
    thumbnail: item.thumbnail,
    url: item.url,
  };
  document.getElementById('saveModal').classList.remove('hidden');
};

window.closeModal = () => {
  document.getElementById('saveModal').classList.add('hidden');
};
document.getElementById('saveModal').onclick = (e) => {
  if (e.target === document.getElementById('saveModal')) closeModal();
};

// 저장 시 resolve → stream_url까지 Firestore에 저장
window.saveToTab = async (tab) => {
  if (!currentItemForSave || !currentUser) return;
  closeModal();

  showToast("저장 중...");

  try {
    const mode = tab === 'music' ? 'music' : 'video';
    const url = currentItemForSave.url ||
      `https://www.youtube.com/watch?v=${currentItemForSave.id}`;

    // resolve해서 stream_url 확보
    const data = await resolveUrl(url, mode);

    await addDoc(collection(db, "users", currentUser, tab), {
      id:         data.id,
      title:      data.title,
      channel:    data.channel || '',
      thumbnail:  data.thumbnail || '',
      url:        url,
      stream_url: data.stream_url || '',
      audio_url:  data.audio_url || '',
      addedAt:    serverTimestamp(),
    });

    const labels = { videos: '동영상', music: '노래', offline: '오프라인' };
    showToast(`${labels[tab]} 보관함에 추가됐어요`);
  } catch (err) {
    showToast("저장 중 오류가 발생했어요");
    console.error(err);
  }
};

// 보관함 로드 — stream_url 바로 재생
function loadLibrary(tab) {
  if (!currentUser) return;
  currentTab = tab;
  if (libUnsubscribe) { libUnsubscribe(); libUnsubscribe = null; }

  const listEl = document.getElementById('libraryList');
  const emptyEl = document.getElementById('emptyLib');
  listEl.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  emptyEl.classList.add('hidden');

  libUnsubscribe = onSnapshot(
    query(collection(db, "users", currentUser, tab), orderBy("addedAt", "desc")),
    (snap) => {
      if (snap.empty) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');
      listEl.innerHTML = snap.docs.map(d => {
        const item = d.data();
        // stream_url을 JS에 직접 넘겨서 재생 시 resolve 불필요
        const sUrl = encodeURIComponent(item.stream_url || '');
        const aUrl = encodeURIComponent(item.audio_url || item.stream_url || '');
        const title = encodeURIComponent(item.title || '');
        const channel = encodeURIComponent(item.channel || '');
        return `
          <div class="lib-item" onclick="playFromLibrary('${sUrl}','${aUrl}','${decodeURIComponent(title)}','${decodeURIComponent(channel)}','${tab}')">
            <img class="lib-thumb" src="${item.thumbnail || ''}" alt="" loading="lazy">
            <div class="lib-text">
              <div class="lib-title">${escHtml(item.title || '')}</div>
              <div class="lib-channel">${escHtml(item.channel || '')}</div>
            </div>
            <button class="lib-del" onclick="event.stopPropagation(); delItem('${d.id}')" title="삭제">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        `;
      }).join('');
    },
    (err) => {
      console.error(err);
      listEl.innerHTML = '';
      showToast("보관함을 불러올 수 없어요");
    }
  );
}

window.delItem = async (id) => {
  if (!confirm("이 항목을 삭제하시겠어요?")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser, currentTab, id));
    showToast("삭제되었어요");
  } catch (err) {
    showToast("삭제 중 오류가 발생했어요");
    console.error(err);
  }
};

document.querySelectorAll('.lib-tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLibrary(btn.dataset.tab);
  };
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

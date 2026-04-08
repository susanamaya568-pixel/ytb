import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, onSnapshot, query, orderBy,
  addDoc, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ───────────────────────────────────────────
   설정
─────────────────────────────────────────── */
const API_BASE = 'https://ytb-jdoz.onrender.com';

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

/* ───────────────────────────────────────────
   상태
─────────────────────────────────────────── */
let currentUser     = localStorage.getItem('yt_user');
let currentTab      = 'videos';
let currentItemForSave = null;
let libUnsubscribe  = null;

/* ───────────────────────────────────────────
   DOM 요소
─────────────────────────────────────────── */
const videoEl = document.getElementById('videoEl');

// audio 요소 – 없으면 생성
let audioEl = document.getElementById('audioEl');
if (!audioEl) {
  audioEl = document.createElement('audio');
  audioEl.id       = 'audioEl';
  audioEl.controls = true;
  audioEl.style.cssText = 'width:100%;display:none;';
  videoEl.parentNode.insertBefore(audioEl, videoEl.nextSibling);
}

/* ───────────────────────────────────────────
   유틸
─────────────────────────────────────────── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Render 프록시 상대경로 → 절대경로 변환
function toAbsoluteStreamUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

/* ───────────────────────────────────────────
   네트워크 – 재시도 포함 fetch
─────────────────────────────────────────── */
async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 3000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 403) throw new Error(`403 Forbidden – 서버 CORS/인증 확인 필요`);
      if (res.status === 404) throw new Error(`404 Not Found – 엔드포인트 없음`);
      if (!res.ok)            throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`시도 ${i + 1} 실패 (${err.message}), ${delayMs}ms 후 재시도...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/* ───────────────────────────────────────────
   API 호출
─────────────────────────────────────────── */
async function resolveUrl(url, mode = 'video') {
  const res = await fetchWithRetry(
    `${API_BASE}/api/resolve`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, mode })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ───────────────────────────────────────────
   PIN 입력 처리
─────────────────────────────────────────── */
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

/* ───────────────────────────────────────────
   로그인
─────────────────────────────────────────── */
document.getElementById('loginBtn').onclick = async () => {
  const nick = document.getElementById('nickInput').value.trim().toLowerCase();
  const pin  = pins.map(p => p.value).join('');
  if (!nick || pin.length < 4) {
    showToast("닉네임과 PIN 4자리를 모두 입력하세요");
    return;
  }
  try {
    const userRef = doc(db, "users", nick);
    const snap    = await getDoc(userRef);
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

// 이미 로그인돼 있으면 오버레이 숨기기
if (currentUser) document.getElementById('loginOverlay').classList.add('hidden');

/* ───────────────────────────────────────────
   로그아웃
─────────────────────────────────────────── */
window.logout = () => {
  if (!confirm(`${currentUser}님, 로그아웃 하시겠어요?`)) return;
  localStorage.removeItem('yt_user');
  currentUser = null;
  // 재생 중인 미디어 정지
  videoEl.pause(); videoEl.src = '';
  audioEl.pause(); audioEl.src = '';
  document.getElementById('playerView').classList.add('hidden');
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('nickInput').value = '';
  pins.forEach(p => p.value = '');
  // 보관함 리스너 해제
  if (libUnsubscribe) { libUnsubscribe(); libUnsubscribe = null; }
};

/* ───────────────────────────────────────────
   네비게이션
─────────────────────────────────────────── */
window.showHome = () => {
  document.getElementById('homePage').style.display    = 'block';
  document.getElementById('libraryPage').classList.add('hidden');
  document.getElementById('navHome').classList.add('active');
  document.getElementById('navLib').classList.remove('active');
};

window.showLibrary = () => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }
  document.getElementById('homePage').style.display       = 'none';
  document.getElementById('libraryPage').classList.remove('hidden');
  document.getElementById('navHome').classList.remove('active');
  document.getElementById('navLib').classList.add('active');
  loadLibrary(currentTab);
};

/* ───────────────────────────────────────────
   검색
─────────────────────────────────────────── */
document.getElementById('searchBtn').onclick = doSearch;
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});
// 보관함 페이지에서 검색창 포커스 시 홈으로 이동
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
    const res = await fetchWithRetry(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
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
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
                       10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '';
    showToast(`검색 오류: ${err.message}`);
    console.error('doSearch error:', err);
  }
}

/* ───────────────────────────────────────────
   검색 결과 재생
─────────────────────────────────────────── */
window.playFromSearch = async (idx) => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }
  const item = window._searchResults?.[idx];
  if (!item) return;

  const playerView    = document.getElementById('playerView');
  const playerTitle   = document.getElementById('playerTitle');
  const playerChannel = document.getElementById('playerChannel');

  playerView.classList.remove('hidden');
  playerTitle.textContent   = '서버에 연결 중... (최대 30초 소요될 수 있어요)';
  playerChannel.textContent = '';
  videoEl.pause(); videoEl.src = '';
  audioEl.pause(); audioEl.src = '';
  playerView.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const data = await resolveUrl(item.url, 'video');

    playerTitle.textContent   = data.title   || '';
    playerChannel.textContent = data.channel || '';

    const streamUrl = toAbsoluteStreamUrl(data.stream_url);

    currentItemForSave = {
      id:        data.id        || item.id        || '',
      title:     data.title     || item.title     || '',
      channel:   data.channel   || item.channel   || '',
      thumbnail: data.thumbnail || item.thumbnail || '',
      url:       item.url,
    };

    audioEl.style.display = 'none';
    videoEl.style.display = 'block';
    videoEl.src = streamUrl;
    videoEl.play().catch(() => {});
  } catch (err) {
    console.error('playFromSearch error:', err.message);
    showToast(`재생 오류: ${err.message}`);
    playerTitle.textContent   = `오류: ${err.message}`;
    playerChannel.textContent = '잠시 후 다시 시도해주세요';
  }
};

/* ───────────────────────────────────────────
   검색 결과에서 + 버튼 → 보관함 모달
─────────────────────────────────────────── */
window.openSaveModalFromSearch = async (idx) => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }
  const item = window._searchResults?.[idx];
  if (!item) return;

  // 이미 같은 항목이 세팅돼 있으면 바로 모달
  if (currentItemForSave && currentItemForSave.url === item.url) {
    document.getElementById('saveModal').classList.remove('hidden');
    return;
  }

  // stream_url 불필요 – 검색 결과 기본 정보로 세팅
  currentItemForSave = {
    id:        item.id        || '',
    title:     item.title     || '',
    channel:   item.channel   || '',
    thumbnail: item.thumbnail || '',
    url:       item.url       || '',
  };
  document.getElementById('saveModal').classList.remove('hidden');
};

/* ───────────────────────────────────────────
   플레이어 내 보관함 추가 버튼
─────────────────────────────────────────── */
document.getElementById('saveFromPlayer').onclick = () => {
  if (!currentItemForSave) { showToast("재생 중인 항목이 없어요"); return; }
  document.getElementById('saveModal').classList.remove('hidden');
};

/* ───────────────────────────────────────────
   보관함 저장 모달
─────────────────────────────────────────── */
window.closeModal = () => {
  document.getElementById('saveModal').classList.add('hidden');
};
document.getElementById('saveModal').onclick = (e) => {
  if (e.target === document.getElementById('saveModal')) closeModal();
};

// Firebase에는 YouTube 원본 url만 저장 (stream_url 저장 안 함)
window.saveToTab = async (tab) => {
  if (!currentItemForSave || !currentUser) return;
  closeModal();
  showToast("저장 중...");
  try {
    await addDoc(collection(db, "users", currentUser, tab), {
      id:        currentItemForSave.id        || '',
      title:     currentItemForSave.title     || '',
      channel:   currentItemForSave.channel   || '',
      thumbnail: currentItemForSave.thumbnail || '',
      url:       currentItemForSave.url       || '',
      addedAt:   serverTimestamp(),
    });
    const labels = { videos: '동영상', music: '노래', offline: '오프라인' };
    showToast(`${labels[tab]} 보관함에 추가됐어요 ✅`);
  } catch (err) {
    showToast("저장 중 오류가 발생했어요");
    console.error('saveToTab error:', err);
  }
};

/* ───────────────────────────────────────────
   보관함 재생 (url re-resolve → Render 프록시)
─────────────────────────────────────────── */
window.playFromLibrary = async (encodedUrl, encodedTitle, encodedChannel, encodedThumbnail, tabType) => {
  if (!currentUser) { showToast("먼저 로그인 해주세요"); return; }

  const url       = decodeURIComponent(encodedUrl);
  const title     = decodeURIComponent(encodedTitle);
  const channel   = decodeURIComponent(encodedChannel);
  const thumbnail = decodeURIComponent(encodedThumbnail);

  if (!url) { showToast("저장된 URL이 없어요. 다시 추가해주세요"); return; }

  const playerView    = document.getElementById('playerView');
  const playerTitle   = document.getElementById('playerTitle');
  const playerChannel = document.getElementById('playerChannel');

  // 홈 화면으로 전환 후 플레이어 표시
  showHome();

  playerView.classList.remove('hidden');
  playerTitle.textContent   = title || '불러오는 중...';
  playerChannel.textContent = channel;
  videoEl.pause(); videoEl.src = '';
  audioEl.pause(); audioEl.src = '';
  playerView.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const mode = tabType === 'music' ? 'music' : 'video';
    const data  = await resolveUrl(url, mode);

    playerTitle.textContent   = data.title   || title;
    playerChannel.textContent = data.channel || channel;

    const streamUrl = toAbsoluteStreamUrl(data.stream_url);
    const audioUrl  = toAbsoluteStreamUrl(data.audio_url);

    currentItemForSave = {
      id:        data.id        || '',
      title:     data.title     || title,
      channel:   data.channel   || channel,
      thumbnail: data.thumbnail || thumbnail,
      url,
    };

    if (tabType === 'music') {
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
  } catch (err) {
    console.error('playFromLibrary error:', err.message);
    showToast(`재생 오류: ${err.message}`);
    playerTitle.textContent   = `오류: ${err.message}`;
    playerChannel.textContent = '잠시 후 다시 시도해주세요';
  }
};

/* ───────────────────────────────────────────
   보관함 로드 (Firestore 실시간)
─────────────────────────────────────────── */
function loadLibrary(tab) {
  if (!currentUser) return;
  currentTab = tab;
  if (libUnsubscribe) { libUnsubscribe(); libUnsubscribe = null; }

  const listEl  = document.getElementById('libraryList');
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
        const item     = d.data();
        const eUrl     = encodeURIComponent(item.url       || '');
        const eTitle   = encodeURIComponent(item.title     || '');
        const eChannel = encodeURIComponent(item.channel   || '');
        const eThumb   = encodeURIComponent(item.thumbnail || '');
        return `
          <div class="lib-item" onclick="playFromLibrary('${eUrl}','${eTitle}','${eChannel}','${eThumb}','${tab}')">
            <img class="lib-thumb" src="${item.thumbnail || ''}" alt="" loading="lazy">
            <div class="lib-text">
              <div class="lib-title">${escHtml(item.title || '')}</div>
              <div class="lib-channel">${escHtml(item.channel || '')}</div>
            </div>
            <button class="lib-del" onclick="event.stopPropagation(); delItem('${d.id}')" title="삭제">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        `;
      }).join('');
    },
    (err) => {
      console.error('loadLibrary error:', err);
      listEl.innerHTML = '';
      showToast("보관함을 불러올 수 없어요");
    }
  );
}

/* ───────────────────────────────────────────
   보관함 항목 삭제
─────────────────────────────────────────── */
window.delItem = async (id) => {
  if (!confirm("이 항목을 삭제하시겠어요?")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser, currentTab, id));
    showToast("삭제되었어요");
  } catch (err) {
    showToast("삭제 중 오류가 발생했어요");
    console.error('delItem error:', err);
  }
};

/* ───────────────────────────────────────────
   보관함 탭 전환
─────────────────────────────────────────── */
document.querySelectorAll('.lib-tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLibrary(btn.dataset.tab);
  };
});

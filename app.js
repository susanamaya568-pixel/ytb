/* ═══════════════════════════════════════════
   YT.PLAY — app.js
   ═══════════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc,
  onSnapshot, addDoc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, writeBatch, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── CONFIG — 여기에 본인 Firebase 설정 입력 ──────────
const firebaseConfig = {
  apiKey: "AIzaSyAkDP9ZFuzcojt1nI81CZOHfs4DchNPGOA",
  authDomain: "ytbe-e6df1.firebaseapp.com",
  databaseURL: "https://ytbe-e6df1-default-rtdb.firebaseio.com",
  projectId: "ytbe-e6df1",
  storageBucket: "ytbe-e6df1.firebasestorage.app",
  messagingSenderId: "692050446064",
  appId: "1:692050446064:web:7b16d69a0badb8d207e435"
};

// Vercel 배포 시: '/api/resolve'
// 로컬 테스트 시: 'http://localhost:5000/api/resolve'
const API = '/api/resolve';

// ── Firebase init ────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

// ── DOM refs ─────────────────────────────
const loginOverlay  = document.getElementById('loginOverlay');
const mainApp       = document.getElementById('mainApp');
const loginNickname = document.getElementById('loginNickname');
const loginBtn      = document.getElementById('loginBtn');
const loginError    = document.getElementById('loginError');
const pinInputs     = [0,1,2,3].map(i => document.getElementById(`pin${i}`));

const fbStatus    = document.getElementById('fbStatus');
const videoEl     = document.getElementById('videoEl');
const emptyPlayer = document.getElementById('emptyPlayer');
const audioOverlay= document.getElementById('audioOverlay');
const audioThumb  = document.getElementById('audioThumb');
const audioTitle  = document.getElementById('audioTitle');
const audioChannel= document.getElementById('audioChannel');
const audioEq     = document.querySelector('.audio-eq');
const urlInput    = document.getElementById('urlInput');
const addBtn      = document.getElementById('addBtn');
const statusBar   = document.getElementById('statusBar');
const queueList   = document.getElementById('queueList');
const queueCount  = document.getElementById('queueCount');
const npTitle     = document.getElementById('npTitle');
const npChannel   = document.getElementById('npChannel');
const npThumbEl   = document.getElementById('npThumb');
const autoplayBtn = document.getElementById('autoplayBtn');
const loopBtn     = document.getElementById('loopBtn');
const playPauseBtn= document.getElementById('playPauseBtn');
const themeBtn    = document.getElementById('themeBtn');
const audioModeBtn= document.getElementById('audioModeBtn');
const qualitySel  = document.getElementById('qualitySel');
const userBadge   = document.getElementById('userBadge');

// ── State ────────────────────────────────
let queue      = [];
let currentIdx = -1;
let autoplay   = true;
let loopMode   = false;
let audioMode  = false;
let currentUser = null;  // { nickname, pin }
let playlistCol = null;
let unsubscribe = null;
let dragSrcIdx  = null;

// ── Theme ────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ytplay_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  themeBtn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ytplay_theme', next);
  themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// ── Audio Mode ───────────────────────────
function toggleAudioMode() {
  audioMode = !audioMode;
  audioModeBtn.classList.toggle('active', audioMode);

  if (audioMode) {
    // Hide video, show audio overlay
    videoEl.style.display = 'none';
    emptyPlayer.style.display = 'none';
    audioOverlay.style.display = 'flex';
    // If playing, keep audio going (video element still active but hidden)
    if (currentIdx >= 0) {
      const item = queue[currentIdx];
      audioTitle.textContent = item.title;
      audioChannel.textContent = item.channel;
      if (item.thumbnail) audioThumb.src = item.thumbnail;
    }
  } else {
    audioOverlay.style.display = 'none';
    if (currentIdx >= 0) {
      videoEl.style.display = 'block';
    } else {
      emptyPlayer.style.display = 'flex';
    }
  }
  updateAudioModeUI();
}

function updateAudioModeUI() {
  const isPlaying = !videoEl.paused && currentIdx >= 0;
  if (audioMode) {
    audioThumb.classList.toggle('playing', isPlaying);
    audioEq.classList.toggle('playing', isPlaying);
  }
}

// ── Login / Auth ─────────────────────────
function initLogin() {
  // PIN input auto-advance
  pinInputs.forEach((input, idx) => {
    input.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(0, 1);
      if (val && idx < 3) pinInputs[idx + 1].focus();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        pinInputs[idx - 1].focus();
      }
    });
  });

  loginBtn.addEventListener('click', attemptLogin);
  loginNickname.addEventListener('keydown', e => { if (e.key === 'Enter') pinInputs[0].focus(); });
  pinInputs[3].addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

  // Auto-login if saved
  const saved = localStorage.getItem('ytplay_user');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      loginWithUser(u);
    } catch {}
  }
}

async function attemptLogin() {
  const nickname = loginNickname.value.trim();
  const pin = pinInputs.map(i => i.value).join('');

  if (!nickname) { loginError.textContent = '닉네임을 입력하세요'; return; }
  if (pin.length !== 4) { loginError.textContent = 'PIN 4자리를 입력하세요'; return; }

  loginBtn.disabled = true;
  loginBtn.textContent = '확인 중...';
  loginError.textContent = '';

  try {
    const userRef = doc(db, 'users', nickname);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      // existing user — verify PIN
      const data = snap.data();
      if (data.pin !== pin) {
        loginError.textContent = 'PIN이 올바르지 않습니다';
        loginBtn.disabled = false;
        loginBtn.textContent = '입장하기';
        return;
      }
    } else {
      // new user — create
      await setDoc(userRef, { pin, createdAt: serverTimestamp() });
    }

    loginWithUser({ nickname, pin });
    localStorage.setItem('ytplay_user', JSON.stringify({ nickname, pin }));

  } catch (err) {
    loginError.textContent = 'Firebase 오류: ' + err.message;
    loginBtn.disabled = false;
    loginBtn.textContent = '입장하기';
  }
}

function loginWithUser(user) {
  currentUser = user;
  loginOverlay.style.display = 'none';
  mainApp.style.display = '';

  userBadge.textContent = `👤 ${user.nickname}`;

  // user-specific playlist
  playlistCol = collection(db, 'users', user.nickname, 'playlist');
  startFirestoreSync();
}

function logout() {
  localStorage.removeItem('ytplay_user');
  location.reload();
}

// ── Firestore sync ───────────────────────
function startFirestoreSync() {
  if (unsubscribe) unsubscribe();
  const q = query(playlistCol, orderBy('order', 'asc'));

  unsubscribe = onSnapshot(q,
    snapshot => {
      fbStatus.textContent = '● 연결됨';
      fbStatus.className = 'fb-status ok';

      const currentVideoId = queue[currentIdx]?.id ?? null;
      queue = snapshot.docs.map(d => ({ firestoreId: d.id, ...d.data() }));

      if (currentVideoId) {
        const found = queue.findIndex(i => i.id === currentVideoId);
        currentIdx = found >= 0 ? found : -1;
      }

      renderQueue();
      queueCount.textContent = queue.length + '개';

      if (currentIdx === -1 && queue.length > 0 && autoplay) playAt(0);
    },
    err => {
      fbStatus.textContent = '● Firebase 오류';
      fbStatus.className = 'fb-status err';
      console.error('Firestore:', err);
    }
  );
}

// ── Add URL ──────────────────────────────
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(); });
addBtn.addEventListener('click', addUrl);

async function addUrl() {
  if (!playlistCol) return;
  const url = urlInput.value.trim();
  if (!url) return;

  urlInput.value = '';
  addBtn.disabled = true;
  fbStatus.textContent = '● 저장 중...';
  fbStatus.className = 'fb-status sync';
  setStatus('영상 정보 가져오는 중...', '');

  const quality = qualitySel.value;

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, quality })
    });
    const data = await res.json();

    if (!res.ok) { setStatus('오류: ' + data.error, 'error'); return; }

    const maxOrder = queue.reduce((m, i) => Math.max(m, i.order ?? 0), 0);
    await addDoc(playlistCol, {
      id:         data.id,
      title:      data.title,
      channel:    data.channel    ?? '',
      thumbnail:  data.thumbnail  ?? '',
      stream_url: data.stream_url,
      audio_url:  data.audio_url  ?? data.stream_url,
      qualities:  data.qualities  ?? [],
      quality:    quality,
      duration:   data.duration   ?? 0,
      order:      maxOrder + 1,
      addedAt:    serverTimestamp(),
    });
    setStatus(`"${data.title}" 저장됨`, 'ok');

  } catch (err) {
    setStatus('서버 연결 실패. /api/resolve 확인하세요.', 'error');
    console.error(err);
  } finally {
    addBtn.disabled = false;
  }
}

// ── Remove ───────────────────────────────
async function removeAt(idx) {
  const item = queue[idx];
  if (!item?.firestoreId) return;
  if (idx === currentIdx) stopPlayback();
  await deleteDoc(doc(db, 'users', currentUser.nickname, 'playlist', item.firestoreId));
}

function stopPlayback() {
  videoEl.pause(); videoEl.src = '';
  videoEl.style.display = 'none';
  if (!audioMode) emptyPlayer.style.display = 'flex';
  audioOverlay.style.display = audioMode ? 'flex' : 'none';
  audioTitle.textContent = '—'; audioChannel.textContent = '—';
  currentIdx = -1;
  npTitle.textContent = '재생 중인 영상 없음';
  npTitle.classList.add('empty');
  npChannel.textContent = '—';
  npThumbEl.style.display = 'none';
  document.title = 'YT.PLAY';
  updatePlayPauseBtn();
  updateMediaSession(null);
}

// ── Play ─────────────────────────────────
function playAt(idx) {
  if (idx < 0 || idx >= queue.length) return;
  const item = queue[idx];
  if (!item?.stream_url) return;

  currentIdx = idx;

  // In audio mode, use audio_url (audio-only stream) if available
  const src = audioMode && item.audio_url ? item.audio_url : item.stream_url;
  videoEl.src = src;

  if (audioMode) {
    videoEl.style.display = 'none';
    emptyPlayer.style.display = 'none';
    audioOverlay.style.display = 'flex';
    audioTitle.textContent = item.title;
    audioChannel.textContent = item.channel;
    if (item.thumbnail) { audioThumb.src = item.thumbnail; }
  } else {
    videoEl.style.display = 'block';
    emptyPlayer.style.display = 'none';
    audioOverlay.style.display = 'none';
  }

  videoEl.load();
  videoEl.play().catch(() => {});

  npTitle.textContent = item.title;
  npTitle.classList.remove('empty');
  npChannel.textContent = item.channel;

  if (item.thumbnail) {
    npThumbEl.src = item.thumbnail;
    npThumbEl.style.display = 'block';
  } else {
    npThumbEl.style.display = 'none';
  }

  document.title = item.title + ' — YT.PLAY';
  setStatus('', '');
  renderQueue();
  updatePlayPauseBtn();
  updateAudioModeUI();
  updateMediaSession(item);
}

// ── Media Session API (lockscreen / notification controls) ──
function updateMediaSession(item) {
  if (!('mediaSession' in navigator)) return;

  if (!item) {
    navigator.mediaSession.metadata = null;
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title:   item.title,
    artist:  item.channel,
    artwork: item.thumbnail
      ? [
          { src: item.thumbnail, sizes: '320x180', type: 'image/jpeg' },
        ]
      : [],
  });

  navigator.mediaSession.setActionHandler('play',         () => videoEl.play());
  navigator.mediaSession.setActionHandler('pause',        () => videoEl.pause());
  navigator.mediaSession.setActionHandler('previoustrack',() => prevTrack());
  navigator.mediaSession.setActionHandler('nexttrack',    () => nextTrack());
  navigator.mediaSession.setActionHandler('seekbackward', () => { videoEl.currentTime = Math.max(0, videoEl.currentTime - 10); });
  navigator.mediaSession.setActionHandler('seekforward',  () => { videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 10); });
}

// ── Render Queue ──────────────────────────
function renderQueue() {
  queueCount.textContent = queue.length + '개';
  if (!queue.length) {
    queueList.innerHTML = `<div class="empty-queue">아직 영상이 없어요.<br>위에서 YouTube 링크를 추가하세요.</div>`;
    return;
  }

  queueList.innerHTML = queue.map((item, idx) => {
    const isActive = idx === currentIdx;
    const numOrDot = isActive
      ? `<div class="playing-dot"></div>`
      : `<span class="qi-num">${idx + 1}</span>`;
    const thumbEl = item.thumbnail
      ? `<img class="qi-thumb" src="${escHtml(item.thumbnail)}" loading="lazy" draggable="false">`
      : `<div class="qi-thumb-ph"></div>`;

    return `
      <div class="queue-item${isActive ? ' active' : ''}" id="qi_${idx}" draggable="true" data-idx="${idx}">
        <span class="drag-handle" title="드래그로 순서 변경">⠿</span>
        ${numOrDot}
        ${thumbEl}
        <div class="qi-info" onclick="window._playAt(${idx})">
          <div class="qi-title">${escHtml(item.title)}</div>
          <div class="qi-channel">${escHtml(item.channel)}</div>
        </div>
        <button class="qi-del" onclick="window._removeAt(${idx})" title="삭제">✕</button>
      </div>`;
  }).join('');

  const activeEl = document.getElementById(`qi_${currentIdx}`);
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  attachDragListeners();
}

// ── Drag & Drop ───────────────────────────
function attachDragListeners() {
  queueList.querySelectorAll('.queue-item').forEach(el => {
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragover',  onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop',      onDrop);
    el.addEventListener('dragend',   onDragEnd);
  });
  queueList.addEventListener('dragover',  onListDragOver);
  queueList.addEventListener('dragleave', onListDragLeave);
  queueList.addEventListener('drop',      onListDrop);
}

function onDragStart(e) {
  dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcIdx);
}
function onDragOver(e) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget;
  if (parseInt(el.dataset.idx) !== dragSrcIdx) {
    queueList.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    el.classList.add('drag-over');
  }
  queueList.classList.remove('drag-end-indicator');
}
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  const targetIdx = parseInt(e.currentTarget.dataset.idx);
  if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) reorderQueue(dragSrcIdx, targetIdx);
  cleanupDrag();
}
function onDragEnd() { cleanupDrag(); }
function onListDragOver(e) {
  const last = queueList.querySelector('.queue-item:last-child');
  if (last && e.clientY > last.getBoundingClientRect().bottom) {
    queueList.classList.add('drag-end-indicator');
    queueList.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
  }
}
function onListDragLeave() { queueList.classList.remove('drag-end-indicator'); }
function onListDrop(e) {
  if (queueList.classList.contains('drag-end-indicator') && dragSrcIdx !== null) {
    reorderQueue(dragSrcIdx, queue.length - 1);
    cleanupDrag();
  }
}
function cleanupDrag() {
  dragSrcIdx = null;
  queueList.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
  queueList.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
  queueList.classList.remove('drag-end-indicator');
}

async function reorderQueue(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const newQueue = [...queue];
  const [moved] = newQueue.splice(fromIdx, 1);
  newQueue.splice(toIdx, 0, moved);

  const currentVideoId = queue[currentIdx]?.id ?? null;
  queue = newQueue;
  if (currentVideoId) currentIdx = queue.findIndex(i => i.id === currentVideoId);
  renderQueue();

  try {
    const batch = writeBatch(db);
    newQueue.forEach((item, idx) => {
      batch.update(doc(db, 'users', currentUser.nickname, 'playlist', item.firestoreId), { order: idx });
    });
    await batch.commit();
  } catch (err) {
    console.error('순서 저장 실패:', err);
    setStatus('순서 저장 실패', 'error');
  }
}

// ── Controls ─────────────────────────────
function prevTrack() {
  if (!queue.length) return;
  const prev = loopMode ? currentIdx : Math.max(0, currentIdx - 1);
  playAt(prev);
}

function nextTrack() {
  if (!queue.length) return;
  let next = loopMode ? currentIdx : currentIdx + 1;
  if (!loopMode && next >= queue.length) next = 0;
  playAt(next);
}

function toggleAutoplay() {
  autoplay = !autoplay;
  autoplayBtn.textContent = `자동재생 ${autoplay ? 'ON' : 'OFF'}`;
  autoplayBtn.classList.toggle('active', autoplay);
}

function toggleLoop() {
  loopMode = !loopMode;
  videoEl.loop = loopMode;
  loopBtn.textContent = `반복 ${loopMode ? 'ON' : 'OFF'}`;
  loopBtn.classList.toggle('active', loopMode);
}

function togglePlayPause() {
  videoEl.paused ? videoEl.play() : videoEl.pause();
  updatePlayPauseBtn();
}

function setVolume(v) { videoEl.volume = parseFloat(v); }

function updatePlayPauseBtn() {
  playPauseBtn.textContent = videoEl.paused ? '▶ 재생' : '⏸ 일시정지';
}

function setStatus(msg, type) {
  statusBar.textContent = msg;
  statusBar.className = 'status-bar' + (type ? ' ' + type : '');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Video events ──────────────────────────
videoEl.addEventListener('ended', () => {
  if (loopMode) return;
  if (autoplay) {
    const next = currentIdx + 1;
    if (next < queue.length) playAt(next);
  }
  updatePlayPauseBtn();
  updateAudioModeUI();
});
videoEl.addEventListener('pause', () => { updatePlayPauseBtn(); updateAudioModeUI(); });
videoEl.addEventListener('play',  () => { updatePlayPauseBtn(); updateAudioModeUI(); });
videoEl.addEventListener('error', () => {
  setStatus('스트림 재생 오류. URL이 만료됐을 수 있습니다. 다시 추가해보세요.', 'error');
});

// ── Wake Lock (화면 꺼짐 방지 — 오디오 모드에서) ──
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {}
}
async function releaseWakeLock() {
  if (wakeLock) { await wakeLock.release(); wakeLock = null; }
}
videoEl.addEventListener('play',  () => { if (audioMode) requestWakeLock(); });
videoEl.addEventListener('pause', () => releaseWakeLock());

// ── Expose globals ────────────────────────
window._playAt         = playAt;
window._removeAt       = removeAt;
window._prevTrack      = prevTrack;
window._nextTrack      = nextTrack;
window._toggleAutoplay = toggleAutoplay;
window._toggleLoop     = toggleLoop;
window._togglePlayPause= togglePlayPause;
window._setVolume      = setVolume;
window._toggleTheme    = toggleTheme;
window._toggleAudioMode= toggleAudioMode;
window._logout         = logout;

// ── Init ──────────────────────────────────
initTheme();
initLogin();
autoplayBtn.classList.add('active');
updatePlayPauseBtn();

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let currentUser = null, currentTab = 'search', audioMode = false, queue = [], currentIdx = -1;
const videoEl = document.getElementById('videoEl');

// ── PIN 자동 이동 및 숫자 체크 (수정됨) ──
const pins = [document.getElementById('p1'), document.getElementById('p2'), document.getElementById('p3'), document.getElementById('p4')];

pins.forEach((p, i) => {
    p.addEventListener('input', (e) => {
        // 숫자 외 입력 방지
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        // 입력 시 다음 칸으로 이동
        if(e.target.value.length === 1 && i < 3) pins[i+1].focus();
    });
    // 백스페이스 시 이전 칸으로 이동
    p.addEventListener('keydown', (e) => {
        if(e.key === 'Backspace' && !e.target.value && i > 0) pins[i-1].focus();
    });
});

// ── 로그인 로직 (대소문자 무시) ──
document.getElementById('loginBtn').onclick = async () => {
    const nick = document.getElementById('nickInput').value.trim().toLowerCase();
    const pin = pins.map(p => p.value).join(''); // 에러 났던 부분 수정 완료
    
    if(!nick || pin.length < 4) return alert("정보를 모두 입력하세요.");

    const userRef = doc(db, "users", nick);
    const snap = await getDoc(userRef);

    if(snap.exists() && snap.data().pin !== pin) return alert("PIN 번호가 틀립니다.");
    if(!snap.exists()) await setDoc(userRef, { pin, createdAt: new Date() });

    currentUser = nick;
    document.getElementById('loginOverlay').style.display = 'none';
};

// ── 검색 기능 ──
async function searchYoutube() {
    const q = document.getElementById('searchInput').value.trim();
    if(!q) return;
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    renderFeed(results, true);
}
document.getElementById('searchBtn').onclick = searchYoutube;
document.getElementById('searchInput').onkeydown = (e) => { if(e.key === 'Enter') searchYoutube(); };

// ── 재생 및 잠금화면 ──
async function playAt(idx) {
    currentIdx = idx; const item = queue[idx];
    document.getElementById('playerView').style.display = 'block';
    videoEl.src = audioMode ? item.audio_url : item.stream_url;
    videoEl.play();
    document.getElementById('npTitle').textContent = item.title;

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: item.title, artist: item.channel,
            artwork: [{ src: item.thumbnail, sizes: '512x512', type: 'image/png' }]
        });
    }
}

// ── 유튜브 모바일 스타일 피드 ──
function renderFeed(items, isSearch = false) {
    const listEl = document.getElementById('itemList');
    queue = items;
    listEl.innerHTML = items.map((item, i) => `
        <div class="item-card" onclick="${isSearch ? `window._playUrl('${item.url}')` : `window._playAt(${i})`}">
            <img src="${item.thumbnail}" class="item-thumb">
            <div class="item-info">
                <div class="item-title">${item.title}</div>
                <button class="item-action" onclick="event.stopPropagation(); ${isSearch ? `window._save('${item.url}')` : `window._del('${item.firestoreId}')` }">
                    ${isSearch ? '추가' : '삭제'}
                </button>
            </div>
        </div>
    `).join('');
}

// 부가 함수들
window._save = async (url) => {
    const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ url, quality: '720' })
    });
    const data = await res.json();
    const tab = confirm("노래목록에 추가할까요? (취소 시 동영상)") ? "music" : "videos";
    await addDoc(collection(db, "users", currentUser, tab), { ...data, addedAt: serverTimestamp() });
    alert("보관함 저장됨");
};

window._del = async (id) => {
    if(confirm("정말 삭제하시겠습니까?")) await deleteDoc(doc(db, "users", currentUser, currentTab, id));
};

function loadLibrary(tab) {
    currentTab = tab;
    onSnapshot(query(collection(db, "users", currentUser, tab), orderBy("addedAt", "desc")), (snap) => {
        const items = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        if(currentTab !== 'search') renderFeed(items, false);
    });
}

document.querySelectorAll('.tab').forEach(t => t.onclick = (e) => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active'); loadLibrary(e.target.dataset.tab);
});

window._playAt = playAt;
window._playUrl = async (url) => {
    const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ url, quality: '720' })
    });
    const data = await res.json(); queue = [data]; playAt(0);
};
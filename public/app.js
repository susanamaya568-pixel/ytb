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

let currentUser = localStorage.getItem('yt_sess'); 
let currentTab = 'videos', audioMode = false, queue = [], currentIdx = -1;
const videoEl = document.getElementById('videoEl');

// ── PIN 자동 이동 ──
const pins = [document.getElementById('p1'), document.getElementById('p2'), document.getElementById('p3'), document.getElementById('p4')];
pins.forEach((p, i) => {
    if(!p) return;
    p.oninput = (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        if(e.target.value && i < 3) pins[i+1].focus();
    };
    p.onkeydown = (e) => { if(e.key === 'Backspace' && !e.target.value && i > 0) pins[i-1].focus(); };
});

// ── 로그인 ──
document.getElementById('loginBtn').onclick = async () => {
    const nick = document.getElementById('nickInput').value.trim().toLowerCase();
    const pin = pins.map(p => p.value).join('');
    if(!nick || pin.length < 4) return alert("정보 입력!");

    const userRef = doc(db, "users", nick);
    const snap = await getDoc(userRef);
    if(snap.exists() && snap.data().pin !== pin) return alert("PIN 틀림!");
    if(!snap.exists()) await setDoc(userRef, { pin, createdAt: new Date() });

    currentUser = nick;
    localStorage.setItem('yt_sess', nick);
    document.getElementById('loginOverlay').classList.add('d-none');
    showHome();
};

if(currentUser) {
    document.getElementById('loginOverlay').classList.add('d-none');
}

// ── 화면 전환 ──
window.showHome = () => {
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('libraryPage').style.display = 'none';
};
window.showLibrary = () => {
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('libraryPage').style.display = 'block';
    loadLibrary('videos');
};

// ── 검색 및 추가 ──
document.getElementById('searchBtn').onclick = async () => {
    const q = document.getElementById('searchInput').value;
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    renderFeed(results, 'searchList', true);
};

function renderFeed(items, listId, isSearch) {
    const listEl = document.getElementById(listId);
    queue = items;
    listEl.innerHTML = items.map((item, i) => `
        <div class="list-group-item d-flex gap-3 py-3 border-0 align-items-center" onclick="window._playUrl('${item.url}')">
            <img src="${item.thumbnail}" class="rounded" style="width:100px; aspect-ratio:16/9; object-fit:cover;">
            <div class="flex-grow-1 overflow-hidden">
                <div class="fw-bold text-truncate small">${item.title}</div>
                <div class="text-muted" style="font-size:11px;">${item.channel}</div>
            </div>
            <button class="btn btn-sm btn-light" onclick="event.stopPropagation(); ${isSearch ? `window._save('${item.url}')` : `window._del('${item.firestoreId}')` }">
                ${isSearch ? '+' : '×'}
            </button>
        </div>
    `).join('');
}

window._save = async (url) => {
    const res = await fetch('/api/resolve', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url }) });
    const data = await res.json();
    const tab = confirm("노래로 저장할까요? (취소 시 동영상)") ? "music" : "videos";
    await addDoc(collection(db, "users", currentUser, tab), { ...data, addedAt: serverTimestamp() });
};

window._del = async (id) => {
    if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "users", currentUser, currentTab, id));
};

function loadLibrary(tab) {
    currentTab = tab;
    onSnapshot(query(collection(db, "users", currentUser, tab), orderBy("addedAt", "desc")), (snap) => {
        const items = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        renderFeed(items, 'libraryList', false);
    });
}

document.querySelectorAll('[data-tab]').forEach(btn => btn.onclick = (e) => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    loadLibrary(e.target.dataset.tab);
});

window._playUrl = async (url) => {
    const res = await fetch('/api/resolve', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url }) });
    const data = await res.json();
    document.getElementById('playerView').style.display = 'block';
    videoEl.src = data.stream_url;
    videoEl.play();
    document.getElementById('npTitle').textContent = data.title;
};
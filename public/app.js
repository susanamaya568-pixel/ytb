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

let currentUser = localStorage.getItem('yt_user'); 
let currentTab = 'videos', audioMode = false, queue = [];
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
    if(!nick || pin.length < 4) return alert("정보를 모두 입력하세요.");

    const userRef = doc(db, "users", nick);
    const snap = await getDoc(userRef);
    if(snap.exists() && snap.data().pin !== pin) return alert("PIN 번호가 틀립니다.");
    if(!snap.exists()) await setDoc(userRef, { pin, createdAt: new Date() });

    currentUser = nick;
    localStorage.setItem('yt_user', nick);
    document.getElementById('loginOverlay').classList.add('d-none');
    showHome();
};

if(currentUser) {
    document.getElementById('loginOverlay').classList.add('d-none');
}

// ── 페이지 전환 ──
window.showHome = () => {
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('libraryPage').style.display = 'none';
};
window.showLibrary = () => {
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('libraryPage').style.display = 'block';
    loadLibrary('videos');
};

// ── 검색 및 결과 출력 ──
document.getElementById('searchBtn').onclick = async () => {
    const q = document.getElementById('searchInput').value;
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    
    const searchList = document.getElementById('searchList');
    searchList.innerHTML = results.map(item => `
        <div class="col">
            <div class="card h-100 border-0 shadow-sm overflow-hidden" onclick="window._playUrl('${item.url}')">
                <img src="${item.thumbnail}" class="card-img-top">
                <div class="card-body p-2 d-flex justify-content-between align-items-center">
                    <div class="overflow-hidden">
                        <div class="fw-bold small text-truncate">${item.title}</div>
                        <div class="text-muted" style="font-size:0.7rem;">${item.channel}</div>
                    </div>
                    <button class="btn btn-sm btn-outline-danger rounded-circle" onclick="event.stopPropagation(); window._save('${item.url}')">+</button>
                </div>
            </div>
        </div>
    `).join('');
};

window._save = async (url) => {
    const res = await fetch('/api/resolve', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url }) });
    const data = await res.json();
    const tab = confirm("노래목록에 추가할까요? (취소 시 동영상)") ? "music" : "videos";
    await addDoc(collection(db, "users", currentUser, tab), { ...data, addedAt: serverTimestamp() });
    alert("보관함에 추가되었습니다.");
};

window._playUrl = async (url) => {
    const res = await fetch('/api/resolve', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ url }) });
    const data = await res.json();
    document.getElementById('playerView').classList.remove('d-none');
    videoEl.src = data.stream_url;
    videoEl.play();
};

function loadLibrary(tab) {
    currentTab = tab;
    onSnapshot(query(collection(db, "users", currentUser, tab), orderBy("addedAt", "desc")), (snap) => {
        const listEl = document.getElementById('libraryList');
        listEl.innerHTML = snap.docs.map(d => {
            const item = d.data();
            return `
                <div class="list-group-item d-flex gap-3 align-items-center border-0 py-2" onclick="window._playUrl('https://youtu.be/${item.id}')">
                    <img src="${item.thumbnail}" class="rounded" style="width:80px; aspect-ratio:16/9; object-fit:cover;">
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="fw-bold small text-truncate">${item.title}</div>
                        <div class="text-muted small">${item.channel}</div>
                    </div>
                    <button class="btn btn-sm text-danger" onclick="event.stopPropagation(); window._del('${d.id}')">✕</button>
                </div>
            `;
        }).join('');
    });
}

window._del = async (id) => {
    if(confirm("정말 삭제하시겠습니까?")) await deleteDoc(doc(db, "users", currentUser, currentTab, id));
};

document.querySelectorAll('[data-tab]').forEach(btn => btn.onclick = (e) => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    loadLibrary(e.target.dataset.tab);
});
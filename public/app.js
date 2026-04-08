import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAkDP9ZFuzcojt1nI81CZOHfs4DchNPGOA",
  authDomain: "ytbe-e6df1.firebaseapp.com",
  databaseURL: "https://ytbe-e6df1-default-rtdb.firebaseio.com",
  projectId: "ytbe-e6df1",
  storageBucket: "ytbe-e6df1.firebasestorage.app",
  messagingSenderId: "692050446064",
  appId: "1:692050446064:web:7b16d69a0badb8d207e435"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = null;
let audioMode = false;
const videoEl = document.getElementById('videoEl');

// ── 닉네임 + PIN 로그인 로직 ──
document.getElementById('loginBtn').onclick = async () => {
    const nick = document.getElementById('nickInput').value.trim();
    const pin = [1,2,3,4].map(i => document.getElementById(`pin${i}`).value).join('');
    
    if(!nick || pin.length < 4) return alert("정보를 입력하세요.");

    const userRef = doc(db, "users", nick);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
        if (snap.data().pin !== pin) return alert("PIN 번호가 틀립니다.");
    } else {
        await setDoc(userRef, { pin, createdAt: new Date() });
    }

    currentUser = nick;
    document.getElementById('loginOverlay').style.display = 'none';
    initPlaylist(); // 사용자 전용 재생목록 로드
};

// ── 백그라운드 & 잠금화면 제어 (Media Session API) ──
function updateMediaMetadata(title, artist, thumb) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            artwork: [{ src: thumb, sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', () => videoEl.play());
        navigator.mediaSession.setActionHandler('pause', () => videoEl.pause());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    }
}

// ── 듣기 모드 토글 ──
document.getElementById('audioModeBtn').onclick = () => {
    audioMode = !audioMode;
    const visualizer = document.getElementById('audioVisualizer');
    visualizer.style.display = audioMode ? 'flex' : 'none';
    document.getElementById('audioModeBtn').classList.toggle('active', audioMode);
};

// ── 테마 토글 ──
document.getElementById('themeBtn').onclick = () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
};

// ── 재생 함수 수정 ──
async function playItem(item) {
    // 오디오 모드일 때 audio_url(m4a) 사용해서 데이터 아끼고 백그라운드 유지력 강화
    videoEl.src = audioMode ? item.audio_url : item.stream_url;
    videoEl.play();
    updateMediaMetadata(item.title, item.channel, item.thumbnail);
}
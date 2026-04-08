# YT.PLAY 설정 가이드

## 📁 파일 구조

```
ytplay/
├── vercel.json          ← Vercel 설정
├── requirements.txt     ← Python 패키지 (yt-dlp)
├── api/
│   └── resolve.py       ← 백엔드 (Vercel Serverless Function)
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## 🔥 Step 1. Firebase 새로 만들기

1. https://console.firebase.google.com 접속
2. **프로젝트 만들기** 클릭
3. 프로젝트 이름 입력 (예: `ytplay-mine`) → 계속
4. Google Analytics: **끄기** → 프로젝트 만들기

### Firestore 활성화
1. 왼쪽 메뉴 → **Firestore Database** → **데이터베이스 만들기**
2. **프로덕션 모드**로 시작
3. 리전: `asia-northeast3 (서울)` 선택 → 완료

### Firestore 보안 규칙 설정
Firestore → **규칙** 탭에서 아래 내용으로 교체 후 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{nickname} {
      allow read, write: if true;
    }
    match /users/{nickname}/playlist/{docId} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ 이 규칙은 간단한 PIN 인증용입니다. 누구나 닉네임을 알면 접근 가능해요.
> 보안이 필요하다면 Firebase Auth를 나중에 추가하세요.

### Firebase 설정값 가져오기
1. 프로젝트 설정(⚙️) → **일반** 탭
2. "내 앱" 섹션 → 웹 앱 추가 (`</>` 아이콘)
3. 앱 닉네임 입력 → **앱 등록**
4. `firebaseConfig` 객체 복사

---

## ⚙️ Step 2. app.js에 Firebase 설정 입력

`public/app.js` 파일 상단의 `firebaseConfig`를 교체:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",        // ← 여기에 복사한 값
  authDomain:        "my-project.firebaseapp.com",
  projectId:         "my-project",
  storageBucket:     "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc...",
};
```

---

## 🚀 Step 3. Vercel 배포

### 방법 A. GitHub 연동 (추천)
1. 이 폴더를 GitHub에 push
2. https://vercel.com → **Add New Project**
3. GitHub 레포 선택 → **Deploy**

### 방법 B. Vercel CLI
```bash
npm i -g vercel
cd ytplay/
vercel
```

### 배포 후 확인
- `https://your-app.vercel.app` 에서 접속
- `/api/resolve` 가 Python Serverless로 작동

---

## 🎧 새 기능 정리

| 기능 | 설명 |
|------|------|
| 🌙/☀️ 다크/라이트 모드 | 헤더 우측 버튼, 설정 저장됨 |
| 👤 닉네임+PIN 로그인 | Firebase에 저장, 기기 간 동기화 |
| 🎧 듣기 모드 | 영상 숨기고 오디오만 재생, 앨범 커버 회전 |
| 📺 화질 선택 | 1080p / 720p / 480p / 360p |
| 🔒 잠금화면 미디어 컨트롤 | Media Session API (iOS Safari 일부 지원) |
| ▶ 이전/다음/볼륨 | 잠금화면 위젯에서 제어 가능 |

---

## ❓ 자주 묻는 질문

**Q. iOS에서 화면 끄면 음악이 멈춰요**
→ Safari는 백그라운드 재생 제한이 있어요. 
  듣기 모드에서 Wake Lock API로 최대한 방지하지만, 완벽하지 않아요.
  App으로 만들려면 PWA manifest.json 추가가 필요해요.

**Q. 화질 선택이 안 돼요**
→ 영상을 추가할 때 화질을 미리 선택하세요. 이미 추가된 영상은 다시 추가해야 해요.

**Q. Vercel에서 yt-dlp 오류가 나요**
→ Vercel Python Serverless의 실행 시간이 10초로 제한돼요. 
  느린 영상은 타임아웃이 날 수 있어요. 이 경우 Fly.io 백엔드를 추천해요.

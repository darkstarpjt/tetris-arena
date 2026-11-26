# Tetris Arena — 1:1 & 4인 배틀 테트리스 앱

Google Play Store & Apple App Store 출시를 목표로 설계된 **React + TypeScript + Capacitor + Node.js(Socket.io) + SQLite** 기반 실시간 배틀 테트리스 앱입니다.

## 주요 기능
- **솔로 클래식**: 개인 최고 점수 기록 도전 (로그인 시 서버 DB 자동 동기화 + 로컬 저장)
- **AI 봇 배틀 (1:1 / 4인 배틀)**: 쉬움 · 보통 · 어려움 난이도 선택, 블록 제거 시 방해 줄 공격 및 상쇄
- **온라인 1:1 & 4인 동시 배틀**:
  - 빠른 매칭 및 4자리 방 코드 생성/참가
  - 블록을 없앨 때마다 **살아있는 모든 상대에게 동시에 방해 블록 공격**
  - 대기 중인 방해 줄은 내가 블록을 제거해 **상쇄(방어)** 가능
- **회원가입 / 로그인 (ID · 비밀번호)**: 암호화된 비밀번호 저장 및 토큰 인증
- **TOP 10 명예의 전당 & 기록 자랑하기**:
  - 온라인 대전 승점 TOP 10 & 개인 최고 점수 TOP 10 (SQLite DB 저장)
  - 원클릭 기록 자랑하기 (모바일 공유 / 클립보드 복사)

## 로컬 실행 방법

### 1. 서버 실행 (API + 실시간 멀티플레이어 + 빌드된 웹앱 제공)
```bash
npm run start
```
실행 후 브라우저에서 `http://localhost:4000` 접속!
(여러 브라우저 탭 또는 시크릿 창을 열어 1:1 및 4인 온라인 대전을 즉시 테스트할 수 있습니다.)

### 2. 개발 모드 (프론트엔드 Hot Reload)
터미널 1:
```bash
npm run dev:server
```
터미널 2:
```bash
npm run dev:client
```
개발 주소: `http://localhost:5173`

## 플레이스토어(Android) & 앱스토어(iOS) 앱 패키징 (Capacitor)
1. 배포된 백엔드 서버 주소를 `client/.env.production`에 설정합니다:
   ```env
   VITE_API_URL=https://your-tetris-server.com
   ```
2. 웹 앱을 빌드합니다:
   ```bash
   npm run build
   ```
3. Android / iOS 네이티브 프로젝트를 추가하고 동기화합니다:
   ```bash
   cd client
   npm install @capacitor/android @capacitor/ios
   npx cap add android
   npx cap add ios
   npx cap sync
   ```
4. Android Studio(`npx cap open android`) 또는 Xcode(`npx cap open ios`)에서 스토어 출시용 AAB/IPA를 빌드합니다.

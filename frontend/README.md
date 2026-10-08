# CineEntry Frontend

프론트엔드는 CineEntry의 사용자 경험을 직접 보여주는 앱 레이어입니다. 영화 기록을 남기고, 다시 꺼내보고, 취향을 시각적으로 확인하는 흐름을 모바일 중심으로 구성합니다.

## 이 앱이 보여주는 경험

- 처음 들어오면 최근 감상 기록과 지금 보고 있는 영화가 먼저 보입니다.
- 영화를 추가할 때는 검색에서 시작해 내 기록으로 자연스럽게 이어집니다.
- 기록이 쌓일수록 통계와 컬렉션이 개인 취향 아카이브처럼 작동합니다.
- 프로필에서는 내 기록 습관과 앱 내 정보가 한 번에 정리됩니다.

## 화면 구성

### 핵심 탭

- `Home`: 최근 감상 기록, 이어 보는 작품, 컬렉션
- `Movies`: 내 영화 라이브러리와 검색/필터 흐름
- `Stats`: 관람 패턴과 취향을 돌아보는 회고
- `Profile`: 프로필과 앱 정보

### 세부 화면

- `MovieDetail`
- `MovieSearch`
- `Collections`
- `CollectionDetail`
- `EditProfile`
- `StreakDetail`
- `WatchCalendar`
- `WatchCalendarSettings`
- `About`
- `Help`
- `Terms`
- `Privacy`

### 진입 흐름

- `Login`
- `EmailLogin`
- `SignUp`
- `ForgotPassword`

## UI 방향

- 모든 텍스트는 한국어 기준으로 작성합니다.
- 중성 차콜 배경과 부드러운 흰색 텍스트를 기본으로, 골드는 별점과 주요 동작에 제한합니다.
- 포스터와 실제 감상이 중심인 개인 영화 아카이브를 지향합니다. 장식적인 그라디언트와 반복되는 통계 카드를 피합니다.
- 여백, 얇은 구분선, 타이포 위계로 섹션을 구분합니다. 포스터는 2:3 비율을 유지합니다.
- 영화 자체의 정보와 내 관람 기록을 분리합니다. 기록이 없으면 가짜 콘텐츠 대신 명확한 빈 상태를 표시합니다.
- 웹은 넓은 보관함과 상세 탐색, 모바일은 짧은 기록 흐름에 맞춥니다. 화면 너비 변화에 따라 그리드와 상세 배치를 조정합니다.

## 코드 구조

```text
frontend/
├── App.tsx
└── src/
    ├── components/   # 공통 UI
    ├── constants/    # 색상, 상수
    ├── contexts/     # 앱 전역 상태
    ├── lib/          # API 클라이언트, 유틸
    ├── screens/      # 화면 컴포넌트
    ├── services/     # 서버 통신 레이어
    └── types/        # 타입 정의
```

## 개발 시작

### 환경 변수

```bash
cd frontend
cp .env.example .env
```

```env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

### 실행

```bash
npm install
npm start
```

플랫폼별 실행:

```bash
npm run ios
npm run android
npm run web
```

## 더 보기

- 프로젝트 개요: [../README.md](../README.md)
- 서버 가이드: [../backend/README.md](../backend/README.md)

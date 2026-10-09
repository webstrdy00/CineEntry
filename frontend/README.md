# CineEntry 앱 개발

Expo SDK 55 / React Native 0.83.10 / React Navigation 7 기반 클라이언트입니다. 제품 소개와 현재 서비스 상태는 [루트 README](../README.md)를 참고하세요.

[로컬 실행](#로컬-실행) · [기기별 연결](#기기별-api-주소) · [웹 실행](#웹-실행) · [검사](#검사와-번들-생성) · [문제 해결](#문제-해결)

## 로컬 실행

### 준비

- Node.js 24와 npm. 의존성 버전은 `package-lock.json`을 사용합니다.
- 먼저 실행한 [로컬 API 서버](../backend/README.md#로컬-실행).
- Android: Android Studio 에뮬레이터 또는 연결한 기기, SDK 55 호환 Expo Go.
- iOS 시뮬레이터: macOS와 Xcode 필요. Windows에서는 실행할 수 없습니다.

저장소 루트에서:

```bash
cd frontend
npm ci
```

환경 파일 복사:

```bash
# macOS / Linux / Git Bash
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

`.env`의 `EXPO_PUBLIC_API_URL`을 기기에서 접근 가능한 API 주소로 바꿉니다. **URL에는 `/api/v1`을 붙이지 않습니다.** 각 서비스가 API 경로를 추가합니다.

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
EXPO_PUBLIC_ENABLE_WEB_APP=false
```

`EXPO_PUBLIC_` 값은 앱 번들에 포함됩니다. API 주소처럼 공개 가능한 값만 넣고 영화 API 키·OAuth client secret·서버 JWT 키는 절대 넣지 마세요. 로컬 `.env.production`이 남아 있다면 export 시 개발 `.env`와 다른 주소를 사용할 수 있으므로 구분해 관리하세요.

```bash
npm start
```

Metro 터미널에서 `a`로 Android를 열거나, Expo Go로 개발 서버에 접속합니다. 정상 실행 후 로그인/회원가입 화면이 나타나며, API 설정이 맞으면 회원가입과 보관함 조회가 가능합니다. 이메일 재로그인은 [이메일 인증 조건](../backend/README.md#기능별-설정)이 충족되어야 합니다.

## 기기별 API 주소

| 환경 | `EXPO_PUBLIC_API_URL` | 연결 조건 |
| --- | --- | --- |
| PC 웹 / iOS 시뮬레이터 | `http://127.0.0.1:8000` | API가 같은 컴퓨터에서 실행 |
| Android 에뮬레이터 + ADB reverse | `http://127.0.0.1:8000` | 아래 reverse 명령 실행 |
| 표준 Android Studio 에뮬레이터 | `http://10.0.2.2:8000` | 에뮬레이터가 호스트 API에 접근 |
| Wi-Fi 실제 기기 | PC의 LAN IP와 포트 8000 | 같은 네트워크, API `--host 0.0.0.0`, 방화벽 허용 |

ADB reverse 방식:

```bash
adb devices -l
adb reverse tcp:8000 tcp:8000
```

Metro도 localhost로 접속하는 경우 **실제 Metro 포트**를 전달합니다. 기본 8081이라면 `adb reverse tcp:8081 tcp:8081`입니다. 여러 기기가 있으면 `adb -s <serial> reverse ...`로 대상을 지정하세요. 에뮬레이터 재시작 후에는 reverse 설정을 다시 확인합니다.

주소 변경 후 Metro를 재시작하고 앱을 다시 로드하세요. 실제 기기의 `localhost`는 PC가 아니라 기기 자신입니다. 개발 API·Metro·DB 포트는 인터넷에 공개하지 마세요.

## 웹 실행

기본값은 모바일 OAuth 브릿지 전용입니다. 전체 UI를 로컬 웹에서 확인하려면 두 설정을 모두 바꾸고 서버와 Metro를 재시작합니다.

```dotenv
# frontend/.env
EXPO_PUBLIC_ENABLE_WEB_APP=true

# backend/.env
OAUTH_WEB_CLIENT_ENABLED=True
FRONTEND_URL=http://localhost:8081
```

```bash
npm run web
```

실제 웹 origin이 다르면 백엔드의 `FRONTEND_URL` 또는 `CORS_ALLOWED_ORIGINS`에도 맞춰야 합니다. 전체 웹 UI를 허용하는 것만으로 OAuth 제공자 설정까지 완료되는 것은 아닙니다.

## 검사와 번들 생성

모두 `frontend/`에서 실행합니다.

| 명령 | 확인하는 것 |
| --- | --- |
| `npx tsc --noEmit` | TypeScript 타입 |
| `npm test` | refresh 동시 요청·오류 처리, OAuth proof, 릴리스 API URL 규칙 |
| `npx expo export --platform all` | web JavaScript 및 Android/iOS Hermes 번들 생성 |

export는 운영 모드이므로 [app.config.js](app.config.js)가 **HTTPS API origin**을 요구합니다. 자격증명·경로·쿼리·fragment·localhost가 포함된 주소는 거부합니다. 유효한 운영 주소를 로컬 `.env.production` 또는 실행 환경에 지정하세요.

컴파일 확인만 할 때는 다음처럼 합성 주소를 사용할 수 있습니다. **이 결과물은 동작하는 서비스가 아니므로 배포하지 마세요.**

```bash
# macOS / Linux / Git Bash
EXPO_PUBLIC_API_URL=https://api.example.test npx expo export --platform all
```

```powershell
# Windows PowerShell
$env:EXPO_PUBLIC_API_URL = 'https://api.example.test'
npx expo export --platform all
Remove-Item Env:EXPO_PUBLIC_API_URL
```

### EAS 릴리스 준비

[eas.json](eas.json)은 development / preview / production 환경을 구분합니다. 릴리스에는 Expo/EAS 로그인, 기존 앱 서명 자격, 해당 EAS environment의 `EXPO_PUBLIC_API_URL` 설정이 필요합니다. `.env.production`은 Git/EAS 업로드에서 제외되므로 로컬 파일만 작성하고 끝내지 마세요.

현재 운영 이전과 서명 앱 배포는 보류 상태입니다. Expo Go 실행, 번들 생성, 서명 앱 설치, 스토어 배포는 각각 별도 검증입니다.

## 문제 해결

| 증상 | 확인할 항목 |
| --- | --- |
| 앱은 열리지만 로그인·목록 조회 실패 | 백엔드 `/health`, API URL, 기기 네트워크 및 ADB reverse |
| 웹에서 인증 안내만 표시 | 기본 브릿지 정책. 전체 웹 설정 두 곳 확인 |
| 가입했지만 다시 로그인할 수 없음 | 이메일 인증 여부. log-only 모드는 메일을 보내지 않음 |
| 외부 작품 등록 실패 | 제공자 상세 조회 오류를 확인. 실패한 검색값을 임의 메타데이터로 저장하지 않음 |
| 이미지 업로드 실패 | GCS 설정·권한·결제 상태. 상세 조건은 서버 가이드 참고 |
| export에서 API URL 오류 | 개발용 HTTP 주소가 아닌 HTTPS origin 설정 필요 |
| Expo Go에서 native module 오류 | Expo SDK 55와 설치된 Expo Go 호환 여부, `npm ci` 후 재실행 |

## 코드 위치

```text
App.tsx                 내비게이션과 앱 진입
app.config.js           릴리스 API 설정 검사
src/screens/            홈·보관함·검색·기록·컬렉션·회고
src/components/         공통 UI
src/contexts/           인증 등 전역 상태
src/lib/api.ts          요청과 세션 갱신
src/services/           도메인별 API 호출
src/config/runtime.ts   웹 브릿지 정책
scripts/test-*.cjs      인증 및 빌드 설정 회귀 테스트
```

UI 문구는 한국어를 사용합니다. 실제 감상 기록과 포스터가 중심이며, 기록이 없을 때 샘플 데이터를 실제 기록처럼 표시하지 않습니다.

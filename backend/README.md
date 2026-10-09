# CineEntry API

FastAPI 서버가 계정, 작품 검색, 개인 감상 기록, 컬렉션, 통계와 이미지 접근을 담당합니다. 앱 실행 방법은 [프런트엔드 가이드](../frontend/README.md), 서비스 상태는 [프로젝트 소개](../README.md)를 참고하세요.

[로컬 실행](#로컬-실행) · [기능별 설정](#기능별-설정) · [테스트](#테스트) · [문제 해결](#문제-해결) · [운영](#운영-전-확인)

## 로컬 실행

### 1. 도구와 환경 파일

Python 3.12, Docker Compose v2를 준비합니다. 아래 명령은 저장소 루트에서 시작하며, 이후 작업 위치는 `backend/`입니다.

```bash
cd backend
python -m venv .venv
```

```bash
# macOS / Linux / Git Bash
source .venv/bin/activate
cp .env.example .env
```

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
Copy-Item .env.example .env
```

Windows Git Bash의 가상환경 활성화 경로는 `source .venv/Scripts/activate`입니다. 실행 정책으로 PowerShell 활성화가 막히면 정책을 무작정 완화하지 말고 `.\.venv\Scripts\python.exe`로 Python 명령을 실행할 수 있습니다.

```bash
python -m pip install -r requirements.txt
```

[.env.example](.env.example)을 복사한 뒤 다음 기본값을 확인합니다. 아래 DB 자격은 로컬 Compose 전용이며 운영에 재사용하지 않습니다.

```dotenv
DEBUG=True
DATABASE_URL=postgresql://cineentry_user:cineentry_password@localhost:5432/cineentry_db
REDIS_URL=redis://localhost:6379/0
FRONTEND_URL=http://localhost:8081
BACKEND_PUBLIC_URL=http://localhost:8000
EMAIL_LOG_ONLY=True
```

`JWT_SECRET_KEY`는 다음 명령으로 생성한 값을 로컬 `.env`에 넣고 공개하지 마세요.

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

사용하지 않는 외부 서비스의 예제값(`your_...`, `**`, `smtp.example.com`)은 실제 자격이 아닙니다. GCS를 설정하지 않을 때는 `GCP_BUCKET_NAME`과 `GOOGLE_APPLICATION_CREDENTIALS`를 빈 값으로 둡니다. 기능별 필요값은 [아래 표](#기능별-설정)와 전체 환경 예제를 참고하세요.

### 2. DB와 Redis 시작

```bash
docker compose up -d --wait
alembic upgrade head
```

[docker-compose.yml](docker-compose.yml)은 **PostgreSQL과 Redis만** 실행합니다. API는 별도로 시작해야 합니다. 기존 다른 서비스가 5432/6379 포트를 사용 중이면 그 서비스를 임의로 종료하지 말고 Compose 포트와 `.env`를 함께 조정하세요.

DB는 named volume에 유지됩니다. `docker compose down -v`는 DB 데이터를 지우므로 일반 종료 명령으로 사용하지 마세요. 개발 Compose의 공개 포트 설정은 신뢰할 수 있는 로컬 개발 환경에서만 사용합니다.

### 3. API 시작 및 확인

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- `http://127.0.0.1:8000/health`: 서버 상태 응답
- `http://127.0.0.1:8000/docs`: 로컬 API 문서
- `http://127.0.0.1:8000/redoc`: 로컬 API 참조

위 응답만으로 SMTP·영화 API·스토리지까지 정상이라고 판단하지 않습니다. 실제 기능 호출은 각 서비스 설정이 필요합니다. Wi-Fi 실제 기기에서 접근하려면 신뢰할 수 있는 개발 네트워크에서 `--host 0.0.0.0`과 방화벽 설정을 사용하고, [기기별 API 주소](../frontend/README.md#기기별-api-주소)를 맞추세요.

## 기능별 설정

| 사용하려는 기능 | 설정 | 조건과 제한 |
| --- | --- | --- |
| 계정·감상 기록·컬렉션·통계 | PostgreSQL, Redis, `JWT_SECRET_KEY` | Redis는 캐시뿐 아니라 인증 링크·요청 제한에도 사용 |
| 작품 검색·외부 메타데이터 등록 | `TMDB_API_KEY`, `KOBIS_API_KEY`, `KMDB_API_KEY` | 사용할 공급자의 실제 키 필요. 해당 공급자 조회 실패 시 외부 작품 등록 거부 |
| 이메일 인증·비밀번호 복구 | `EMAIL_LOG_ONLY=False`, SMTP host/port/자격, 발신자, TLS/SSL | log-only는 발송하지 않으며 인증 URL도 로그에 출력하지 않음 |
| Google / Kakao 로그인 | 제공자별 client ID/secret, 공개 callback URL | 모바일·웹 redirect 등록과 앱 복귀 흐름을 별도로 확인 |
| 프로필·기록 이미지 | `GCP_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS` | 비공개 GCS, 객체 권한·Signed URL·프로젝트 결제 정상 상태 필요 |
| 전체 웹 앱 | `OAUTH_WEB_CLIENT_ENABLED=True`, 프런트 전체 웹 플래그 | 기본은 모바일 OAuth 브릿지 전용. origin도 일치해야 함 |

외부 키는 제공자에서 발급받습니다: [TMDB](https://developer.themoviedb.org/docs/getting-started), [KOBIS](https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do), [KMDB](https://www.kmdb.or.kr/info/api/apiDetail/6).

회원가입은 현재 기기에 토큰을 발급하지만, 이후 이메일 재로그인과 비밀번호 변경에는 이메일 인증이 필요합니다. **메일 없는 log-only 모드는 전체 인증 흐름을 체험하는 방법이 아닙니다.** 실제 계정 DB를 직접 수정해 인증을 우회하지 마세요.

API 키·OAuth secret·GCS 키 파일·실제 `.env`는 Git이나 이슈에 올리지 않습니다. 클라이언트의 `EXPO_PUBLIC_` 변수에도 넣지 않습니다.

## 테스트

### 단위 회귀

개발 환경 설정 후 `backend/`에서:

```bash
python -m pytest tests -q
```

실제 DB 통합 테스트는 기본적으로 opt-in이며 건너뜁니다. 단위 테스트 통과는 외부 제공자·SMTP·GCS의 실제 동작을 보증하지 않습니다.

### 격리 PostgreSQL·Redis 통합 테스트

기존 개발 DB나 운영 DB를 사용하지 않습니다. 테스트가 허용하는 주소는 loopback PostgreSQL **15439 / cineentry_audit**, Redis **16389 / 0**으로 제한됩니다. 아래 테스트 전용 컨테이너가 이미 있다면 소유권·포트를 확인하고 새로 실행하거나 삭제하지 마세요.

```bash
docker run -d --name cineentry-readme-test-postgres -p 127.0.0.1:15439:5432 -e POSTGRES_USER=cineentry_audit -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=cineentry_audit postgres:15-alpine
docker run -d --name cineentry-readme-test-redis -p 127.0.0.1:16389:6379 redis:7-alpine
```

아래 환경변수는 **테스트용 Bash 터미널에서만** 설정합니다. Windows에서는 Git Bash를 사용하세요. 기존 환경을 덮어쓰지 않도록 새 터미널을 사용하고 끝나면 닫으세요. 일부 PowerShell 버전은 빈 환경변수를 제거하므로, 이 테스트의 GCS 빈 값 설정에는 그대로 대체해서 사용하지 않습니다.

```bash
# macOS / Linux / Git Bash
export DATABASE_URL='postgresql://cineentry_audit:local-test-only@127.0.0.1:15439/cineentry_audit'
export REDIS_URL='redis://127.0.0.1:16389/0'
export JWT_SECRET_KEY='local-integration-test-key-not-for-production'
export DEBUG=True EMAIL_LOG_ONLY=True CINEENTRY_INTEGRATION_TESTS=1
export GCP_BUCKET_NAME='' GOOGLE_APPLICATION_CREDENTIALS=''
```

`docker exec cineentry-readme-test-postgres pg_isready -U cineentry_audit -d cineentry_audit`가 연결 가능 상태인지 확인한 후 실행합니다.

```bash
alembic upgrade head
python -m pytest tests/test_backend_integration.py -q
python -m pytest tests/test_media_cleanup.py -k postgres -q
```

통합 테스트는 다른 테스트와 **별도 프로세스**로 실행합니다. 실제 PostgreSQL/Redis를 사용하지만 이메일 전달·외부 공급자·GCS 호출은 대체합니다. 테스트가 생성한 데이터를 정리하더라도 이 환경은 반드시 폐기 가능한 테스트 전용이어야 합니다. 자세한 안전장치는 [통합 테스트](tests/test_backend_integration.py)에 있습니다.

## 문제 해결

| 증상 | 확인 및 조치 |
| --- | --- |
| DB 로그인 오류 | Compose의 사용자·비밀번호·DB 이름과 `DATABASE_URL` 일치 확인. 기존 volume의 자격은 env 변경만으로 바뀌지 않음 |
| 인증·요청 제한에서 Redis 오류 | Redis 실행 상태와 URL/포트 확인 |
| 메일이 오지 않음 | `EMAIL_LOG_ONLY`, SMTP TLS/자격·발신자 확인. log-only는 성공 응답이어도 발송하지 않음 |
| 검색은 되지만 작품 등록 실패 | 선택한 공급자의 상세 조회와 키 상태 확인. 실패 시 임의 정보를 대신 저장하지 않음 |
| 외부 작품 정보 수정이 409 | 공용 출처 정보는 읽기 전용. 개인 감상 필드만 수정 |
| 이미지 삭제가 503 | 스토리지 권한·결제·접근을 복구한 뒤 재시도. DB 참조를 먼저 삭제하지 않음 |
| 운영 모드에서 시작 거부 | JWT 키·HTTPS 공개 URL·SMTP/TLS 설정 검사 결과 확인 |

## 운영 전 확인

운영 이전은 현재 보류 중입니다. [운영 환경 예제](.env.production.example), [운영 Compose](../docker-compose.prod.yml), [배포 워크플로](../.github/workflows/backend-deploy.yml)는 기존 GCP/GCS 구성 기준이며, 새 클라우드 배포가 완료된 구성이 아닙니다.

- `DEBUG=False`, `EMAIL_LOG_ONLY=False`; 예제값이 아닌 32바이트 이상 JWT 키와 HTTPS URL·실제 SMTP 필요.
- OAuth 트랜잭션은 프로세스 메모리이므로 **worker/replica 1개** 유지. 재시작하면 진행 중 인증을 다시 시작해야 할 수 있습니다.
- 서버와 앱의 OAuth proof 계약을 함께 배포해야 합니다.
- 개인 이미지 삭제는 사용자 소유권과 남은 참조를 확인합니다. DB와 GCS는 원자적으로 커밋되지 않으며, 부분 실패 후 이미 지운 객체는 DB rollback으로 복구되지 않습니다.
- SSH 배포는 신뢰할 수 있는 콘솔에서 확인한 `GCP_HOST_FINGERPRINT`가 필요합니다. 지문 검증을 끄지 마세요.
- 운영 DB 백업, 마이그레이션, 실제 이메일/OAuth/이미지 시나리오를 별도로 검증해야 합니다.

## 코드 위치

```text
app/api/v1/       인증·사용자·작품·컬렉션·태그·통계·미디어 API
app/models/       데이터 모델
app/schemas/      요청/응답 검증
app/services/     외부 공급자·인증·저장소·정리 로직
alembic/          DB 마이그레이션
tests/            단위 및 opt-in 통합 테스트
```

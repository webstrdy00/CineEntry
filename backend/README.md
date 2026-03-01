# CineEntry Backend API

FastAPI 기반의 영화 기록 앱 백엔드 API

## 아키텍처

**Hybrid Architecture: Supabase Auth + Independent PostgreSQL**

```
[Mobile App (React Native/Expo)]
         ↓
Supabase Auth SDK
  - 이메일 로그인
  - 구글 로그인
  - 애플 로그인
  - 카카오 로그인
         ↓
    JWT Token 발급 (Supabase)
         ↓
[FastAPI Backend]
  - Supabase JWT 검증 (JWKS 기반)
  - 영화 CRUD (100% FastAPI 통제)
  - 통계/분석
  - 외부 API 프록시 (KOBIS/TMDb/KMDb)
         ↓
Independent PostgreSQL (Docker/RDS/Neon)
  - 8개 테이블
  - FastAPI 100% 통제
         ↓
S3 or Supabase Storage (이미지)
```

## 기술 스택

- **Framework**: FastAPI 0.104.1
- **Database**: PostgreSQL 15 (독립 데이터베이스)
- **ORM**: SQLAlchemy 2.0
- **Migration**: Alembic 1.12
- **Authentication**: Supabase JWT (JWKS 검증)
- **Caching**: Redis 7
- **Python**: 3.10+

## 프로젝트 구조

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI 앱 진입점
│   ├── config.py                # 환경 변수 설정
│   ├── database.py              # DB 연결
│   │
│   ├── models/                  # SQLAlchemy 모델 (8개 테이블)
│   │   ├── user.py
│   │   ├── movie.py
│   │   ├── user_movie.py
│   │   ├── user_image.py
│   │   ├── tag.py
│   │   ├── movie_tag.py
│   │   ├── collection.py
│   │   └── collection_movie.py
│   │
│   ├── schemas/                 # Pydantic 스키마 (TODO)
│   │
│   ├── api/v1/                  # API 라우터
│   │   ├── movies.py
│   │   ├── collections.py
│   │   └── stats.py
│   │
│   ├── services/                # 비즈니스 로직 (TODO)
│   │
│   └── middleware/              # 미들웨어
│       └── auth_middleware.py  # JWT 검증
│
├── alembic/                     # DB 마이그레이션
│   ├── versions/
│   └── env.py
│
├── requirements.txt
├── alembic.ini
├── docker-compose.yml
└── .env.example
```

## 데이터베이스 스키마

**8개 테이블:**

1. **users** - 사용자 정보 (Supabase Auth와 연동)
2. **movies** - 영화 메타데이터 (KOBIS/TMDb/KMDb)
3. **user_movies** - 사용자별 영화 기록
4. **user_images** - 티켓/포토카드 이미지
5. **tags** - 태그 (사전 정의 + 사용자 정의)
6. **movie_tags** - 영화-태그 연결
7. **collections** - 컬렉션 (수동/자동)
8. **collection_movies** - 컬렉션-영화 연결

자세한 스키마는 `/docs/DATABASE_SCHEMA.md` 참조

## 설치 및 실행

### 1. 환경 변수 설정

```bash
cd backend
cp .env.example .env
# .env 파일을 열어서 필요한 값 설정
```

**.env 필수 항목:**

```env
DATABASE_URL=postgresql://cineentry_user:cineentry_password@localhost:5432/cineentry_db
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWKS_URL=https://your-project.supabase.co/.well-known/jwks.json
```

### 2. Docker 컨테이너 실행

```bash
# PostgreSQL + Redis 실행
docker-compose up -d

# 상태 확인
docker ps | grep cineentry

# PostgreSQL 연결 테스트
docker exec cineentry-postgres psql -U cineentry_user -d cineentry_db -c "\dt"
```

### 3. Python 가상환경 및 패키지 설치

```bash
# 가상환경 생성
python3 -m venv venv

# 가상환경 활성화
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# 패키지 설치
pip install -r requirements.txt
```

### 4. 데이터베이스 마이그레이션

```bash
# Alembic 초기 마이그레이션 생성
alembic revision --autogenerate -m "initial_schema"

# 마이그레이션 적용
alembic upgrade head

# 테이블 생성 확인
docker exec cineentry-postgres psql -U cineentry_user -d cineentry_db -c "\dt"
```

### 5. FastAPI 서버 실행

```bash
# 개발 서버 실행 (hot reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 또는 production 모드
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 6. Supabase Auth 설정 (선택 - 실제 인증 테스트 시)

#### Supabase 프로젝트 생성

1. https://supabase.com 접속 및 로그인
2. "New Project" 클릭
3. 프로젝트 이름: `cineentry` 입력
4. Database Password 설정 (저장 필수)
5. Region 선택: `Northeast Asia (Seoul)`
6. "Create new project" 클릭

#### Authentication Providers 설정

**Settings → Authentication → Providers에서 활성화:**

1. **Email** (기본 활성화)
   - Email confirmation: 개발 중에는 비활성화 가능
   - Secure email change: 활성화 권장

2. **Google**
   - Google Cloud Console에서 OAuth 2.0 Client ID 발급
   - Authorized redirect URIs: `https://[YOUR-PROJECT].supabase.co/auth/v1/callback`
   - Client ID와 Client Secret을 Supabase에 입력

3. **Apple**
   - Apple Developer에서 Sign in with Apple 설정
   - Service ID 생성
   - Key 생성 및 다운로드
   - Supabase에 Service ID, Team ID, Key ID, Private Key 입력

4. **Kakao**
   - Kakao Developers에서 애플리케이션 생성
   - REST API 키 발급
   - Redirect URI 설정: `https://[YOUR-PROJECT].supabase.co/auth/v1/callback`
   - Supabase에 Client ID와 Client Secret 입력

#### API Keys 복사

**Settings → API → Project API keys:**

```bash
# .env 파일에 추가
SUPABASE_URL=https://[YOUR-PROJECT].supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # anon/public key
SUPABASE_JWKS_URL=https://[YOUR-PROJECT].supabase.co/.well-known/jwks.json
```

#### 인증 플로우 테스트

```bash
# 프론트엔드에서 Supabase Auth SDK 사용
# 1. 사용자 로그인 (Email/Google/Apple/Kakao)
# 2. JWT Token 발급 (Supabase)
# 3. Token을 Authorization Header에 포함하여 API 호출
# 4. FastAPI가 JWKS로 Token 검증
# 5. user_id 추출 후 PostgreSQL 쿼리
```

### 7. API 문서 확인

서버 실행 후 브라우저에서:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## API 엔드포인트

### 인증

모든 API는 JWT Bearer Token 인증 필요:

```
Authorization: Bearer <supabase_jwt_token>
```

### Movies

- `GET /api/v1/movies` - 사용자 영화 목록
- `GET /api/v1/movies/{movie_id}` - 영화 상세
- `POST /api/v1/movies` - 영화 추가
- `PUT /api/v1/movies/{movie_id}` - 영화 수정
- `DELETE /api/v1/movies/{movie_id}` - 영화 삭제
- `GET /api/v1/movies/search?q=` - 영화 검색 (외부 API)

### Collections

- `GET /api/v1/collections` - 컬렉션 목록
- `GET /api/v1/collections/{id}` - 컬렉션 상세
- `POST /api/v1/collections` - 컬렉션 생성
- `PUT /api/v1/collections/{id}` - 컬렉션 수정
- `DELETE /api/v1/collections/{id}` - 컬렉션 삭제
- `POST /api/v1/collections/{id}/movies/{movie_id}` - 영화 추가
- `DELETE /api/v1/collections/{id}/movies/{movie_id}` - 영화 제거

### Stats

- `GET /api/v1/stats` - 전체 통계
- `GET /api/v1/stats/monthly` - 월별 관람 추이
- `GET /api/v1/stats/genres` - 장르 통계
- `GET /api/v1/stats/tags` - 태그 통계
- `GET /api/v1/stats/best-movies` - 인생 영화 목록

## 개발 가이드

### 코드 스타일

```bash
# Black 포맷팅
black app/

# Flake8 린팅
flake8 app/
```

### 테스트

```bash
# 전체 테스트 실행
pytest

# 커버리지 포함
pytest --cov=app tests/
```

### 새로운 API 엔드포인트 추가

1. `app/api/v1/` 에 새 파일 생성
2. `app/main.py` 에 라우터 등록
3. Pydantic 스키마 작성 (`app/schemas/`)
4. 비즈니스 로직 분리 (`app/services/`)

### 데이터베이스 마이그레이션

```bash
# 모델 변경 후 마이그레이션 생성
alembic revision --autogenerate -m "description"

# 마이그레이션 적용
alembic upgrade head

# 롤백
alembic downgrade -1
```

## Docker 관리

```bash
# 컨테이너 시작
docker-compose up -d

# 컨테이너 중지
docker-compose down

# 로그 확인
docker-compose logs -f postgres
docker-compose logs -f redis

# 볼륨 포함 완전 삭제
docker-compose down -v
```

## 환경별 설정

### 개발 환경

- Database: Docker PostgreSQL (localhost:5432)
- Redis: Docker Redis (localhost:6379)
- Debug mode: True
- CORS: 모든 origin 허용

### 운영 환경

- Database: AWS RDS / Neon / Railway
- Redis: AWS ElastiCache / Redis Cloud
- Debug mode: False
- CORS: 프론트엔드 도메인만 허용
- HTTPS 필수
- Workers: 4+ (CPU 코어 수에 따라)

## 주의사항

### 중요 사항

1. **Supabase는 Auth만 사용** - 데이터베이스는 독립 PostgreSQL 사용
2. **JWT 검증은 JWKS 방식** - Supabase 공개 키로 검증
3. **모든 데이터는 FastAPI가 100% 통제** - Supabase Row Level Security 미사용
4. **.env 파일은 절대 커밋하지 않기** - 이미 .gitignore에 추가됨

### 보안

- JWT 토큰 만료 시간 검증
- SQL Injection 방지 (SQLAlchemy ORM 사용)
- CORS 운영 환경에서 제한
- API Rate Limiting 추가 고려

## 외부 API 통합 (TODO)

- **KOBIS**: 한국 영화 정보
- **TMDb**: 국제 영화 정보
- **KMDb**: 한국 영화 데이터베이스

Redis 캐싱으로 API 요청 최소화 (24시간)

## 다음 단계

### Phase 2

- [ ] Pydantic 스키마 작성
- [ ] 비즈니스 로직 서비스 레이어 분리
- [ ] 외부 API 통합 (KOBIS/TMDb/KMDb)
- [ ] Redis 캐싱 구현
- [ ] 이미지 업로드 (S3 presigned URL)
- [ ] 테스트 코드 작성

### Phase 3

- [ ] API Rate Limiting
- [ ] Logging 구조화
- [ ] Error Handling 개선
- [ ] CI/CD 파이프라인
- [ ] 운영 환경 배포

## 문제 해결

### PostgreSQL 연결 실패

```bash
# 컨테이너 상태 확인
docker ps -a | grep cineentry-postgres

# 로그 확인
docker logs cineentry-postgres

# 재시작
docker-compose restart postgres
```

### Alembic 마이그레이션 실패

```bash
# 현재 마이그레이션 상태 확인
alembic current

# 마이그레이션 히스토리
alembic history

# 특정 버전으로 롤백
alembic downgrade <revision>
```

### JWT 검증 실패

- Supabase URL 확인
- JWKS URL 확인
- 토큰 만료 시간 확인

## 라이선스

MIT

## 기여

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

**Contact**: CineEntry Team
**Documentation**: `/docs/`

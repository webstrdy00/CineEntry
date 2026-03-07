# CineEntry Backend

백엔드는 CineEntry의 기록 경험을 안정적으로 쌓아주는 데이터와 기능의 중심입니다. 사용자의 영화 라이브러리, 컬렉션, 통계, 프로필 정보를 앱과 연결해 주는 역할을 맡습니다.

## 백엔드가 맡는 일

- 사용자 계정과 프로필 정보를 관리합니다.
- 영화 검색 결과와 메타데이터를 정리해 앱에 전달합니다.
- 보고 싶은 영화, 보는 중인 영화, 본 영화를 기록 가능한 형태로 저장합니다.
- 컬렉션과 태그를 통해 영화 기록을 다시 묶고 확장할 수 있게 합니다.
- 통계, 연속 기록, 관람 캘린더 같은 회고용 데이터를 계산해 제공합니다.
- 프로필 이미지와 사용자 이미지를 앱에서 사용할 수 있도록 관리합니다.

## 제품 관점의 데이터 흐름

```text
외부 영화 정보
KOBIS / TMDb / KMDb
        |
        v
영화 검색과 메타데이터 정리
        |
        v
사용자 기록 저장
- 상태
- 별점
- 감상
- 태그
- 컬렉션
        |
        v
통계 / 홈 요약 / 프로필 / 캘린더 화면에 재사용
```

## 기술 구성

- FastAPI
- PostgreSQL
- Redis
- SQLAlchemy / Alembic
- Google Cloud Storage

## 도메인 구성

### 사용자와 프로필

- 기본 프로필 정보
- 프로필 이미지
- 앱 내 계정 상태와 연결 로그인 수단

### 영화 기록

- 영화 검색
- 영화 상세 메타데이터
- 상태별 보관
- 별점과 감상 기록

### 컬렉션과 태그

- 수동 컬렉션
- 자동 정리 성격의 컬렉션 동기화
- 사용자 태그와 인기 태그 흐름

### 통계

- 연간 목표
- 월별 관람 수
- 장르별 분포
- 자주 사용하는 태그
- 연속 기록과 관람 캘린더

## 프로젝트 구조

```text
backend/
├── app/
│   ├── api/v1/        # 앱에서 사용하는 API
│   ├── models/        # 도메인 모델
│   ├── schemas/       # 요청/응답 구조
│   ├── services/      # 영화 검색, 기록 처리, 통계 계산, 미디어 처리
│   ├── config.py
│   ├── database.py
│   └── main.py
├── alembic/
├── tests/
├── docker-compose.yml
└── .env.example
```

## 로컬 개발

### 준비

```bash
cd backend
cp .env.example .env
docker-compose up -d
```

### 실행

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

실행 후 확인:

- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`
- `http://localhost:8000/health`

## 참고 문서

- 프로젝트 개요: [../README.md](../README.md)
- 프론트엔드 가이드: [../frontend/README.md](../frontend/README.md)

<h1 align="center">CineEntry</h1>
<p align="center">영화를 보고 끝내지 않고, 취향으로 남기는 기록 앱</p>

CineEntry는 보고 싶은 영화부터 이미 본 영화까지, 감상과 별점, 태그와 컬렉션, 통계와 회고를 하나의 흐름으로 이어주는 개인 영화 기록 프로젝트입니다. 처음에는 영화 다이어리처럼 쓰고, 기록이 쌓인 뒤에는 취향 아카이브처럼 다시 들여다볼 수 있도록 설계했습니다.

## What It Feels Like

단순히 영화를 저장하는 앱이 아니라, "내가 어떤 영화를 좋아하는 사람인지"가 시간이 갈수록 더 선명해지는 경험을 만드는 것이 목표입니다.

## Core Loop

`검색` -> `기록` -> `정리` -> `회고`

- 검색에서 영화를 찾고
- 별점과 짧은 감상을 남기고
- 태그와 컬렉션으로 취향을 묶고
- 통계와 기록 흐름으로 다시 돌아봅니다

## Highlights

| 기능 | 설명 |
| --- | --- |
| 상태 기반 기록 | 보고 싶은 영화, 보는 중인 영화, 본 영화를 자연스럽게 이어서 관리합니다. |
| 감상 아카이브 | 별점과 짧은 감상으로 그때의 감정을 빠르게 남깁니다. |
| 취향 정리 | 태그와 컬렉션으로 영화를 주제별로 다시 엮어볼 수 있습니다. |
| 회고 화면 | 통계와 연속 기록으로 관람 습관과 취향 흐름을 돌아봅니다. |

## App Surfaces

### Home

지금 보고 있는 영화, 보고 싶은 영화, 연간 목표와 최근 흐름을 가장 먼저 보여주는 시작 화면입니다.

### Movies

내 영화 라이브러리를 상태별로 정리하고, 검색과 필터로 원하는 기록을 빠르게 탐색하는 화면입니다.

### Stats

월별 관람 추이, 장르 분포, 자주 쓰는 태그를 통해 기록이 취향으로 보이기 시작하는 화면입니다.

### Profile

프로필과 기록 습관을 함께 확인하고 앱 정보와 기본 설정으로 이어지는 화면입니다.

## For Who

- 영화를 보고 난 뒤 짧게라도 기록을 남기고 싶은 사람
- 취향을 태그와 컬렉션으로 정리하는 걸 좋아하는 사람
- 기록이 쌓였을 때 숫자와 흐름으로 다시 돌아보고 싶은 사람

## Repository

- `frontend/`: Expo 기반 클라이언트 앱
- `backend/`: FastAPI 기반 API 서버

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
docker-compose up -d
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

## Stack

- Frontend: React Native, Expo, TypeScript
- Backend: FastAPI, SQLAlchemy, Alembic
- Data: PostgreSQL, Redis
- Media: Google Cloud Storage

## Read More

- App guide: [frontend/README.md](frontend/README.md)
- Backend guide: [backend/README.md](backend/README.md)

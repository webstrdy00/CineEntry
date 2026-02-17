# Filmory

- frontend : RN/Expo
- backend : FastApi
- DB : PostgreSQL, Supabase

```tsx
[모바일 앱 (React Native)]
         ↓
   Supabase Auth SDK (로그인)
         ↓
    JWT Token 발급
         ↓
[FastAPI 백엔드]
    - JWT 검증 (JWKS)
    - 영화 CRUD
    - 통계/분석
    - 외부 API (KOBIS/TMDb/KMDb)
         ↓
   PostgreSQL (데이터)
         ↓
Supabase Storage or S3 (이미지)
```

```tsx
[모바일앱(RN)]
   └─ Supabase Auth SDK (이메일/구글/카카오)
        └─ (JWT 수신: RS256)

[FastAPI Backend]
   ├─ Supabase JWKS로 JWT 검증 미들웨어
   ├─ Domain APIs (영화/기록/컬렉션/통계)
   ├─ 외부 API 프록시(KOBIS/TMDb/KMDb) + 캐싱
   ├─ 미디어 업로드: S3 프리사인드 URL
   └─ DB 액세스: PostgreSQL

[Data]
   ├─ PostgreSQL (Docker 로컬 → 운영 RDS)
   └─ AWS S3 (포스터 캐시/티켓/포토카드)
```

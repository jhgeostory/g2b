# G2B 발주 모니터링 시스템

나라장터(G2B)의 국토지리정보원(1613436) 신규 발주 공고를 자동으로 수집하고, 웹 대시보드로 보여주는 프로젝트입니다.

## 기능
- **자동 수집**: GitHub Actions가 매시간 자동으로 G2B를 크롤링합니다.
- **데이터 저장**: Supabase 데이터베이스에 공고 내역을 저장합니다.
- **이메일 알림**: 신규 공고 발견 시 이메일로 즉시 알림을 보냅니다.
- **웹 대시보드**: 수집된 공고 내역을 깔끔한 UI로 확인할 수 있습니다.

## 설정 방법

### 1. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 정보를 입력하세요 (참고: `env.sample`):
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
DISCORD_WEBHOOK_URL=your_discord_webhook_url
```

### 2. Supabase 테이블 생성
Supabase SQL Editor에서 다음 쿼리를 실행하여 테이블을 생성하세요:

```sql
create table announcements (
  id text primary key,
  title text not null,
  link text,
  date text,
  agency text,
  status text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  is_sent boolean default false
);
```

### 3. 설치 및 실행
```bash
npm install
npm run dev
```

### 4. 배포
- **Frontend**: 이 레포지토리를 [Vercel](https://vercel.com)에 연동하여 배포하세요. 환경변수(`SUPABASE_URL`, `SUPABASE_KEY`)를 Vercel 설정에 추가해야 합니다.
- **Backend (Scraper)**: GitHub Actions가 `.github/workflows/scrape.yml`에 의해 자동으로 실행됩니다. GitHub Repository Settings > Secrets and variables > Actions에 다음 Secrets를 등록하세요:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `DISCORD_WEBHOOK_URL`

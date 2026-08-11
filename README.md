# Nudema Mongolia

몽골 화장품 브랜드 **Nudema**의 쇼핑몰 + 관리자 페이지 프로토타입.

[Claude Design](https://claude.ai/design)의 `.dc.html` 형식으로 작성되었으며,
모든 페이지가 `nudema-store.js`를 통해 같은 데이터를 사용합니다.
Cloudflare 배포에서는 Pages Functions + D1이 기기 간 공유 저장소이며,
`localStorage`는 빠른 로딩과 로컬 미리보기를 위한 캐시/폴백으로 사용됩니다.

## 페이지

| 파일 | 설명 |
|---|---|
| `index.html` | 정적 폴백·OAuth 설명 페이지. 운영 루트는 `functions/index.js`가 주소를 유지한 채 PC/모바일 홈을 내부 제공 |
| `menu.html` | 전체 페이지 목록 (개발·시연용) |
| `Nudema Mongolia.dc.html` | PC 홈 |
| `Nudema Mobile.dc.html` | 모바일 홈 (390px) |
| `Nudema Product.dc.html` | 상품 상세 (`?id=1`) |
| `Nudema Checkout.dc.html` | 결제 |
| `Nudema Admin.dc.html` | 관리자 (PC) |
| `Nudema Admin Mobile.dc.html` | 관리자 (모바일) |

운영 환경에서는 아래의 짧은 공개 URL을 사용합니다. 기존 `.dc` 및
`.dc.html` 주소는 호환성을 위해 대응하는 짧은 URL로 영구 이동합니다.

| 공개 URL | 페이지 |
|---|---|
| `/` | 기기에 맞는 쇼핑몰 홈 |
| `/admin` | 기기에 맞는 관리자 |
| `/login`, `/signup`, `/account` | 고객 인증·계정 |
| `/search`, `/product?id=1` | 검색·상품 상세 |
| `/cart`, `/checkout` | 장바구니·결제 |
| `/privacy`, `/terms` | 개인정보 처리방침·이용약관 |

`/`와 `/admin`은 서버에서 기기를 감지해 같은 URL을 유지한 채 PC 또는
모바일 화면을 제공합니다. 기존 긴 PC 주소로 직접 들어온 모바일 사용자는
`device-redirect.js`가 각각 `/?v=mobile` 또는 `/admin?v=mobile`로 정리합니다.
`?v=pc`를 붙이면 PC 화면을 강제로 확인할 수 있습니다.

## 관리자 기능

- **대시보드** — 매출·주문·회원·평균주문액, 최근 7일 차트, 인기상품 (모두 주문 데이터에서 계산)
- **주문** — 상태 필터, 검색, 상세 모달, 상태 변경
- **상품** — 등록·편집·삭제, 이미지 갤러리(최대 8), 상세 블록 에디터(텍스트/구분선/이미지/영상/조합형)
- **회원** — 주문에서 집계, 지출 기준 등급
- **사용자 계정** — D1 회원가입·로그인, PBKDF2 비밀번호 해시, HttpOnly 세션, 내 주문·포인트 조회
- **리뷰** — 숨김·답변·삭제, 필터
- **콘텐츠** — 상단 마퀴, 히어로 슬라이드(추가/삭제/이미지 업로드), 브랜드 영상
- **통계** — 월별 매출, 카테고리 비중
- **설정** — 상점 정보, 무통장입금 계좌, 카테고리/태그, 관리자 계정

### 모바일 관리자 (`Nudema Admin Mobile.dc.html`)

하단 탭 5개(대시보드 · 주문 · 상품 · 콘텐츠 · 설정)로 구성된 앱 형태이며,
PC 관리자와 같은 `nudema-store.js` · `/api/admin-auth` · D1을 그대로 씁니다.
앱바의 `‹` 버튼이 화면·상세 시트 이동 기록을 되돌립니다.

PC 전용 화면은 아직 옮기지 않았습니다 — **회원, 리뷰, 통계**, 그리고
멤버십 배너 편집은 PC 관리자에서만 가능합니다.

## 로컬 실행

```bash
node serve.js
# http://localhost:4321/
```

`.dc.html`은 `support.js`(DC 런타임)가 있어야 렌더링됩니다.
런타임이 React·Babel을 CDN에서 불러오므로 **인터넷 연결이 필요**합니다.

Cloudflare Pages + D1 배포 방법은 [`CLOUDFLARE.md`](./CLOUDFLARE.md)를 참고하세요.

## 개발용 스크립트

```bash
node .smoke-test.js      # 353개 동작 검증
node .check-bindings.js  # 템플릿 바인딩 누락 검사
```

## 데이터 구조

`nudema-store.js`가 localStorage에 저장하는 키:

| 키 | 내용 |
|---|---|
| `nudema_products` | 상품 카탈로그 |
| `nudema_orders` | 주문 (시드 46건) |
| `nudema_reviews` | 리뷰 |
| `nudema_content` | 마퀴·히어로 슬라이드·브랜드 영상 |
| `nudema_settings` | 상점 정보·계좌·배송비 |
| `nudema_taxonomy` | 카테고리·태그 |
| `nudema_admin` | 관리자 계정 |

## ⚠️ 알아두실 점

- **관리자 로그인은 실제 보안이 아닙니다.** 비밀번호가 브라우저에 평문 저장되고 검증도 클라이언트에서만 이뤄집니다. 개발자도구로 우회 가능합니다. 실제 운영에는 서버 측 인증이 필요합니다.
- 일반 정적 서버(`node serve.js`)에서는 데이터가 `localStorage`에만 저장됩니다. Cloudflare 운영 배포에는 `DB` 이름의 D1 바인딩과 migrations 적용이 필요합니다.
- 주문·회원·리뷰의 시드 데이터는 **데모용 가상 데이터**입니다.
- `support.js`, `image-slot.js`는 Claude Design이 생성한 런타임 파일입니다 (직접 수정하지 마세요).

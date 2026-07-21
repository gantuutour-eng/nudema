# Nudema Mongolia

몽골 화장품 브랜드 **Nudema**의 쇼핑몰 + 관리자 페이지 프로토타입.

[Claude Design](https://claude.ai/design)의 `.dc.html` 형식으로 작성되었으며,
모든 페이지가 `nudema-store.js`를 통해 같은 데이터를 사용합니다.
Cloudflare 배포에서는 Pages Functions + D1이 기기 간 공유 저장소이며,
`localStorage`는 빠른 로딩과 로컬 미리보기를 위한 캐시/폴백으로 사용됩니다.

## 페이지

| 파일 | 설명 |
|---|---|
| `index.html` | 루트 → PC 홈으로 이동 |
| `menu.html` | 전체 페이지 목록 (개발·시연용) |
| `Nudema Mongolia.dc.html` | PC 홈 |
| `Nudema Mobile.dc.html` | 모바일 홈 (390px) |
| `Nudema Product.dc.html` | 상품 상세 (`?id=1`) |
| `Nudema Checkout.dc.html` | 결제 |
| `Nudema Admin.dc.html` | 관리자 |

## 관리자 기능

- **대시보드** — 매출·주문·회원·평균주문액, 최근 7일 차트, 인기상품 (모두 주문 데이터에서 계산)
- **주문** — 상태 필터, 검색, 상세 모달, 상태 변경
- **상품** — 등록·편집·삭제, 이미지 갤러리(최대 8), 상세 블록 에디터(텍스트/구분선/이미지/영상/조합형)
- **회원** — 주문에서 집계, 지출 기준 등급
- **리뷰** — 숨김·답변·삭제, 필터
- **콘텐츠** — 상단 마퀴, 히어로 슬라이드(추가/삭제/이미지 업로드), 브랜드 영상
- **통계** — 월별 매출, 카테고리 비중
- **설정** — 상점 정보, 무통장입금 계좌, 카테고리/태그, 관리자 계정

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
node .smoke-test.js      # 324개 동작 검증
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

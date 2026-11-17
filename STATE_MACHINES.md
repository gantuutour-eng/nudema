# Nudema 상태 전환 감사 · 2026-11-17

저장소가 소유한 고객 화면, PC·모바일 관리자, 브라우저 공통 스크립트,
Cloudflare Functions, DB 관계에서 논리적 상태 머신 **50개**를 식별했다.
불리언 조합, DOM 표시, URL, 타이머, 요청 순서와 외래키도 포함한다.
생성된 DC 런타임·외부 라이브러리·Google·브라우저 내부는 제외했다.
정적 검토 목록이며 모든 런타임 경로를 증명한 것은 아니다.

**50개 상태 머신이 50개 버그라는 뜻은 아니다.** 버그·위험 후보 35개의 점수와
처리 결정은 [BUG_TRIAGE.md](BUG_TRIAGE.md), 기계 판독용 평가는
[docs/bug-triage.json](docs/bug-triage.json)에 있다.
발생 빈도는 실측 운영 통계가 아닌 추정치다.

## 현재 작업 기준

발생 빈도와 심각도를 각각 1–10점으로 평가하고 곱이 **5 미만이면 코드 변경 없이 이슈로만** 남긴다.
5 이상이어도 실제 요청/재현이 없는 드문 상황이나 정해지지 않은 영업 정책을 위한 설계를 추가하지 않는다.
기존 일상 흐름에서 발생하는 오류에 필요한 최소 수정만 PR #9에 유지한다.

| 유지한 수정 | 사용자 경험 | 개발·에이전트 확인 |
|---|---|---|
| 관리자 저장 요청 순서와 실패 보존 | 연속 저장 순서 역전, 실패 뒤 폴링 덮어쓰기 방지 | 기존 write 호출과 저장 이벤트 유지 |
| 서버 전송/실패/완료 표시와 재저장 | 로컬 캐시 성공을 서버 저장 완료로 오인하지 않음 | 표시 요소의 data-state·aria-busy 확인 |
| 진행 중 저장의 이탈 확인 | 전송/재저장 필요 상태를 알림 | 브라우저 기본 이탈 확인 사용 |
| 주소 검색·관리자 재조회 최신 응답만 반영 | 이전 결과·오류가 현재 결과를 덮지 않음 | 해당 요소의 검색/목록 상태와 보이는 결과 확인 |
| 주문 상태 저장 시 UPSERT | 정상 상태 수정으로 회원 주문 연결이 사라지지 않음 | SQLite 외래키 테스트 |
| 취소 표기 호환·한 주문의 합산 수량 검사 | 취소 합계 오류와 여러 옵션의 재고 초과 방지 | 기존 주문·장바구니 입력 계약 유지 |

## 유지한 코드의 계약

- `NudemaStore.write(name, value)`는 이전처럼 **로컬 캐시 저장 성공**을 boolean으로 반환한다.
  원격 완료 여부는 관리자 공통 저장 표시가 전달한다.
- 기존 `catalog.saveAsync()`는 카테고리와 연결 상품을 서버 확인 후 반영한다.
- 관리자 쓰기는 같은 탭의 한 FIFO를 사용한다. 요청 시점의 값을 전송하고,
  실패한 낙관적 쓰기는 메모리에 보관해 ‘Дахин хадгалах’로 재저장한다.
- 다른 항목의 성공은 실패 기록을 지우지 않는다. 실패한 쓰기가 있는 동안 폴링은 편집값을 덮지 않는다.
- `remoteStatus.saveState`, `pendingWrites`, `retryableWrites`는 실제 저장 표시가 쓰는 값이다.
  새 공개 저장 API, 진단 전환 trace, 범용 상태 머신 계층은 추가하지 않는다.
- 읽기·관리자 JSON 저장 요청의 제한 시간은 16초다. 이미지 업로드와 주문 생성에 이 제한을 새로 적용하지 않는다.
- 주소 입력/선택/삭제는 진행 중 검색을 무효화한다. 지도 재연결 복구나 비정상 직접 호출 가드는 제외한다.
- 주문 UPSERT는 기존 행의 회원 연결과 생성 시각을 유지한다. 실제로 생략된 주문을 지우는
  전체 교체 API 의미는 그대로여서, 오래된 목록 저장과 새 주문의 충돌(F13)은 남아 있다.
- 신규 주문과 회원 연결의 기존 두 SQL 실행 절차는 그대로다(F26).
- `cancel`·`cancelled`는 같은 취소로 표시·합산 제외하되 DB의 과거 값을 일괄 변경하지 않는다.

## 변경하지 않은 범위

5점 미만 9개는 각각 GitHub 이슈로 남겼다. 운영 미확인·인위적 실패인 7점 항목 2개도 이슈로만 남겼다.
세부 재현 조건, 점수와 링크는 버그 평가 문서를 참조한다.

재고 예약·복원, 중복 주문 방지용 저장소, 이미지 정리 작업, 새 쿠폰/알림/자동 취소 시스템,
엄격한 주문 전이 제한, 과거 데이터 재구성, PC·모바일 공통 컨트롤러는 이번에 설계하거나 만들지 않는다.
그중 기존 안내와 실제 처리의 불일치, 별도 주문 간 재고 미차감 같은 확인된 문제는
점수표에서 **미수정**으로 명확하게 구분한다. 기존에 손실된 회원–주문 연결도 이번 변경으로 복구되지 않는다.

이전 분석의 “폴링이 검색어를 지운다”는 주장은 입력 때 URL도 갱신되는 현재 코드에서 재현되지 않아 제외했다.
로그아웃 뒤 늦은 응답은 ready 플래그 문제이며 관리자 인증·권한이 복구되는 보안 문제로 표현하지 않는다.

## 검증

```powershell
node --test .state-machines-test.js .admin-stability-test.js .catalog-test.js .address-test.js .account-test.js .google-auth-test.js .admin-auth-test.js .mobile-test.js .image-upload-test.js .serve-test.js
node .smoke-test.js
node .check-bindings.js
```

수정 범위를 줄인 뒤 기능 테스트 86개, 기존 동작 검사 356개, HTTP 경로 검사 26개가 통과했다.
템플릿 바인딩 누락이 없으며, 저장 표시는 진단 API 없이 대기·실패·재저장·완료를 표시하는지 확인했다.
카탈로그·저장·주소·주문 관계의 필요한 회귀 검사는 유지하고, 제외한 특수 사례 전용 테스트는 함께 제거했다.
운영 주문·상품·권한을 바꾸며 시험하지 않는다.

SQL의 `json_each`는 [Cloudflare D1 JSON 문서](https://developers.cloudflare.com/d1/sql-api/query-json/)에서
지원 여부를 확인했다. 기존 배치 호출은 [D1Database 계약](https://developers.cloudflare.com/d1/worker-api/d1-database/)을 따른다.

## 상태 머신 전체 목록

원본 [docs/state-machines.json](docs/state-machines.json)에는 소스·상태·이벤트·불변 조건과
연관된 버그 ID가 있다. `retain-tested`는 기존 동작을 유지한다는 뜻이며 모든 전이를 새로 테스트했다는 뜻은 아니다.

| ID | 소스 | 결정 |
|---|---|---|
| runtime-bootstrap | user-ui.js, Nudema Admin.dc.html, Nudema Admin Mobile.dc.html, admin-team.js | retain-tested |
| environment-mode | nudema-store.js, serve.js, device-redirect.js | retain-tested |
| remote-load | nudema-store.js | hardened |
| admin-auth-view | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | retain-tested |
| admin-session | functions/_admin-auth.js, functions/api/admin/_middleware.js, functions/api/admin-auth/logout.js, nudema-store.js | retain-tested |
| customer-session | functions/_auth.js, functions/api/auth/login.js, functions/api/auth/logout.js | retain-tested |
| customer-google-oauth | functions/api/auth/google/start.js, functions/api/auth/google/callback.js, functions/_auth.js | retain-tested |
| admin-google-oauth | functions/_admin-google.js, functions/_admin-auth.js | retain-tested |
| credential-submission | Nudema Login.dc.html, Nudema Signup.dc.html, Nudema Account.dc.html, nudema-auth.js | issue-only |
| admin-membership | functions/_admin-team.js, functions/_admin-auth.js | retain-tested |
| admin-role-permissions | functions/_admin-team.js, functions/api/admin/_middleware.js, admin-team.js | retain-tested |
| team-list-load | admin-team.js | hardened |
| team-editor | admin-team.js | retain-tested |
| admin-write-queue | nudema-store.js, admin-team.js | hardened |
| catalog-transaction | nudema-store.js, functions/_catalog.js, functions/api/admin/catalog.js | hardened |
| product-editor | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | hardened |
| taxonomy-editor | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | retain-tested |
| content-autosave | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | hardened |
| settings-editor | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | hardened |
| image-conversion-upload | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html, nudema-store.js, functions/api/admin/images.js | recorded-unmodified |
| image-object-lifecycle | functions/api/admin/images.js, functions/api/admin/images/[key].js, functions/api/images/[key].js | issue-only |
| review-moderation | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html, Nudema Product.dc.html | follow-up |
| order-fulfilment | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html, nudema-auth.js, functions/api/auth/account.js | hardened |
| order-account-persistence | functions/_lib.js, functions/api/orders.js, functions/api/auth/account.js | hardened |
| checkout-submission | Nudema Checkout.dc.html, nudema-store.js, functions/api/orders.js | issue-only-for-lost-response |
| stock-and-reservation | functions/api/orders.js, nudema-cart.js | partially-hardened-policy-required |
| delivery-region-cascade | Nudema Checkout.dc.html, mn-regions.js | retain-tested |
| address-search | address-picker.js, functions/api/geocode.js | hardened |
| address-selection | address-picker.js, Nudema Checkout.dc.html, functions/api/orders.js | hardened |
| address-map-lifecycle | address-picker.js | issue-only |
| cart-persistence | nudema-cart.js, Nudema Cart.dc.html | recorded-unmodified |
| cart-catalog-reconciliation | nudema-cart.js, Nudema Cart.dc.html, Nudema Checkout.dc.html | follow-up |
| product-availability | Nudema Product.dc.html | retain-tested |
| product-option-quantity | Nudema Product.dc.html, nudema-cart.js | retain-tested |
| product-gallery | Nudema Product.dc.html | retain-tested |
| product-detail-disclosure | Nudema Product.dc.html | retain-tested |
| catalog-search-filters | catalog-search.js, Nudema Search.dc.html, catalog-nav.js | follow-up |
| home-carousel | Nudema Mongolia.dc.html, Nudema Mobile.dc.html | retain-tested |
| home-curation | storefront-ui.js, Nudema Mongolia.dc.html, Nudema Mobile.dc.html | retain-tested |
| menu-drawers | nudema-menu.js, catalog-nav.js, Nudema Mobile.dc.html, storefront-ui.js | observed-only |
| account-view | Nudema Account.dc.html, functions/api/auth/account.js | follow-up |
| recently-viewed | storefront-ui.js | retain-tested |
| pwa-installation | pwa-install.js, manifest.webmanifest | retain-tested |
| service-worker-network | sw.js, offline.html | retain-tested |
| responsive-navigation | device-redirect.js, user-ui.js | retain-tested |
| footer-header-hydration | user-ui.js, storefront-ui.js | retain-tested |
| admin-navigation-dialogs | Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | observed-only |
| ephemeral-feedback | storefront-ui.js, Nudema Checkout.dc.html, Nudema Admin.dc.html, Nudema Admin Mobile.dc.html | hardened |
| legacy-login-rate-limit | functions/api/admin-auth/login.js, functions/_lib.js | retain-tested |
| schema-initialization | functions/_lib.js, functions/_admin-auth.js, functions/_admin-schema.js, migrations | retain-tested |

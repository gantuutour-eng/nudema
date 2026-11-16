# Cloudflare Pages production setup

The repository now contains Cloudflare Pages Functions and a D1 migration. The storefront keeps a local cache, while D1 is the shared source of truth across browsers and devices.

## 1. Create D1

```bash
npx wrangler d1 create nudemadata
```

Copy `wrangler.example.jsonc` to `wrangler.jsonc`, then replace the production and preview database IDs with the IDs returned by Cloudflare.

Apply the schema:

```bash
npx wrangler d1 migrations apply nudemadata --remote
```

Migration `0002_customer_auth.sql` adds customer accounts, HttpOnly sessions, and
the user-to-order relationship. Migration `0003_google_oauth.sql` adds one-time
OAuth state and external identity mappings. Migration `0004_admin_login.sql`
adds the failed-login throttle used by the site administrator form. Pages
Functions also create the same tables on first use, but applying migrations
remains the recommended production workflow.

For local Functions testing:

```bash
npx wrangler pages dev . --d1 DB=nudemadata --r2 IMAGES=nudema-images
```

## 2. Configure Pages

For a Git-connected Pages project:

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `.`
- D1 binding name: `DB`
- D1 database: `nudemadata`
- R2 binding name: `IMAGES`

New gallery and banner uploads are resized to a maximum edge of 1600px and encoded
as WebP at 82% quality. Long product-detail images preserve up to 2000px of width,
30,000px of height, and 32 megapixels, and use WebP at 96% quality so embedded text
stays readable. Images are uploaded to R2 as binary multipart data. Product records
store only the `/api/images/<key>.webp` URL; Base64 image data is not stored in D1.
- R2 bucket: `nudema-images`

Set the domain's Caching → Configuration → Browser Cache TTL to **Respect Existing Headers**.
Application scripts use the same release query string across customer/admin pages;
bump that release when changing their shared API to prevent old browser copies
from being combined with new templates. Public immutable product images reuse
the Cloudflare edge cache; customer/account/order APIs are not cached.
Serve `/manifest.webmanifest` as `application/manifest+json` and `/sw.js` with
revalidation enabled. The worker caches only the public offline notice and icon.

Add these production variables:

- Administrator membership and sessions now live in D1. The old `ADMIN_EMAILS`,
  `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` values no longer grant access.
- `ALLOW_LOCAL_ADMIN`: `false`

If the Pages project uses the dashboard instead of `wrangler.jsonc`, create the same D1 binding and variables in both Production and Preview environments. Redeploy after changing bindings.

## 3. Configure Google login

In Google Cloud Console, create an OAuth 2.0 client with application type **Web application**.

Use these exact OAuth consent screen branding values while the app is under review:

- App name: `Nudema in Mongolia`
- App home page: `https://nudema-mongolia.com/`
- Privacy policy: `https://nudema-mongolia.com/privacy`
- Terms of service: `https://nudema-mongolia.com/terms`
- Authorized domain: `nudema-mongolia.com`

Do not submit the Pages preview domain or a storefront subpage as the app home page.
The root route keeps `https://nudema-mongolia.com/` in the address bar and serves
the device-appropriate storefront internally through `functions/index.js`. The
storefront displays the exact app name, purpose, Google Sign-In usage, and legal
links without redirecting the submitted OAuth homepage to another URL.

- Authorized JavaScript origin: `https://nudema-mongolia.com`
- Authorized redirect URI: `https://nudema-mongolia.com/api/auth/google/callback`

Add these values under Pages → Settings → Variables and Secrets → Production:

- `GOOGLE_CLIENT_ID`: the Web application client ID
- `GOOGLE_CLIENT_SECRET`: add as an encrypted secret, never commit it
- `GOOGLE_REDIRECT_URI`: `https://nudema-mongolia.com/api/auth/google/callback`

Use the Pages URL only for a pre-production environment that is not submitted for
OAuth brand verification. Google requires an exact redirect URI match. Redeploy
after changing these values.

Production registration completed on 2026-11-16:

- Google Cloud project: `Nudema in Mongolia` (`nudema-in-mongolia-514906`)
- Web OAuth client: `Nudema Web Login`
- Audience: External, Production
- Login scopes: `openid email profile`; no sensitive or restricted Google scopes
- Cloudflare Pages project: `nudema`; all three Google variables are encrypted
- Production callback: `https://nudema-mongolia.com/api/auth/google/callback`

The Google-only account creation fix is deployed in commit `93e0b4c`.
It stores random, unusable password placeholders instead of deriving a password
that the customer never set. This avoids the Workers PBKDF2 limit during Google
signup without changing existing password accounts. The live Google sign-in,
account page, profile navigation, and session persistence were verified.
Google brand verification is separate from the production publishing status.
The Google brand verification passed and the verified branding was published
on 2026-11-16; Google confirms it is displayed to users.
The domain property `nudema-mongolia.com` is verified in Google Search Console
for the Google Cloud project owner's account. Its new verification TXT record
was added alongside the existing verification record; retain both records.
Keep OAuth secrets in Cloudflare; do not copy their values into this document.

## 4. Configure the site admin login

Administrators use **Google sign-in** at `/admin`. The specifically authorized
first owner is `gantuutour@gmail.com`. This row starts unclaimed; only a verified
Google sign-in for that address can bind it to a Google `sub` and activate it.
Customer login sessions never grant administrator access. Password-era admin
cookies and the old password endpoint no longer authorize access (HTTP 410).

The existing Google OAuth client and `/api/auth/google/callback` are reused.
Admin requests use separate browser-bound, single-use state, PKCE, membership,
and session tables. No additional Google scopes or callback registration are needed.
Opaque administrator cookies are HttpOnly/Secure/SameSite=Lax and expire after
12 hours. Only their hashes are stored in D1; every request rechecks membership.

Migration `0005_google_admin_team.sql` creates these tables. Admin Functions also
create them safely on first use without modifying existing shop/customer data.
The first owner's role cannot be removed, reassigned or suspended in the UI/API.
Owner transfer is intentionally not part of this release.

Under **Администратор удирдах**, the owner can invite admins or operators.
Admins can manage operators only. Operators have selected module permissions
and cannot manage the team. Invitations expire after seven days and require
explicit acceptance after Google login. Initial account claims require Gmail
or Google Workspace, where Google is authoritative for the email address.
There is no automatic invitation email: use the button to copy `/admin` and share
it with the invited person. Suspended/revoked memberships cannot authenticate;
role changes also delete all existing sessions for that member immediately.

Admin read/write endpoints enforce module permissions. Analytics-only order
data excludes customer contact/address/name fields. Team changes and their
audit events commit together; other successful admin writes record resource
names without storing customer payloads or credentials in the audit log.

Admin clients distinguish HTTP 401 from validation, permission and network errors.
Only a real unauthorized response clears the session UI. Temporary polling errors
retain the last confirmed data; initial data errors offer retry without Google
reauthentication. Category edits wait for server confirmation before changing the
local cache. Older polling responses cannot overwrite a newer local save.

Catalog reads reconstruct legacy missing taxonomy entries from existing product
categories without changing products or deleting category data. A subsequent
catalog save persists that coherent taxonomy. Explicit edits still reject newly
orphaned product categories. Admin HTML hides raw templates and provisional
screens behind one static startup screen until authentication has been checked.

## 5. Initialize the database

After the first deployment and migration:

1. Open the deployed admin page in the browser that contains the authoritative current Nudema data.
2. Sign in with the verified owner Google account `gantuutour@gmail.com`.
3. Wait for the page to load. Existing D1 shop data is preserved; seed a new empty installation separately before selling products.
4. Open `/api/health`; it must return `{"ok":true,"database":"connected"}`.
5. Open the storefront in a private window or on a phone and verify that the same products appear.

Do not initialize from multiple browsers at the same time. Once D1 has data, normal clients only synchronize with it.

## 6. Deployment checks

- Product edits in Admin appear in another browser within 15 seconds.
- A checkout submission returns a new `NDM-YYYYMMDD-xxxxxx` order number.
- The new order appears in Admin after refresh or synchronization.
- `/api/admin/state` returns `401` without a valid site-admin session.
- Missing D1 bindings make `/api/health` return `503`; fix the binding instead of deploying around the error.

## API routes

| Route | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | D1 readiness check |
| `GET /api/storefront` | Public | Products and public storefront state |
| `POST /api/orders` | Public | Validated order creation |
| `POST /api/auth/signup` | Public | Create a password-hashed customer account |
| `POST /api/auth/login` | Public | Create an HttpOnly customer session |
| `GET /api/auth/account` | Customer session | Profile, points, and linked orders |
| `POST /api/auth/logout` | Customer session | Revoke the current session |
| `GET /api/auth/google/start` | Public | Start Google OAuth with state and PKCE |
| `GET /api/auth/google/callback` | Public | Link/create customer and issue session |
| `GET /api/images/:key` | Public | Immutable R2 image delivery |
| `GET /api/admin-auth/google/start` | Public | Begin Google administrator sign-in with browser-bound state and PKCE |
| `POST /api/admin-auth/login` | Disabled (410) | Password login retired |
| `POST /api/admin-auth/accept` | Invited Google admin, same origin | Accept an unexpired invitation |
| `GET /api/admin-auth/session` | Admin session | Return the active admin identity |
| `POST /api/admin-auth/logout` | Public | Clear the admin session cookie |
| `GET /api/admin/state` | Active admin | State filtered by module permissions |
| `GET/POST/PUT /api/admin/team` | Owner/admin, role constrained | List, invite, change roles/permissions, suspend or revoke |
| `GET /api/admin/audit` | Owner/admin | Latest 100 administrator events |
| `PUT /api/admin/store/:name` | Admin session | Admin updates |
| `POST /api/admin/images` | Admin session | R2 image upload |
| `DELETE /api/admin/images/:key` | Admin session | R2 image deletion |

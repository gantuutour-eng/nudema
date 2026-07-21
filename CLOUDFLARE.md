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
OAuth state and external identity mappings. Pages Functions also create the same
tables on first use, but applying migrations remains the recommended production
workflow.

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

New admin image uploads are resized to a maximum edge of 1600px, encoded as WebP
at 82% quality, and uploaded to R2 as binary multipart data. Product records store
only the `/api/images/<key>.webp` URL; Base64 image data is not stored in D1.
- R2 bucket: `nudema-images`

Add these production variables:

- `ADMIN_EMAILS`: comma-separated email addresses allowed to administer the store
- `ALLOW_LOCAL_ADMIN`: `false`

If the Pages project uses the dashboard instead of `wrangler.jsonc`, create the same D1 binding and variables in both Production and Preview environments. Redeploy after changing bindings.

## 3. Configure Google login

In Google Cloud Console, create an OAuth 2.0 client with application type **Web application**.

- Authorized JavaScript origin: `https://nudema.pages.dev`
- Authorized redirect URI: `https://nudema.pages.dev/api/auth/google/callback`

Add these values under Pages → Settings → Variables and Secrets → Production:

- `GOOGLE_CLIENT_ID`: the Web application client ID
- `GOOGLE_CLIENT_SECRET`: add as an encrypted secret, never commit it
- `GOOGLE_REDIRECT_URI`: `https://nudema.pages.dev/api/auth/google/callback`

If a custom domain becomes the primary domain, add its callback URI in Google and
set `GOOGLE_REDIRECT_URI` to that exact URI. Google requires an exact redirect URI
match. Redeploy after changing these values.

## 4. Protect the admin routes

Create Cloudflare Access applications/policies for both the custom domain and the `pages.dev` domain. Protect:

- `/Nudema Admin.dc*`
- `/api/admin/*`

Only the addresses listed in `ADMIN_EMAILS` should be allowed. The public storefront and `/api/orders` must remain public.

## 5. Initialize the database

After the first deployment and migration:

1. Open the protected admin page in the browser that contains the authoritative current Nudema data.
2. Sign in to the existing Nudema admin screen.
3. Wait for the page to load. If D1 is empty, the client uploads its current products, content, settings, taxonomy, reviews, orders, statuses, and admin profile once.
4. Open `/api/health`; it must return `{"ok":true,"database":"connected"}`.
5. Open the storefront in a private window or on a phone and verify that the same products appear.

Do not initialize from multiple browsers at the same time. Once D1 has data, normal clients only synchronize with it.

## 6. Deployment checks

- Product edits in Admin appear in another browser within 15 seconds.
- A checkout submission returns a new `NDM-YYYYMMDD-xxxxxx` order number.
- The new order appears in Admin after refresh or synchronization.
- `/api/admin/state` returns `401` without Cloudflare Access.
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
| `GET /api/admin/state` | Cloudflare Access | Full admin state |
| `POST /api/admin/state` | Cloudflare Access | First-time D1 bootstrap |
| `PUT /api/admin/store/:name` | Cloudflare Access | Admin updates |
| `POST /api/admin/images` | Cloudflare Access | R2 image upload |
| `DELETE /api/admin/images/:key` | Cloudflare Access | R2 image deletion |

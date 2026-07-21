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

## 3. Protect the admin routes

Create Cloudflare Access applications/policies for both the custom domain and the `pages.dev` domain. Protect:

- `/Nudema Admin.dc*`
- `/api/admin/*`

Only the addresses listed in `ADMIN_EMAILS` should be allowed. The public storefront and `/api/orders` must remain public.

## 4. Initialize the database

After the first deployment and migration:

1. Open the protected admin page in the browser that contains the authoritative current Nudema data.
2. Sign in to the existing Nudema admin screen.
3. Wait for the page to load. If D1 is empty, the client uploads its current products, content, settings, taxonomy, reviews, orders, statuses, and admin profile once.
4. Open `/api/health`; it must return `{"ok":true,"database":"connected"}`.
5. Open the storefront in a private window or on a phone and verify that the same products appear.

Do not initialize from multiple browsers at the same time. Once D1 has data, normal clients only synchronize with it.

## 5. Deployment checks

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
| `GET /api/images/:key` | Public | Immutable R2 image delivery |
| `GET /api/admin/state` | Cloudflare Access | Full admin state |
| `POST /api/admin/state` | Cloudflare Access | First-time D1 bootstrap |
| `PUT /api/admin/store/:name` | Cloudflare Access | Admin updates |
| `POST /api/admin/images` | Cloudflare Access | R2 image upload |
| `DELETE /api/admin/images/:key` | Cloudflare Access | R2 image deletion |

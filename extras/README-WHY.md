# Staff Portal Restructure — 2026-09-15

## What changed

The staff portal used to deploy from `public/` because `wrangler.toml` had `pages_build_output_dir = "./public"`.
That meant every live HTML/Worker file lived under `public/` and the root of the project was full of stale duplicates.
This was confusing compared to the customer site (`foreveryoung/`) which serves straight from root.

We restructured so the staff project now serves from root, exactly like the customer site.
No files were deleted — everything was moved into `extras/` as a safety backup.

## Files moved

### Stale root-level files → `extras/root-backup/`
These were older/unused copies at the project root:

- `2online-products.html`
- `index.html`
- `indexf_dev_punches.html`
- `instore-products.html`
- `online-products.html`
- `punches.html`
- `production_export.sql`
- `update-vendors.sql`
- `warehouse.html`
- `images/` (entire old image folder)

### API functions → `extras/functions-backup/functions/`
The old per-endpoint Pages Functions. They are replaced by the consolidated `_worker.js`:

- `functions/api/discogs-lookup.js`
- `functions/api/enrich.js`
- `functions/api/featured.js`
- `functions/api/instore-search.js`
- `functions/api/instore-update.js`
- `functions/api/inventory-search.js`
- `functions/api/online-search.js`
- `functions/api/online-update.js`
- `functions/api/punch.js`
- `functions/api/queue.js`
- `functions/api/redeem.js`
- `functions/api/sales.js`
- `functions/api/sync.js`
- `functions/api/ticker.js`

### Old `public/` content → promoted to root
These are the live/current versions that Pages was actually serving. They were moved up to root:

- `public/_worker.js` → `_worker.js`
- `public/index.html` → `index.html`
- `public/indexf_dev_punches.html` → `indexf_dev_punches.html`
- `public/instore-products.html` → `instore-products.html`
- `public/online-products.html` → `online-products.html`
- `public/warehouse.html` → `warehouse.html`
- `public/images/*` → `images/*`
- `public/.wrangler` → `extras/public-backup/.wrangler`

The now-empty `public/` directory was removed.

## Configuration changes

- `wrangler.toml`:
  - `pages_build_output_dir` changed from `"./public"` to `"."`
- `startstaff.bat`:
  - Command changed from `npx -y wrangler@4 pages dev ./public --port 8789` to `npx -y wrangler@4 pages dev . --port 8789`

## How to undo

If anything breaks, you can restore the old layout manually:

1. Create `public/` again.
2. Move `_worker.js`, `index.html`, `instore-products.html`, `online-products.html`, `warehouse.html`, `indexf_dev_punches.html`, and `images/` back into `public/`.
3. Move the files from `extras/root-backup/` back to root, and `extras/functions-backup/functions` back to `functions/`.
4. Revert `wrangler.toml` to `pages_build_output_dir = "./public"`.
5. Revert `startstaff.bat` to `npx -y wrangler@4 pages dev ./public --port 8789`.

## Notes

- `.assetsignore` was reviewed but left unchanged.
- `.wrangler/` is ignored by `.gitignore` so it won't affect Git, but the runtime cache from `public/.wrangler` was preserved in `extras/public-backup/.wrangler` just in case.

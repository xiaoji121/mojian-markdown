# mojian.uk deployment

The `Deploy mojian.uk` workflow publishes `main` independently of the existing
site at `https://yuxizhai.com/md-editor/`. Every push to `main` builds and checks
the site, then updates `gh-pages` and requests a Pages build. The workflow waits
for Pages to confirm the expected commit was published. Pull requests run the
build and verification jobs without publishing. A failed build leaves the last
successful site online and is visible in GitHub Actions.

Build the custom-domain output:

```sh
npm ci --ignore-scripts
MOJIAN_SITE_ORIGIN=https://mojian.uk MOJIAN_SITE_BASE=/ npm run build
MOJIAN_SITE_ORIGIN=https://mojian.uk MOJIAN_SITE_BASE=/ node scripts/check-landing-build.mjs
MOJIAN_SITE_ORIGIN=https://mojian.uk MOJIAN_SITE_BASE=/ npx playwright test --config playwright.landing.config.ts
```

`MOJIAN_SITE_ORIGIN` and `MOJIAN_SITE_BASE` configure the prerendered metadata,
runtime metadata, and sitemap. Asset paths remain relative so all four locale
directories work. Without these variables, the previous public URL is preserved.

Keep GitHub Pages on **Deploy from a branch**, `gh-pages`, `/ (root)`, with custom
domain `mojian.uk`. The existing environment allows only `gh-pages`; this setup
preserves that protection.
The workflow uses GitHub's short-lived deployment token; no new secret is needed.
Keep the ownership TXT record in DNS. Configure the apex with GitHub Pages' four
A records and `www` with CNAME `xiaoji121.github.io`. The existing `Notify deploy`
workflow and default build URL continue to serve the old site independently.

The `gh-pages` branch holds generated output and is automatically fast-forwarded
by the workflow; do not edit it manually. Future changes should enter `main` through the normal review
process. Use the workflow's **Run workflow** action on `main` to retry a failed
deployment. `deployment.json` records the published source SHA. Do not force-push
or change the existing site's deployment.

On macOS, use `TMPDIR=/private/tmp npm run check` if tests otherwise compare
`/var/...` against its canonical `/private/var/...` path.

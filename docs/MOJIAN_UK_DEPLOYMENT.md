# mojian.uk deployment

The domain deployment is isolated from `main` and the existing site at
`https://yuxizhai.com/md-editor/`. It builds the existing landing page and browser
editor; it does not include the separate PC redesign.

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

Publish `dist/` to the independent `gh-pages` branch, with `.nojekyll` and a
`CNAME` file containing `mojian.uk`. Configure GitHub Pages to serve that branch
from its root. Keep the ownership TXT record in DNS. Configure the apex with
GitHub Pages' four A records and `www` with CNAME `xiaoji121.github.io`.

Future publications should build reviewed source, record its SHA, and fast-forward
the deployment branch. Do not force-push or change the existing site's deployment.

On macOS, use `TMPDIR=/private/tmp npm run check` if tests otherwise compare
`/var/...` against its canonical `/private/var/...` path.

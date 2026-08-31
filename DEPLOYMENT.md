# Deploying the console

## Why this needs more than "build and serve"

Two things about this app are not obvious from the source, and getting either
wrong produces a page that spins forever with nothing in the console to explain
it.

**The API allowlists origins.** `api.mycountrymobile.com` returns an
`Access-Control-Allow-Origin` header only to hosts it recognises — the
`*.mycountrymobile.com` domains. Any other host gets a response with no such
header, which the browser then blocks. A deployment on a `vercel.app` domain, or
a dev server on localhost, therefore cannot call the API directly however
correct its configuration is.

The fix is to never make the call cross-origin. `vercel.json` rewrites `/api/*`
to the API host, and `vite.config.ts` proxies the same path for `vite dev` and
`vite preview`. The browser only ever talks to the origin it loaded the app
from, so there is nothing for the allowlist to reject.

This is why `VITE_API_BASE_URL` is left unset outside production: an empty base
makes requests relative, which is what routes them through the proxy. Setting it
to an absolute URL opts back into direct cross-origin calls, and only works from
an allowlisted host.

**Branding is looked up by domain.** On startup the app asks the API for the
organisation registered to the domain it is being served from. A preview or
development host is not registered, so the lookup fails and there is no
branding, no Stripe key, and nothing to render. Hosts that cannot be registered
— localhost, `*.vercel.app` — fall back to the QA organisation. Set
`VITE_ORG_DOMAIN` to follow a specific organisation instead.

## Which API host

`api.mycountrymobile.com`, which is what the deployed console at
ucaas.mycountrymobile.com has baked into its own bundle.

`docs/api-security-audit-2026-08-29.md` says the production frontend points at
`api2.mycountrymobile.com`. That is no longer true of the running deployment,
and the two hosts do not share a user database: signing in against `api2` with
an account that exists in production fails with "The email ... was not found",
which reads as a wrong password rather than a wrong backend. Both hosts serve
the same organisation record, so branding and the login screen come up fine
either way and the mistake only surfaces at the moment someone tries to sign in.

## Vercel setup

`vercel.json` covers the build, the API proxy, and client-side routing, so a
default import of the repository works with no environment variables set. It
will come up against the QA organisation.

To point a deployment somewhere else, set in Project → Settings → Environment
Variables:

- `VITE_ORG_DOMAIN` — the organisation's domain, if not the QA default.
- `VITE_APP_ENV=production` — silences `console.log` in the built app.

Leave `VITE_API_BASE_URL` unset unless the deployment is on an allowlisted
domain. To proxy to a different API host, edit the destination in
`vercel.json`; Vercel rewrites cannot read environment variables.

See `.env.example` for the full list of variables and what stays inert without
them.

## Local development

`npm install && npm run dev`. No `.env` is required — the dev server proxies
`/api` to `api.mycountrymobile.com` and the app loads the QA organisation.
Set `VITE_API_PROXY_TARGET` to proxy elsewhere.

On the production host, `.env` lives in `/etc/mycountrymobile-web` rather than
in the repository, and the build reads it from there when that directory
exists. Everywhere else the build falls back to the project root.

# Security Policy

## Supported versions

The latest commit on `main` is supported.

## Reporting a vulnerability

Please use the private **Report a vulnerability** flow on the repository's Security tab:

https://github.com/tarek-dev-coder/Alpha-Timer/security

Do not open a public issue containing exploit details. If private reporting is unavailable, open a minimal issue asking for a private contact channel.

Include reproduction steps, impact, browser/OS details, and any proof of concept. The maintainer will review the report through the private advisory.

## Security model

Alpha Timer is a static, client-side web app. It has:

- no server-side code, accounts, authentication, cookies, or analytics;
- no third-party scripts, fonts, or network requests;
- no secrets, API keys, or credentials in the repository;
- task and settings data stored only in the browser's `localStorage` (not encrypted).

Do not store sensitive information in tasks or settings.

## Controls

- Strict Content Security Policy: no `unsafe-inline`, no `unsafe-eval`, no inline event handlers or styles, and no workers, frames, objects, media, or external fonts.
- Task text is rendered with `textContent`, never HTML; there are no dynamic code execution or HTML injection sinks.
- Stored tasks and settings are validated, and task count, task length, and stored task size are capped.
- `Referrer-Policy: no-referrer` via a meta tag.
- No external resources, service worker, or third-party dependencies.
- A frame-busting fallback hides the app when it is embedded, because GitHub Pages cannot send a `frame-ancestors` header.

## Platform limitations

GitHub Pages cannot set custom response headers such as `frame-ancestors`, HSTS, `X-Content-Type-Options`, or `Permissions-Policy`. The app uses meta tags and a frame-busting fallback where possible.

`localStorage` is scoped to the entire `*.github.io` origin, not to this project path. Other projects served under the same GitHub Pages account can technically access it. Do not store secrets in the app.

## Out of scope

- Missing response headers that GitHub Pages does not allow the project to set.
- Social engineering, physical access, and compromised browsers or extensions.

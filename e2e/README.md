# MuseFlow browser E2E

The suite connects to an already running MuseFlow platform and never starts or
mocks the application itself. The target must run with development authentication
enabled so tests can create a fresh isolated subject through `/api/auth/dev-login`.

```bash
E2E_BASE_URL=http://127.0.0.1:8791 npm run test:e2e
```

The normal suite exercises development login, real PostgreSQL-backed project
idempotency through the real project form, AI prompt and lyrics
preview/confirmation, logout/session revocation, all core workspace pages, responsive
desktop/mobile layouts, theme persistence, keyboard behavior, accessible names,
strict zero-warning/error browser-console auditing, serious/critical Axe checks,
and 390px horizontal-overflow checks. The mocked platform cases also pin the
MXAPI Sound parameter contract (`title`, `tags`, `mv`, optional `tempo`/`key`/
`loop`), ModelCross dynamic `sound_pair` pricing, V5/V5.5 authorization, legacy
model capability hiding, billing fail-closed behavior, and the separation between
Provider merchant points and user-visible ModelCross credits.

Music generation is intentionally skipped unless the operator explicitly
confirms that the configured provider is fake:

```bash
E2E_BASE_URL=http://127.0.0.1:8791 E2E_FAKE_PROVIDER=true npm run test:e2e
```

Even with that flag, both song and Sound tests skip unless `/api/health` reports
the provider as configured and ready, explicitly marks development preview music
mutations executable, and reports `billingLive` as exactly `false`. The Sound
case waits for both Provider tasks, verifies each private MP3 and cover through
same-origin object-storage routes (including byte ranges), exercises playback and
download links, and deletes both assets. Never set
`E2E_FAKE_PROVIDER=true` against an account or provider capable of consuming real
credits. Slow fake-provider jobs can raise the polling budget with
`E2E_GENERATION_TIMEOUT_MS`; the default is 120 seconds.

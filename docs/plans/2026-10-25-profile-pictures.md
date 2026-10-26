# Profile pictures implementation

Goal: let availability respondents optionally choose a goofy face or take a selfie beside their name.

Architecture: preserve browser-scoped response identity and the existing respondent visibility gate. Store thumbnails separately from the metadata selected by poll reads, and serve photos through a respondent-authorized route. Isolate the camera lifecycle in a small chooser component and extend existing draft protection.

Tech stack: existing Next.js/React, Prisma/Postgres, Zod, SVG, browser media/canvas APIs, sharp, Vitest and Playwright. Separate worktree, branch `feat/profile-pics`, starting at `48c1437`.

```text
Name + optional picture -> save response -> browser identity stays unchanged
  avatar -> allowlisted ID             |
  selfie -> crop -> JPEG -> normalize -+
  invalid / save failure -> safe error; edits retained

Camera tap -> preview -> capture -> review -> use / retake
  unavailable -> choose file / avatar
  close / hidden / late grant -> stop tracks

Photo GET -> valid Venn -> requester has answered -> picture belongs to Venn -> JPEG
  any missing/unauthorized/expired case -> no photo
```

## Files and steps

- [ ] Baseline: install dependencies and run `npm test` (existing suites pass; database suites may skip without test opt-in). Add sharp 0.35.5 as an explicit dependency. Provision only `venn_profile_pics_test` on local Postgres; never migrate the dev or production database.
- [ ] Shared contract/backend: `src/features/profile-pictures/schema.ts`, `normalize.ts`, availability service/schema, Prisma schema/migration and protected picture route. Write failing tests for avatar allowlisting, invalid/oversized JPEGs, metadata stripping, persistence/removal, anonymous and cross-poll photo rejection. Implement `PictureInput = { kind: 'avatar'; id: AvatarId } | { kind: 'photo'; dataUrl: string } | null` and `PictureView = { kind: 'avatar'; id: AvatarId } | { kind: 'photo'; key: string }`. Run targeted Vitest and isolated Postgres tests until green.
- [ ] Chooser: `src/components/profile-picture.tsx`, `profile-picture-picker.tsx`, CSS and capture helpers/tests. Implement props `{ share, value, onChange, disabled }` with six SVG faces, a native modal camera booth and file fallback. Failing browser/unit coverage precedes capture/lifecycle implementation; verify mirrored crop and cleanup, including permission resolving after cancel.
- [ ] Integration: availability voting and draft helpers; include picture state in `draftBaseFingerprint`, dirty state and restoration. Use a helper that returns undefined for unchanged photo-key references, null for removal, and the selected preset/new JPEG otherwise. Keep `names` and add gated `respondents: { name, picture }[]`. Render protected photos with the same-origin route and decorative images beside visible names. Write failing tests before each changed behavior.
- [ ] Isolated browser setup: allow `PLAYWRIGHT_PORT` with 3000 as the compatibility default; read the configured URL in global setup. Use port 3033 and test database `venn_profile_pics_test`. Run avatar, camera, file, privacy and draft journeys on desktop/mobile with retries disabled; inspect screenshots. Never reuse another worktree's development server.
- [ ] Verify and review: run `npm run verify`, the full guest suite and authenticated creator suite against the isolated database. Review correctness, camera cleanup, image boundaries and privacy; apply required fixes. Record commands/results below, and leave the feature on its separate branch for review, without deploying.

## Evidence

Results are recorded after running the corresponding checks.

2026-10-25 (Claude, resuming after Codex hit its usage limit):

- Fix: the picker now closes the booth and stops camera tracks when it becomes disabled (voting closes mid-capture).
- Test hardening: picture specs wait for React hydration (`tests/e2e/fixtures/hydration.ts`); availability spec derives its same-origin header from `baseURL` so `PLAYWRIGHT_PORT` works.
- `tsc`, `eslint`: clean. `vitest` with `VENN_DATABASE_TESTS=1` on `venn_profile_pics_test`: 36 files / 265 tests passed.
- Production build on port 3034, `CI=1`, retries 0: picture specs 54/54 (x3 repeat, desktop + mobile); full guest suite 84 passed / 8 skipped after the origin fix (availability.spec 16/16); `VENN_AUTH_E2E=1` creator suite 8/8.
- Screenshots of booth, review and saved states inspected at 390px. Physical iPhone camera check not done (synthetic media only).

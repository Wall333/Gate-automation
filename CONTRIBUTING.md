# Contributing

Thank you for contributing to Gate Controller. Please follow these guidelines to keep the codebase clean and the project moving smoothly.

## Branching

- **`main`** — stable, deployable code.
- **Feature branches** — branch off `main` using the pattern `feature/<short-description>` (e.g., `feature/admin-approval`).
- **Bug-fix branches** — use `fix/<short-description>`.

## Commits

- Write clear, concise commit messages in the imperative mood:
  - ✅ `Add JWT middleware for protected routes`
  - ❌ `added stuff`
- Keep commits focused — one logical change per commit.

## Pull Requests

1. Open a PR against `main`.
2. Describe **what** changed and **why**.
3. Reference the relevant spec in `docs/specs/` if applicable.
4. Ensure all tests pass before requesting review.
5. At least one approval is required before merging.

## Documentation

- For significant changes (new features, API changes, architectural shifts), update or create a spec in `docs/specs/`.
- Record non-obvious architectural decisions in `docs/adr/` using the ADR template.
- Keep `README.md` and `.env.example` in sync with any new configuration.

## Security

- **Never commit secrets** (API keys, tokens, passwords). Use `.env` files and document required variables in `.env.example`.
- Report security concerns privately — do not open a public issue.

## Code Style

- Use consistent formatting (Prettier / ESLint configs will be added as the project matures).
- Prefer clarity over cleverness.
- Add comments only when the _why_ isn't obvious from the code.

## Versioning

This project follows **[Semantic Versioning](https://semver.org/)** (`MAJOR.MINOR.PATCH`):

| Bump  | When to use | Example |
|-------|-------------|---------|
| **PATCH** (`1.5.0` → `1.5.1`) | Bug fixes, build fixes, doc-only corrections | Fix a crash, fix a broken import |
| **MINOR** (`1.5.x` → `1.6.0`) | New features, new API endpoints, new screens | Add activity feed, add push notifications |
| **MAJOR** (`1.x.x` → `2.0.0`) | Breaking changes to the API, DB schema, or device protocol | Change auth flow, redesign WebSocket protocol |

### Where to update

When bumping the version, update **all** of these in a single commit:

1. **`mobile/app.json`** — `expo.version` (e.g. `"1.5.1"`) and `expo.android.versionCode` (e.g. `10501`).
   - `versionCode` format: `MAJOR * 10000 + MINOR * 100 + PATCH` (e.g. 1.5.1 → 10501).
   - `build.gradle` reads these automatically — no separate edit needed.
2. **`server/package.json`** — `version` field.
3. **`README.md`** — version badge at the top.
4. **`CHANGELOG.md`** — add a new section header `## [vX.Y.Z] — YYYY-MM-DD` with the relevant `### Added`, `### Changed`, and/or `### Fixed` entries.

### Changelog format

Follow [Keep a Changelog](https://keepachangelog.com/). Group entries under:
- **Added** — new features
- **Changed** — changes to existing functionality
- **Fixed** — bug fixes
- **Removed** — removed features or deprecated items

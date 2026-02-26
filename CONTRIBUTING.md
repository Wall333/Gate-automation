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

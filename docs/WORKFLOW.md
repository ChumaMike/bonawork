# Parallel development workflow

Several Claude Code sessions work at once, each in its own Git worktree on its
own branch. Every branch starts from `foundation/scaffold`.

## Ownership

Edit only what your team owns. To change something you do not own, ask its owner.

| Paths                                                                                   | Owner              | Branch                  |
| --------------------------------------------------------------------------------------- | ------------------ | ----------------------- |
| `contracts/`, `src/blockchain/`, `verifier/`                                            | Blockchain         | `feature/blockchain`    |
| `src/app/` (except `src/app/api/`), `src/components/`, `public/`, `e2e/`                | Frontend           | `feature/frontend`      |
| `src/server/`, `src/app/api/`, `database/`                                              | Backend            | `feature/backend`       |
| `docs/research/`, `docs/demo/`                                                          | Research and pitch | `feature/demo-research` |
| `src/shared/`, `docs/*.md`, root config files, `package.json`, `CLAUDE.md`, `README.md` | Foundation lead    | `foundation/scaffold`   |

Root config means: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
`tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `vitest.config.ts`,
`playwright.config.ts`, `.env.example`, `.gitignore`, `.prettierrc.json`.

Two shared files every team will need to touch:

- **`package.json` / `pnpm-lock.yaml`** — add dependencies with `pnpm add` in
  your own branch. Expect a lockfile conflict at integration; resolve it by
  taking either side and running `pnpm install`.
- **`.env.example`** — add your variables under your team's heading, and to
  `src/server/env.ts` if the server reads them.

## Rules

1. Never commit to `foundation/scaffold` or `main` unless you are the Foundation lead.
2. Never merge another session's branch, and never push or deploy. The
   integration session does that.
3. Never rename, move or delete a worktree folder while a session is using it.
4. Run `pnpm check` before every commit.
5. Shared interface changes go through `docs/INTERFACES.md`.

## Creating a worktree

These worktrees already exist — do not create them again:

| Branch                     | Folder                            |
| -------------------------- | --------------------------------- |
| `foundation/scaffold`      | the main folder                   |
| `feature/frontend`         | `.claude/worktrees/frontend`      |
| `feature/demo-research`    | `.claude/worktrees/demo-research` |
| `feature/blockchain`       | `../BonaBlock-blockchain`     |
| `integration/bona-release` | `../BonaBlock-integration`    |

To add a new one (for example the backend), run from the main folder:

```bash
git worktree add "../BonaBlock-backend" -b feature/backend foundation/scaffold
git worktree add "../BonaBlock-ai"      -b feature/ai      foundation/scaffold
```

Then, in the new folder:

```bash
pnpm install
pnpm check
```

To run two dev servers at once, give each its own port: `pnpm dev --port 3001`.

## Picking up foundation changes

Run inside your own worktree:

```bash
git merge foundation/scaffold
pnpm install
pnpm check
```

Merge, do not rebase: the integration branch has already merged some feature
branches, and rebasing would rewrite commits it depends on.

## If the merge conflicts

- In a file you own: keep your version.
- In `src/shared/`, `docs/*.md` or root config: keep the foundation version
  (`git checkout --theirs -- <path>` during the merge), then `git add <path>`.
- In `package.json`: keep both sets of dependencies, then run `pnpm install`
  to regenerate `pnpm-lock.yaml`.

## Integration

The integration session works on `integration/bona-release` in
`../BonaBlock-integration`. It merges `foundation/scaffold` first, then each
feature branch, running `pnpm check` and `pnpm e2e` after each merge. No other
session merges, pushes or deploys.

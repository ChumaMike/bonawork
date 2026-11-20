# Bona Chain

Verified institutional fulfilment and accountability platform. First application: school infrastructure repairs.
Bona Chain merges BonaBlock (community reporting and independent verification) with Alethia (work orders, invoices, receipts, three-way match and release decisions).
The project folder is `BonaChain`; worktrees are its `BonaChain-*` siblings.

@AGENTS.md

## Read first

- `docs/PROJECT_BRIEF.md` — names, purpose, plan.
- `docs/WORKFLOW.md` — **who owns which paths**, worktrees, rules.
- `docs/INTERFACES.md` — shared types. Import them from `@/shared`.
- `docs/ARCHITECTURE.md` — modules and how they communicate.

## Rules for every session

- Edit only paths your team owns (`docs/WORKFLOW.md`). `src/shared/` belongs to the Foundation lead.
- Do not merge other branches, push, or deploy.
- Names: Bona Chain (product), Bona AI (assistant), Bona Chain Verify (verifier). Contracts: `BonaChainFactory`, `InstitutionOperations`, `InstitutionFinance` (`BonaRegistry` is the earlier single contract and stays unchanged).
- Testnet only (Avalanche Fuji). No real money moves: a release is an instruction, never "paid". AI never approves, verifies, signs or authorises.
- There is no "resolved" status. A repair is `repair_claimed` until an independent reviewer makes it `verified`.

## Commands

```bash
pnpm install     # once per worktree
pnpm dev         # http://localhost:3000
pnpm check       # lint + typecheck + unit tests — run before every commit
pnpm e2e         # browser tests at 390/768/1440px, writes docs/screenshots/
pnpm build       # production build
pnpm format      # prettier
```

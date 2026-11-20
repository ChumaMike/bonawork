# Bona Chain — project brief

**Bona Chain — See it. Report it. Prove it.**

> A report is not protection. A repair claim is not verification.

## Names

| Thing                | Name                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Product              | Bona Chain                                                                                                                   |
| Technical name       | `bona`                                                                                                                       |
| First application    | School infrastructure repairs                                                                                                |
| AI assistant         | Bona AI                                                                                                                      |
| Smart contracts      | `BonaRegistry` (reporting and verification); `BonaChainFactory`, `InstitutionOperations`, `InstitutionFinance` (being built) |
| Independent verifier | Bona Chain Verify (project `bona-verify`)                                                                                    |

The product was called BonaBlock until it merged with Alethia. The GitHub
repository is `obxalethia-star/BonaChain` and the Vercel projects are
`bonachain` and `bonachain-verify`. `BonaRegistry`, the package names, the
`bona_session` cookie and the `BB-` reference prefix keep their names.

## Purpose

Bona Chain helps communities report problems, take part in existing issues,
understand how institutions respond, and independently verify the history of
important evidence and decisions through Avalanche.

Schools are the first use case — starting with school infrastructure such as
toilets, water, electricity and buildings. The platform is not limited to
schools: reports attach to an `Institution`, and "school" is one kind.

Bona Chain merges two projects: BonaBlock (community reporting and
independent verification of repairs) and Alethia (work orders, invoices,
deliveries, a three-way match and release decisions). On one case the trail is:

```
report -> work order approved (buyer) -> order acknowledged (supplier)
       -> invoice submitted (supplier) -> delivery recorded (receiving officer)
       -> invoice checked against order and delivery (rules, in code)
       -> repair independently verified (reviewer)
       -> release authorised (payment approver)
```

No real money moves: the last step is a release instruction on a test
network. The contract for the merged build is `docs/merged/BUILD_BRIEF.md`.

## What it must do

- **Reporting** — describe a problem at a school and attach evidence.
- **Endorsing** — other community members add "this affects me too".
- **School information** — a page per school with its reports and their status.
- **Bona AI** — helps people write clear reports and understand responses.
- **Interim protection** — record what was done to keep people safe meanwhile; it never counts as a repair.
- **Independent reviewers** — check a repair claim before it counts as fixed.
- **Evidence integrity** — evidence stays private; its digest is anchored.
- **Avalanche** — `BonaRegistry` holds the digests; anyone can verify them.
- **The procurement trail** — work order, acknowledgement, invoice, delivery
  record, a three-way match done by code, and a release instruction that stays
  locked until the invoice matches and the repair is verified. Being built.
- **Separation of duties** — no person takes two of the approve, invoice,
  receive and authorise steps on a case.
- **Privacy of the trail** — the public sees steps, roles, times and proofs;
  never amounts, supplier names, documents or people's names.

## Brand direction

Professional, accessible, modern South African civic technology. Plain
language. Works on a low-cost phone first.

## Plan

Ordered milestones. Each ends with something that can be shown working.

| #   | Milestone                           | Owner                | Done when                                                                                        |
| --- | ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| 0   | Foundation                          | Foundation           | App runs, shared interfaces committed, worktrees based on it. **Done.**                          |
| 1   | `BonaRegistry` on Fuji              | Blockchain           | Contract written and tested (done); deployed to Fuji; `LedgerPort` adapter in `src/blockchain/`. |
| 2   | Backend core                        | Backend              | Create report, upload evidence, case events, against an in-memory `LedgerPort`.                  |
| 3   | Reporting and school pages          | Frontend             | A person can file a report and see it on the school page from a phone.                           |
| 4   | Repair claim and independent review | Backend + Frontend   | A claim can be verified or disputed; the same user cannot do both.                               |
| 5   | Real anchoring                      | Backend + Blockchain | Receipts on Fuji appear on reports; Bona Chain Verify confirms one.                              |
| 6   | Bona AI                             | AI session           | Drafting help on the report form.                                                                |
| 7   | Demo hardening                      | Everyone             | Seed data, the demo script runs end to end twice without intervention.                           |

| 8 | Bona Chain merge | Everyone | The procurement trail runs on a seeded case from work order to release instruction. **In progress.** |

Milestones 1, 2 and 3 run in parallel because they meet only at
`src/shared/`. If time runs short, cut 6 first, then narrow 3 to one school.
Never cut 4 or 5: they are the point of the product.

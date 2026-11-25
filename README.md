# BonaWork

**Fund school repairs. Release payment only after independent verification.**

Dev3Pack Global Hackathon 2026 · Solana · DeFi / milestone escrow

BonaWork turns school infrastructure funding into accountable, milestone-based payments. Funders lock tokens in an escrow vault, contractors submit evidence of completed work, and independent reviewers verify that evidence before funds can be released.

## Start here — for judges

| Resource | Link / status |
| --- | --- |
| Solana program (Rust / Anchor) | [Source on main](https://github.com/ChumaMike/bonawork/tree/main/solana/programs/bonawork) |
| Web application (Next.js) | [solana/app branch](https://github.com/ChumaMike/bonawork/tree/solana/app) — integration in progress |
| Devnet program | [Solana Explorer](https://explorer.solana.com/address/5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY?cluster=devnet) |
| Deployment transaction | [Explorer receipt](https://explorer.solana.com/tx/5fv99J9ZNWnWMmde5xZxta72LFFzoG4R8r8ymSwZWARQZY1P3f7sKi1A4pX1TRBQQgWP99nYnYX95eCTNP59wbbW?cluster=devnet) |
| Tests and deployment | [Successful CI run — 24 LiteSVM tests passed](https://github.com/ChumaMike/bonawork/actions/runs/45428772707) |
| Live web demo / video | Pending verified submission URLs |

## The problem

A broken classroom window or toilet may be reported, repaired on paper and invoiced without a funder being able to independently confirm that the work was completed. Schools need functioning infrastructure; contractors need predictable payment; funders need evidence before releasing money.

BonaWork connects these needs through programmable escrow, not just a record of an approval.

## How it works

1. A funder creates an escrow with two milestones, agreed amounts, deadlines and an assigned reviewer.
2. Demo tokens are deposited into the escrow's program-controlled SPL token vault.
3. The contractor and procurement match authority sign a milestone claim.
4. The assigned independent reviewer signs that exact claim.
5. A challenge window allows disputes; an immediate release attempt is rejected.
6. Once the challenge window expires without an open dispute, anyone can trigger release to the predetermined contractor for the agreed amount. Deadline refunds and dispute resolution provide alternative paths.

The program enforces the payment conditions; an AI model or web administrator does not decide whether escrow funds can move.

## Why Solana

- **Anchor / Rust:** a custom program enforces milestone states, signer requirements, deadlines, disputes and refunds.
- **Program-derived accounts and SPL Token:** escrow custody and token transfers are enforced by the program rather than an application database.
- **Solana Kit and token SDK:** the application branch builds transactions, reads accounts and links to explorer receipts.
- **Bona Guardian and Escrow Watchdog:** the application branch includes transaction decoding/policy checks and a keeper for eligible releases. These are software safeguards, not substitutes for on-chain enforcement or human inspection.

## Demo walkthrough

The [scripted devnet journey](https://github.com/ChumaMike/bonawork/blob/solana/app/scripts/solana/demo-journey.ts) uses a fictional R5,000 repair split into R3,000 for materials and R2,000 for completion. It creates and funds an escrow, claims and verifies the materials milestone, attempts a premature release (expected error: `ChallengeWindowActive`), then waits for the challenge window and triggers the eligible release.

This is a reproducible demo script, not a claim that the public web journey has been independently tested.

## Deployment

Network: **Solana devnet only**. Program ID:

```
5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY
```

The November 24, 2026 deployment workflow succeeded at slot 525839562. The application [devnet configuration](https://github.com/ChumaMike/bonawork/blob/solana/app/config/solana-devnet.json) specifies BDZAR, a sandbox demo token with two decimals ([mint on Explorer](https://explorer.solana.com/address/5AHRPsVABhZESFmPMXX9jeYb6krkz9XUAsLy1LiWXud3?cluster=devnet)). BDZAR is not real rand, a redeemable stablecoin or a claim on fiat funds.

## Run and inspect

### Program and tests

Install Rust and the Solana CLI with `cargo-build-sbf` (CI uses v4.1.2).

```bash
git clone https://github.com/ChumaMike/bonawork.git
cd bonawork
git switch main
cargo build-sbf --manifest-path solana/programs/bonawork/Cargo.toml --features localtest
(cd solana/tests-litesvm && cargo test -- --test-threads=4)
```

The localtest feature is for testing only. The [deployment workflow](https://github.com/ChumaMike/bonawork/blob/main/.github/workflows/solana-deploy.yml) builds the devnet program without it.

### Web application

Requires Node.js 22+ and pnpm 11.24.0.

```bash
git fetch origin
git switch solana/app
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. This starts the application development environment; a fully configured devnet journey additionally requires the appropriate server-side demo keys and network configuration. See [bootstrap script](https://github.com/ChumaMike/bonawork/blob/solana/app/scripts/solana/bootstrap-devnet.ts) and [demo journey](https://github.com/ChumaMike/bonawork/blob/solana/app/scripts/solana/demo-journey.ts). Never commit private keys. Run `pnpm check` for application checks.

## Repository guide

| Branch / path | Purpose |
| --- | --- |
| [main](https://github.com/ChumaMike/bonawork/tree/main) | Default landing documentation and deployed Rust program |
| [solana/escrow](https://github.com/ChumaMike/bonawork/tree/solana/escrow) | Escrow development branch |
| [solana/app](https://github.com/ChumaMike/bonawork/tree/solana/app) | Solana SDK integration, web app and demo scripts |
| `solana/tests-litesvm/` | Program integration tests |
| `src/solana/`, `src/server/solana/` (app branch) | Transaction construction, guardian, escrow service and keeper |

## Hackathon scope and provenance

BonaWork builds on the earlier BonaBlock / Alethia (Bona Chain) school reporting and procurement application. The Dev3Pack work introduces a new Solana Anchor escrow program and Solana application integration, moving from recording release instructions to enforcing actual demo-token transfers. Inherited Avalanche contracts, documents and UI code remain in the repository for reference; they are not the Solana submission's deployment or evidence of newly built work.

## Limitations

This is a hackathon prototype with synthetic school data and test tokens. The program validates digital signatures and payment conditions; it cannot independently establish whether physical work really happened. Reviewer independence and evidence quality remain operational responsibilities. The deployed program retains an upgrade authority; it is not immutable or independently audited. No production funds or real school adoption are claimed. Live web deployment, video and any additional sponsor integrations must be verified before submission.


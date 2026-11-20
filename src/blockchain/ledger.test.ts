import { describe, expect, it } from "vitest";
import { BlockchainReceiptSchema, LedgerError, type Hex32 } from "@/shared";
import { loadEnv } from "@/server/env";
import { createMemoryLedger, MEMORY_CHAIN_ID } from "@/server/ledger/memory";
import { createLedger, ledgerMode } from "./index";

const REPORT = "3f2b8c1e-9a4d-4e7b-8c2a-5d6e7f8091a2";
const SCHOOL = "7a1c2d3e-4f50-4a6b-9c8d-0e1f2a3b4c5d";
const hash = (n: number): Hex32 => `0x${n.toString(16).padStart(64, "0")}`;

describe("memory ledger describes itself and probes verification like the contract", () => {
  it("is never presented as Avalanche", () => {
    const info = createMemoryLedger().info();
    expect(info.live).toBe(false);
    expect(info.chainId).toBe(MEMORY_CHAIN_ID);
    expect(info.explorerTxUrl(hash(1))).toBeNull();
  });

  it("refuses the school administrator and allows the reviewer only once a repair is claimed", async () => {
    const ledger = createMemoryLedger();
    const r = await ledger.registerReport({
      reportId: REPORT,
      institutionId: SCHOOL,
      commitment: hash(1),
    });
    expect(BlockchainReceiptSchema.safeParse(r).success).toBe(true);

    expect(await ledger.probeVerify({ reportId: REPORT, as: "reviewer" })).toEqual({
      allowed: false,
      revert: "InvalidState",
    });
    await ledger.acknowledgeReport({ reportId: REPORT });
    await ledger.claimRepair({ reportId: REPORT, commitment: hash(2) });
    expect(await ledger.probeVerify({ reportId: REPORT, as: "school_admin" })).toEqual({
      allowed: false,
      revert: "SchoolAdminCannotVerify",
    });
    expect(await ledger.probeVerify({ reportId: REPORT, as: "registrar" })).toEqual({
      allowed: false,
      revert: "Unauthorized",
    });
    expect(await ledger.probeVerify({ reportId: REPORT, as: "reviewer" })).toEqual({
      allowed: true,
      revert: null,
    });
  });

  it("raises LedgerError with both a code and the contract error name", async () => {
    const ledger = createMemoryLedger();
    const error = await ledger
      .claimRepair({ reportId: REPORT, commitment: hash(1) })
      .catch((e) => e);
    expect(error).toBeInstanceOf(LedgerError);
    expect(error).toMatchObject({ code: "not_found", contractError: "ReportNotFound" });
  });
});

describe("ledger selection from the environment", () => {
  const base = { NODE_ENV: "test" };

  it("uses the memory ledger when Avalanche is not fully configured", () => {
    expect(ledgerMode(loadEnv(base))).toBe("memory");
    expect(
      ledgerMode(
        loadEnv({
          ...base,
          LEDGER_RPC_URL: "https://api.avax-test.network/ext/bc/C/rpc",
        }),
      ),
    ).toBe("memory");
  });

  it("turns the ledger off when asked", async () => {
    const ledger = createLedger(loadEnv({ ...base, LEDGER_MODE: "off" }));
    await expect(
      ledger.registerReport({
        reportId: REPORT,
        institutionId: SCHOOL,
        commitment: hash(1),
      }),
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("refuses identical signer keys", () => {
    const key = `0x${"11".repeat(32)}`;
    expect(() =>
      loadEnv({
        ...base,
        LEDGER_REGISTRAR_PRIVATE_KEY: key,
        LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: key,
      }),
    ).toThrow(/must all differ/);
  });

  it("selects Avalanche only when everything is present, and only Fuji", () => {
    const full = {
      ...base,
      LEDGER_RPC_URL: "https://api.avax-test.network/ext/bc/C/rpc",
      LEDGER_CHAIN_ID: "eip155:43113",
      LEDGER_CONTRACT_ADDRESS: `0x${"ab".repeat(20)}`,
      LEDGER_REGISTRAR_PRIVATE_KEY: `0x${"11".repeat(32)}`,
      LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: `0x${"22".repeat(32)}`,
      LEDGER_REVIEWER_PRIVATE_KEY: `0x${"33".repeat(32)}`,
    };
    expect(ledgerMode(loadEnv(full))).toBe("avalanche");
    expect(createLedger(loadEnv(full)).info()).toMatchObject({
      chainId: "eip155:43113",
      live: true,
      networkName: "Avalanche Fuji C-Chain",
    });
    expect(() =>
      createLedger(loadEnv({ ...full, LEDGER_CHAIN_ID: "eip155:43114" })),
    ).toThrow(/only eip155:43113/);
  });
});

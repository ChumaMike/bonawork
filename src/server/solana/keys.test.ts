import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getBase58Decoder } from "@solana/kit";
import { afterAll, describe, expect, it } from "vitest";

import { loadEnv } from "../env";
import {
  KEY_FILES,
  generateKeypairBytes,
  loadSigners,
  parseSecretKey,
  resolveKeyBytes,
  signerFromBytes,
} from "./keys";

// Every key here is generated for the test; no real key is ever used.
const bytes = generateKeypairBytes();
const asJson = JSON.stringify(Array.from(bytes));
const asBase58 = getBase58Decoder().decode(bytes);

const dir = mkdtempSync(join(tmpdir(), "bonawork-keys-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("parseSecretKey", () => {
  it("reads a JSON byte array and base58 to the same 64 bytes", () => {
    expect(parseSecretKey(asJson)).toEqual(bytes);
    expect(parseSecretKey(`  ${asBase58}\n`)).toEqual(bytes);
  });

  it("rejects wrong lengths and junk without echoing the value", () => {
    const short = JSON.stringify(Array.from(bytes.slice(0, 32)));
    expect(() => parseSecretKey(short, "BONAWORK_ADMIN_KEY")).toThrow(
      "BONAWORK_ADMIN_KEY: must be 64 bytes, got 32",
    );
    for (const bad of ["[1,2,", "[300]", "0x1234", "not a key!", ""]) {
      expect(() => parseSecretKey(bad, "X")).toThrow(/^X: /);
    }
    try {
      parseSecretKey(asBase58.slice(0, 40), "X");
    } catch (error) {
      expect((error as Error).message).not.toContain(asBase58.slice(0, 40));
    }
  });

  it("generates keys whose public half matches the seed", async () => {
    const signer = await signerFromBytes(generateKeypairBytes());
    expect(signer.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});

describe("resolveKeyBytes", () => {
  writeFileSync(join(dir, KEY_FILES.feepayer), asJson);

  it("prefers the environment, then a key file in local development", () => {
    const other = generateKeypairBytes();
    const found = resolveKeyBytes(["admin", "feepayer", "keeper"], {
      BONAWORK_ADMIN_KEY: getBase58Decoder().decode(other),
      BONAWORK_KEYS_DIR: dir,
      NODE_ENV: "development",
    });
    expect(found.admin).toEqual({ bytes: other, from: "env" });
    expect(found.feepayer).toEqual({ bytes, from: "file" });
    expect(found.keeper).toBeUndefined();
  });

  it("never reads key files in production or on Vercel", () => {
    expect(
      resolveKeyBytes(["feepayer"], { BONAWORK_KEYS_DIR: dir, NODE_ENV: "production" }),
    ).toEqual({});
    expect(
      resolveKeyBytes(["feepayer"], { BONAWORK_KEYS_DIR: dir, VERCEL: "1" }),
    ).toEqual({});
  });
});

describe("loadSigners", () => {
  it("refuses one key shared by two roles", async () => {
    await expect(
      loadSigners(["admin", "keeper"], {
        BONAWORK_ADMIN_KEY: asJson,
        BONAWORK_KEEPER_KEY: asBase58,
      }),
    ).rejects.toThrow("BONAWORK_KEEPER_KEY and BONAWORK_ADMIN_KEY hold the same key");
  });

  it("loads one signer per role", async () => {
    const signers = await loadSigners(["admin", "match"], {
      BONAWORK_ADMIN_KEY: asJson,
      BONAWORK_MATCH_KEY: getBase58Decoder().decode(generateKeypairBytes()),
    });
    expect(signers.admin?.address).toBe((await signerFromBytes(bytes)).address);
    expect(signers.match?.address).not.toBe(signers.admin?.address);
  });
});

describe("env", () => {
  it("accepts Solana keys as base58 or JSON and rejects junk without the value", () => {
    const env = loadEnv({ BONAWORK_ADMIN_KEY: asBase58, BONAWORK_KEEPER_KEY: asJson });
    expect(env.BONAWORK_ADMIN_KEY).toBe(asBase58);
    let message = "";
    try {
      loadEnv({ BONAWORK_FEEPAYER_KEY: "secret-but-wrong" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("BONAWORK_FEEPAYER_KEY");
    expect(message).not.toContain("secret-but-wrong");
  });
});

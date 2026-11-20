import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

// Optional local env file (git-ignored). Tests and the local demo need none of it.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — fine
}

const deployerKey = process.env.FUJI_DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  // Snowtrace (Routescan) verifies Fuji contracts through an Etherscan-style API that needs no
  // account; the key below is a placeholder Routescan accepts. `pnpm verify:fuji` uses it.
  chainDescriptors: {
    43113: {
      name: "Avalanche Fuji",
      blockExplorers: {
        etherscan: {
          name: "SnowTrace",
          url: "https://testnet.snowtrace.io",
          apiUrl: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api",
        },
      },
    },
  },
  verify: {
    etherscan: { apiKey: process.env.SNOWTRACE_API_KEY ?? "verifyContract" },
    blockscout: { enabled: false },
    sourcify: { enabled: false },
  },
  networks: {
    fuji: {
      type: "http",
      chainType: "l1",
      chainId: 43113,
      url: process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
};

export default config;

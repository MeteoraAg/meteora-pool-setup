import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  DEFAULT_COMMITMENT_LEVEL,
  MeteoraConfig,
  getAmountInLamports,
  getQuoteMint,
  getQuoteDecimals,
  safeParseKeypairFromFile,
  runSimulateTransaction,
  FcfsAlphaVaultConfig,
  ProrataAlphaVaultConfig,
  getAlphaVaultWhitelistMode,
  parseConfigFromCli,
  getAlphaVaultPoolType,
  modifyComputeUnitPriceIx,
  AlphaVaultTypeConfig,
  PoolTypeConfig,
  toAlphaVaulSdkPoolType,
} from ".";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";

import { BN } from "bn.js";
import AlphaVault, { PoolType } from "@meteora-ag/alpha-vault";
import {
  LBCLMM_PROGRAM_IDS,
  deriveCustomizablePermissionlessLbPair,
} from "@meteora-ag/dlmm";
import {
  deriveCustomizablePermissionlessConstantProductPoolAddress,
  createProgram,
} from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils";
import {
  createFcfsAlphaVault,
  createProrataAlphaVault,
} from "./libs/create_alpha_vault_utils";

async function main() {
  let config: MeteoraConfig = parseConfigFromCli();

  console.log(`> Using keypair file path ${config.keypairFilePath}`);
  let keypair = safeParseKeypairFromFile(config.keypairFilePath);

  console.log("\n> Initializing with general configuration...");
  console.log(`- Using RPC URL ${config.rpcUrl}`);
  console.log(`- Dry run = ${config.dryRun}`);
  console.log(`- Using payer ${keypair.publicKey} to execute commands`);

  const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL);
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: connection.commitment,
  });

  if (!config.baseMint) {
    throw new Error("Missing baseMint in configuration");
  }
  const baseMint = new PublicKey(config.baseMint);
  let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint);
  const quoteDecimals = await getQuoteDecimals(connection, config.quoteSymbol, config.quoteMint);

  console.log(`- Using base token mint ${baseMint.toString()}`);
  console.log(`- Using quote token mint ${quoteMint.toString()}`);

  if (!config.alphaVault) {
    throw new Error("Missing alpha vault in configuration");
  }
  const poolType = config.alphaVault.poolType;

  let poolKey: PublicKey;
  if (poolType == PoolTypeConfig.Dynamic) {
    poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
      baseMint,
      quoteMint,
      createProgram(connection).ammProgram.programId,
    );
  } else if (poolType == PoolTypeConfig.Dlmm) {
    [poolKey] = deriveCustomizablePermissionlessLbPair(
      baseMint,
      quoteMint,
      new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"]),
    );
  } else {
    throw new Error(`Invalid pool type ${poolType}`);
  }

  console.log(`\n> Pool address: ${poolKey}, pool type ${poolType}`);

  if (config.alphaVault.alphaVaultType == AlphaVaultTypeConfig.Fcfs) {
    await createFcfsAlphaVault(
      connection,
      wallet,
      toAlphaVaulSdkPoolType(poolType),
      poolKey,
      baseMint,
      quoteMint,
      quoteDecimals,
      config.alphaVault as FcfsAlphaVaultConfig,
      config.dryRun,
      config.computeUnitPriceMicroLamports,
    );
  } else if (config.alphaVault.alphaVaultType == AlphaVaultTypeConfig.Prorata) {
    await createProrataAlphaVault(
      connection,
      wallet,
      toAlphaVaulSdkPoolType(poolType),
      poolKey,
      baseMint,
      quoteMint,
      quoteDecimals,
      config.alphaVault as ProrataAlphaVaultConfig,
      config.dryRun,
      config.computeUnitPriceMicroLamports,
    );
  } else {
    throw new Error(
      `Invalid alpha vault type ${config.alphaVault.alphaVaultType}`,
    );
  }
}

main();

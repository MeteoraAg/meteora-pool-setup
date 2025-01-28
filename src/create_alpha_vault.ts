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
} from ".";
import { Wallet } from "@coral-xyz/anchor";

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

  const poolType = getAlphaVaultPoolType(config.alphaVault.poolType);

  let poolKey: PublicKey;
  if (poolType == PoolType.DYNAMIC) {
    poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
      baseMint,
      quoteMint,
      createProgram(connection).ammProgram.programId,
    );
  } else if (poolType == PoolType.DLMM) {
    [poolKey] = deriveCustomizablePermissionlessLbPair(
      baseMint,
      quoteMint,
      new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"]),
    );
  } else {
    throw new Error(`Invalid pool type ${poolType}`);
  }

  console.log(
    `\n> Pool address: ${poolKey}, pool type ${config.alphaVault.poolType}`,
  );

  let initAlphaVaultTx: Transaction | null = null;
  if (config.alphaVault.alphaVaultType == "fcfs") {
    initAlphaVaultTx = await createFcfsAlphaVault(
      connection,
      wallet,
      poolType,
      poolKey,
      baseMint,
      quoteMint,
      quoteDecimals,
      config.alphaVault as FcfsAlphaVaultConfig,
    );
  } else if (config.alphaVault.alphaVaultType == "prorata") {
    initAlphaVaultTx = await createProrataAlphaVault(
      connection,
      wallet,
      poolType,
      poolKey,
      baseMint,
      quoteMint,
      quoteDecimals,
      config.alphaVault as ProrataAlphaVaultConfig,
    );
  } else {
    throw new Error(
      `Invalid alpha vault type ${config.alphaVault.alphaVaultType}`,
    );
  }
  modifyComputeUnitPriceIx(
    initAlphaVaultTx,
    config.computeUnitPriceMicroLamports,
  );

  if (config.dryRun) {
    console.log(`\n> Simulating init alpha vault tx...`);
    await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
      initAlphaVaultTx,
    ]);
  } else {
    console.log(`>> Sending init alpha vault transaction...`);
    const initAlphaVaulTxHash = await sendAndConfirmTransaction(
      connection,
      initAlphaVaultTx,
      [wallet.payer],
    ).catch((err) => {
      console.error(err);
      throw err;
    });
    console.log(
      `>>> Alpha vault initialized successfully with tx hash: ${initAlphaVaulTxHash}`,
    );
  }
}

async function createFcfsAlphaVault(
  connection: Connection,
  wallet: Wallet,
  poolType: PoolType,
  poolAddress: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  quoteDecimals: number,
  params: FcfsAlphaVaultConfig,
): Promise<Transaction> {
  let maxDepositingCap = getAmountInLamports(
    params.maxDepositCap,
    quoteDecimals,
  );
  let individualDepositingCap = getAmountInLamports(
    params.individualDepositingCap,
    quoteDecimals,
  );
  let escrowFee = getAmountInLamports(params.escrowFee, quoteDecimals);
  let whitelistMode = getAlphaVaultWhitelistMode(params.whitelistMode);

  console.log(`\n> Initializing FcfsAlphaVault...`);
  console.log(`- Using poolType: ${poolType}`);
  console.log(`- Using poolMint ${poolAddress}`);
  console.log(`- Using baseMint ${baseMint}`);
  console.log(`- Using quoteMint ${quoteMint}`);
  console.log(`- Using depositingPoint ${params.depositingPoint}`);
  console.log(`- Using startVestingPoint ${params.startVestingPoint}`);
  console.log(`- Using endVestingPoint ${params.endVestingPoint}`);
  console.log(
    `- Using maxDepositingCap ${params.maxDepositCap}. In lamports ${maxDepositingCap}`,
  );
  console.log(
    `- Using individualDepositingCap ${params.individualDepositingCap}. In lamports ${individualDepositingCap}`,
  );
  console.log(
    `- Using escrowFee ${params.escrowFee}. In lamports ${escrowFee}`,
  );
  console.log(
    `- Using whitelistMode ${params.whitelistMode}. In value ${whitelistMode}`,
  );

  const tx = await AlphaVault.createCustomizableFcfsVault(
    connection,
    {
      quoteMint,
      baseMint,
      poolAddress,
      poolType,
      depositingPoint: new BN(params.depositingPoint),
      startVestingPoint: new BN(params.startVestingPoint),
      endVestingPoint: new BN(params.endVestingPoint),
      maxDepositingCap,
      individualDepositingCap,
      escrowFee,
      whitelistMode,
    },
    wallet.publicKey,
    {
      cluster: "mainnet-beta",
    },
  );
  return tx;
}

async function createProrataAlphaVault(
  connection: Connection,
  wallet: Wallet,
  poolType: PoolType,
  poolAddress: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  quoteDecimals: number,
  params: ProrataAlphaVaultConfig,
): Promise<Transaction> {
  let maxBuyingCap = getAmountInLamports(params.maxBuyingCap, quoteDecimals);
  let escrowFee = getAmountInLamports(params.escrowFee, quoteDecimals);
  let whitelistMode = getAlphaVaultWhitelistMode(params.whitelistMode);

  console.log(`\n> Initializing ProrataAlphaVault...`);
  console.log(`- Using poolType: ${poolType}`);
  console.log(`- Using poolMint ${poolAddress}`);
  console.log(`- Using baseMint ${baseMint}`);
  console.log(`- Using quoteMint ${quoteMint}`);
  console.log(`- Using depositingPoint ${params.depositingPoint}`);
  console.log(`- Using startVestingPoint ${params.startVestingPoint}`);
  console.log(`- Using endVestingPoint ${params.endVestingPoint}`);
  console.log(
    `- Using maxBuyingCap ${params.maxBuyingCap}. In lamports ${maxBuyingCap}`,
  );
  console.log(
    `- Using escrowFee ${params.escrowFee}. In lamports ${escrowFee}`,
  );
  console.log(
    `- Using whitelistMode ${params.whitelistMode}. In value ${whitelistMode}`,
  );

  const tx = await AlphaVault.createCustomizableProrataVault(
    connection,
    {
      quoteMint,
      baseMint,
      poolAddress,
      poolType,
      depositingPoint: new BN(params.depositingPoint),
      startVestingPoint: new BN(params.startVestingPoint),
      endVestingPoint: new BN(params.endVestingPoint),
      maxBuyingCap,
      escrowFee,
      whitelistMode,
    },
    wallet.publicKey,
    {
      cluster: "mainnet-beta",
    },
  );
  return tx;
}

main();

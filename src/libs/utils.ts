import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import { parseArgs } from "util";
import { BN } from "bn.js";
import Decimal from "decimal.js";
import {
  SOL_TOKEN_DECIMALS,
  SOL_TOKEN_MINT,
  TX_SIZE_LIMIT_BYTES,
  USDC_TOKEN_DECIMALS,
  USDC_TOKEN_MINT,
} from "./constants";
import { simulateTransaction } from "@coral-xyz/anchor/dist/cjs/utils/rpc";
import { ActivationType as DynamicAmmActivationType } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/types";
import { ActivationType as DlmmActivationType } from "@meteora-ag/dlmm";
import {
  PermissionWithAuthority,
  PermissionWithMerkleProof,
  Permissionless,
  PoolType,
  WhitelistMode,
} from "@meteora-ag/alpha-vault";
import {
  ActivationTypeConfig,
  MeteoraConfig,
  PoolTypeConfig,
  PriceRoundingConfig,
  WhitelistModeConfig,
} from "..";
import { getMint } from "@solana/spl-token";
import { parse } from "csv-parse";

export const DEFAULT_ADD_LIQUIDITY_CU = 800_000;

export function extraConfigValidation(config: MeteoraConfig) {
  if (!config.keypairFilePath) {
    throw new Error("Missing keypairFilePath in config file.");
  }
  if (!config.rpcUrl) {
    throw new Error("Missing rpcUrl in config file.");
  }

  if (config.createBaseToken && config.baseMint) {
    throw new Error(
      "Both createBaseToken and baseMint cannot be set simultaneously.",
    );
  }

  if (config.dynamicAmm && config.dlmm) {
    throw new Error(
      "Both Dynamic AMM and DLMM configuration cannot be set simultaneously.",
    );
  }

  if (config.dlmm && config.dlmm.hasAlphaVault) {
    if (config.quoteSymbol == null && config.quoteMint == null) {
      throw new Error(
        "Either quoteSymbol or quoteMint must be provided for DLMM",
      );
    }
  }

  if (config.alphaVault) {
    if (
      config.alphaVault.alphaVaultType != "fcfs" &&
      config.alphaVault.alphaVaultType != "prorata"
    ) {
      throw new Error(
        `Alpha vault type ${config.alphaVault.alphaVaultType} isn't supported.`,
      );
    }

    if (
      config.alphaVault.poolType != "dynamic" &&
      config.alphaVault.poolType != "dlmm"
    ) {
      throw new Error(
        `Alpha vault pool tyep ${config.alphaVault.poolType} isn't supported.`,
      );
    }
  }
}

export function safeParseJsonFromFile<T>(filePath: string): T {
  try {
    const rawData = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error reading or parsing JSON file:", error);
    throw new Error(`failed to parse file ${filePath}`);
  }
}

export function safeParseKeypairFromFile(filePath: string): Keypair {
  let keypairJson: Array<number> = safeParseJsonFromFile(filePath);
  let keypairBytes = Uint8Array.from(keypairJson);
  let keypair = Keypair.fromSecretKey(keypairBytes);
  return keypair;
}

export function parseKeypairFromSecretKey(secretKey: string): Keypair {
  const keypairBytes = bs58.decode(secretKey);
  const keypair = Keypair.fromSecretKey(keypairBytes);
  return keypair;
}

// Function to parse CSV file
export async function parseCsv<T>(filePath: string): Promise<Array<T>> {
  const fileStream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    const parser = parse({
      columns: true, // Use the header row as keys
      skip_empty_lines: true, // Skip empty lines
    });

    const results = [];

    fileStream
      .pipe(parser)
      .on("data", (row) => results.push(row)) // Collect rows
      .on("end", () => resolve(results)) // Resolve the promise with results
      .on("error", (err) => reject(err)); // Reject the promise if error occurs
  });
}

export function getAmountInLamports(
  amount: number | string,
  decimals: number,
): BN {
  const amountD = new Decimal(amount);
  const amountLamports = amountD.mul(new Decimal(10 ** decimals));
  return new BN(amountLamports.toString());
}

export function getDecimalizedAmount(amountLamport: BN, decimals: number): BN {
  return amountLamport / new BN(10 ** decimals);
}

export function getQuoteMint(quoteSymbol?: string, quoteMint?: string): PublicKey {
  if (quoteSymbol == null && quoteMint == null) {
    throw new Error(`Either quoteSymbol or quoteMint must be provided`);
  }
  if (quoteSymbol && quoteMint) {
    throw new Error(`Cannot provide quoteSymbol and quoteMint at the same time`);
  }

  if (quoteMint) {
    return new PublicKey(quoteMint);
  }

  if (quoteSymbol.toLowerCase() == "sol") {
    return new PublicKey(SOL_TOKEN_MINT);
  } else if (quoteSymbol.toLowerCase() == "usdc") {
    return new PublicKey(USDC_TOKEN_MINT);
  } else {
    throw new Error(`Unsupported quote symbol: ${quoteSymbol}`);
  }
}

export async function getQuoteDecimals(connection: Connection, quoteSymbol?: string, quoteMint?: string): Promise<number> {
  if (quoteSymbol == null && quoteMint == null) {
    throw new Error(`Either quoteSymbol or quoteMint must be provided`);
  }
  if (quoteMint) {
    const mintAccount = await getMint(connection, new PublicKey(quoteMint));
    const decimals = mintAccount.decimals;
    return decimals;
  }
  if (quoteSymbol.toLowerCase() == "sol") {
    return SOL_TOKEN_DECIMALS;
  } else if (quoteSymbol.toLowerCase() == "usdc") {
    return USDC_TOKEN_DECIMALS;
  } else {
    throw new Error(`Unsupported quote symbol: ${quoteSymbol}`);
  }
}

export async function runSimulateTransaction(
  connection: Connection,
  signers: Array<Keypair>,
  feePayer: PublicKey,
  txs: Array<Transaction>,
) {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const transaction = new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer,
  }).add(...txs);

  let simulateResp = await simulateTransaction(
    connection,
    transaction,
    signers,
  );
  if (simulateResp.value.err) {
    console.error(">>> Simulate transaction failed:", simulateResp.value.err);
    console.log(`Logs ${simulateResp.value.logs}`);
    throw simulateResp.value.err;
  }

  console.log(">>> Simulated transaction successfully");
}

export function getDynamicAmmActivationType(
  activationType: ActivationTypeConfig,
): DynamicAmmActivationType {
  if (activationType == ActivationTypeConfig.Slot) {
    return DynamicAmmActivationType.Slot;
  } else if (activationType == ActivationTypeConfig.Timestamp) {
    return DynamicAmmActivationType.Timestamp;
  } else {
    throw new Error(
      `Unsupported Dynamic AMM activation type: ${activationType}`,
    );
  }
}

export function getDlmmActivationType(
  activationType: ActivationTypeConfig,
): DlmmActivationType {
  if (activationType == ActivationTypeConfig.Slot) {
    return DlmmActivationType.Slot;
  } else if (activationType == ActivationTypeConfig.Timestamp) {
    return DlmmActivationType.Timestamp;
  } else {
    throw new Error(`Unsupported DLMM activation type: ${activationType}`);
  }
}

export function isPriceRoundingUp(
  priceRoundingConfig: PriceRoundingConfig,
): boolean {
  return priceRoundingConfig == PriceRoundingConfig.Up;
}

export function getAlphaVaultPoolType(poolType: PoolTypeConfig): PoolType {
  if (poolType == PoolTypeConfig.Dynamic) {
    return PoolType.DYNAMIC;
  } else if (poolType == PoolTypeConfig.Dlmm) {
    return PoolType.DLMM;
  } else {
    throw new Error(`Unsupported alpha vault pool type: ${poolType}`);
  }
}

export function getAlphaVaultWhitelistMode(
  mode: WhitelistModeConfig,
): WhitelistMode {
  if (mode == WhitelistModeConfig.Permissionless) {
    return Permissionless;
  } else if (mode == WhitelistModeConfig.PermissionedWithAuthority) {
    return PermissionWithAuthority;
  } else if (mode == WhitelistModeConfig.PermissionedWithMerkleProof) {
    return PermissionWithMerkleProof;
  } else {
    throw new Error(`Unsupported alpha vault whitelist mode: ${mode}`);
  }
}

export function toAlphaVaulSdkPoolType(poolType: PoolTypeConfig): PoolType {
  switch (poolType) {
    case PoolTypeConfig.Dynamic:
      return PoolType.DYNAMIC;
    case PoolTypeConfig.Dlmm:
      return PoolType.DLMM;
    default:
      throw new Error(`Unsupported alpha vault pool type: ${poolType}`);
  }
}

/// Divine the instructions to multiple transactions
export async function handleSendTxs(
  connection: Connection,
  instructions: TransactionInstruction[],
  instructionsPerTx: number,
  payer: Keypair,
  computeUnitPriceMicroLamports: number,
  dryRun: boolean,
  txLabel?: string,
): Promise<void> {
  const numTransactions = Math.ceil(instructions.length / instructionsPerTx);

  for (let i = 0; i < numTransactions; i++) {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    const setPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: computeUnitPriceMicroLamports,
    });
    let tx = new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: payer.publicKey,
    }).add(setPriorityFeeIx);
    let lowerIndex = i * instructionsPerTx;
    let upperIndex = (i + 1) * instructionsPerTx;
    for (let j = lowerIndex; j < upperIndex; j++) {
      if (instructions[j]) tx.add(instructions[j]);
    }

    const txSize = tx.serialize({
      verifySignatures: false,
    }).length;
    console.log(`Tx number ${i + 1} txSize = ${txSize}`);

    let label = txLabel ?? "";
    if (dryRun) {
      console.log(`\n> Simulating ${label} tx number ${i + 1}...`);
      await runSimulateTransaction(connection, [payer], payer.publicKey, [tx]);
    } else {
      console.log(`>> Sending ${label} transaction number ${i + 1}...`);
      const txHash = await sendAndConfirmTransaction(connection, tx, [
        payer,
      ]).catch((err) => {
        console.error(err);
        throw err;
      });
      console.log(
        `>>> Transaction ${i + 1} ${label} successfully with tx hash: ${txHash}`,
      );
    }
  }
}

/**
 * Modify priority fee in transaction
 * @param tx
 * @param newPriorityFee
 * @returns {boolean} true if priority fee was modified
 **/
export const modifyComputeUnitPriceIx = (
  tx: VersionedTransaction | Transaction,
  newPriorityFee: number,
): boolean => {
  if ("version" in tx) {
    for (let ix of tx.message.compiledInstructions) {
      let programId = tx.message.staticAccountKeys[ix.programIdIndex];
      if (programId && ComputeBudgetProgram.programId.equals(programId)) {
        // need check for data index
        if (ix.data[0] === 3) {
          ix.data = Uint8Array.from(
            ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: newPriorityFee,
            }).data,
          );
          return true;
        }
      }
    }
    // could not inject for VT
  } else {
    for (let ix of tx.instructions) {
      if (ComputeBudgetProgram.programId.equals(ix.programId)) {
        // need check for data index
        if (ix.data[0] === 3) {
          ix.data = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: newPriorityFee,
          }).data;
          return true;
        }
      }
    }

    // inject if none
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: newPriorityFee,
      }),
    );
    return true;
  }

  return false;
};

export interface CliArguments {
  // Config filepath
  config?: string | undefined;
}

export function parseCliArguments(): CliArguments {
  const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
      config: {
        type: "string",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  return values;
}

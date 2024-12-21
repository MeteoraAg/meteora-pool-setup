import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
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
  parseConfigFromCli,
} from ".";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import DLMM, {
  LBCLMM_PROGRAM_IDS,
  deriveCustomizablePermissionlessLbPair,
} from "@meteora-ag/dlmm";
import BN from "bn.js";
import { getMint } from "@solana/spl-token";

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
  const DLMM_PROGRAM_ID = new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"]);

  if (!config.baseMint) {
    throw new Error("Missing baseMint in configuration");
  }
  const baseMint = new PublicKey(config.baseMint);
  const baseMintAccount = await getMint(connection, baseMint);
  const baseDecimals = baseMintAccount.decimals;

  let quoteMint = getQuoteMint(config.quoteSymbol);
  const quoteDecimals = getQuoteDecimals(config.quoteSymbol);

  console.log(`- Using base token mint ${baseMint.toString()}`);
  console.log(`- Using quote token mint ${quoteMint.toString()}`);

  let poolKey: PublicKey;
  [poolKey] = deriveCustomizablePermissionlessLbPair(
    baseMint,
    quoteMint,
    DLMM_PROGRAM_ID,
  );
  console.log(`- Using pool key ${poolKey.toString()}`);

  if (!config.singleBinSeedLiquidity) {
    throw new Error(`Missing DLMM Single bin seed liquidity in configuration`);
  }

  const pair = await DLMM.create(connection, poolKey, {
    cluster: "mainnet-beta",
  });

  const seedAmount = getAmountInLamports(
    config.singleBinSeedLiquidity.seedAmount,
    baseDecimals,
  );
  const priceRounding = config.singleBinSeedLiquidity.priceRounding;
  if (priceRounding != "up" && priceRounding != "down") {
    throw new Error("Invalid selective rounding value. Must be 'up' or 'down'");
  }
  const baseKeypair = safeParseKeypairFromFile(
    config.singleBinSeedLiquidity.basePositionKeypairFilepath,
  );
  const operatorKeypair = safeParseKeypairFromFile(
    config.singleBinSeedLiquidity.operatorKeypairFilepath,
  );
  const basePublickey = baseKeypair.publicKey;
  const price = config.singleBinSeedLiquidity.price;
  const positionOwner = new PublicKey(
    config.singleBinSeedLiquidity.positionOwner,
  );
  const feeOwner = new PublicKey(config.singleBinSeedLiquidity.feeOwner);
  const operator = operatorKeypair.publicKey;
  const lockReleasePoint = new BN(
    config.singleBinSeedLiquidity.lockReleasePoint,
  );

  console.log(`- Using seedAmount in lamports = ${seedAmount}`);
  console.log(`- Using priceRounding = ${priceRounding}`);
  console.log(`- Using price ${price}`);
  console.log(`- Using operator ${operator}`);
  console.log(`- Using positionOwner ${positionOwner}`);
  console.log(`- Using feeOwner ${feeOwner}`);
  console.log(`- Using lockReleasePoint ${lockReleasePoint}`);
  console.log(
    `- Using seedTokenXToPositionOwner ${config.singleBinSeedLiquidity.seedTokenXToPositionOwner}`,
  );

  if (!config.singleBinSeedLiquidity.seedTokenXToPositionOwner) {
    console.log(
      `WARNING: You selected seedTokenXToPositionOwner = false, you should manually send 1 lamport of token X to the position owner account to prove ownership.`,
    );
  }

  const seedLiquidityIxs = await pair.seedLiquiditySingleBin(
    wallet.publicKey,
    basePublickey,
    seedAmount,
    price,
    priceRounding == "up",
    positionOwner,
    feeOwner,
    operator,
    lockReleasePoint,
    config.singleBinSeedLiquidity.seedTokenXToPositionOwner,
  );

  const setCUPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: config.computeUnitPriceMicroLamports,
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer: keypair.publicKey,
    blockhash,
    lastValidBlockHeight,
  })
    .add(setCUPriceIx)
    .add(...seedLiquidityIxs);

  if (config.dryRun) {
    console.log(`\n> Simulating seedLiquiditySingleBin transaction...`);
    await runSimulateTransaction(
      connection,
      [wallet.payer, baseKeypair, operatorKeypair],
      wallet.publicKey,
      [tx],
    );
  } else {
    console.log(`>> Sending seedLiquiditySingleBin transaction...`);
    const txHash = await sendAndConfirmTransaction(connection, tx, [
      wallet.payer,
      baseKeypair,
      operatorKeypair,
    ]).catch((err) => {
      console.error(err);
      throw err;
    });
    console.log(
      `>>> SeedLiquiditySingleBin successfully with tx hash: ${txHash}`,
    );
  }
}

main();

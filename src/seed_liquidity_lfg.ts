import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
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
  generateAmountForBinRange,
  compressBinAmount,
  distributeAmountToCompressedBinsByRatio,
  getPositionCount,
  DEFAULT_ADD_LIQUIDITY_CU,
} from ".";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import DLMM, {
  CompressedBinDepositAmounts,
  LBCLMM_PROGRAM_IDS,
  MAX_BIN_PER_POSITION,
  PositionV2,
  binIdToBinArrayIndex,
  deriveBinArray,
  deriveCustomizablePermissionlessLbPair,
  derivePosition,
  getBinArrayLowerUpperBinId,
  getEstimatedComputeUnitIxWithBuffer,
  getOrCreateATAInstruction,
  getPriceOfBinByBinId,
} from "@meteora-ag/dlmm";
import Decimal from "decimal.js";
import {
  AccountLayout,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";

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
    new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"]),
  );
  console.log(`- Using pool key ${poolKey.toString()}`);

  if (!config.lfgSeedLiquidity) {
    throw new Error(`Missing DLMM LFG seed liquidity in configuration`);
  }

  const pair = await DLMM.create(connection, poolKey, {
    cluster: "mainnet-beta",
  });
  await pair.refetchStates();

  const seedAmount = getAmountInLamports(
    config.lfgSeedLiquidity.seedAmount,
    baseDecimals,
  );
  const curvature = config.lfgSeedLiquidity.curvature;
  const minPrice = config.lfgSeedLiquidity.minPrice;
  const maxPrice = config.lfgSeedLiquidity.maxPrice;
  const baseKeypair = safeParseKeypairFromFile(
    config.lfgSeedLiquidity.basePositionKeypairFilepath,
  );
  const operatorKeypair = safeParseKeypairFromFile(
    config.lfgSeedLiquidity.operatorKeypairFilepath,
  );
  const basePublickey = baseKeypair.publicKey;
  const positionOwner = new PublicKey(config.lfgSeedLiquidity.positionOwner);
  const feeOwner = new PublicKey(config.lfgSeedLiquidity.feeOwner);
  const operator = operatorKeypair.publicKey;
  const lockReleasePoint = new BN(config.lfgSeedLiquidity.lockReleasePoint);

  console.log(`- Using seedAmount in lamports = ${seedAmount}`);
  console.log(`- Using curvature = ${curvature}`);
  console.log(`- Using minPrice ${minPrice}`);
  console.log(`- Using maxPrice ${maxPrice}`);
  console.log(`- Using operator ${operator}`);
  console.log(`- Using positionOwner ${positionOwner}`);
  console.log(`- Using feeOwner ${feeOwner}`);
  console.log(`- Using lockReleasePoint ${lockReleasePoint}`);
  console.log(
    `- Using seedTokenXToPositionOwner ${config.lfgSeedLiquidity.seedTokenXToPositionOwner}`,
  );

  if (!config.lfgSeedLiquidity.seedTokenXToPositionOwner) {
    console.log(
      `WARNING: You selected seedTokenXToPositionOwner = false, you should manually send 1 lamport of token X to the position owner account to prove ownership.`,
    );
  }

  const minPricePerLamport = DLMM.getPricePerLamport(
    baseDecimals,
    quoteDecimals,
    minPrice,
  );
  const maxPricePerLamport = DLMM.getPricePerLamport(
    baseDecimals,
    quoteDecimals,
    maxPrice,
  );

  const minBinId = new BN(
    DLMM.getBinIdFromPrice(minPricePerLamport, pair.lbPair.binStep, false),
  );
  const maxBinId = new BN(
    DLMM.getBinIdFromPrice(maxPricePerLamport, pair.lbPair.binStep, true),
  );

  if (minBinId.toNumber() < pair.lbPair.activeId) {
    throw new Error("minPrice < current pair price");
  }

  if (minBinId.toNumber() > maxBinId.toNumber()) {
    throw new Error("Price range too small");
  }

  const k = 1.0 / curvature;

  const binDepositAmount = generateAmountForBinRange(
    seedAmount,
    pair.lbPair.binStep,
    pair.tokenX.decimal,
    pair.tokenY.decimal,
    minBinId,
    maxBinId,
    k,
  );

  const decompressMultiplier = new BN(10 ** this.tokenX.decimal);

  let { compressedBinAmount, compressionLoss } = compressBinAmount(
    binDepositAmount,
    decompressMultiplier,
  );

  // Distribute loss after compression back to bins based on bin ratio with total deposited amount
  let { newCompressedBinAmount: compressedBinDepositAmount, loss: finalLoss } =
    distributeAmountToCompressedBinsByRatio(
      compressedBinAmount,
      compressionLoss,
      decompressMultiplier,
      new BN(2 ** 32 - 1), // u32
    );

  // This amount will be deposited to the last bin without compression
  const positionCount = getPositionCount(minBinId, maxBinId.sub(new BN(1)));

  const preflightIxs: Array<TransactionInstruction> = [];
  const initializeBinArraysAndPositionIxs: Array<
    Array<TransactionInstruction>
  > = [];
  const addLiquidityIxs: Array<Array<TransactionInstruction>> = [];
  const appendedInitBinArrayIx = new Set();

  const { ataPubKey: userTokenX, ix: createPayerTokenXIx } =
    await getOrCreateATAInstruction(
      provider.connection,
      pair.lbPair.tokenXMint,
      operator,
      wallet.publicKey,
    );

  // create userTokenX account
  createPayerTokenXIx && preflightIxs.push(createPayerTokenXIx);

  const operatorTokenX = getAssociatedTokenAddressSync(
    pair.lbPair.tokenXMint,
    operator,
    true,
  );
  const positionOwnerTokenX = getAssociatedTokenAddressSync(
    pair.lbPair.tokenXMint,
    positionOwner,
    true,
  );

  const positionOwnerTokenXAccount =
    await provider.connection.getAccountInfo(positionOwnerTokenX);
  if (positionOwnerTokenXAccount) {
    const account = AccountLayout.decode(positionOwnerTokenXAccount.data);
    if (account.amount == BigInt(0)) {
      // send 1 lamport to position owner token X to prove ownership
      const transferIx = createTransferInstruction(
        operatorTokenX,
        positionOwnerTokenX,
        wallet.publicKey,
        1,
      );
      preflightIxs.push(transferIx);
    }
  } else {
    const createPositionOwnerTokenXIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      positionOwnerTokenX,
      positionOwner,
      this.lbPair.tokenXMint,
    );
    preflightIxs.push(createPositionOwnerTokenXIx);

    // send 1 lamport to position owner token X to prove ownership
    const transferIx = createTransferInstruction(
      operatorTokenX,
      positionOwnerTokenX,
      wallet.publicKey,
      1,
    );
    preflightIxs.push(transferIx);
  }

  for (let i = 0; i < positionCount.toNumber(); i++) {
    const lowerBinId = minBinId.add(MAX_BIN_PER_POSITION.mul(new BN(i)));
    const upperBinId = lowerBinId.add(MAX_BIN_PER_POSITION).sub(new BN(1));

    const lowerBinArrayIndex = binIdToBinArrayIndex(lowerBinId);
    const upperBinArrayIndex = binIdToBinArrayIndex(upperBinId);

    const [positionPda, _bump] = derivePosition(
      pair.pubkey,
      baseKeypair.publicKey,
      lowerBinId,
      MAX_BIN_PER_POSITION,
      pair.program.programId,
    );

    const [lowerBinArray] = deriveBinArray(
      pair.pubkey,
      lowerBinArrayIndex,
      pair.program.programId,
    );

    const [upperBinArray] = deriveBinArray(
      pair.pubkey,
      upperBinArrayIndex,
      pair.program.programId,
    );

    const accounts = await provider.connection.getMultipleAccountsInfo([
      lowerBinArray,
      upperBinArray,
      positionPda,
    ]);

    let instructions: TransactionInstruction[] = [];

    const lowerBinArrayAccount = accounts[0];
    if (
      !lowerBinArrayAccount &&
      !appendedInitBinArrayIx.has(lowerBinArray.toBase58())
    ) {
      instructions.push(
        await pair.program.methods
          .initializeBinArray(lowerBinArrayIndex)
          .accounts({
            lbPair: pair.pubkey,
            binArray: lowerBinArray,
            funder: wallet.publicKey,
          })
          .instruction(),
      );

      appendedInitBinArrayIx.add(lowerBinArray.toBase58());
    }

    const upperBinArrayAccount = accounts[1];
    if (
      !upperBinArrayAccount &&
      !appendedInitBinArrayIx.has(upperBinArray.toBase58())
    ) {
      instructions.push(
        await pair.program.methods
          .initializeBinArray(upperBinArrayIndex)
          .accounts({
            lbPair: pair.pubkey,
            binArray: upperBinArray,
            funder: wallet.publicKey,
          })
          .instruction(),
      );

      appendedInitBinArrayIx.add(upperBinArray.toBase58());
    }

    const positionAccount = accounts[2];
    if (!positionAccount) {
      instructions.push(
        await pair.program.methods
          .initializePositionByOperator(
            lowerBinId.toNumber(),
            MAX_BIN_PER_POSITION.toNumber(),
            feeOwner,
            lockReleasePoint,
          )
          .accounts({
            payer: wallet.publicKey,
            base: baseKeypair.publicKey,
            position: positionPda,
            lbPair: pair.pubkey,
            owner: positionOwner,
            operator,
            operatorTokenX,
            ownerTokenX: positionOwnerTokenX,
          })
          .instruction(),
      );
    }

    // Initialize bin arrays and initialize position account in 1 tx
    if (instructions.length > 1) {
      instructions.push(
        await getEstimatedComputeUnitIxWithBuffer(
          this.program.provider.connection,
          instructions,
          wallet.publicKey,
        ),
      );
      initializeBinArraysAndPositionIxs.push(instructions);
      instructions = [];
    }

    const positionDeposited =
      positionAccount &&
      pair.program.coder.accounts
        .decode<PositionV2>("positionV2", positionAccount.data)
        .liquidityShares.reduce((total, cur) => total.add(cur), new BN(0))
        .gt(new BN(0));

    if (!positionDeposited) {
      const cappedUpperBinId = Math.min(
        upperBinId.toNumber(),
        maxBinId.toNumber() - 1,
      );

      const bins: CompressedBinDepositAmounts = [];

      for (let i = lowerBinId.toNumber(); i <= cappedUpperBinId; i++) {
        bins.push({
          binId: i,
          amount: compressedBinDepositAmount.get(i).toNumber(),
        });
      }

      instructions.push(
        await pair.program.methods
          .addLiquidityOneSidePrecise({
            bins,
            decompressMultiplier,
          })
          .accounts({
            position: positionPda,
            lbPair: pair.pubkey,
            binArrayBitmapExtension: pair.binArrayBitmapExtension
              ? pair.binArrayBitmapExtension.publicKey
              : pair.program.programId,
            userToken: userTokenX,
            reserve: pair.lbPair.reserveX,
            tokenMint: pair.lbPair.tokenXMint,
            binArrayLower: lowerBinArray,
            binArrayUpper: upperBinArray,
            sender: operator,
          })
          .instruction(),
      );

      // Last position
      if (i + 1 >= positionCount.toNumber() && !finalLoss.isZero()) {
        instructions.push(
          await pair.program.methods
            .addLiquidityOneSide({
              amount: finalLoss,
              activeId: pair.lbPair.activeId,
              maxActiveBinSlippage: 0,
              binLiquidityDist: [
                {
                  binId: cappedUpperBinId,
                  weight: 1,
                },
              ],
            })
            .accounts({
              position: positionPda,
              lbPair: pair.pubkey,
              binArrayBitmapExtension: pair.binArrayBitmapExtension
                ? pair.binArrayBitmapExtension.publicKey
                : pair.program.programId,
              userToken: userTokenX,
              reserve: pair.lbPair.reserveX,
              tokenMint: pair.lbPair.tokenXMint,
              binArrayLower: lowerBinArray,
              binArrayUpper: upperBinArray,
              sender: operator,
            })
            .instruction(),
        );
      }

      addLiquidityIxs.push([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: DEFAULT_ADD_LIQUIDITY_CU,
        }),
        ...instructions,
      ]);
    }
  }

  // run preflight ixs
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: wallet.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...preflightIxs);

  const signers = [wallet.payer];

  if (config.dryRun) {
    throw new Error(
      "dryRun is not supported for this script, please set dryRun config to false",
    );
  }

  console.log(`>> Running preflight instructions...`);
  try {
    console.log(`>> Sending preflight transaction...`);
    const txHash = await sendAndConfirmTransaction(connection, tx, signers);
    console.log(`>>> Preflight successfully with tx hash: ${txHash}`);
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }

  console.log(`>> Running initializeBinArraysAndPosition instructions...`);
  // Initialize all bin array and position, transaction order can be in sequence or not
  {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const transactions: Array<Promise<string>> = [];

    for (const groupIx of initializeBinArraysAndPositionIxs) {
      const tx = new Transaction({
        feePayer: wallet.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(...groupIx);

      const signers = [wallet.payer, baseKeypair];

      transactions.push(sendAndConfirmTransaction(connection, tx, signers));
    }

    await Promise.all(transactions)
      .then((txs) => {
        txs.map(console.log);
      })
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }
  console.log(`>>> Finished initializeBinArraysAndPosition instructions!`);

  console.log(`>> Running addLiquidity instructions...`);
  {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const transactions: Array<Promise<string>> = [];

    // Deposit to positions created in above step. The add liquidity order can be in sequence or not.
    for (const groupIx of addLiquidityIxs) {
      const tx = new Transaction({
        feePayer: wallet.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(...groupIx);

      const signers = [wallet.payer];

      transactions.push(sendAndConfirmTransaction(connection, tx, signers));
    }

    await Promise.all(transactions)
      .then((txs) => {
        txs.map(console.log);
      })
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }
  console.log(`>>> Finished addLiquidity instructions!`);
}

main();

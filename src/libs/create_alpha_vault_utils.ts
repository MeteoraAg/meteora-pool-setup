import { CustomizableFcfsVaultParams, CustomizableProrataVaultParams, IDL, PoolType, SEED } from "@meteora-ag/alpha-vault";
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { ALPHA_VAULT_PROGRAM_IDS } from "./constants";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { getAlphaVaultWhitelistMode, getAmountInLamports, runSimulateTransaction } from "./utils";
import { FcfsAlphaVaultConfig, ProrataAlphaVaultConfig } from "./config";
import { BN } from "bn.js";

export async function createFcfsAlphaVault(
  connection: Connection,
  wallet: Wallet,
  poolType: PoolType,
  poolAddress: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  quoteDecimals: number,
  params: FcfsAlphaVaultConfig,
  dryRun: boolean,
  computeUnitPriceMicroLamports: number,
  opts?: {
    alphaVaultProgramId: PublicKey;
  },
): Promise<void> {
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

  const initAlphaVaultTx = (await createCustomizableFcfsVault(
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
    computeUnitPriceMicroLamports,
    opts
  )) as Transaction;

  if (dryRun) {
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

export async function createProrataAlphaVault(
  connection: Connection,
  wallet: Wallet,
  poolType: PoolType,
  poolAddress: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  quoteDecimals: number,
  params: ProrataAlphaVaultConfig,
  dryRun: boolean,
  computeUnitPriceMicroLamports: number,
  opts?: {
    alphaVaultProgramId: PublicKey;
  },
) {
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

  const initAlphaVaultTx = (await createCustomizableProrataVault(
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
    computeUnitPriceMicroLamports,
    opts
  )) as Transaction;

  if (dryRun) {
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

async function createCustomizableFcfsVault(
  connection: Connection,
  vaultParam: CustomizableFcfsVaultParams,
  owner: PublicKey,
  computeUnitPriceMicroLamports: number,
  opts?: {
    alphaVaultProgramId: PublicKey
  }
) {
  const alphaVaultProgramId = opts?.alphaVaultProgramId || new PublicKey(ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]);
  const {
    poolAddress,
    poolType,
    baseMint,
    quoteMint,
    depositingPoint,
    startVestingPoint,
    endVestingPoint,
    maxDepositingCap,
    individualDepositingCap,
    escrowFee,
    whitelistMode,
  } = vaultParam;

  const [alphaVaultPubkey] = deriveAlphaVault(
    owner,
    poolAddress,
    alphaVaultProgramId,
  );

  const provider = new AnchorProvider(
    connection,
    {} as any,
    AnchorProvider.defaultOptions(),
  );
  const program = new Program(IDL, alphaVaultProgramId, provider);

  const createTx = await program.methods
    .initializeFcfsVault({
      poolType,
      baseMint,
      quoteMint,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxDepositingCap,
      individualDepositingCap,
      escrowFee,
      whitelistMode,
    })
    .accounts({
      base: owner,
      vault: alphaVaultPubkey,
      pool: poolAddress,
      funder: owner,
      program: alphaVaultProgramId,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const setPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: computeUnitPriceMicroLamports,
  });
  createTx.add(setPriorityFeeIx);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  return new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: owner,
  }).add(createTx);
}

async function createCustomizableProrataVault(
  connection: Connection,
  vaultParam: CustomizableProrataVaultParams,
  owner: PublicKey,
  computeUnitPriceMicroLamports: number,
  opts?: {
    alphaVaultProgramId: PublicKey
  }
) {
  const alphaVaultProgramId = opts?.alphaVaultProgramId || new PublicKey(ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]);
  const {
    poolAddress,
    poolType,
    baseMint,
    quoteMint,
    depositingPoint,
    startVestingPoint,
    endVestingPoint,
    maxBuyingCap,
    escrowFee,
    whitelistMode,
  } = vaultParam;

  const [alphaVaultPubkey] = deriveAlphaVault(
    owner,
    poolAddress,
    alphaVaultProgramId,
  );

  const provider = new AnchorProvider(
    connection,
    {} as any,
    AnchorProvider.defaultOptions(),
  );
  const program = new Program(IDL, alphaVaultProgramId, provider);

  const createTx = await program.methods
    .initializeProrataVault({
      poolType,
      baseMint,
      quoteMint,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxBuyingCap,
      escrowFee,
      whitelistMode,
    })
    .accounts({
      base: owner,
      vault: alphaVaultPubkey,
      pool: poolAddress,
      funder: owner,
      program: alphaVaultProgramId,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const setPriorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: computeUnitPriceMicroLamports,
  });
  createTx.add(setPriorityFeeIx);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  return new Transaction({
    blockhash,
    lastValidBlockHeight,
    feePayer: owner,
  }).add(createTx);
}

export function deriveAlphaVault(
  base: PublicKey,
  lbPair: PublicKey,
  programId: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.vault), base.toBuffer(), lbPair.toBuffer()],
    programId,
  );
}
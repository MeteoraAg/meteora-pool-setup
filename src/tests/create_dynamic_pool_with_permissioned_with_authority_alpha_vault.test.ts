import { Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { SOL_TOKEN_MINT } from "../libs/constants";
import {
  createPermissionlessDynamicPool,
  toAlphaVaulSdkPoolType,
} from "../index";
import { web3 } from "@coral-xyz/anchor";
import {
  ActivationTypeConfig,
  AlphaVaultTypeConfig,
  MeteoraConfig,
  PoolTypeConfig,
  WhitelistModeConfig,
} from "../libs/config";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  connection,
  payerKeypair,
  rpcUrl,
  keypairFilePath,
  payerWallet,
  DYNAMIC_AMM_PROGRAM_ID,
  ALPHA_VAULT_PROGRAM_ID,
} from "./setup";
import { deriveCustomizablePermissionlessConstantProductPoolAddress } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils";
import {
  createAlphaVaultInstance,
  createPermissionedAlphaVaultWithAuthority,
  deriveAlphaVault,
} from "../libs/create_alpha_vault_utils";
import { BN } from "bn.js";
import { PermissionWithAuthority } from "@meteora-ag/alpha-vault";

describe("Test create dynamic pool with permissioned authority fcfs alpha vault", () => {
  const WEN_DECIMALS = 5;
  const USDC_DECIMALS = 6;
  const WEN_SUPPLY = 100_000_000;
  const USDC_SUPPLY = 100_000_000;
  const dryRun = false;
  const computeUnitPriceMicroLamports = 100000;

  let WEN: PublicKey;
  let USDC: PublicKey;
  let userWEN: web3.PublicKey;
  let userUSDC: web3.PublicKey;

  beforeAll(async () => {
    WEN = await createMint(
      connection,
      payerKeypair,
      payerKeypair.publicKey,
      null,
      WEN_DECIMALS,
      Keypair.generate(),
      undefined,
      TOKEN_PROGRAM_ID,
    );

    USDC = await createMint(
      connection,
      payerKeypair,
      payerKeypair.publicKey,
      null,
      USDC_DECIMALS,
      Keypair.generate(),
      undefined,
      TOKEN_PROGRAM_ID,
    );

    const userWenInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payerKeypair,
      WEN,
      payerKeypair.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    userWEN = userWenInfo.address;

    const userUsdcInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payerKeypair,
      USDC,
      payerKeypair.publicKey,
      false,
      "confirmed",
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    userUSDC = userUsdcInfo.address;

    await mintTo(
      connection,
      payerKeypair,
      WEN,
      userWEN,
      payerKeypair.publicKey,
      WEN_SUPPLY * 10 ** WEN_DECIMALS,
      [],
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );

    await mintTo(
      connection,
      payerKeypair,
      USDC,
      userUSDC,
      payerKeypair.publicKey,
      USDC_SUPPLY * 10 ** USDC_DECIMALS,
      [],
      {
        commitment: "confirmed",
      },
      TOKEN_PROGRAM_ID,
    );
  });

  it("Happy case", async () => {
    const currentSlot = await connection.getSlot({
      commitment: "confirmed",
    });
    const activationPoint = currentSlot + 30;
    const depositingPoint = currentSlot;
    const startVestingPoint = currentSlot + 50;
    const endVestingPoint = currentSlot + 60;

    // 1. Create pool
    const config: MeteoraConfig = {
      dryRun: false,
      rpcUrl,
      keypairFilePath,
      computeUnitPriceMicroLamports: 100000,
      createBaseToken: null,
      baseMint: WEN.toString(),
      quoteSymbol: "SOL",
      dynamicAmm: {
        baseAmount: 1000,
        quoteAmount: 1,
        tradeFeeNumerator: 2500,
        activationType: ActivationTypeConfig.Slot,
        activationPoint,
        hasAlphaVault: true,
      },
      dlmm: null,
      alphaVault: {
        poolType: PoolTypeConfig.Dynamic,
        alphaVaultType: AlphaVaultTypeConfig.Fcfs,
        depositingPoint,
        startVestingPoint,
        endVestingPoint,
        maxDepositCap: 5,
        individualDepositingCap: 0.01,
        escrowFee: 0,
        whitelistMode: WhitelistModeConfig.PermissionedWithAuthority,
      },
      lockLiquidity: null,
      lfgSeedLiquidity: null,
      singleBinSeedLiquidity: null,
    };

    // 1. Create pool
    await createPermissionlessDynamicPool(
      config,
      connection,
      payerWallet,
      WEN,
      SOL_TOKEN_MINT,
      {
        programId: DYNAMIC_AMM_PROGRAM_ID,
      },
    );

    const alphaVaultType = config.alphaVault.alphaVaultType;
    const poolType = toAlphaVaulSdkPoolType(config.alphaVault.poolType);
    const poolAddress =
      deriveCustomizablePermissionlessConstantProductPoolAddress(
        WEN,
        SOL_TOKEN_MINT,
        DYNAMIC_AMM_PROGRAM_ID,
      );
    const alphaVaultConfig = config.alphaVault;

    // Generate whitelist wallets
    const whitelistWallets: Array<Keypair> = [];
    for (let i = 0; i < 12; i++) {
      const wallet = Keypair.generate();
      whitelistWallets.push(wallet);
      await connection.requestAirdrop(wallet.publicKey, 10 * 10 ** 9);
    }

    const whitelistWallet_1 = whitelistWallets[0];

    const whitelistList = whitelistWallets.map((keypair) => {
      return {
        address: keypair.publicKey,
        maxAmount: new BN(1 * 10 ** 9),
      };
    });

    // 2. Create permissioned alpha vault
    await createPermissionedAlphaVaultWithAuthority(
      connection,
      payerWallet,
      alphaVaultType,
      poolType,
      poolAddress,
      WEN,
      SOL_TOKEN_MINT,
      9,
      alphaVaultConfig,
      whitelistList,
      dryRun,
      computeUnitPriceMicroLamports,
      {
        alphaVaultProgramId: ALPHA_VAULT_PROGRAM_ID,
      },
    );

    const [alphaVaultPubkey] = deriveAlphaVault(
      payerWallet.publicKey,
      poolAddress,
      ALPHA_VAULT_PROGRAM_ID,
    );

    const alphaVault = await createAlphaVaultInstance(
      connection,
      ALPHA_VAULT_PROGRAM_ID,
      alphaVaultPubkey,
    );

    expect(alphaVault.vault.whitelistMode).toEqual(PermissionWithAuthority);

    {
      const depositAmount = new BN(5 * 10 ** 8);
      const depositTx = await alphaVault.deposit(
        depositAmount,
        whitelistWallet_1.publicKey,
      );

      const depositTxHash = await sendAndConfirmTransaction(
        connection,
        depositTx,
        [whitelistWallet_1],
      ).catch((e) => {
        console.error(e);
        throw e;
      });

      const whitelistWalletEscrow_1 = await alphaVault.getEscrow(
        whitelistWallet_1.publicKey,
      );
      expect(whitelistWalletEscrow_1.totalDeposit.toString()).toEqual(
        depositAmount.toString(),
      );
    }

    {
      const depositAmount = new BN(5 * 10 ** 8);
      const depositTx = await alphaVault.deposit(
        depositAmount,
        whitelistWallet_1.publicKey,
      );

      const depositTxHash = await sendAndConfirmTransaction(
        connection,
        depositTx,
        [whitelistWallet_1],
      ).catch((e) => {
        console.error(e);
        throw e;
      });

      const whitelistWalletEscrow_1 = await alphaVault.getEscrow(
        whitelistWallet_1.publicKey,
      );
      expect(whitelistWalletEscrow_1.totalDeposit.toString()).toEqual(
        (depositAmount * 2).toString(),
      );
    }

    // deposit exceed cap
    {
      const depositAmount = new BN(1 * 10 ** 8);
      const depositTx = await alphaVault.deposit(
        depositAmount,
        whitelistWallet_1.publicKey,
      );

      await expect(
        sendAndConfirmTransaction(connection, depositTx, [whitelistWallet_1]),
      ).rejects.toThrow();
    }
  });
});

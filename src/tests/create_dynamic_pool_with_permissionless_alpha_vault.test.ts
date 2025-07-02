import { web3 } from "@coral-xyz/anchor"
import AmmImpl from "@mercurial-finance/dynamic-amm-sdk"
import { deriveCustomizablePermissionlessConstantProductPoolAddress } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import AlphaVault, {
	PoolType,
	VaultMode,
	WhitelistMode
} from "@meteora-ag/alpha-vault"
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	TOKEN_PROGRAM_ID,
	createMint,
	getOrCreateAssociatedTokenAccount,
	mintTo
} from "@solana/spl-token"
import { Keypair, PublicKey } from "@solana/web3.js"
import { createPermissionlessDynamicPool } from "../index"
import {
	ActivationTypeConfig,
	AlphaVaultTypeConfig,
	FcfsAlphaVaultConfig,
	MeteoraConfig,
	PoolTypeConfig,
	ProrataAlphaVaultConfig,
	WhitelistModeConfig
} from "../libs/config"
import { SOL_TOKEN_MINT } from "../libs/constants"
import {
	createFcfsAlphaVault,
	createProrataAlphaVault,
	deriveAlphaVault
} from "../libs/create_alpha_vault_utils"
import {
	ALPHA_VAULT_PROGRAM_ID,
	DYNAMIC_AMM_PROGRAM_ID,
	connection,
	keypairFilePath,
	payerKeypair,
	payerWallet,
	rpcUrl
} from "./setup"

describe("Test create permissonless dynamic pool with fcfs alpha vault", () => {
	const WEN_DECIMALS = 5
	const USDC_DECIMALS = 6
	const WEN_SUPPLY = 100_000_000
	const USDC_SUPPLY = 100_000_000
	const dryRun = false
	const computeUnitPriceMicroLamports = 100000

	let WEN: PublicKey
	let USDC: PublicKey
	let userWEN: web3.PublicKey
	let userUSDC: web3.PublicKey

	beforeAll(async () => {
		WEN = await createMint(
			connection,
			payerKeypair,
			payerKeypair.publicKey,
			null,
			WEN_DECIMALS,
			Keypair.generate(),
			undefined,
			TOKEN_PROGRAM_ID
		)

		USDC = await createMint(
			connection,
			payerKeypair,
			payerKeypair.publicKey,
			null,
			USDC_DECIMALS,
			Keypair.generate(),
			undefined,
			TOKEN_PROGRAM_ID
		)

		const userWenInfo = await getOrCreateAssociatedTokenAccount(
			connection,
			payerKeypair,
			WEN,
			payerKeypair.publicKey,
			false,
			"confirmed",
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		)
		userWEN = userWenInfo.address

		const userUsdcInfo = await getOrCreateAssociatedTokenAccount(
			connection,
			payerKeypair,
			USDC,
			payerKeypair.publicKey,
			false,
			"confirmed",
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		)
		userUSDC = userUsdcInfo.address

		await mintTo(
			connection,
			payerKeypair,
			WEN,
			userWEN,
			payerKeypair.publicKey,
			WEN_SUPPLY * 10 ** WEN_DECIMALS,
			[],
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID
		)

		await mintTo(
			connection,
			payerKeypair,
			USDC,
			userUSDC,
			payerKeypair.publicKey,
			USDC_SUPPLY * 10 ** USDC_DECIMALS,
			[],
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID
		)
	})

	it("Test create permissonless dynamic pool with fcfs alpha vault", async () => {
		const currentSlot = await connection.getSlot({
			commitment: "confirmed"
		})
		const activationPoint = currentSlot + 30
		const depositingPoint = currentSlot
		const startVestingPoint = currentSlot + 50
		const endVestingPoint = currentSlot + 60

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
				activationPoint: activationPoint,
				hasAlphaVault: true
			},
			dlmm: null,
			alphaVault: {
				poolType: PoolTypeConfig.Dynamic,
				alphaVaultType: AlphaVaultTypeConfig.Fcfs,
				depositingPoint,
				startVestingPoint,
				endVestingPoint,
				maxDepositCap: 0.5,
				individualDepositingCap: 0.01,
				escrowFee: 0,
				whitelistMode: WhitelistModeConfig.Permissionless
			},
			lockLiquidity: null,
			lfgSeedLiquidity: null,
			singleBinSeedLiquidity: null,
			dynamicAmmV2: null,
			setDlmmPoolStatus: null,
			m3m3: null
		}

		await createPermissionlessDynamicPool(
			config,
			connection,
			payerWallet,
			WEN,
			SOL_TOKEN_MINT,
			{
				programId: DYNAMIC_AMM_PROGRAM_ID
			}
		)

		const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
			WEN,
			SOL_TOKEN_MINT,
			DYNAMIC_AMM_PROGRAM_ID
		)

		const pool = await AmmImpl.create(connection, poolKey, {
			programId: DYNAMIC_AMM_PROGRAM_ID.toString()
		})

		// 2. Create alpha vault
		await createFcfsAlphaVault(
			connection,
			payerWallet,
			PoolType.DAMM,
			poolKey,
			WEN,
			SOL_TOKEN_MINT,
			9,
			config.alphaVault as FcfsAlphaVaultConfig,
			dryRun,
			computeUnitPriceMicroLamports,
			{
				alphaVaultProgramId: ALPHA_VAULT_PROGRAM_ID
			}
		)

		const [alphaVaultPubkey] = deriveAlphaVault(
			payerKeypair.publicKey,
			poolKey,
			ALPHA_VAULT_PROGRAM_ID
		)

		// @ts-expect-error: Connection version difference
		const alphaVault = await AlphaVault.create(connection, alphaVaultPubkey)
		expect(alphaVault.vault.baseMint).toEqual(WEN)
		expect(alphaVault.vault.quoteMint).toEqual(SOL_TOKEN_MINT)
		expect(alphaVault.vault.poolType).toEqual(PoolType.DAMM)
		expect(alphaVault.vault.vaultMode).toEqual(VaultMode.FCFS)
		expect(alphaVault.vault.whitelistMode).toEqual(WhitelistMode.Permissionless)
	})
})

describe("Test create permissonless dynamic pool with prorata alpha vault", () => {
	const WEN_DECIMALS = 5
	const USDC_DECIMALS = 6
	const WEN_SUPPLY = 100_000_000
	const USDC_SUPPLY = 100_000_000
	const dryRun = false
	const computeUnitPriceMicroLamports = 100000

	let WEN: PublicKey
	let USDC: PublicKey
	let userWEN: web3.PublicKey
	let userUSDC: web3.PublicKey

	beforeAll(async () => {
		WEN = await createMint(
			connection,
			payerKeypair,
			payerKeypair.publicKey,
			null,
			WEN_DECIMALS,
			Keypair.generate(),
			undefined,
			TOKEN_PROGRAM_ID
		)

		USDC = await createMint(
			connection,
			payerKeypair,
			payerKeypair.publicKey,
			null,
			USDC_DECIMALS,
			Keypair.generate(),
			undefined,
			TOKEN_PROGRAM_ID
		)

		const userWenInfo = await getOrCreateAssociatedTokenAccount(
			connection,
			payerKeypair,
			WEN,
			payerKeypair.publicKey,
			false,
			"confirmed",
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		)
		userWEN = userWenInfo.address

		const userUsdcInfo = await getOrCreateAssociatedTokenAccount(
			connection,
			payerKeypair,
			USDC,
			payerKeypair.publicKey,
			false,
			"confirmed",
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		)
		userUSDC = userUsdcInfo.address

		await mintTo(
			connection,
			payerKeypair,
			WEN,
			userWEN,
			payerKeypair.publicKey,
			WEN_SUPPLY * 10 ** WEN_DECIMALS,
			[],
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID
		)

		await mintTo(
			connection,
			payerKeypair,
			USDC,
			userUSDC,
			payerKeypair.publicKey,
			USDC_SUPPLY * 10 ** USDC_DECIMALS,
			[],
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID
		)
	})

	it("Test create permissonless dynamic pool with prorata alpha vault", async () => {
		const currentSlot = await connection.getSlot({
			commitment: "confirmed"
		})
		const activationPoint = currentSlot + 30
		const depositingPoint = currentSlot
		const startVestingPoint = currentSlot + 40
		const endVestingPoint = currentSlot + 60

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
				activationPoint: activationPoint,
				hasAlphaVault: true
			},
			dlmm: null,
			alphaVault: {
				poolType: PoolTypeConfig.Dynamic,
				alphaVaultType: AlphaVaultTypeConfig.Prorata,
				depositingPoint,
				startVestingPoint,
				endVestingPoint,
				maxBuyingCap: 10,
				escrowFee: 0,
				whitelistMode: WhitelistModeConfig.Permissionless
			},
			lockLiquidity: null,
			lfgSeedLiquidity: null,
			singleBinSeedLiquidity: null,
			m3m3: null,
			setDlmmPoolStatus: null,
			dynamicAmmV2: null
		}

		await createPermissionlessDynamicPool(
			config,
			connection,
			payerWallet,
			WEN,
			SOL_TOKEN_MINT,
			{
				programId: DYNAMIC_AMM_PROGRAM_ID
			}
		)

		const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
			WEN,
			SOL_TOKEN_MINT,
			DYNAMIC_AMM_PROGRAM_ID
		)

		const pool = await AmmImpl.create(connection, poolKey, {
			programId: DYNAMIC_AMM_PROGRAM_ID.toString()
		})

		// 2. Create alpha vault
		await createProrataAlphaVault(
			connection,
			payerWallet,
			PoolType.DAMM,
			poolKey,
			WEN,
			SOL_TOKEN_MINT,
			9,
			config.alphaVault as ProrataAlphaVaultConfig,
			dryRun,
			computeUnitPriceMicroLamports,
			{
				alphaVaultProgramId: ALPHA_VAULT_PROGRAM_ID
			}
		)

		const [alphaVaultPubkey] = deriveAlphaVault(
			payerKeypair.publicKey,
			poolKey,
			ALPHA_VAULT_PROGRAM_ID
		)

		// @ts-expect-error: Connection version difference
		const alphaVault = await AlphaVault.create(connection, alphaVaultPubkey)
		expect(alphaVault.vault.baseMint).toEqual(WEN)
		expect(alphaVault.vault.quoteMint).toEqual(SOL_TOKEN_MINT)
		expect(alphaVault.vault.poolType).toEqual(PoolType.DAMM)
		expect(alphaVault.vault.vaultMode).toEqual(VaultMode.PRORATA)
		expect(alphaVault.vault.whitelistMode).toEqual(WhitelistMode.Permissionless)
	})
})

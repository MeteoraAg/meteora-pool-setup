import { web3 } from "@coral-xyz/anchor"
import { deriveCustomizablePermissionlessConstantProductPoolAddress } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import AlphaVault, { PermissionWithMerkleProof } from "@meteora-ag/alpha-vault"
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	TOKEN_PROGRAM_ID,
	createMint,
	getOrCreateAssociatedTokenAccount,
	mintTo
} from "@solana/spl-token"
import { Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import { BN } from "bn.js"
import { createPermissionlessDynamicPool, toAlphaVaulSdkPoolType } from "../index"
import {
	ActivationTypeConfig,
	AlphaVaultTypeConfig,
	MeteoraConfig,
	PoolTypeConfig,
	WhitelistModeConfig
} from "../libs/config"
import { SOL_TOKEN_MINT } from "../libs/constants"
import {
	createPermissionedAlphaVaultWithMerkleProof,
	deriveAlphaVault,
	deriveMerkleRootConfig
} from "../libs/create_alpha_vault_utils"
import { createMerkleTree } from "../libs/merkle_tree"
import {
	ALPHA_VAULT_PROGRAM_ID,
	DYNAMIC_AMM_PROGRAM_ID,
	connection,
	keypairFilePath,
	payerKeypair,
	payerWallet,
	rpcUrl
} from "./setup"

describe("Test create dynamic pool with permissioned with merkle proof fcfs alpha vault", () => {
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

	it("Happy case", async () => {
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
				activationPoint,
				hasAlphaVault: true
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
				whitelistMode: WhitelistModeConfig.PermissionedWithMerkleProof
			},
			lockLiquidity: null,
			lfgSeedLiquidity: null,
			singleBinSeedLiquidity: null,
			dynamicAmmV2: null,
			setDlmmPoolStatus: null,
			m3m3: null
		}

		// 1. Create pool
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

		const alphaVaultType = config.alphaVault.alphaVaultType
		const poolType = toAlphaVaulSdkPoolType(config.alphaVault.poolType)
		const poolAddress = deriveCustomizablePermissionlessConstantProductPoolAddress(
			WEN,
			SOL_TOKEN_MINT,
			DYNAMIC_AMM_PROGRAM_ID
		)
		const alphaVaultConfig = config.alphaVault

		// Generate whitelist wallets
		const whitelistWallet_1 = Keypair.generate()
		const whitelistWallet_2 = Keypair.generate()
		await connection.requestAirdrop(whitelistWallet_1.publicKey, 10 * 10 ** 9)
		await connection.requestAirdrop(whitelistWallet_2.publicKey, 10 * 10 ** 9)

		const whitelistWallet_1_maxAmount = new BN(1 * 10 ** 9)
		const whitelistWallet_2_maxAmount = new BN(5 * 10 ** 9)

		const whitelistList = [
			{
				address: whitelistWallet_1.publicKey,
				maxAmount: whitelistWallet_1_maxAmount
			},
			{
				address: whitelistWallet_2.publicKey,
				maxAmount: whitelistWallet_2_maxAmount
			}
		]

		// 2. Create permissioned alpha vault
		await createPermissionedAlphaVaultWithMerkleProof(
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
				alphaVaultProgramId: ALPHA_VAULT_PROGRAM_ID
			}
		)

		const [alphaVaultPubkey] = deriveAlphaVault(
			payerWallet.publicKey,
			poolAddress,
			ALPHA_VAULT_PROGRAM_ID
		)

		// @ts-expect-error: Connection version difference
		const alphaVault = await AlphaVault.create(connection, alphaVaultPubkey, {
			cluster: "localhost"
		})

		expect(alphaVault.vault.whitelistMode).toEqual(PermissionWithMerkleProof)

		// 3. Create merkle proof
		const tree = await createMerkleTree(whitelistList)

		const [merkleRootConfig] = deriveMerkleRootConfig(
			alphaVault.pubkey,
			new BN(0),
			ALPHA_VAULT_PROGRAM_ID
		)

		const proof = tree
			.getProof(whitelistWallet_1.publicKey, whitelistWallet_1_maxAmount)
			.map((buffer) => {
				return Array.from(new Uint8Array(buffer))
			})

		const depositProof = {
			merkleRootConfig,
			maxCap: whitelistWallet_1_maxAmount,
			proof
		}

		// 4. Deposit
		{
			const depositAmount = new BN(5 * 10 ** 8)
			const depositTx = await alphaVault.deposit(
				depositAmount,
				whitelistWallet_1.publicKey,
				depositProof
			)

			// @ts-expect-error: Transaction version difference
			await sendAndConfirmTransaction(connection, depositTx, [
				whitelistWallet_1
			]).catch((e) => {
				console.error(e)
				throw e
			})

			const whitelistWalletEscrow_1 = await alphaVault.getEscrow(
				whitelistWallet_1.publicKey
			)
			expect(whitelistWalletEscrow_1.totalDeposit.toString()).toEqual(
				depositAmount.toString()
			)
		}

		{
			const depositAmount = new BN(5 * 10 ** 8)
			const depositTx = await alphaVault.deposit(
				depositAmount,
				whitelistWallet_1.publicKey,
				depositProof
			)

			// @ts-expect-error: Transaction version difference
			await sendAndConfirmTransaction(connection, depositTx, [
				whitelistWallet_1
			]).catch((e) => {
				console.error(e)
				throw e
			})

			const whitelistWalletEscrow_1 = await alphaVault.getEscrow(
				whitelistWallet_1.publicKey
			)
			expect(whitelistWalletEscrow_1.totalDeposit.toString()).toEqual(
				depositAmount.muln(2).toString()
			)
		}

		// deposit exceed cap
		{
			const depositAmount = new BN(1 * 10 ** 8)
			const depositTx = await alphaVault.deposit(
				depositAmount,
				whitelistWallet_1.publicKey,
				depositProof
			)

			await expect(
				// @ts-expect-error: Transaction version difference
				sendAndConfirmTransaction(connection, depositTx, [whitelistWallet_1])
			).rejects.toThrow()
		}
	})
})

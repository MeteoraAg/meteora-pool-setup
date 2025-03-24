import AlphaVault, {
	CustomizableFcfsVaultParams,
	CustomizableProrataVaultParams,
	IDL,
	PoolType,
	SEED,
	VaultMode,
	WalletDepositCap
} from "@meteora-ag/alpha-vault"
import {
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	sendAndConfirmTransaction
} from "@solana/web3.js"
import {
	ALPHA_VAULT_PROGRAM_IDS,
	MAX_INSTRUCTIONS_PER_STAKE_ESCROW_ACCOUNTS_CREATED
} from "./constants"
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor"
import {
	getAlphaVaultWhitelistMode,
	getAmountInLamports,
	handleSendTxs,
	modifyComputeUnitPriceIx,
	runSimulateTransaction
} from "./utils"
import {
	AlphaVaultTypeConfig,
	FcfsAlphaVaultConfig,
	ProrataAlphaVaultConfig,
	WhitelistModeConfig
} from "./config"
import { BN } from "bn.js"

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
		alphaVaultProgramId: PublicKey
	}
): Promise<void> {
	let maxDepositingCap = getAmountInLamports(params.maxDepositCap, quoteDecimals)
	let individualDepositingCap = getAmountInLamports(
		params.individualDepositingCap,
		quoteDecimals
	)
	let escrowFee = getAmountInLamports(params.escrowFee, quoteDecimals)
	let whitelistMode = getAlphaVaultWhitelistMode(params.whitelistMode)

	console.log(`\n> Initializing FcfsAlphaVault...`)
	console.log(`- Using poolType: ${poolType}`)
	console.log(`- Using poolMint ${poolAddress}`)
	console.log(`- Using baseMint ${baseMint}`)
	console.log(`- Using quoteMint ${quoteMint}`)
	console.log(`- Using depositingPoint ${params.depositingPoint}`)
	console.log(`- Using startVestingPoint ${params.startVestingPoint}`)
	console.log(`- Using endVestingPoint ${params.endVestingPoint}`)
	console.log(
		`- Using maxDepositingCap ${params.maxDepositCap}. In lamports ${maxDepositingCap}`
	)
	console.log(
		`- Using individualDepositingCap ${params.individualDepositingCap}. In lamports ${individualDepositingCap}`
	)
	console.log(`- Using escrowFee ${params.escrowFee}. In lamports ${escrowFee}`)
	console.log(
		`- Using whitelistMode ${params.whitelistMode}. In value ${whitelistMode}`
	)

	const alphaVaultProgramId =
		opts?.alphaVaultProgramId.toBase58() ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	let cluster = ""

	switch (alphaVaultProgramId) {
		case ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]:
			cluster = "mainnet-beta"
			break
		case ALPHA_VAULT_PROGRAM_IDS["devnet"]:
			cluster = "devnet"
			break
		case ALPHA_VAULT_PROGRAM_IDS["localhost"]:
			cluster = "localhost"
			break
		default:
			throw new Error(`Invalid alpha vault program id ${alphaVaultProgramId}`)
	}

	const initAlphaVaultTx = (await AlphaVault.createCustomizableFcfsVault(
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
			whitelistMode
		},
		wallet.publicKey,
		{
			cluster
		}
	)) as Transaction

	modifyComputeUnitPriceIx(initAlphaVaultTx, computeUnitPriceMicroLamports)

	if (dryRun) {
		console.log(`\n> Simulating init alpha vault tx...`)
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
			initAlphaVaultTx
		])
	} else {
		console.log(`>> Sending init alpha vault transaction...`)
		const initAlphaVaulTxHash = await sendAndConfirmTransaction(
			connection,
			initAlphaVaultTx,
			[wallet.payer]
		).catch((err) => {
			console.error(err)
			throw err
		})
		console.log(
			`>>> Alpha vault initialized successfully with tx hash: ${initAlphaVaulTxHash}`
		)
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
		alphaVaultProgramId: PublicKey
	}
) {
	let maxBuyingCap = getAmountInLamports(params.maxBuyingCap, quoteDecimals)
	let escrowFee = getAmountInLamports(params.escrowFee, quoteDecimals)
	let whitelistMode = getAlphaVaultWhitelistMode(params.whitelistMode)

	console.log(`\n> Initializing ProrataAlphaVault...`)
	console.log(`- Using poolType: ${poolType}`)
	console.log(`- Using poolMint ${poolAddress}`)
	console.log(`- Using baseMint ${baseMint}`)
	console.log(`- Using quoteMint ${quoteMint}`)
	console.log(`- Using depositingPoint ${params.depositingPoint}`)
	console.log(`- Using startVestingPoint ${params.startVestingPoint}`)
	console.log(`- Using endVestingPoint ${params.endVestingPoint}`)
	console.log(
		`- Using maxBuyingCap ${params.maxBuyingCap}. In lamports ${maxBuyingCap}`
	)
	console.log(`- Using escrowFee ${params.escrowFee}. In lamports ${escrowFee}`)
	console.log(
		`- Using whitelistMode ${params.whitelistMode}. In value ${whitelistMode}`
	)

	const alphaVaultProgramId =
		opts?.alphaVaultProgramId.toBase58() ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	let cluster = ""

	switch (alphaVaultProgramId) {
		case ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]:
			cluster = "mainnet-beta"
			break
		case ALPHA_VAULT_PROGRAM_IDS["devnet"]:
			cluster = "devnet"
			break
		case ALPHA_VAULT_PROGRAM_IDS["localhost"]:
			cluster = "localhost"
			break
		default:
			throw new Error(`Invalid alpha vault program id ${alphaVaultProgramId}`)
	}

	const initAlphaVaultTx = (await AlphaVault.createCustomizableProrataVault(
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
			whitelistMode
		},
		wallet.publicKey,
		{
			cluster
		}
	)) as Transaction

	modifyComputeUnitPriceIx(initAlphaVaultTx, computeUnitPriceMicroLamports)

	if (dryRun) {
		console.log(`\n> Simulating init alpha vault tx...`)
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
			initAlphaVaultTx
		])
	} else {
		console.log(`>> Sending init alpha vault transaction...`)
		const initAlphaVaulTxHash = await sendAndConfirmTransaction(
			connection,
			initAlphaVaultTx,
			[wallet.payer]
		).catch((err) => {
			console.error(err)
			throw err
		})
		console.log(
			`>>> Alpha vault initialized successfully with tx hash: ${initAlphaVaulTxHash}`
		)
	}
}

export async function createPermissionedAlphaVaultWithAuthority(
	connection: Connection,
	wallet: Wallet,
	alphaVaultType: AlphaVaultTypeConfig,
	poolType: PoolType,
	poolAddress: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	quoteDecimals: number,
	params: FcfsAlphaVaultConfig | ProrataAlphaVaultConfig,
	whitelistList: WalletDepositCap[],
	dryRun: boolean,
	computeUnitPriceMicroLamports: number,
	opts?: {
		alphaVaultProgramId: PublicKey
	}
): Promise<void> {
	if (params.whitelistMode != WhitelistModeConfig.PermissionedWithAuthority) {
		throw new Error(`Invalid whitelist mode ${params.whitelistMode}. Only Permissioned with authority is allowed 
    `)
	}
	const alphaVaultProgramId = new PublicKey(
		opts?.alphaVaultProgramId ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	)

	const [alphaVaultPubkey] = deriveAlphaVault(
		wallet.publicKey,
		poolAddress,
		alphaVaultProgramId
	)

	const alphaVaultAccountInfo = await connection.getAccountInfo(alphaVaultPubkey)
	if (!alphaVaultAccountInfo) {
		// 1. Create alpha vault
		if (alphaVaultType == AlphaVaultTypeConfig.Fcfs) {
			await createFcfsAlphaVault(
				connection,
				wallet,
				poolType,
				poolAddress,
				baseMint,
				quoteMint,
				quoteDecimals,
				params as FcfsAlphaVaultConfig,
				dryRun,
				computeUnitPriceMicroLamports,
				opts
			)
		} else if (alphaVaultType == AlphaVaultTypeConfig.Prorata) {
			await createProrataAlphaVault(
				connection,
				wallet,
				poolType,
				poolAddress,
				baseMint,
				quoteMint,
				quoteDecimals,
				params as ProrataAlphaVaultConfig,
				dryRun,
				computeUnitPriceMicroLamports,
				opts
			)
		}
	} else {
		console.log(`> Alpha vault already exists at ${alphaVaultPubkey}`)
	}

	// 2. Create StakeEscrow account for each whitelisted wallet
	console.log("Creating stake escrow accounts...")

	const alphaVault = await createAlphaVaultInstance(
		connection,
		alphaVaultProgramId,
		alphaVaultPubkey
	)

	// Create StakeEscrow accounts for whitelist list
	const instructions =
		await alphaVault.createMultipleStakeEscrowByAuthorityInstructions(
			whitelistList,
			wallet.publicKey
		)

	await handleSendTxs(
		connection,
		instructions,
		MAX_INSTRUCTIONS_PER_STAKE_ESCROW_ACCOUNTS_CREATED,
		wallet.payer,
		computeUnitPriceMicroLamports,
		dryRun,
		"create stake escrow accounts"
	)
}

export function deriveAlphaVault(
	base: PublicKey,
	lbPair: PublicKey,
	alphaVaultProgramId: PublicKey
) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from(SEED.vault), base.toBuffer(), lbPair.toBuffer()],
		alphaVaultProgramId
	)
}

export async function createAlphaVaultInstance(
	connection: Connection,
	alphaVaultProgramId: PublicKey,
	vaultAddress: PublicKey
): Promise<AlphaVault> {
	const provider = new AnchorProvider(
		connection,
		{} as any,
		AnchorProvider.defaultOptions()
	)
	const program = new Program(IDL, alphaVaultProgramId, provider)

	const vault = await program.account.vault.fetch(vaultAddress)
	const vaultMode = vault.vaultMode === 0 ? VaultMode.PRORATA : VaultMode.FCFS

	return new AlphaVault(program, vaultAddress, vault, vaultMode)
}

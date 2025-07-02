import { Wallet } from "@coral-xyz/anchor"
import { AmmImpl } from "@mercurial-finance/dynamic-amm-sdk"
import { CustomizableParams } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/types"
import {
	createProgram,
	deriveCustomizablePermissionlessConstantProductPoolAddress
} from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import DLMM, { deriveCustomizablePermissionlessLbPair } from "@meteora-ag/dlmm"
import { getMint } from "@solana/spl-token"
import {
	Cluster,
	Connection,
	PublicKey,
	sendAndConfirmTransaction
} from "@solana/web3.js"
import { BN } from "bn.js"
import {
	DEFAULT_SEND_TX_MAX_RETRIES,
	DLMM_PROGRAM_IDS,
	MeteoraConfig,
	getAmountInLamports,
	getDlmmActivationType,
	getDynamicAmmActivationType,
	getQuoteDecimals,
	isPriceRoundingUp,
	modifyComputeUnitPriceIx,
	runSimulateTransaction
} from "../"

export async function createPermissionlessDynamicPool(
	config: MeteoraConfig,
	connection: Connection,
	wallet: Wallet,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	opts?: {
		cluster?: Cluster
		programId?: PublicKey
	}
) {
	if (!config.dynamicAmm) {
		throw new Error("Missing dynamic amm configuration")
	}
	console.log("\n> Initializing Permissionless Dynamic AMM pool...")

	const quoteDecimals = await getQuoteDecimals(
		connection,
		config.quoteSymbol,
		config.quoteMint
	)
	const baseMintAccount = await getMint(connection, baseMint, connection.commitment)
	const baseDecimals = baseMintAccount.decimals

	const baseAmount = getAmountInLamports(config.dynamicAmm.baseAmount, baseDecimals)
	const quoteAmount = getAmountInLamports(
		config.dynamicAmm.quoteAmount,
		quoteDecimals
	)

	console.log(
		`- Using token A amount ${config.dynamicAmm.baseAmount}, in lamports = ${baseAmount}`
	)
	console.log(
		`- Using token B amount ${config.dynamicAmm.quoteAmount}, in lamports = ${quoteAmount}`
	)

	const activationType = getDynamicAmmActivationType(
		config.dynamicAmm.activationType
	)

	const customizeParam: CustomizableParams = {
		tradeFeeNumerator: config.dynamicAmm.tradeFeeNumerator,
		activationType: activationType,
		activationPoint: config.dynamicAmm.activationPoint
			? new BN(config.dynamicAmm.activationPoint)
			: null,
		hasAlphaVault: config.dynamicAmm.hasAlphaVault,
		padding: Array(90).fill(0)
	}
	console.log(`- Using tradeFeeNumerator = ${customizeParam.tradeFeeNumerator}`)
	console.log(`- Using activationType = ${config.dynamicAmm.activationType}`)
	console.log(`- Using activationPoint = ${customizeParam.activationPoint}`)
	console.log(`- Using hasAlphaVault = ${customizeParam.hasAlphaVault}`)

	const initPoolTx =
		await AmmImpl.createCustomizablePermissionlessConstantProductPool(
			connection,
			wallet.publicKey,
			baseMint,
			quoteMint,
			baseAmount,
			quoteAmount,
			customizeParam,
			{
				cluster: opts?.cluster,
				programId: opts?.programId.toString()
			}
		)
	modifyComputeUnitPriceIx(initPoolTx, config.computeUnitPriceMicroLamports)
	const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
		baseMint,
		quoteMint,
		createProgram(connection).ammProgram.programId
	)

	console.log(`\n> Pool address: ${poolKey}`)

	if (config.dryRun) {
		console.log(`> Simulating init pool tx...`)
		// @ts-expect-error: Keypair version difference
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
			initPoolTx
		])
	} else {
		console.log(`>> Sending init pool transaction...`)
		const initPoolTxHash = await sendAndConfirmTransaction(
			connection,
			initPoolTx,
			[wallet.payer],
			{
				commitment: connection.commitment,
				maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
			}
		).catch((err) => {
			console.error(err)
			throw err
		})
		console.log(`>>> Pool initialized successfully with tx hash: ${initPoolTxHash}`)
	}
}

export async function createPermissionlessDlmmPool(
	config: MeteoraConfig,
	connection: Connection,
	wallet: Wallet,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	opts?: {
		cluster?: Cluster | "localhost"
		programId?: PublicKey
	}
) {
	if (!config.dlmm) {
		throw new Error("Missing DLMM configuration")
	}
	console.log("\n> Initializing Permissionless DLMM pool...")

	const binStep = config.dlmm.binStep
	const feeBps = config.dlmm.feeBps
	const hasAlphaVault = config.dlmm.hasAlphaVault
	const activationPoint = config.dlmm.activationPoint
		? new BN(config.dlmm.activationPoint)
		: null

	const activationType = getDlmmActivationType(config.dlmm.activationType)
	const creatorPoolOnOffControl = config.dlmm.creatorPoolOnOffControl
	console.log(`- Using binStep = ${binStep}`)
	console.log(`- Using feeBps = ${feeBps}`)
	console.log(`- Using initialPrice = ${config.dlmm.initialPrice}`)
	console.log(`- Using activationType = ${config.dlmm.activationType}`)
	console.log(`- Using activationPoint = ${activationPoint}`)
	console.log(`- Using hasAlphaVault = ${hasAlphaVault}`)
	console.log(`- Using creatorPoolOnOffControl = ${creatorPoolOnOffControl}`)

	const quoteDecimals = await getQuoteDecimals(
		connection,
		config.quoteSymbol,
		config.quoteMint
	)
	const baseMintInfo = await connection.getAccountInfo(
		baseMint,
		connection.commitment
	)
	const baseMintAccount = await getMint(
		connection,
		baseMint,
		connection.commitment,
		baseMintInfo.owner
	)
	const baseDecimals = baseMintAccount.decimals

	const initPrice = DLMM.getPricePerLamport(
		baseDecimals,
		quoteDecimals,
		config.dlmm.initialPrice
	)

	const activateBinId = DLMM.getBinIdFromPrice(
		initPrice,
		binStep,
		!isPriceRoundingUp(config.dlmm.priceRounding)
	)

	const cluster = opts?.cluster || "mainnet-beta"
	const dlmmProgramId = opts?.programId ?? new PublicKey(DLMM_PROGRAM_IDS[cluster])
	const initPoolTx = await DLMM.createCustomizablePermissionlessLbPair2(
		// @ts-expect-error: Connection version difference
		connection,
		new BN(binStep),
		baseMint,
		quoteMint,
		new BN(activateBinId.toString()),
		new BN(feeBps),
		activationType,
		hasAlphaVault,
		wallet.publicKey,
		activationPoint,
		creatorPoolOnOffControl,
		{
			cluster,
			programId: dlmmProgramId
		}
	)

	// @ts-expect-error: Transaction version difference
	modifyComputeUnitPriceIx(initPoolTx, config.computeUnitPriceMicroLamports)

	let poolKey: PublicKey
	;[poolKey] = deriveCustomizablePermissionlessLbPair(
		baseMint,
		quoteMint,
		dlmmProgramId
	)

	console.log(`\n> Pool address: ${poolKey}`)

	if (config.dryRun) {
		console.log(`\n> Simulating init pool tx...`)
		// @ts-expect-error: Keypair version difference
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
			initPoolTx
		])
	} else {
		console.log(`>> Sending init pool transaction...`)
		let initPoolTxHash = await sendAndConfirmTransaction(
			connection,
			// @ts-expect-error: Transaction version difference
			initPoolTx,
			[wallet.payer],
			{
				commitment: connection.commitment,
				maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
			}
		).catch((e) => {
			console.error(e)
			throw e
		})
		console.log(`>>> Pool initialized successfully with tx hash: ${initPoolTxHash}`)
	}
}

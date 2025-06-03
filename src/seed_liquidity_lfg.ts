import {
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	TransactionInstruction,
	sendAndConfirmTransaction
} from "@solana/web3.js"
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
	seedLiquidityLfg
} from "."
import { Wallet } from "@coral-xyz/anchor"
import { BN } from "bn.js"
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
	getPriceOfBinByBinId
} from "@meteora-ag/dlmm"
import Decimal from "decimal.js"
import {
	AccountLayout,
	createAssociatedTokenAccountInstruction,
	createTransferInstruction,
	getAssociatedTokenAddressSync,
	getMint
} from "@solana/spl-token"

async function main() {
	let config: MeteoraConfig = parseConfigFromCli()

	console.log(`> Using keypair file path ${config.keypairFilePath}`)
	let keypair = safeParseKeypairFromFile(config.keypairFilePath)

	console.log("\n> Initializing with general configuration...")
	console.log(`- Using RPC URL ${config.rpcUrl}`)
	console.log(`- Dry run = ${config.dryRun}`)
	console.log(`- Using payer ${keypair.publicKey} to execute commands`)

	const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL)
	const wallet = new Wallet(keypair)
	const DLMM_PROGRAM_ID = new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"])

	if (!config.baseMint) {
		throw new Error("Missing baseMint in configuration")
	}
	const baseMint = new PublicKey(config.baseMint)
	const baseMintAccount = await getMint(connection, baseMint, connection.commitment)
	const baseDecimals = baseMintAccount.decimals

	let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint)
	const quoteDecimals = await getQuoteDecimals(
		connection,
		config.quoteSymbol,
		config.quoteMint
	)

	console.log(`- Using base token mint ${baseMint.toString()}`)
	console.log(`- Using quote token mint ${quoteMint.toString()}`)

	let poolKey: PublicKey
	;[poolKey] = deriveCustomizablePermissionlessLbPair(
		baseMint,
		quoteMint,
		new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"])
	)
	console.log(`- Using pool key ${poolKey.toString()}`)

	if (!config.lfgSeedLiquidity) {
		throw new Error(`Missing DLMM LFG seed liquidity in configuration`)
	}

	const pair = await DLMM.create(connection, poolKey, {
		cluster: "mainnet-beta"
	})
	await pair.refetchStates()

	const seedAmount = getAmountInLamports(
		config.lfgSeedLiquidity.seedAmount,
		baseDecimals
	)
	const curvature = config.lfgSeedLiquidity.curvature
	const minPrice = config.lfgSeedLiquidity.minPrice
	const maxPrice = config.lfgSeedLiquidity.maxPrice
	const baseKeypair = safeParseKeypairFromFile(
		config.lfgSeedLiquidity.basePositionKeypairFilepath
	)
	const operatorKeypair = safeParseKeypairFromFile(
		config.lfgSeedLiquidity.operatorKeypairFilepath
	)
	const positionOwner = new PublicKey(config.lfgSeedLiquidity.positionOwner)
	const feeOwner = new PublicKey(config.lfgSeedLiquidity.feeOwner)
	const operator = operatorKeypair.publicKey
	const lockReleasePoint = new BN(config.lfgSeedLiquidity.lockReleasePoint)
	const seedTokenXToPositionOwner = config.lfgSeedLiquidity.seedTokenXToPositionOwner

	await seedLiquidityLfg(
		connection,
		keypair,
		baseKeypair,
		operatorKeypair,
		positionOwner,
		feeOwner,
		baseMint,
		quoteMint,
		seedAmount,
		curvature,
		minPrice,
		maxPrice,
		lockReleasePoint,
		seedTokenXToPositionOwner,
		config.dryRun,
		config.computeUnitPriceMicroLamports
	)
}

main()

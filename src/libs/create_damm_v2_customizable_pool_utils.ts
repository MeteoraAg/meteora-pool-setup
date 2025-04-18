import {
	Cluster,
	Connection,
	Keypair,
	PublicKey,
	sendAndConfirmTransaction
} from "@solana/web3.js"
import {
	MeteoraConfig,
	getAmountInLamports,
	getQuoteDecimals,
	runSimulateTransaction,
	modifyComputeUnitPriceIx,
	getDammV2ActivationType,
	getDecimalizedAmount
} from "../"
import { Wallet, BN } from "@coral-xyz/anchor"
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import {
	BaseFee,
	BASIS_POINT_MAX,
	CpAmm,
	FEE_DENOMINATOR,
	getPriceFromSqrtPrice,
	getSqrtPriceFromPrice,
	MAX_SQRT_PRICE,
	MIN_SQRT_PRICE,
	PoolFeesParams
} from "@meteora-ag/cp-amm-sdk"

// convert to BPS
function bpsToFeeNumerator(bps: number) {
	return (bps * FEE_DENOMINATOR) / BASIS_POINT_MAX
}

export async function createDammV2CustomizablePool(
	config: MeteoraConfig,
	connection: Connection,
	wallet: Wallet,
	baseTokenMint: PublicKey,
	quoteTokenMint: PublicKey,
	opts?: {
		cluster?: Cluster
		programId?: PublicKey
	}
) {
	if (!config.dynamicAmmV2) {
		throw new Error("Missing dynamic amm v2 configuration")
	}
	console.log("\n> Initializing customize Dynamic AMM V2 pool...")

	const quoteDecimals = await getQuoteDecimals(
		connection,
		config.quoteSymbol,
		config.quoteMint
	)

	let baseTokenInfo = null
	let baseTokenProgram = TOKEN_PROGRAM_ID

	const baseMintAccountInfo = await connection.getAccountInfo(
		new PublicKey(baseTokenMint)
	)

	const baseMint = await getMint(
		connection,
		baseTokenMint,
		connection.commitment,
		baseMintAccountInfo.owner
	)

	if (baseMintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
		const epochInfo = await connection.getEpochInfo()
		baseTokenInfo = {
			mint: baseMint,
			currentEpoch: epochInfo.epoch
		}
		baseTokenProgram = TOKEN_2022_PROGRAM_ID
	}

	const baseDecimals = baseMint.decimals

	// create cp amm instance
	const cpAmmInstance = new CpAmm(connection)
	const {
		initPrice,
		maxPrice,
		poolFees,
		baseAmount,
		hasAlphaVault,
		activationPoint,
		activationType,
		collectFeeMode
	} = config.dynamicAmmV2

	const {
		feeSchedulerMode,
		reductionFactor,
		periodFrequency,
		numberOfPeriod,
		feeBps,
		useDynamicFee
	} = poolFees
	// setup pool params
	const initSqrtPrice = initPrice
		? getSqrtPriceFromPrice(initPrice.toString(), baseDecimals, quoteDecimals)
		: MIN_SQRT_PRICE
	const maxSqrtPrice = maxPrice
		? getSqrtPriceFromPrice(maxPrice.toString(), baseDecimals, quoteDecimals)
		: MAX_SQRT_PRICE

	if (
		initSqrtPrice.gte(maxSqrtPrice) &&
		initSqrtPrice.gte(MIN_SQRT_PRICE) &&
		maxSqrtPrice.lte(MAX_SQRT_PRICE)
	) {
		throw new Error("Invalid price range")
	}

	const tokenAAmount = getAmountInLamports(baseAmount, baseDecimals)
	const tokenBAmount = new BN(0)
	const liquidityDelta = cpAmmInstance.preparePoolCreationSingleSide({
		tokenAAmount,
		minSqrtPrice: initSqrtPrice,
		maxSqrtPrice,
		initSqrtPrice,
		tokenAInfo: baseTokenInfo
	})

	console.log(
		`- Using base token with amount = ${getDecimalizedAmount(tokenAAmount, baseDecimals)}`
	)
	console.log(
		`- Init price ${getPriceFromSqrtPrice(initSqrtPrice, baseDecimals, quoteDecimals)}`
	)

	console.log(
		`- Price range [${initPrice}, ${getPriceFromSqrtPrice(maxSqrtPrice, baseDecimals, quoteDecimals)}]`
	)

	const activationTypeValue = getDammV2ActivationType(activationType)
	const dynamicFeeConfig = config.dynamicAmmV2.poolFees.dynamicFeeConfig

	const dynamicFeeParams = {
		binStep: 1,
		binStepU128: new BN("1844674407370955"),
		filterPeriod: dynamicFeeConfig ? dynamicFeeConfig.filterPeriod : 10,
		decayPeriod: dynamicFeeConfig ? dynamicFeeConfig.decayPeriod : 120,
		reductionFactor: dynamicFeeConfig ? dynamicFeeConfig.reductionFactor : 5000,
		variableFeeControl: dynamicFeeConfig
			? dynamicFeeConfig.variableFeeControl
			: 2000000,
		maxVolatilityAccumulator: dynamicFeeConfig
			? dynamicFeeConfig.maxVolatilityAccumulator
			: 100000
	}

	const feeNumerator = bpsToFeeNumerator(feeBps)

	const baseFee: BaseFee = {
		cliffFeeNumerator: new BN(feeNumerator),
		numberOfPeriod: numberOfPeriod,
		periodFrequency: new BN(periodFrequency),
		reductionFactor: new BN(reductionFactor),
		feeSchedulerMode: feeSchedulerMode
	}

	const poolFeesParams: PoolFeesParams = {
		baseFee,
		protocolFeePercent: 20,
		partnerFeePercent: 0,
		referralFeePercent: 20,
		dynamicFee: useDynamicFee ? dynamicFeeParams : null
	}
	const positionNft = Keypair.generate()

	const {
		tx: initCustomizePoolTx,
		pool,
		position
	} = await cpAmmInstance.createCustomPool({
		payer: wallet.publicKey,
		creator: new PublicKey(config.dynamicAmmV2.creator),
		positionNft: positionNft.publicKey,
		tokenAMint: baseTokenMint,
		tokenBMint: quoteTokenMint,
		tokenAAmount: tokenAAmount,
		tokenBAmount: tokenBAmount,
		sqrtMinPrice: initSqrtPrice,
		sqrtMaxPrice: maxSqrtPrice,
		liquidityDelta: liquidityDelta,
		initSqrtPrice,
		poolFees: poolFeesParams,
		hasAlphaVault: hasAlphaVault,
		activationType: activationTypeValue,
		collectFeeMode: collectFeeMode,
		activationPoint: activationPoint ? new BN(activationPoint) : null,
		tokenAProgram: baseTokenProgram,
		tokenBProgram: TOKEN_PROGRAM_ID
	})

	modifyComputeUnitPriceIx(initCustomizePoolTx, config.computeUnitPriceMicroLamports)

	console.log(`\n> Pool address: ${pool}`)
	console.log(`\n> Position address: ${position}`)

	if (config.dryRun) {
		console.log(`> Simulating init pool tx...`)
		await runSimulateTransaction(
			connection,
			[wallet.payer, positionNft],
			wallet.publicKey,
			[initCustomizePoolTx]
		)
	} else {
		console.log(`>> Sending init pool transaction...`)
		const initPoolTxHash = await sendAndConfirmTransaction(
			connection,
			initCustomizePoolTx,
			[wallet.payer, positionNft]
		).catch((err) => {
			console.error(err)
			throw err
		})
		console.log(`>>> Pool initialized successfully with tx hash: ${initPoolTxHash}`)
	}
}

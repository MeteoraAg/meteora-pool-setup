import { BN } from "bn.js"
import Decimal from "decimal.js"
import { MAX_BIN_PER_POSITION, getPriceOfBinByBinId } from "@meteora-ag/dlmm"

export function generateAmountForBinRange(
	amount: BN,
	binStep: number,
	tokenXDecimal: number,
	tokenYDecimal: number,
	minBinId: BN,
	maxBinId: BN,
	k: number
): Map<number, BN> {
	const toTokenMultiplier = new Decimal(10 ** (tokenXDecimal - tokenYDecimal))
	const minPrice = getPriceOfBinByBinId(minBinId.toNumber(), binStep).mul(
		toTokenMultiplier
	)
	const maxPrice = getPriceOfBinByBinId(maxBinId.toNumber(), binStep).mul(
		toTokenMultiplier
	)
	const binAmounts = new Map<number, BN>()

	for (let i = minBinId.toNumber(); i < maxBinId.toNumber(); i++) {
		const binAmount = generateBinAmount(
			amount,
			binStep,
			new BN(i),
			tokenXDecimal,
			tokenYDecimal,
			minPrice,
			maxPrice,
			k
		)

		binAmounts.set(i, binAmount)
	}

	return binAmounts
}

export function generateBinAmount(
	amount: BN,
	binStep: number,
	binId: BN,
	tokenXDecimal: number,
	tokenYDecimal: number,
	minPrice: Decimal,
	maxPrice: Decimal,
	k: number
) {
	const c1 = getC(
		amount,
		binStep,
		binId.add(new BN(1)),
		tokenXDecimal,
		tokenYDecimal,
		minPrice,
		maxPrice,
		k
	)

	const c0 = getC(
		amount,
		binStep,
		binId,
		tokenXDecimal,
		tokenYDecimal,
		minPrice,
		maxPrice,
		k
	)

	return new BN(c1.sub(c0).floor().toString())
}

export function getC(
	amount: BN,
	binStep: number,
	binId: BN,
	baseTokenDecimal: number,
	quoteTokenDecimal: number,
	minPrice: Decimal,
	maxPrice: Decimal,
	k: number
) {
	const currentPricePerLamport = new Decimal(1 + binStep / 10000).pow(
		binId.toNumber()
	)
	const currentPricePerToken = currentPricePerLamport.mul(
		new Decimal(10 ** (baseTokenDecimal - quoteTokenDecimal))
	)
	const priceRange = maxPrice.sub(minPrice)
	const currentPriceDeltaFromMin = currentPricePerToken.sub(new Decimal(minPrice))

	const c = new Decimal(amount.toString()).mul(
		currentPriceDeltaFromMin.div(priceRange).pow(k)
	)

	return c.floor()
}

export function compressBinAmount(binAmount: Map<number, BN>, multiplier: BN) {
	const compressedBinAmount = new Map<number, BN>()

	let totalAmount = new BN(0)
	let compressionLoss = new BN(0)

	for (const [binId, amount] of binAmount) {
		totalAmount = totalAmount.add(amount)
		const compressedAmount = amount.div(multiplier)

		compressedBinAmount.set(binId, compressedAmount)
		let loss = amount.sub(compressedAmount.mul(multiplier))
		compressionLoss = compressionLoss.add(loss)
	}

	return {
		compressedBinAmount,
		compressionLoss
	}
}

export function distributeAmountToCompressedBinsByRatio(
	compressedBinAmount: Map<number, BN>,
	uncompressedAmount: BN,
	multiplier: BN,
	binCapAmount: BN
) {
	const newCompressedBinAmount = new Map<number, BN>()
	let totalCompressedAmount = new BN(0)

	for (const compressedAmount of compressedBinAmount.values()) {
		totalCompressedAmount = totalCompressedAmount.add(compressedAmount)
	}

	let totalDepositedAmount = new BN(0)

	for (const [binId, compressedAmount] of compressedBinAmount.entries()) {
		const depositAmount = compressedAmount
			.mul(uncompressedAmount)
			.div(totalCompressedAmount)

		let compressedDepositAmount = depositAmount.div(multiplier)

		let newCompressedAmount = compressedAmount.add(compressedDepositAmount)
		if (newCompressedAmount.gt(binCapAmount)) {
			compressedDepositAmount = compressedDepositAmount.sub(
				newCompressedAmount.sub(binCapAmount)
			)
			newCompressedAmount = binCapAmount
		}
		newCompressedBinAmount.set(binId, newCompressedAmount)

		totalDepositedAmount = totalDepositedAmount.add(
			compressedDepositAmount.mul(multiplier)
		)
	}

	const loss = uncompressedAmount.sub(totalDepositedAmount)

	return {
		newCompressedBinAmount,
		loss
	}
}

export function getPositionCount(minBinId: BN, maxBinId: BN) {
	const binDelta = maxBinId.sub(minBinId)
	const positionCount = binDelta.div(MAX_BIN_PER_POSITION)
	return positionCount.add(new BN(1))
}

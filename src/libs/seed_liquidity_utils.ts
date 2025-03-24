import {
	Cluster,
	ComputeBudgetProgram,
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	TransactionInstruction,
	sendAndConfirmTransaction
} from "@solana/web3.js"
import { DEFAULT_ADD_LIQUIDITY_CU, runSimulateTransaction } from "./utils"
import { BN } from "bn.js"
import DLMM, {
	BASIS_POINT_MAX,
	BinLiquidityDistribution,
	CompressedBinDepositAmounts,
	LiquidityParameter,
	MAX_BIN_PER_POSITION,
	PositionV2,
	binIdToBinArrayIndex,
	deriveBinArray,
	deriveBinArrayBitmapExtension,
	deriveCustomizablePermissionlessLbPair,
	derivePosition,
	getEstimatedComputeUnitIxWithBuffer,
	getOrCreateATAInstruction,
	isOverflowDefaultBinArrayBitmap
} from "@meteora-ag/dlmm"
import {
	compressBinAmount,
	distributeAmountToCompressedBinsByRatio,
	generateAmountForBinRange,
	getPositionCount
} from "./math"
import {
	getAssociatedTokenAddressSync,
	AccountLayout,
	createTransferInstruction,
	createAssociatedTokenAccountInstruction,
	TOKEN_PROGRAM_ID
} from "@solana/spl-token"
import { DLMM_PROGRAM_IDS } from "./constants"

export async function seedLiquiditySingleBin(
	connection: Connection,
	payerKeypair: Keypair,
	baseKeypair: Keypair,
	operatorKeypair: Keypair,
	positionOwner: PublicKey,
	feeOwner: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	seedAmount: BN,
	price: number,
	priceRounding: string,
	lockReleasePoint: BN,
	seedTokenXToPositionOwner: boolean,
	dryRun: boolean,
	computeUnitPriceMicroLamports: number | bigint,
	opts?: {
		cluster?: Cluster | "localhost"
		programId?: PublicKey
	}
) {
	if (priceRounding != "up" && priceRounding != "down") {
		throw new Error("Invalid selective rounding value. Must be 'up' or 'down'")
	}

	const cluster = opts?.cluster || "mainnet-beta"
	const dlmmProgramId = opts?.programId ?? new PublicKey(DLMM_PROGRAM_IDS[cluster])

	let poolKey: PublicKey
	;[poolKey] = deriveCustomizablePermissionlessLbPair(
		baseMint,
		quoteMint,
		dlmmProgramId
	)
	console.log(`- Using pool key ${poolKey.toString()}`)

	console.log(`- Using seedAmount in lamports = ${seedAmount}`)
	console.log(`- Using priceRounding = ${priceRounding}`)
	console.log(`- Using price ${price}`)
	console.log(`- Using operator ${operatorKeypair.publicKey}`)
	console.log(`- Using positionOwner ${positionOwner}`)
	console.log(`- Using feeOwner ${feeOwner}`)
	console.log(`- Using lockReleasePoint ${lockReleasePoint}`)
	console.log(`- Using seedTokenXToPositionOwner ${seedTokenXToPositionOwner}`)

	if (!seedTokenXToPositionOwner) {
		console.log(
			`WARNING: You selected seedTokenXToPositionOwner = false, you should manually send 1 lamport of token X to the position owner account to prove ownership.`
		)
	}

	const { preInstructions, addLiquidityInstructions } =
		await createSeedLiquiditySingleBinInstructions(
			connection,
			poolKey,
			payerKeypair.publicKey,
			baseKeypair.publicKey,
			seedAmount,
			price,
			priceRounding == "up",
			positionOwner,
			feeOwner,
			operatorKeypair.publicKey,
			lockReleasePoint,
			seedTokenXToPositionOwner,
			opts
		)

	const seedLiquidityIxs = [...preInstructions, ...addLiquidityInstructions]

	const setCUPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
		microLamports: computeUnitPriceMicroLamports
	})

	const { blockhash, lastValidBlockHeight } =
		await connection.getLatestBlockhash("confirmed")

	const tx = new Transaction({
		feePayer: payerKeypair.publicKey,
		blockhash,
		lastValidBlockHeight
	})
		.add(setCUPriceIx)
		.add(...seedLiquidityIxs)

	if (dryRun) {
		console.log(`\n> Simulating seedLiquiditySingleBin transaction...`)
		await runSimulateTransaction(
			connection,
			[payerKeypair, baseKeypair, operatorKeypair],
			payerKeypair.publicKey,
			[tx]
		)
	} else {
		console.log(`>> Sending seedLiquiditySingleBin transaction...`)
		const txHash = await sendAndConfirmTransaction(connection, tx, [
			payerKeypair,
			baseKeypair,
			operatorKeypair
		]).catch((err) => {
			console.error(err)
			throw err
		})
		console.log(`>>> SeedLiquiditySingleBin successfully with tx hash: ${txHash}`)
	}
}

export async function seedLiquidityLfg(
	connection: Connection,
	payerKeypair: Keypair,
	baseKeypair: Keypair,
	operatorKeypair: Keypair,
	positionOwner: PublicKey,
	feeOwner: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	seedAmount: BN,
	curvature: number,
	minPricePerLamport: BN,
	maxPricePerLamport: BN,
	lockReleasePoint: BN,
	seedTokenXToPositionOwner: boolean,
	dryRun: boolean,
	computeUnitPriceMicroLamports: number | bigint,
	opts?: {
		cluster?: Cluster | "localhost"
		programId?: PublicKey
	}
) {
	const cluster = opts?.cluster || "mainnet-beta"
	const dlmmProgramId = opts?.programId ?? new PublicKey(DLMM_PROGRAM_IDS[cluster])

	let poolKey: PublicKey
	;[poolKey] = deriveCustomizablePermissionlessLbPair(
		baseMint,
		quoteMint,
		dlmmProgramId
	)
	console.log(`- Using pool key ${poolKey.toString()}`)

	console.log(`- Using seedAmount in lamports = ${seedAmount}`)
	console.log(`- Using curvature = ${curvature}`)
	console.log(`- Using minPrice per lamport ${minPricePerLamport}`)
	console.log(`- Using maxPrice per lamport ${maxPricePerLamport}`)
	console.log(`- Using operator ${operatorKeypair.publicKey}`)
	console.log(`- Using positionOwner ${positionOwner}`)
	console.log(`- Using feeOwner ${feeOwner}`)
	console.log(`- Using lockReleasePoint ${lockReleasePoint}`)
	console.log(`- Using seedTokenXToPositionOwner ${seedTokenXToPositionOwner}`)

	if (!seedTokenXToPositionOwner) {
		console.log(
			`WARNING: You selected seedTokenXToPositionOwner = false, you should manually send 1 lamport of token X to the position owner account to prove ownership.`
		)
	}

	const {
		preInstructions,
		initializeBinArraysAndPositionInstructions,
		addLiquidityInstructions
	} = await createSeedLiquidityLfgInstructions(
		connection,
		poolKey,
		payerKeypair.publicKey,
		baseKeypair.publicKey,
		lockReleasePoint,
		seedAmount,
		curvature,
		minPricePerLamport,
		maxPricePerLamport,
		positionOwner,
		feeOwner,
		operatorKeypair.publicKey,
		opts
	)

	if (preInstructions.length > 0) {
		// run preflight ixs
		const { blockhash, lastValidBlockHeight } =
			await connection.getLatestBlockhash("confirmed")
		const setCUPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: computeUnitPriceMicroLamports
		})

		const signers = [payerKeypair]
		const tx = new Transaction({
			feePayer: payerKeypair.publicKey,
			blockhash,
			lastValidBlockHeight
		}).add(setCUPriceIx)

		tx.add(...preInstructions)

		if (dryRun) {
			throw new Error(
				"dryRun is not supported for this script, please set dryRun config to false"
			)
		}

		console.log(`>> Running preflight instructions...`)
		try {
			console.log(`>> Sending preflight transaction...`)
			const txHash = await sendAndConfirmTransaction(connection, tx, signers)
			console.log(`>>> Preflight successfully with tx hash: ${txHash}`)
		} catch (err) {
			console.error(err)
			throw new Error(err)
		}
	}

	console.log(`>> Running initializeBinArraysAndPosition instructions...`)
	// Initialize all bin array and position, transaction order can be in sequence or not
	{
		const { blockhash, lastValidBlockHeight } =
			await connection.getLatestBlockhash("confirmed")

		const transactions: Array<Promise<string>> = []

		for (const groupIx of initializeBinArraysAndPositionInstructions) {
			const tx = new Transaction({
				feePayer: payerKeypair.publicKey,
				blockhash,
				lastValidBlockHeight
			}).add(...groupIx)

			const signers = [payerKeypair, baseKeypair, operatorKeypair]

			transactions.push(sendAndConfirmTransaction(connection, tx, signers))
		}

		await Promise.all(transactions)
			.then((txs) => {
				txs.map(console.log)
			})
			.catch((e) => {
				console.error(e)
				throw e
			})
	}
	console.log(`>>> Finished initializeBinArraysAndPosition instructions!`)

	console.log(`>> Running addLiquidity instructions...`)
	{
		const { blockhash, lastValidBlockHeight } =
			await connection.getLatestBlockhash("confirmed")

		const transactions: Array<Promise<string>> = []

		// Deposit to positions created in above step. The add liquidity order can be in sequence or not.
		for (const groupIx of addLiquidityInstructions) {
			const tx = new Transaction({
				feePayer: payerKeypair.publicKey,
				blockhash,
				lastValidBlockHeight
			}).add(...groupIx)

			const signers = [payerKeypair, operatorKeypair]

			await sendAndConfirmTransaction(connection, tx, signers)
		}

		// await Promise.all(transactions)
		//   .then((txs) => {
		//     txs.map(console.log);
		//   })
		//   .catch((e) => {
		//     console.error(e);
		//     throw e;
		//   });
	}
	console.log(`>>> Finished addLiquidity instructions!`)
}

export async function createSeedLiquiditySingleBinInstructions(
	connection: Connection,
	poolAddress: PublicKey,
	payer: PublicKey,
	base: PublicKey,
	seedAmount: BN,
	price: number,
	roundingUp: boolean,
	positionOwner: PublicKey,
	feeOwner: PublicKey,
	operator: PublicKey,
	lockReleasePoint: BN,
	shouldSeedPositionOwner: boolean = false,
	opts?: {
		cluster?: Cluster | "localhost"
		programId?: PublicKey
	}
): Promise<SeedLiquiditySingleBinInstructionSet> {
	const pair = await DLMM.create(connection, poolAddress, opts)

	const pricePerLamport = DLMM.getPricePerLamport(
		pair.tokenX.decimal,
		pair.tokenY.decimal,
		price
	)
	const binIdNumber = DLMM.getBinIdFromPrice(
		pricePerLamport,
		pair.lbPair.binStep,
		!roundingUp
	)

	const binId = new BN(binIdNumber)
	const lowerBinArrayIndex = binIdToBinArrayIndex(binId)
	const upperBinArrayIndex = lowerBinArrayIndex.add(new BN(1))

	const [lowerBinArray] = deriveBinArray(
		pair.pubkey,
		lowerBinArrayIndex,
		pair.program.programId
	)
	const [upperBinArray] = deriveBinArray(
		pair.pubkey,
		upperBinArrayIndex,
		pair.program.programId
	)
	const [positionPda] = derivePosition(
		pair.pubkey,
		base,
		binId,
		new BN(1),
		pair.program.programId
	)

	const preInstructions = []

	const [
		{ ataPubKey: userTokenX, ix: createPayerTokenXIx },
		{ ataPubKey: userTokenY, ix: createPayerTokenYIx }
	] = await Promise.all([
		getOrCreateATAInstruction(connection, pair.tokenX.publicKey, operator, payer),
		getOrCreateATAInstruction(connection, pair.tokenY.publicKey, operator, payer)
	])

	// create userTokenX and userTokenY accounts
	createPayerTokenXIx && preInstructions.push(createPayerTokenXIx)
	createPayerTokenYIx && preInstructions.push(createPayerTokenYIx)

	let [binArrayBitmapExtension] = deriveBinArrayBitmapExtension(
		pair.pubkey,
		pair.program.programId
	)
	const accounts = await connection.getMultipleAccountsInfo([
		lowerBinArray,
		upperBinArray,
		positionPda,
		binArrayBitmapExtension
	])

	if (isOverflowDefaultBinArrayBitmap(lowerBinArrayIndex)) {
		const bitmapExtensionAccount = accounts[3]
		if (!bitmapExtensionAccount) {
			preInstructions.push(
				await pair.program.methods
					.initializeBinArrayBitmapExtension()
					.accounts({
						binArrayBitmapExtension,
						funder: payer,
						lbPair: pair.pubkey
					})
					.instruction()
			)
		}
	} else {
		binArrayBitmapExtension = pair.program.programId
	}

	const positionOwnerTokenX = getAssociatedTokenAddressSync(
		pair.lbPair.tokenXMint,
		positionOwner,
		true
	)

	if (shouldSeedPositionOwner) {
		const positionOwnerTokenXAccount =
			await connection.getAccountInfo(positionOwnerTokenX)
		if (positionOwnerTokenXAccount) {
			const account = AccountLayout.decode(positionOwnerTokenXAccount.data)
			if (account.amount == BigInt(0)) {
				// send 1 lamport to position owner token X to prove ownership
				const transferIx = createTransferInstruction(
					userTokenX,
					positionOwnerTokenX,
					payer,
					1
				)
				preInstructions.push(transferIx)
			}
		} else {
			const createPositionOwnerTokenXIx = createAssociatedTokenAccountInstruction(
				payer,
				positionOwnerTokenX,
				positionOwner,
				pair.lbPair.tokenXMint
			)
			preInstructions.push(createPositionOwnerTokenXIx)

			// send 1 lamport to position owner token X to prove ownership
			const transferIx = createTransferInstruction(
				userTokenX,
				positionOwnerTokenX,
				payer,
				1
			)
			preInstructions.push(transferIx)
		}
	}

	const lowerBinArrayAccount = accounts[0]
	const upperBinArrayAccount = accounts[1]
	const positionAccount = accounts[2]

	if (!lowerBinArrayAccount) {
		preInstructions.push(
			await pair.program.methods
				.initializeBinArray(lowerBinArrayIndex)
				.accounts({
					binArray: lowerBinArray,
					funder: payer,
					lbPair: pair.pubkey
				})
				.instruction()
		)
	}

	if (!upperBinArrayAccount) {
		preInstructions.push(
			await pair.program.methods
				.initializeBinArray(upperBinArrayIndex)
				.accounts({
					binArray: upperBinArray,
					funder: payer,
					lbPair: pair.pubkey
				})
				.instruction()
		)
	}

	if (!positionAccount) {
		preInstructions.push(
			await pair.program.methods
				.initializePositionByOperator(
					binId.toNumber(),
					1,
					feeOwner,
					lockReleasePoint
				)
				.accounts({
					payer,
					base,
					position: positionPda,
					lbPair: pair.pubkey,
					owner: positionOwner,
					operator,
					operatorTokenX: userTokenX,
					ownerTokenX: positionOwnerTokenX
				})
				.instruction()
		)
	}

	const binLiquidityDist: BinLiquidityDistribution = {
		binId: binIdNumber,
		distributionX: BASIS_POINT_MAX,
		distributionY: 0
	}

	const addLiquidityParams: LiquidityParameter = {
		amountX: seedAmount,
		amountY: new BN(0),
		binLiquidityDist: [binLiquidityDist]
	}

	const depositLiquidityIx = await pair.program.methods
		.addLiquidity(addLiquidityParams)
		.accounts({
			position: positionPda,
			lbPair: pair.pubkey,
			binArrayBitmapExtension,
			userTokenX,
			userTokenY,
			reserveX: pair.lbPair.reserveX,
			reserveY: pair.lbPair.reserveY,
			tokenXMint: pair.lbPair.tokenXMint,
			tokenYMint: pair.lbPair.tokenYMint,
			binArrayLower: lowerBinArray,
			binArrayUpper: upperBinArray,
			sender: operator,
			tokenXProgram: TOKEN_PROGRAM_ID,
			tokenYProgram: TOKEN_PROGRAM_ID
		})
		.instruction()

	return {
		preInstructions,
		addLiquidityInstructions: [depositLiquidityIx]
	}
}

export async function createSeedLiquidityLfgInstructions(
	connection: Connection,
	poolAddress: PublicKey,
	payer: PublicKey,
	base: PublicKey,
	lockReleasePoint: BN,
	seedAmount: BN,
	curvature: number,
	minPricePerLamport: BN,
	maxPricePerLamport: BN,
	positionOwner: PublicKey,
	feeOwner: PublicKey,
	operator: PublicKey,
	opts?: {
		cluster?: Cluster | "localhost"
		programId?: PublicKey
	}
): Promise<SeedLiquidityLfgInstructionSet> {
	const pair = await DLMM.create(connection, poolAddress, opts)

	const minBinId = new BN(
		DLMM.getBinIdFromPrice(minPricePerLamport, pair.lbPair.binStep, false)
	)
	const maxBinId = new BN(
		DLMM.getBinIdFromPrice(maxPricePerLamport, pair.lbPair.binStep, true)
	)
	if (minBinId.toNumber() < pair.lbPair.activeId) {
		throw new Error("minPrice < current pair price")
	}
	if (minBinId.toNumber() > maxBinId.toNumber()) {
		throw new Error("Price range too small")
	}
	const k = 1.0 / curvature

	const binDepositAmount = generateAmountForBinRange(
		seedAmount,
		pair.lbPair.binStep,
		pair.tokenX.decimal,
		pair.tokenY.decimal,
		minBinId,
		maxBinId,
		k
	)

	const decompressMultiplier = new BN(10 ** pair.tokenX.decimal)

	let { compressedBinAmount, compressionLoss } = compressBinAmount(
		binDepositAmount,
		decompressMultiplier
	)

	// Distribute loss after compression back to bins based on bin ratio with total deposited amount
	let { newCompressedBinAmount: compressedBinDepositAmount, loss: finalLoss } =
		distributeAmountToCompressedBinsByRatio(
			compressedBinAmount,
			compressionLoss,
			decompressMultiplier,
			new BN(2 ** 32 - 1) // u32
		)

	// This amount will be deposited to the last bin without compression
	const positionCount = getPositionCount(minBinId, maxBinId.sub(new BN(1)))

	const preInstructions: Array<TransactionInstruction> = []
	const initializeBinArraysAndPositionIxs: Array<Array<TransactionInstruction>> = []
	const addLiquidityIxs: Array<Array<TransactionInstruction>> = []
	const appendedInitBinArrayIx = new Set()

	const { ataPubKey: userTokenX, ix: createPayerTokenXIx } =
		await getOrCreateATAInstruction(
			connection,
			pair.lbPair.tokenXMint,
			operator,
			payer
		)

	// create userTokenX account
	createPayerTokenXIx && preInstructions.push(createPayerTokenXIx)

	const positionOwnerTokenX = getAssociatedTokenAddressSync(
		pair.lbPair.tokenXMint,
		positionOwner,
		true
	)

	const positionOwnerTokenXAccount =
		await connection.getAccountInfo(positionOwnerTokenX)
	if (positionOwnerTokenXAccount) {
		const account = AccountLayout.decode(positionOwnerTokenXAccount.data)
		if (account.amount == BigInt(0)) {
			// send 1 lamport to position owner token X to prove ownership
			const transferIx = createTransferInstruction(
				userTokenX,
				positionOwnerTokenX,
				payer,
				1
			)
			preInstructions.push(transferIx)
		}
	} else {
		const createPositionOwnerTokenXIx = createAssociatedTokenAccountInstruction(
			payer,
			positionOwnerTokenX,
			positionOwner,
			pair.lbPair.tokenXMint
		)
		preInstructions.push(createPositionOwnerTokenXIx)

		// send 1 lamport to position owner token X to prove ownership
		const transferIx = createTransferInstruction(
			userTokenX,
			positionOwnerTokenX,
			payer,
			1
		)
		preInstructions.push(transferIx)
	}

	for (let i = 0; i < positionCount.toNumber(); i++) {
		const lowerBinId = minBinId.add(MAX_BIN_PER_POSITION.mul(new BN(i)))
		const upperBinId = lowerBinId.add(MAX_BIN_PER_POSITION).sub(new BN(1))

		const lowerBinArrayIndex = binIdToBinArrayIndex(lowerBinId)
		const upperBinArrayIndex = binIdToBinArrayIndex(upperBinId)

		const [positionPda, _bump] = derivePosition(
			pair.pubkey,
			base,
			lowerBinId,
			MAX_BIN_PER_POSITION,
			pair.program.programId
		)

		const [lowerBinArray] = deriveBinArray(
			pair.pubkey,
			lowerBinArrayIndex,
			pair.program.programId
		)

		const [upperBinArray] = deriveBinArray(
			pair.pubkey,
			upperBinArrayIndex,
			pair.program.programId
		)

		const accounts = await connection.getMultipleAccountsInfo([
			lowerBinArray,
			upperBinArray,
			positionPda
		])

		let instructions: TransactionInstruction[] = []

		const lowerBinArrayAccount = accounts[0]
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
						funder: payer
					})
					.instruction()
			)

			appendedInitBinArrayIx.add(lowerBinArray.toBase58())
		}

		const upperBinArrayAccount = accounts[1]
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
						funder: payer
					})
					.instruction()
			)

			appendedInitBinArrayIx.add(upperBinArray.toBase58())
		}

		const positionAccount = accounts[2]
		if (!positionAccount) {
			instructions.push(
				await pair.program.methods
					.initializePositionByOperator(
						lowerBinId.toNumber(),
						MAX_BIN_PER_POSITION.toNumber(),
						feeOwner,
						lockReleasePoint
					)
					.accounts({
						payer: payer,
						base,
						position: positionPda,
						lbPair: pair.pubkey,
						owner: positionOwner,
						operator,
						operatorTokenX: userTokenX,
						ownerTokenX: positionOwnerTokenX
					})
					.instruction()
			)
		}

		// Initialize bin arrays and initialize position account in 1 tx
		if (instructions.length > 1) {
			instructions.push(
				await getEstimatedComputeUnitIxWithBuffer(connection, instructions, payer)
			)

			initializeBinArraysAndPositionIxs.push(instructions)
			instructions = []
		}

		const positionDeposited =
			positionAccount &&
			pair.program.coder.accounts
				.decode<PositionV2>(
					pair.program.account.positionV2.idlAccount.name,
					positionAccount.data
				)
				.liquidityShares.reduce((total, cur) => total.add(cur), new BN(0))
				.gt(new BN(0))

		if (!positionDeposited) {
			const cappedUpperBinId = Math.min(
				upperBinId.toNumber(),
				maxBinId.toNumber() - 1
			)

			const bins: CompressedBinDepositAmounts = []

			for (let i = lowerBinId.toNumber(); i <= cappedUpperBinId; i++) {
				bins.push({
					binId: i,
					amount: compressedBinDepositAmount.get(i).toNumber()
				})
			}

			instructions.push(
				await pair.program.methods
					.addLiquidityOneSidePrecise({
						bins,
						decompressMultiplier
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
						sender: operator
					})
					.instruction()
			)

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
									weight: 1
								}
							]
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
							sender: operator
						})
						.instruction()
				)
			}

			addLiquidityIxs.push([
				ComputeBudgetProgram.setComputeUnitLimit({
					units: DEFAULT_ADD_LIQUIDITY_CU
				}),
				...instructions
			])
		}
	}

	return {
		preInstructions,
		addLiquidityInstructions: addLiquidityIxs,
		initializeBinArraysAndPositionInstructions: initializeBinArraysAndPositionIxs
	}
}

export interface SeedLiquiditySingleBinInstructionSet {
	preInstructions: Array<TransactionInstruction>
	addLiquidityInstructions: Array<TransactionInstruction>
}

export interface SeedLiquidityLfgInstructionSet {
	preInstructions: Array<TransactionInstruction>
	initializeBinArraysAndPositionInstructions: Array<Array<TransactionInstruction>>
	addLiquidityInstructions: Array<Array<TransactionInstruction>>
}

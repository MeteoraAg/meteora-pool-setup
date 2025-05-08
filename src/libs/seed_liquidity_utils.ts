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
import { runSimulateTransaction } from "./utils"
import { BN } from "bn.js"
import DLMM, { deriveCustomizablePermissionlessLbPair } from "@meteora-ag/dlmm"

import { DEFAULT_SEND_TX_MAX_RETRIES, DLMM_PROGRAM_IDS } from "./constants"

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

	const dlmmInstance = await DLMM.create(connection, poolKey, opts)
	const seedLiquidityIxs = await dlmmInstance.seedLiquiditySingleBin(
		payerKeypair.publicKey,
		baseKeypair.publicKey,
		seedAmount,
		price,
		priceRounding == "up",
		positionOwner,
		feeOwner,
		operatorKeypair.publicKey,
		lockReleasePoint,
		seedTokenXToPositionOwner
	)

	const setCUPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
		microLamports: computeUnitPriceMicroLamports
	})

	const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
		connection.commitment
	)

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
		const txHash = await sendAndConfirmTransaction(
			connection,
			tx,
			[payerKeypair, baseKeypair, operatorKeypair],
			{
				commitment: connection.commitment,
				maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
			}
		).catch((err) => {
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

	const dlmmInstance = await DLMM.create(connection, poolKey, opts)

	const {
		sendPositionOwnerTokenProveIxs,
		initializeBinArraysAndPositionIxs,
		addLiquidityIxs
	} = await dlmmInstance.seedLiquidity(
		positionOwner,
		seedAmount,
		curvature,
		minPricePerLamport,
		maxPricePerLamport,
		baseKeypair.publicKey,
		payerKeypair.publicKey,
		feeOwner,
		operatorKeypair.publicKey,
		lockReleasePoint,
		seedTokenXToPositionOwner
	)

	if (sendPositionOwnerTokenProveIxs.length > 0) {
		// run preflight ixs
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
			connection.commitment
		)
		const setCUPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: computeUnitPriceMicroLamports
		})

		const signers = [payerKeypair]
		const tx = new Transaction({
			feePayer: payerKeypair.publicKey,
			blockhash,
			lastValidBlockHeight
		}).add(setCUPriceIx)

		tx.add(...sendPositionOwnerTokenProveIxs)

		if (dryRun) {
			throw new Error(
				"dryRun is not supported for this script, please set dryRun config to false"
			)
		}

		console.log(`>> Running preflight instructions...`)
		try {
			console.log(`>> Sending preflight transaction...`)
			const txHash = await sendAndConfirmTransaction(connection, tx, signers, {
				commitment: connection.commitment,
				maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
			})
			console.log(`>>> Preflight successfully with tx hash: ${txHash}`)
		} catch (err) {
			console.error(err)
			throw new Error(err)
		}
	}

	console.log(`>> Running initializeBinArraysAndPosition instructions...`)
	// Initialize all bin array and position, transaction order can be in sequence or not
	{
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
			connection.commitment
		)

		const transactions: Array<Promise<string>> = []

		for (const groupIx of initializeBinArraysAndPositionIxs) {
			const tx = new Transaction({
				feePayer: payerKeypair.publicKey,
				blockhash,
				lastValidBlockHeight
			}).add(...groupIx)

			const signers = [payerKeypair, baseKeypair, operatorKeypair]

			transactions.push(
				sendAndConfirmTransaction(connection, tx, signers, {
					commitment: connection.commitment,
					maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
				})
			)
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
		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
			connection.commitment
		)

		const transactions: Array<Promise<string>> = []

		// Deposit to positions created in above step. The add liquidity order can be in sequence or not.
		for (const groupIx of addLiquidityIxs) {
			const tx = new Transaction({
				feePayer: payerKeypair.publicKey,
				blockhash,
				lastValidBlockHeight
			}).add(...groupIx)

			const signers = [payerKeypair, operatorKeypair]

			await sendAndConfirmTransaction(connection, tx, signers, {
				commitment: connection.commitment,
				maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
			})
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

export interface SeedLiquiditySingleBinInstructionSet {
	preInstructions: Array<TransactionInstruction>
	addLiquidityInstructions: Array<TransactionInstruction>
}

export interface SeedLiquidityLfgInstructionSet {
	preInstructions: Array<TransactionInstruction>
	initializeBinArraysAndPositionInstructions: Array<Array<TransactionInstruction>>
	addLiquidityInstructions: Array<Array<TransactionInstruction>>
}

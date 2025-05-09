import { BN } from "@coral-xyz/anchor"
import StakeForFee, { deriveFeeVault } from "@meteora-ag/m3m3"
import {
	Connection,
	Keypair,
	PublicKey,
	sendAndConfirmTransaction
} from "@solana/web3.js"
import { M3m3Config } from "./config"
import { DEFAULT_SEND_TX_MAX_RETRIES, M3M3_PROGRAM_IDS } from "./constants"
import { modifyComputeUnitPriceIx, runSimulateTransaction } from "./utils"

export async function create_m3m3_farm(
	connection: Connection,
	payer: Keypair,
	poolKey: PublicKey,
	stakeMint: PublicKey,
	config: M3m3Config,
	dryRun: boolean,
	computeUnitPriceMicroLamports: number,
	opts?: {
		m3m3ProgramId: PublicKey
	}
): Promise<void> {
	const m3m3ProgramId =
		opts?.m3m3ProgramId ?? new PublicKey(M3M3_PROGRAM_IDS["mainnet-beta"])
	const m3m3VaultPubkey = deriveFeeVault(poolKey, m3m3ProgramId)
	console.log(`- M3M3 fee vault ${m3m3VaultPubkey}`)

	// 1. Create m3m3 farm
	const m3m3VaultAccount = await connection.getAccountInfo(
		m3m3VaultPubkey,
		connection.commitment
	)

	if (m3m3VaultAccount) {
		console.log(`>>> M3M3 farm is already existed. Skip creating new farm.`)
		return
	}

	console.log(`>> Creating M3M3 fee farm...`)
	const topListLength = config.topListLength
	const unstakeLockDuration = new BN(config.unstakeLockDurationSecs)
	const secondsToFullUnlock = new BN(config.secondsToFullUnlock)
	const startFeeDistributeTimestamp = new BN(config.startFeeDistributeTimestamp)

	console.log(`- Using topListLength: ${topListLength}`)
	console.log(`- Using unstakeLockDuration ${unstakeLockDuration}`)
	console.log(`- Using secondsToFullUnlock ${secondsToFullUnlock}`)
	console.log(`- Using startFeeDistributeTimestamp ${startFeeDistributeTimestamp}`)

	// m3m3 farm didn't exist
	const createTx = await StakeForFee.createFeeVault(
		// @ts-expect-error: Connection version difference
		connection,
		poolKey,
		stakeMint,
		payer.publicKey,
		{
			topListLength,
			unstakeLockDuration,
			secondsToFullUnlock,
			startFeeDistributeTimestamp
		}
	)

	// @ts-expect-error: Transaction version difference
	modifyComputeUnitPriceIx(createTx, computeUnitPriceMicroLamports)

	if (dryRun) {
		console.log(`> Simulating create m3m3 farm tx...`)
		// @ts-expect-error: Transaction version difference
		await runSimulateTransaction(connection, [payer], payer.publicKey, [createTx])
	} else {
		console.log(`>> Sending create m3m3 farm transaction...`)
		// @ts-expect-error: Transaction version difference
		const txHash = await sendAndConfirmTransaction(connection, createTx, [payer], {
			commitment: connection.commitment,
			maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
		}).catch((err) => {
			console.error(err)
			throw err
		})
		console.log(`>>> M3M3 farm initialized successfully with tx hash: ${txHash}`)
	}
}

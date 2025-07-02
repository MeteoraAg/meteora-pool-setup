import { Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import {
	DEFAULT_COMMITMENT_LEVEL,
	MeteoraConfig,
	safeParseKeypairFromFile,
	parseConfigFromCli,
	modifyComputeUnitPriceIx,
	runSimulateTransaction,
	DEFAULT_SEND_TX_MAX_RETRIES
} from "."
import { Wallet } from "@coral-xyz/anchor"
import DLMM from "@meteora-ag/dlmm"

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

	const poolAddress = new PublicKey(config.setDlmmPoolStatus.poolAddress)
	const enabled = config.setDlmmPoolStatus.enabled

	console.log(`- Using pool address ${poolAddress.toString()}`)
	console.log(`- Using enabled ${enabled}`)

	// @ts-expect-error: Connection version difference
	const lbPair = await DLMM.create(connection, poolAddress)

	const tx = await lbPair.setPairStatusPermissionless(enabled, wallet.publicKey)
	// @ts-expect-error: Transaction version difference
	modifyComputeUnitPriceIx(tx, config.computeUnitPriceMicroLamports)

	if (config.dryRun) {
		console.log(`\n> Simulating set DLMM pool status tx...`)
		// @ts-expect-error: Transaction version difference
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [tx])
	} else {
		console.log(`>> Sending set DLMM pool status transaction...`)
		// @ts-expect-error: Transaction version difference
		let txHash = await sendAndConfirmTransaction(connection, tx, [wallet.payer], {
			commitment: connection.commitment,
			maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
		}).catch((e) => {
			console.error(e)
			throw e
		})
		console.log(`>>> Set DLMM pool status tx hash: ${txHash}`)
	}
}

main()

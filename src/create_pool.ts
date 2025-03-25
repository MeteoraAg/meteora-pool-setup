import { Connection, PublicKey } from "@solana/web3.js"
import {
	DEFAULT_COMMITMENT_LEVEL,
	MeteoraConfig,
	getQuoteMint,
	safeParseKeypairFromFile,
	parseConfigFromCli
} from "."
import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { createTokenMint } from "./libs/create_token_mint"
import {
	createPermissionlessDlmmPool,
	createPermissionlessDynamicPool
} from "./libs/create_pool_utils"

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

	let baseMint: PublicKey
	let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint)

	// If we want to create a new token mint
	if (config.createBaseToken) {
		baseMint = await createTokenMint(connection, wallet, {
			dryRun: config.dryRun,
			mintTokenAmount: config.createBaseToken.mintBaseTokenAmount,
			decimals: config.createBaseToken.baseDecimals,
			computeUnitPriceMicroLamports: config.computeUnitPriceMicroLamports
		})
	} else {
		if (!config.baseMint) {
			throw new Error("Missing baseMint in configuration")
		}
		baseMint = new PublicKey(config.baseMint)
	}

	console.log(`- Using base token mint ${baseMint.toString()}`)
	console.log(`- Using quote token mint ${quoteMint.toString()}`)

	/// --------------------------------------------------------------------------
	if (config.dynamicAmm && !config.dlmm) {
		await createPermissionlessDynamicPool(
			config,
			connection,
			wallet,
			baseMint,
			quoteMint
		)
	} else if (config.dlmm && !config.dynamicAmm) {
		await createPermissionlessDlmmPool(
			config,
			connection,
			wallet,
			baseMint,
			quoteMint
		)
	} else if (config.dynamicAmm && config.dlmm) {
		throw new Error("Either provide only Dynamic AMM or DLMM configuration")
	} else {
		throw new Error("Must provide Dynamic AMM or DLMM configuration")
	}
}

main()

import { Connection, PublicKey } from "@solana/web3.js"
import {
	DEFAULT_COMMITMENT_LEVEL,
	MeteoraConfig,
	getQuoteMint,
	safeParseKeypairFromFile,
	parseConfigFromCli
} from "."
import { Wallet } from "@coral-xyz/anchor"
import { createTokenMint } from "./libs/create_token_mint"
import { createDammV2CustomizablePool } from "./libs/create_damm_v2_customizable_pool_utils"

async function main() {
	let config: MeteoraConfig = parseConfigFromCli()

	console.log(`> Using keypair file path ${config.keypairFilePath}`)
	let keypair = safeParseKeypairFromFile(config.keypairFilePath)

	console.log("\n> Initializing with general configuration...")
	console.log(`- Using RPC URL ${config.rpcUrl}`)
	console.log(`- Dry run = ${config.dryRun}`)
	console.log(`- Using payer ${keypair.publicKey} to execute commands`)

	const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL)
	// @ts-expect-error Keypair version different
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
	if (config.dynamicAmmV2) {
		await createDammV2CustomizablePool(
			config,
			connection,
			wallet,
			baseMint,
			quoteMint
		)
	} else {
		throw new Error("Must provide Dynamic V2 configuration")
	}
}

main()

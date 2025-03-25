import { BN, Wallet } from "@coral-xyz/anchor"
import { Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import { MeteoraConfig, parseConfigFromCli } from "./libs/config"
import { DEFAULT_COMMITMENT_LEVEL, M3M3_PROGRAM_IDS } from "./libs/constants"
import {
	safeParseKeypairFromFile,
	getQuoteMint,
	runSimulateTransaction
} from "./libs/utils"
import { createTokenMint } from "./libs/create_token_mint"
import { createPermissionlessDynamicPool } from "./libs/create_pool_utils"
import {
	createProgram,
	deriveCustomizablePermissionlessConstantProductPoolAddress
} from "@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import { create_m3m3_farm } from "./libs/create_m3m3_farm_utils"

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

	if (!config.baseMint) {
		throw new Error("Missing baseMint in configuration")
	}
	let baseMint = new PublicKey(config.baseMint)
	let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint)
	const ammProgram = createProgram(connection).ammProgram
	const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
		baseMint,
		quoteMint,
		ammProgram.programId
	)

	const poolAccount = await connection.getAccountInfo(poolKey, {
		commitment: "confirmed"
	})

	if (!poolAccount) {
		throw new Error(`Pool ${poolKey} didn't exist. Please create it first.`)
	}

	console.log(`- Using base token mint ${baseMint.toString()}`)
	console.log(`- Using quote token mint ${quoteMint.toString()}`)
	console.log(`- Pool key ${poolKey}`)

	if (!config.m3m3) {
		throw new Error("Missing M3M3 configuration")
	}

	// 3. Create M3M3 farm
	await create_m3m3_farm(
		connection,
		wallet.payer,
		poolKey,
		baseMint,
		config.m3m3,
		config.dryRun,
		config.computeUnitPriceMicroLamports
	)
}

main()

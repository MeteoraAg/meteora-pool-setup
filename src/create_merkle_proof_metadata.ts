import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import {
	ALPHA_VAULT_PROGRAM_IDS,
	DEFAULT_COMMITMENT_LEVEL,
	DEFAULT_SEND_TX_MAX_RETRIES,
	MeteoraConfig,
	PoolTypeConfig,
	WhitelistModeConfig,
	getQuoteDecimals,
	getQuoteMint,
	parseConfigFromCli,
	runSimulateTransaction,
	safeParseKeypairFromFile
} from "."

import {
	createProgram,
	deriveCustomizablePermissionlessConstantProductPoolAddress
} from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import AlphaVault, {
	deriveAlphaVault,
	deriveMerkleProofMetadata
} from "@meteora-ag/alpha-vault"
import {
	LBCLMM_PROGRAM_IDS,
	deriveCustomizablePermissionlessLbPair
} from "@meteora-ag/dlmm"

import fs from "fs"
import { getClusterFromProgramId } from "./libs/create_alpha_vault_utils"

interface ProofRecord {
	[key: string]: {
		merkle_tree: string
		amount: number
		proof: Array<number[]>
	}
}

interface BodyItem {
	base64: boolean
	key: string
	value: string
}

function chunks<T>(array: T[], size: number): T[][] {
	return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
		array.slice(index * size, (index + 1) * size)
	)
}

async function uploadProof(
	kvProofFilepath: string,
	vaultAddress: string,
	kvNameSpaceId: string,
	accountId: string,
	apiKey: string
) {
	// 1. Read merkle proof files from the folder
	const proofFolder = fs.readdirSync(kvProofFilepath)
	const files: ProofRecord[] = []

	for (const fileName of proofFolder) {
		const path = `./${kvProofFilepath}/${fileName}`
		console.log(`> Reading file ${path}`)
		const file = fs.readFileSync(path, "utf-8")
		const json = JSON.parse(file) as ProofRecord
		files.push(json)
	}

	// 2. Upload them to KV
	for (const file of files) {
		const proofsArr = Object.entries(file)
		for (const chunk of chunks(proofsArr, 10000)) {
			const items: BodyItem[] = chunk.map(([walletAddress, value]) => ({
				key: `${vaultAddress}-${walletAddress}`,
				value: JSON.stringify(value),
				base64: false
			}))

			await Promise.all(
				chunks(items, 250).map(async (body) => {
					let success = false
					while (!success) {
						const resp = await fetch(
							`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNameSpaceId}/bulk`,
							{
								body: JSON.stringify(body),
								headers: {
									Authorization: `Bearer ${apiKey}`,
									"Content-Type": "application/json"
								},
								method: "PUT"
							}
						).then(async (res) => {
							const text = await res.text()
							console.log({ text })
							return JSON.parse(text) as Promise<{ success: boolean }>
						})

						if (resp.success) {
							success = true
						}
					}
				})
			)
		}
	}
}

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

	if (!config.baseMint) {
		throw new Error("Missing baseMint in configuration")
	}
	const baseMint = new PublicKey(config.baseMint)
	let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint)

	console.log(`- Using base token mint ${baseMint.toString()}`)
	console.log(`- Using quote token mint ${quoteMint.toString()}`)

	if (!config.alphaVault) {
		throw new Error("Missing alpha vault in configuration")
	}
	const poolType = config.alphaVault.poolType

	let poolKey: PublicKey
	if (poolType == PoolTypeConfig.Dynamic) {
		poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
			baseMint,
			quoteMint,
			createProgram(connection).ammProgram.programId
		)
	} else if (poolType == PoolTypeConfig.Dlmm) {
		;[poolKey] = deriveCustomizablePermissionlessLbPair(
			baseMint,
			quoteMint,
			new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"])
		)
	} else {
		throw new Error(`Invalid pool type ${poolType}`)
	}

	console.log(`\n> Pool address: ${poolKey}, pool type ${poolType}`)

	if (
		config.alphaVault.whitelistMode !=
		WhitelistModeConfig.PermissionedWithMerkleProof
	) {
		throw new Error("Invalid whitelist mode")
	}

	const alphaVaultProgramId = new PublicKey(ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"])

	const [alphaVaultPubkey] = deriveAlphaVault(
		wallet.publicKey,
		poolKey,
		alphaVaultProgramId
	)

	const cluster = getClusterFromProgramId(alphaVaultProgramId)

	// @ts-expect-error Connection version different
	const alphaVault = await AlphaVault.create(connection, alphaVaultPubkey, {
		cluster
	})
	const [merkleProofMetadata] = deriveMerkleProofMetadata(
		alphaVaultPubkey,
		alphaVaultProgramId
	)

	const merkleProofMetadataAccount =
		await connection.getAccountInfo(merkleProofMetadata)

	if (!merkleProofMetadataAccount) {
		const createMerkleProofMetadataTx = await alphaVault.createMerkleProofMetadata(
			keypair.publicKey,
			config.alphaVault.merkleProofBaseUrl
		)

		if (config.dryRun) {
			console.log(`\n> Simulating init merkle proof metadata tx...`)
			// @ts-expect-error Keypair version different
			await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
				createMerkleProofMetadataTx
			])
		} else {
			console.log(`>> Sending init merkle proof metadata transaction...`)
			const initAlphaVaulTxHash = await sendAndConfirmTransaction(
				connection,
				// @ts-expect-error Transaction version different
				createMerkleProofMetadataTx,
				[wallet.payer],
				{
					commitment: connection.commitment,
					maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
				}
			).catch((err) => {
				console.error(err)
				throw err
			})
			console.log(
				`>>> Merkle proof metadata initialized successfully with tx hash: ${initAlphaVaulTxHash}`
			)
		}
	}

	if (config.alphaVault.cloudflareKvProofUpload) {
		console.log(`\n> Uploading merkle proof to cloudflare...`)

		const { kvNamespaceId, apiKey, accountId } =
			config.alphaVault.cloudflareKvProofUpload

		// Get from https://github.com/MeteoraAg/cloudflare-kv-merkle-proof/blob/main/scripts/upload_merkle_proof.ts
		const kvProofFilepath =
			config.alphaVault.kvProofFilepath ?? `./${alphaVaultPubkey.toBase58()}`
		await uploadProof(
			kvProofFilepath,
			alphaVaultPubkey.toBase58(),
			kvNamespaceId,
			accountId,
			apiKey
		)
	}
}

main()

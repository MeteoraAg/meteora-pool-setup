import { Wallet } from "@coral-xyz/anchor"
import AlphaVault, {
	PoolType,
	SEED,
	WalletDepositCap
} from "@meteora-ag/alpha-vault"
import {
	Connection,
	PublicKey,
	Transaction,
	sendAndConfirmTransaction
} from "@solana/web3.js"
import BN from "bn.js"
import fs from "fs"
import {
	AlphaVaultTypeConfig,
	FcfsAlphaVaultConfig,
	ProrataAlphaVaultConfig,
	WhitelistModeConfig
} from "./config"
import {
	ALPHA_VAULT_PROGRAM_IDS,
	DEFAULT_NODES_PER_TREE,
	DEFAULT_SEND_TX_MAX_RETRIES,
	MAX_INSTRUCTIONS_PER_STAKE_ESCROW_ACCOUNTS_CREATED
} from "./constants"
import { BalanceTree } from "./merkle_tree"
import {
	getAlphaVaultWhitelistMode,
	getAmountInLamports,
	handleSendTxs,
	modifyComputeUnitPriceIx,
	runSimulateTransaction
} from "./utils"

export function getClusterFromProgramId(alphaVaultProgramId: PublicKey): string {
	let cluster = "mainnet-beta"
	switch (alphaVaultProgramId.toString()) {
		case ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]:
			cluster = "mainnet-beta"
			break
		case ALPHA_VAULT_PROGRAM_IDS["devnet"]:
			cluster = "devnet"
			break
		case ALPHA_VAULT_PROGRAM_IDS["localhost"]:
			cluster = "localhost"
			break
		default:
			throw new Error(`Invalid alpha vault program id ${alphaVaultProgramId}`)
	}

	return cluster
}

export async function createFcfsAlphaVault(
	connection: Connection,
	wallet: Wallet,
	poolType: PoolType,
	poolAddress: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	quoteDecimals: number,
	params: FcfsAlphaVaultConfig,
	dryRun: boolean,
	computeUnitPriceMicroLamports: number,
	opts?: {
		alphaVaultProgramId: PublicKey
	}
): Promise<void> {
	let maxDepositingCap = getAmountInLamports(params.maxDepositCap, quoteDecimals)
	let individualDepositingCap = getAmountInLamports(
		params.individualDepositingCap,
		quoteDecimals
	)
	let escrowFee = getAmountInLamports(params.escrowFee, quoteDecimals)
	let whitelistMode = getAlphaVaultWhitelistMode(params.whitelistMode)

	console.log(`\n> Initializing FcfsAlphaVault...`)
	console.log(`- Using poolType: ${poolType}`)
	console.log(`- Using poolMint ${poolAddress}`)
	console.log(`- Using baseMint ${baseMint}`)
	console.log(`- Using quoteMint ${quoteMint}`)
	console.log(`- Using depositingPoint ${params.depositingPoint}`)
	console.log(`- Using startVestingPoint ${params.startVestingPoint}`)
	console.log(`- Using endVestingPoint ${params.endVestingPoint}`)
	console.log(
		`- Using maxDepositingCap ${params.maxDepositCap}. In lamports ${maxDepositingCap}`
	)
	console.log(
		`- Using individualDepositingCap ${params.individualDepositingCap}. In lamports ${individualDepositingCap}`
	)
	console.log(`- Using escrowFee ${params.escrowFee}. In lamports ${escrowFee}`)
	console.log(
		`- Using whitelistMode ${params.whitelistMode}. In value ${whitelistMode}`
	)

	const alphaVaultProgramId =
		opts?.alphaVaultProgramId.toBase58() ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	let cluster = getClusterFromProgramId(new PublicKey(alphaVaultProgramId))

	// @ts-expect-error: Transaction version difference
	const initAlphaVaultTx = (await AlphaVault.createCustomizableFcfsVault(
		// @ts-expect-error: Connection version difference
		connection,
		{
			quoteMint,
			baseMint,
			poolAddress,
			poolType,
			depositingPoint: new BN(params.depositingPoint),
			startVestingPoint: new BN(params.startVestingPoint),
			endVestingPoint: new BN(params.endVestingPoint),
			maxDepositingCap,
			individualDepositingCap,
			escrowFee,
			whitelistMode
		},
		wallet.publicKey,
		{
			cluster
		}
	)) as Transaction

	modifyComputeUnitPriceIx(initAlphaVaultTx, computeUnitPriceMicroLamports)

	if (dryRun) {
		console.log(`\n> Simulating init alpha vault tx...`)
		// @ts-expect-error: Keypair version difference
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
			initAlphaVaultTx
		])
	} else {
		console.log(`>> Sending init alpha vault transaction...`)
		const initAlphaVaulTxHash = await sendAndConfirmTransaction(
			connection,
			initAlphaVaultTx,
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
			`>>> Alpha vault initialized successfully with tx hash: ${initAlphaVaulTxHash}`
		)
	}
}

export async function createProrataAlphaVault(
	connection: Connection,
	wallet: Wallet,
	poolType: PoolType,
	poolAddress: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	quoteDecimals: number,
	params: ProrataAlphaVaultConfig,
	dryRun: boolean,
	computeUnitPriceMicroLamports: number,
	opts?: {
		alphaVaultProgramId: PublicKey
	}
) {
	let maxBuyingCap = getAmountInLamports(params.maxBuyingCap, quoteDecimals)
	let escrowFee = getAmountInLamports(params.escrowFee, quoteDecimals)
	let whitelistMode = getAlphaVaultWhitelistMode(params.whitelistMode)

	console.log(`\n> Initializing ProrataAlphaVault...`)
	console.log(`- Using poolType: ${poolType}`)
	console.log(`- Using poolAddress ${poolAddress}`)
	console.log(`- Using baseMint ${baseMint}`)
	console.log(`- Using quoteMint ${quoteMint}`)
	console.log(`- Using depositingPoint ${params.depositingPoint}`)
	console.log(`- Using startVestingPoint ${params.startVestingPoint}`)
	console.log(`- Using endVestingPoint ${params.endVestingPoint}`)
	console.log(
		`- Using maxBuyingCap ${params.maxBuyingCap}. In lamports ${maxBuyingCap}`
	)
	console.log(`- Using escrowFee ${params.escrowFee}. In lamports ${escrowFee}`)
	console.log(
		`- Using whitelistMode ${params.whitelistMode}. In value ${whitelistMode}`
	)

	const alphaVaultProgramId =
		opts?.alphaVaultProgramId.toBase58() ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	let cluster = getClusterFromProgramId(new PublicKey(alphaVaultProgramId))

	// @ts-expect-error: Transaction version difference
	const initAlphaVaultTx = (await AlphaVault.createCustomizableProrataVault(
		// @ts-expect-error: Connection version difference
		connection,
		{
			quoteMint,
			baseMint,
			poolAddress,
			poolType,
			depositingPoint: new BN(params.depositingPoint),
			startVestingPoint: new BN(params.startVestingPoint),
			endVestingPoint: new BN(params.endVestingPoint),
			maxBuyingCap,
			escrowFee,
			whitelistMode
		},
		wallet.publicKey,
		{
			cluster
		}
	)) as Transaction

	modifyComputeUnitPriceIx(initAlphaVaultTx, computeUnitPriceMicroLamports)

	if (dryRun) {
		console.log(`\n> Simulating init alpha vault tx...`)
		// @ts-expect-error: Keypair version difference
		await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
			initAlphaVaultTx
		])
	} else {
		console.log(`>> Sending init alpha vault transaction...`)
		const initAlphaVaulTxHash = await sendAndConfirmTransaction(
			connection,
			initAlphaVaultTx,
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
			`>>> Alpha vault initialized successfully with tx hash: ${initAlphaVaulTxHash}`
		)
	}
}

export async function createPermissionedAlphaVaultWithMerkleProof(
	connection: Connection,
	wallet: Wallet,
	alphaVaultType: AlphaVaultTypeConfig,
	poolType: PoolType,
	poolAddress: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	quoteDecimals: number,
	params: FcfsAlphaVaultConfig | ProrataAlphaVaultConfig,
	whitelistList: WalletDepositCap[],
	dryRun: boolean,
	computeUnitPriceMicroLamports: number,
	opts?: {
		alphaVaultProgramId: PublicKey
	}
): Promise<void> {
	if (params.whitelistMode != WhitelistModeConfig.PermissionedWithMerkleProof) {
		throw new Error(`Invalid whitelist mode ${params.whitelistMode}. Only Permissioned with merkle proof is allowed 
    `)
	}
	const alphaVaultProgramId = new PublicKey(
		opts?.alphaVaultProgramId ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	)

	let cluster = ""

	switch (alphaVaultProgramId.toBase58()) {
		case ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]:
			cluster = "mainnet-beta"
			break
		case ALPHA_VAULT_PROGRAM_IDS["devnet"]:
			cluster = "devnet"
			break
		case ALPHA_VAULT_PROGRAM_IDS["localhost"]:
			cluster = "localhost"
			break
		default:
			throw new Error(`Invalid alpha vault program id ${alphaVaultProgramId}`)
	}

	const [alphaVaultPubkey] = deriveAlphaVault(
		wallet.publicKey,
		poolAddress,
		alphaVaultProgramId
	)

	const alphaVaultAccountInfo = await connection.getAccountInfo(
		alphaVaultPubkey,
		connection.commitment
	)
	if (!alphaVaultAccountInfo) {
		// 1. Create alpha vault
		if (alphaVaultType == AlphaVaultTypeConfig.Fcfs) {
			await createFcfsAlphaVault(
				connection,
				wallet,
				poolType,
				poolAddress,
				baseMint,
				quoteMint,
				quoteDecimals,
				params as FcfsAlphaVaultConfig,
				dryRun,
				computeUnitPriceMicroLamports,
				opts
			)
		} else if (alphaVaultType == AlphaVaultTypeConfig.Prorata) {
			await createProrataAlphaVault(
				connection,
				wallet,
				poolType,
				poolAddress,
				baseMint,
				quoteMint,
				quoteDecimals,
				params as ProrataAlphaVaultConfig,
				dryRun,
				computeUnitPriceMicroLamports,
				opts
			)
		}
	} else {
		console.log(`> Alpha vault already exists at ${alphaVaultPubkey}`)
	}

	// 2. Create merkle root config
	console.log("Creating merkle root configs...")

	const chunkSize = params.chunkSize ?? DEFAULT_NODES_PER_TREE
	console.log(`- Using chunk size of ${chunkSize}`)

	const kvProofFolderPath =
		params.kvProofFilepath ?? `./${alphaVaultPubkey.toBase58()}`

	console.log(`- Using kv proof filepath ${kvProofFolderPath}`)

	// @ts-expect-error: Connection version difference
	const alphaVault = await AlphaVault.create(connection, alphaVaultPubkey, {
		cluster
	})

	let chunkCount = Math.floor(whitelistList.length / chunkSize)
	if (whitelistList.length % chunkSize != 0) {
		chunkCount++
	}

	console.log(`- Total number of tree ${chunkCount}`)

	for (let i = 0; i < chunkCount; i++) {
		console.log(`- Tree version ${i}`)
		const version = new BN(i)

		const [merkleRootConfig] = deriveMerkleRootConfig(
			alphaVaultPubkey,
			version,
			alphaVaultProgramId
		)

		const offset = i * chunkSize
		const endOffset = Math.min(offset + chunkSize, whitelistList.length)
		const chunkedWhitelistList = whitelistList.slice(offset, endOffset)

		const tree = createMerkleTree(chunkedWhitelistList)
		const root = tree.getRoot()

		interface KvMerkleProof {
			[key: string]: {
				merkle_root_config: String
				max_cap: number
				proof: number[][]
			}
		}

		const kvProofs: KvMerkleProof = {}
		const kvProofFilePath = `${kvProofFolderPath}/${i}.json`

		for (const wallet of chunkedWhitelistList) {
			const proof = tree.getProof(wallet.address, wallet.maxAmount)
			kvProofs[wallet.address.toBase58()] = {
				merkle_root_config: merkleRootConfig.toBase58(),
				max_cap: wallet.maxAmount.toNumber(),
				proof: proof.map((buffer) => {
					return Array.from(new Uint8Array(buffer))
				})
			}
		}

		console.log(`- Writing kv proof to ${kvProofFilePath}`)
		fs.mkdirSync(kvProofFolderPath, { recursive: true })
		fs.writeFileSync(kvProofFilePath, JSON.stringify(kvProofs), {
			encoding: "utf-8"
		})

		const merkleRootConfigAccount = await connection.getAccountInfo(merkleRootConfig)
		if (merkleRootConfigAccount != null) {
			console.log(
				">>> Merkle root config is already existed. Skip creating new merkle root config."
			)
			continue
		}

		const tx = await alphaVault.createMerkleRootConfig(
			root,
			version,
			wallet.publicKey
		)

		const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash()
		const initMerkleRootConfigTx = new Transaction({
			lastValidBlockHeight,
			blockhash
		}).add(...tx.instructions)

		modifyComputeUnitPriceIx(initMerkleRootConfigTx, computeUnitPriceMicroLamports)

		if (dryRun) {
			console.log(`\n> Simulating init merkle root config tx...`)
			// @ts-expect-error: Keypair version difference
			await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
				initMerkleRootConfigTx
			])
		} else {
			console.log(`>> Sending init merkle root config transaction...`)
			const initAlphaVaulTxHash = await sendAndConfirmTransaction(
				connection,
				initMerkleRootConfigTx,
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
				`>>> Merkle root config version ${i + 1} successfully with tx hash: ${initAlphaVaulTxHash}`
			)
		}
	}
}

export async function createPermissionedAlphaVaultWithAuthority(
	connection: Connection,
	wallet: Wallet,
	alphaVaultType: AlphaVaultTypeConfig,
	poolType: PoolType,
	poolAddress: PublicKey,
	baseMint: PublicKey,
	quoteMint: PublicKey,
	quoteDecimals: number,
	params: FcfsAlphaVaultConfig | ProrataAlphaVaultConfig,
	whitelistList: WalletDepositCap[],
	dryRun: boolean,
	computeUnitPriceMicroLamports: number,
	opts?: {
		alphaVaultProgramId: PublicKey
	}
): Promise<void> {
	if (params.whitelistMode != WhitelistModeConfig.PermissionedWithAuthority) {
		throw new Error(`Invalid whitelist mode ${params.whitelistMode}. Only Permissioned with authority is allowed 
    `)
	}
	const alphaVaultProgramId = new PublicKey(
		opts?.alphaVaultProgramId ?? ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]
	)

	let cluster = ""

	switch (alphaVaultProgramId.toBase58()) {
		case ALPHA_VAULT_PROGRAM_IDS["mainnet-beta"]:
			cluster = "mainnet-beta"
			break
		case ALPHA_VAULT_PROGRAM_IDS["devnet"]:
			cluster = "devnet"
			break
		case ALPHA_VAULT_PROGRAM_IDS["localhost"]:
			cluster = "localhost"
			break
		default:
			throw new Error(`Invalid alpha vault program id ${alphaVaultProgramId}`)
	}

	const [alphaVaultPubkey] = deriveAlphaVault(
		wallet.publicKey,
		poolAddress,
		alphaVaultProgramId
	)

	const alphaVaultAccountInfo = await connection.getAccountInfo(
		alphaVaultPubkey,
		connection.commitment
	)
	if (!alphaVaultAccountInfo) {
		// 1. Create alpha vault
		if (alphaVaultType == AlphaVaultTypeConfig.Fcfs) {
			await createFcfsAlphaVault(
				connection,
				wallet,
				poolType,
				poolAddress,
				baseMint,
				quoteMint,
				quoteDecimals,
				params as FcfsAlphaVaultConfig,
				dryRun,
				computeUnitPriceMicroLamports,
				opts
			)
		} else if (alphaVaultType == AlphaVaultTypeConfig.Prorata) {
			await createProrataAlphaVault(
				connection,
				wallet,
				poolType,
				poolAddress,
				baseMint,
				quoteMint,
				quoteDecimals,
				params as ProrataAlphaVaultConfig,
				dryRun,
				computeUnitPriceMicroLamports,
				opts
			)
		}
	} else {
		console.log(`> Alpha vault already exists at ${alphaVaultPubkey}`)
	}

	// 2. Create StakeEscrow account for each whitelisted wallet
	console.log("Creating stake escrow accounts...")

	// @ts-expect-error: Connection version difference
	const alphaVault = await AlphaVault.create(connection, alphaVaultPubkey, {
		cluster
	})

	// Create StakeEscrow accounts for whitelist list
	const instructions =
		await alphaVault.createMultipleStakeEscrowByAuthorityInstructions(
			whitelistList,
			wallet.publicKey
		)

	await handleSendTxs(
		connection,
		instructions,
		MAX_INSTRUCTIONS_PER_STAKE_ESCROW_ACCOUNTS_CREATED,
		// @ts-expect-error: Keypair version difference
		wallet.payer,
		computeUnitPriceMicroLamports,
		dryRun,
		"create stake escrow accounts"
	)
}

// Derive alpha vault public key
export function deriveAlphaVault(
	base: PublicKey,
	lbPair: PublicKey,
	alphaVaultProgramId: PublicKey
) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from(SEED.vault), base.toBuffer(), lbPair.toBuffer()],
		alphaVaultProgramId
	)
}

export function deriveMerkleRootConfig(
	alphaVault: PublicKey,
	version: BN,
	programId: PublicKey
) {
	return PublicKey.findProgramAddressSync(
		[
			Buffer.from(SEED.merkleRoot),
			alphaVault.toBuffer(),
			new Uint8Array(version.toArrayLike(Buffer, "le", 8))
		],
		programId
	)
}

export function createMerkleTree(walletDepositCap: WalletDepositCap[]) {
	const tree = new BalanceTree(
		walletDepositCap.map((info) => {
			return {
				account: info.address,
				maxCap: info.maxAmount
			}
		})
	)

	return tree
}

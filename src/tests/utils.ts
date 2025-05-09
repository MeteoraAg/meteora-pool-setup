import { getAssociatedTokenAccount } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import { wrapSOLInstruction } from "@meteora-ag/dlmm"
import {
	createInitializeMint2Instruction,
	createInitializeTransferFeeConfigInstruction,
	createMintToInstruction,
	ExtensionType,
	getMintLen,
	getOrCreateAssociatedTokenAccount,
	NATIVE_MINT,
	TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token"
import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	sendAndConfirmTransaction,
	SystemProgram,
	Transaction
} from "@solana/web3.js"
import BN from "bn.js"
import { DEFAULT_SEND_TX_MAX_RETRIES } from "../libs/constants"

export const wrapSol = async (connection: Connection, amount: BN, user: Keypair) => {
	const userAta = getAssociatedTokenAccount(NATIVE_MINT, user.publicKey)
	const wrapSolIx = wrapSOLInstruction(
		user.publicKey,
		userAta,
		BigInt(amount.toString())
	)
	const latestBlockHash = await connection.getLatestBlockhash(connection.commitment)
	const tx = new Transaction({
		feePayer: user.publicKey,
		...latestBlockHash
	}).add(...wrapSolIx)
	tx.sign(user)
	const txHash = await sendAndConfirmTransaction(connection, tx, [user], {
		commitment: connection.commitment,
		maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
	})
	return txHash
}

export const airDropSol = async (
	connection: Connection,
	publicKey: PublicKey,
	amount = 1
) => {
	try {
		const airdropSignature = await connection.requestAirdrop(
			publicKey,
			amount * LAMPORTS_PER_SOL
		)
		const latestBlockHash = await connection.getLatestBlockhash(
			connection.commitment
		)
		await connection.confirmTransaction(
			{
				blockhash: latestBlockHash.blockhash,
				lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
				signature: airdropSignature
			},
			connection.commitment
		)
	} catch (error) {
		console.error(error)
		throw error
	}
}

export async function createToken2022(
	connection: Connection,
	payer: Keypair,
	decimals: number,
	extensions: ExtensionType[]
): Promise<PublicKey> {
	const mintKeypair = Keypair.generate()
	const maxFee = BigInt(9 * Math.pow(10, decimals))
	const feeBasisPoints = 100
	const transferFeeConfigAuthority = Keypair.generate()
	const withdrawWithheldAuthority = Keypair.generate()

	let mintLen = getMintLen(extensions)
	const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen)
	const transaction = new Transaction().add(
		SystemProgram.createAccount({
			fromPubkey: payer.publicKey,
			newAccountPubkey: mintKeypair.publicKey,
			space: mintLen,
			lamports: Number(mintLamports.toString()),
			programId: TOKEN_2022_PROGRAM_ID
		}),
		createInitializeTransferFeeConfigInstruction(
			mintKeypair.publicKey,
			transferFeeConfigAuthority.publicKey,
			withdrawWithheldAuthority.publicKey,
			feeBasisPoints,
			maxFee,
			TOKEN_2022_PROGRAM_ID
		),
		createInitializeMint2Instruction(
			mintKeypair.publicKey,
			decimals,
			payer.publicKey,
			null,
			TOKEN_2022_PROGRAM_ID
		)
	)

	await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair], {
		commitment: connection.commitment,
		maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
	})

	return mintKeypair.publicKey
}

export async function mintToToken2022(
	connection: Connection,
	payer: Keypair,
	mint: PublicKey,
	mintAuthority: Keypair,
	toWallet: PublicKey,
	rawAmount: BN
) {
	const destination = await getOrCreateAssociatedTokenAccount(
		connection,
		payer,
		mint,
		toWallet,
		true,
		undefined,
		undefined,
		TOKEN_2022_PROGRAM_ID
	)
	const mintIx = createMintToInstruction(
		mint,
		destination.address,
		mintAuthority.publicKey,
		BigInt(rawAmount.toString()),
		[],
		TOKEN_2022_PROGRAM_ID
	)

	let transaction = new Transaction()
	transaction.add(mintIx)

	await sendAndConfirmTransaction(connection, transaction, [payer, mintAuthority], {
		commitment: connection.commitment,
		maxRetries: DEFAULT_SEND_TX_MAX_RETRIES
	})
}

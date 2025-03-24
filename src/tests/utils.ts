import { getAssociatedTokenAccount } from "@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils"
import { wrapSOLInstruction } from "@meteora-ag/dlmm"
import { NATIVE_MINT } from "@solana/spl-token"
import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	Transaction
} from "@solana/web3.js"
import { BN } from "bn.js"

export const wrapSol = async (connection: Connection, amount: BN, user: Keypair) => {
	const userAta = getAssociatedTokenAccount(NATIVE_MINT, user.publicKey)
	const wrapSolIx = wrapSOLInstruction(
		user.publicKey,
		userAta,
		BigInt(amount.toString())
	)
	const latestBlockHash = await connection.getLatestBlockhash()
	const tx = new Transaction({
		feePayer: user.publicKey,
		...latestBlockHash
	}).add(...wrapSolIx)
	tx.sign(user)
	const txHash = await connection.sendRawTransaction(tx.serialize())
	await connection.confirmTransaction(txHash, "finalized")
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
		const latestBlockHash = await connection.getLatestBlockhash()
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

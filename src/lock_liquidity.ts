import { Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import {
	DEFAULT_COMMITMENT_LEVEL,
	MeteoraConfig,
	getQuoteMint,
	getQuoteDecimals,
	safeParseKeypairFromFile,
	parseConfigFromCli,
	LockLiquidityAllocation,
	modifyComputeUnitPriceIx,
	DEFAULT_SEND_TX_MAX_RETRIES
} from "."
import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import BN from "bn.js"
import AmmImpl from "@mercurial-finance/dynamic-amm-sdk"
import { SEEDS } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/constants"
import {
	deriveCustomizablePermissionlessConstantProductPoolAddress,
	createProgram,
	getAssociatedTokenAccount
} from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils"

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
	const provider = new AnchorProvider(connection, wallet, {
		commitment: connection.commitment
	})

	if (!config.baseMint) {
		throw new Error("Missing baseMint in configuration")
	}
	const baseMint = new PublicKey(config.baseMint)
	let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint)
	const quoteDecimals = await getQuoteDecimals(
		connection,
		config.quoteSymbol,
		config.quoteMint
	)

	console.log(`- Using base token mint ${baseMint.toString()}`)
	console.log(`- Using quote token mint ${quoteMint.toString()}`)

	const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
		baseMint,
		quoteMint,
		createProgram(connection).ammProgram.programId
	)

	console.log(`\n> Pool address: ${poolKey}`)

	if (!config.lockLiquidity) {
		throw new Error("Missing lockLiquidity configuration")
	}
	if (config.lockLiquidity.allocations.length == 0) {
		throw new Error("Missing allocations in lockLiquidity configuration")
	}

	const [lpMint] = PublicKey.findProgramAddressSync(
		[Buffer.from(SEEDS.LP_MINT), poolKey.toBuffer()],
		createProgram(connection).ammProgram.programId
	)
	const payerPoolLp = getAssociatedTokenAccount(lpMint, wallet.publicKey)
	const payerPoolLpBalance = (
		await connection.getTokenAccountBalance(payerPoolLp, connection.commitment)
	).value.amount
	console.log("> payerPoolLpBalance %s", payerPoolLpBalance.toString())

	const allocationByAmounts = fromAllocationsToAmount(
		new BN(payerPoolLpBalance),
		config.lockLiquidity.allocations
	)
	const pool = await AmmImpl.create(connection, poolKey)

	for (const allocation of allocationByAmounts) {
		console.log("\n> Lock liquidity %s", allocation.address.toString())
		let tx = await pool.lockLiquidity(
			allocation.address,
			allocation.amount,
			wallet.publicKey
		)
		modifyComputeUnitPriceIx(tx, config.computeUnitPriceMicroLamports)

		if (config.dryRun) {
			console.log(
				`\n> Simulating lock liquidty tx for address ${allocation.address} with amount = ${allocation.amount}... / percentage = ${allocation.percentage}`
			)
		} else {
			const txHash = await sendAndConfirmTransaction(
				connection,
				tx,
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
				`>>> Lock liquidity successfully with tx hash: ${txHash} for address ${allocation.address} with amount ${allocation.amount}`
			)
		}
	}
}

type AllocationByAmount = {
	address: PublicKey
	amount: BN
	percentage: number
}

function fromAllocationsToAmount(
	lpAmount: BN,
	allocations: LockLiquidityAllocation[]
): AllocationByAmount[] {
	const sumPercentage = allocations.reduce(
		(partialSum, a) => partialSum + a.percentage,
		0
	)
	if (sumPercentage === 0) {
		throw Error("sumPercentage is zero")
	} else if (sumPercentage > 100) {
		throw Error("sumPercentage is greater than 100")
	}

	let amounts: AllocationByAmount[] = []
	let sum = new BN(0)
	for (let i = 0; i < allocations.length - 1; i++) {
		const amount = lpAmount
			.mul(new BN(allocations[i].percentage))
			.div(new BN(sumPercentage))
		sum = sum.add(amount)
		amounts.push({
			address: new PublicKey(allocations[i].address),
			amount,
			percentage: allocations[i].percentage
		})
	}
	// the last wallet get remaining amount
	amounts.push({
		address: new PublicKey(allocations[allocations.length - 1].address),
		amount: lpAmount.sub(sum),
		percentage: allocations[allocations.length - 1].percentage
	})
	return amounts
}

main()

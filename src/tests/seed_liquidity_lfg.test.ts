import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import fs from "fs"
import { DLMM_PROGRAM_IDS, DYNAMIC_AMM_PROGRAM_IDS } from "../libs/constants"
import {
	createPermissionlessDlmmPool,
	createPermissionlessDynamicPool,
	seedLiquidityLfg,
	seedLiquiditySingleBin
} from "../index"
import { BN, Wallet, web3 } from "@coral-xyz/anchor"
import {
	ActivationTypeConfig,
	MeteoraConfig,
	PriceRoundingConfig
} from "../libs/config"
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	TOKEN_PROGRAM_ID,
	createMint,
	getOrCreateAssociatedTokenAccount,
	mintTo
} from "@solana/spl-token"
import DLMM, {
	deriveCustomizablePermissionlessLbPair,
	getBinArrayLowerUpperBinId,
	getPriceOfBinByBinId,
	getTokenBalance
} from "@meteora-ag/dlmm"
import Decimal from "decimal.js"
import babar from "babar"

const keypairFilePath =
	"./src/tests/keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json"
const keypairBuffer = fs.readFileSync(keypairFilePath, "utf-8")
const rpcUrl = "http://127.0.0.1:8899"
const connection = new Connection("http://127.0.0.1:8899", "confirmed")
const payerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairBuffer)))
const payerWallet = new Wallet(payerKeypair)
const DLMM_PROGRAM_ID = new PublicKey(DLMM_PROGRAM_IDS["localhost"])

describe("Test Seed Liquidity Single Bin", () => {
	const WEN_DECIMALS = 5
	const USDC_DECIMALS = 6
	const WEN_SUPPLY = 100_000_000
	const USDC_SUPPLY = 100_000_000
	const binStep = 200
	const feeBps = 200
	const initialPrice = 0.005

	const baseKeypair = Keypair.generate()
	const positionOwner = Keypair.generate().publicKey
	const feeOwner = Keypair.generate().publicKey

	let WEN: PublicKey
	let USDC: PublicKey
	let userWEN: web3.PublicKey
	let userUSDC: web3.PublicKey
	let poolKey: PublicKey

	beforeAll(async () => {
		WEN = await createMint(
			connection,
			payerKeypair,
			payerKeypair.publicKey,
			null,
			WEN_DECIMALS,
			Keypair.generate(),
			undefined,
			TOKEN_PROGRAM_ID
		)

		USDC = await createMint(
			connection,
			payerKeypair,
			payerKeypair.publicKey,
			null,
			USDC_DECIMALS,
			Keypair.generate(),
			undefined,
			TOKEN_PROGRAM_ID
		)

		const userWenInfo = await getOrCreateAssociatedTokenAccount(
			connection,
			payerKeypair,
			WEN,
			payerKeypair.publicKey,
			false,
			"confirmed",
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		)
		userWEN = userWenInfo.address

		const userUsdcInfo = await getOrCreateAssociatedTokenAccount(
			connection,
			payerKeypair,
			USDC,
			payerKeypair.publicKey,
			false,
			"confirmed",
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		)
		userUSDC = userUsdcInfo.address

		await mintTo(
			connection,
			payerKeypair,
			WEN,
			userWEN,
			payerKeypair.publicKey,
			WEN_SUPPLY * 10 ** WEN_DECIMALS,
			[],
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID
		)

		await mintTo(
			connection,
			payerKeypair,
			USDC,
			userUSDC,
			payerKeypair.publicKey,
			USDC_SUPPLY * 10 ** USDC_DECIMALS,
			[],
			{
				commitment: "confirmed"
			},
			TOKEN_PROGRAM_ID
		)

		const slot = await connection.getSlot()
		const activationPoint = new BN(slot).add(new BN(100))

		const config: MeteoraConfig = {
			dryRun: false,
			rpcUrl,
			keypairFilePath,
			computeUnitPriceMicroLamports: 100000,
			createBaseToken: null,
			baseMint: WEN.toString(),
			quoteSymbol: "USDC",
			dlmm: {
				binStep,
				feeBps,
				initialPrice,
				activationType: ActivationTypeConfig.Slot,
				activationPoint,
				priceRounding: PriceRoundingConfig.Up,
				hasAlphaVault: false
			},
			dynamicAmm: null,
			alphaVault: null,
			lockLiquidity: null,
			lfgSeedLiquidity: null,
			singleBinSeedLiquidity: null
		}

		//create DLMM pool
		await createPermissionlessDlmmPool(config, connection, payerWallet, WEN, USDC, {
			cluster: "localhost",
			programId: DLMM_PROGRAM_ID
		})

		// send SOL to wallets
		const payerBalance = await connection.getBalance(payerKeypair.publicKey)
		console.log(`Payer balance ${payerBalance} lamports`)

		const [poolKeyString] = deriveCustomizablePermissionlessLbPair(
			WEN,
			USDC,
			new PublicKey(DLMM_PROGRAM_ID)
		)
		poolKey = new PublicKey(poolKeyString)
	})

	it("Should able to seed liquidity LFG", async () => {
		const seedAmount = new BN(200_000 * 10 ** WEN_DECIMALS)
		const lockReleasePoint = new BN(0)
		const seedTokenXToPositionOwner = true
		const dryRun = false
		const computeUnitPriceMicroLamports = 100000
		const curvature = 0.6
		const minPrice = 0.005
		const maxPrice = 0.1

		const minPricePerLamport = DLMM.getPricePerLamport(
			WEN_DECIMALS,
			USDC_DECIMALS,
			minPrice
		)
		const maxPricePerLamport = DLMM.getPricePerLamport(
			WEN_DECIMALS,
			USDC_DECIMALS,
			maxPrice
		)

		await seedLiquidityLfg(
			connection,
			payerKeypair,
			baseKeypair,
			payerKeypair,
			positionOwner,
			feeOwner,
			WEN,
			USDC,
			seedAmount,
			curvature,
			minPricePerLamport,
			maxPricePerLamport,
			lockReleasePoint,
			seedTokenXToPositionOwner,
			dryRun,
			computeUnitPriceMicroLamports,
			{
				cluster: "localhost",
				programId: DLMM_PROGRAM_ID
			}
		)

		// WEN balance after = WEN supply - seed amount - 1 lamport
		const wenBalanceAfter = await getTokenBalance(connection, userWEN)
		const expectedBalanceAfter = new BN(WEN_SUPPLY * 10 ** WEN_DECIMALS - 1).sub(
			seedAmount
		)
		expect(wenBalanceAfter.toString()).toEqual(expectedBalanceAfter.toString())

		const pair = await DLMM.create(connection, poolKey, {
			cluster: "localhost",
			programId: DLMM_PROGRAM_ID
		})

		await pair.refetchStates()

		let binArrays = await pair.getBinArrays()
		binArrays = binArrays.sort((a, b) => a.account.index.cmp(b.account.index))

		const binLiquidities = binArrays
			.map((ba) => {
				const [lowerBinId, upperBinId] = getBinArrayLowerUpperBinId(ba.account.index)
				const binWithLiquidity: [number, number][] = []
				for (let i = lowerBinId.toNumber(); i <= upperBinId.toNumber(); i++) {
					const binAmountX = ba.account.bins[i - lowerBinId.toNumber()].amountX
					const binPrice = getPriceOfBinByBinId(i, pair.lbPair.binStep)
					const liquidity = new Decimal(binAmountX.toString())
						.mul(binPrice)
						.floor()
						.toNumber()
					binWithLiquidity.push([i, liquidity])
				}
				return binWithLiquidity
			})
			.flat()

		console.log(binLiquidities.filter((b) => b[1] > 0).reverse())
		console.log(binLiquidities.filter((b) => b[1] > 0))
		console.log(babar(binLiquidities))
	})
})

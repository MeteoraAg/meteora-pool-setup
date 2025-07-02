import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import fs from "fs"
import { DLMM_PROGRAM_IDS } from "../libs/constants"
import { createPermissionlessDlmmPool } from "../index"
import { Wallet } from "@coral-xyz/anchor"
import {
	ActivationTypeConfig,
	MeteoraConfig,
	PriceRoundingConfig
} from "../libs/config"
import { ExtensionType } from "@solana/spl-token"
import { createToken2022, mintToToken2022 } from "./utils"
import { BN } from "bn.js"

const keypairFilePath =
	"./src/tests/keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json"
const keypairBuffer = fs.readFileSync(keypairFilePath, "utf-8")
const rpcUrl = "http://127.0.0.1:8899"
const connection = new Connection("http://127.0.0.1:8899", "confirmed")
const payerKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairBuffer)))
// @ts-expect-error Keypair version different
const payerWallet = new Wallet(payerKeypair)
const DLMM_PROGRAM_ID = new PublicKey(DLMM_PROGRAM_IDS["localhost"])

describe("Test Create Dlmm Pool with token2022", () => {
	const WEN_DECIMALS = 5
	const USDC_DECIMALS = 6
	const JUP_DECIMALS = 6
	const WEN_SUPPLY = 100_000_000
	const USDC_SUPPLY = 100_000_000
	const JUP_SUPPLY = 7_000_000_000

	let WEN: PublicKey
	let USDC: PublicKey
	let JUP: PublicKey

	beforeAll(async () => {
		const extensions = [ExtensionType.TransferFeeConfig]
		WEN = await createToken2022(connection, payerKeypair, WEN_DECIMALS, extensions)

		USDC = await createToken2022(connection, payerKeypair, USDC_DECIMALS, extensions)

		JUP = await createToken2022(connection, payerKeypair, JUP_DECIMALS, extensions)

		await mintToToken2022(
			connection,
			payerKeypair,
			WEN,
			payerKeypair,
			payerKeypair.publicKey,
			new BN(WEN_SUPPLY).mul(new BN(10 ** WEN_DECIMALS))
		)

		await mintToToken2022(
			connection,
			payerKeypair,
			USDC,
			payerKeypair,
			payerKeypair.publicKey,
			new BN(USDC_SUPPLY).mul(new BN(10 ** USDC_DECIMALS))
		)

		await mintToToken2022(
			connection,
			payerKeypair,
			JUP,
			payerKeypair,
			payerKeypair.publicKey,
			new BN(JUP_SUPPLY).mul(new BN(10 ** JUP_DECIMALS))
		)
	})

	it("Should be able to create Basic DLMM pool", async () => {
		const config: MeteoraConfig = {
			dryRun: false,
			rpcUrl,
			keypairFilePath,
			computeUnitPriceMicroLamports: 100000,
			createBaseToken: null,
			baseMint: WEN.toString(),
			quoteSymbol: "USDC",
			dlmm: {
				binStep: 200,
				feeBps: 200,
				initialPrice: 0.5,
				activationType: ActivationTypeConfig.Timestamp,
				activationPoint: null,
				priceRounding: PriceRoundingConfig.Up,
				hasAlphaVault: false,
				creatorPoolOnOffControl: false
			},
			dynamicAmm: null,
			alphaVault: null,
			lockLiquidity: null,
			lfgSeedLiquidity: null,
			singleBinSeedLiquidity: null,
			m3m3: null,
			setDlmmPoolStatus: null,
			dynamicAmmV2: null
		}

		await createPermissionlessDlmmPool(config, connection, payerWallet, WEN, USDC, {
			cluster: "localhost",
			programId: DLMM_PROGRAM_ID
		})
	})

	it("Should be able to create DLMM pool without strict quote token", async () => {
		const config: MeteoraConfig = {
			dryRun: false,
			rpcUrl,
			keypairFilePath,
			computeUnitPriceMicroLamports: 100000,
			createBaseToken: null,
			baseMint: WEN.toString(),
			quoteMint: JUP.toString(),
			dlmm: {
				binStep: 200,
				feeBps: 200,
				initialPrice: 0.5,
				activationType: ActivationTypeConfig.Timestamp,
				activationPoint: null,
				priceRounding: PriceRoundingConfig.Up,
				hasAlphaVault: false,
				creatorPoolOnOffControl: false
			},
			dynamicAmm: null,
			alphaVault: null,
			lockLiquidity: null,
			lfgSeedLiquidity: null,
			singleBinSeedLiquidity: null,
			m3m3: null,
			setDlmmPoolStatus: null,
			dynamicAmmV2: null
		}

		await createPermissionlessDlmmPool(config, connection, payerWallet, WEN, JUP, {
			cluster: "localhost",
			programId: DLMM_PROGRAM_ID
		})
	})
})

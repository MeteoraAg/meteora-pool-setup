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
import {
  createFungible,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata'
import {
  createTokenIfMissing,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
  mintTokensTo,
} from '@metaplex-foundation/mpl-toolbox'
import {
  generateSigner,
  percentAmount,
  createGenericFile,
  signerIdentity,
  sol,
  createSignerFromKeypair
} from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { base58 } from '@metaplex-foundation/umi/serializers'
import fs from 'fs'
import path from 'path'


async function main() {
	let config: MeteoraConfig = parseConfigFromCli()

	console.log(`> Using keypair file path ${config.keyPath}`)
	let keypair = safeParseKeypairFromFile(config.keyPath)

	console.log("\n> Initializing with general configuration...")
	console.log(`- Using RPC URL ${config.rpcUrl}`)
	console.log(`- Dry run = ${config.dryRun}`)
	console.log(`- Using payer ${keypair.publicKey} to execute commands`)
	console.log(`- Using payer ${keypair.secretKey} to execute commands`)

	const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL)
	const wallet = new Wallet(keypair)

	const umi = createUmi("https://sleek-yolo-breeze.solana-mainnet.quiknode.pro/b7104d586deecc86c0a743fa7c431a4c123c9b3a/")
	.use(mplTokenMetadata())
	.use(irysUploader())

	const KEYPAIR_PATH = config.keypairFilePath || path.join(__dirname, 'keypairs', 'wallet.json');
	const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));

	const payer = createSignerFromKeypair(umi, {
		publicKey: keypairData.publicKey,
		secretKey: new Uint8Array(keypairData.secretKey)
	});
	umi.use(signerIdentity(payer))

	let baseMint: PublicKey
	let quoteMint = getQuoteMint(config.quoteSymbol, config.quoteMint)

	// If we want to create a new token mint
	if (config.createBaseToken) {
		// baseMint = await createTokenMint(connection, wallet, {
		// 	dryRun: config.dryRun,
		// 	mintTokenAmount: config.createBaseToken.mintBaseTokenAmount,
		// 	decimals: config.createBaseToken.baseDecimals,
		// 	computeUnitPriceMicroLamports: config.computeUnitPriceMicroLamports
		// })
		const metadata = {
			name: config.createBaseToken.name,
			symbol: config.createBaseToken.symbol,
			description: "",
			image: '', // Either use variable or paste in string of the uri.
		};
	
	
		console.log("Uploading metadata to Arweave via Irys");
		const metadataUri = await umi.uploader.uploadJson(metadata).catch((err) => {
			throw new Error(err);
		});
	
		// Creating the mintIx
	
		const mintSigner = generateSigner(umi);
	
		const createFungibleIx = createFungible(umi, {
			mint: mintSigner,
			name: config.createBaseToken.name,
			uri: metadataUri, // we use the `metadataUri` variable we created earlier that is storing our uri.
			sellerFeeBasisPoints: percentAmount(0),
			decimals: 0, // set the amount of decimals you want your token to have.
		});
	
		// This instruction will create a new Token Account if required, if one is found then it skips.
	
		const createTokenIx = createTokenIfMissing(umi, {
			mint: mintSigner.publicKey,
			owner: umi.identity.publicKey,
			ataProgram: getSplAssociatedTokenProgramId(umi),
		});
	
		// The final instruction (if required) is to mint the tokens to the token account in the previous ix.
	
		const mintTokensIx = mintTokensTo(umi, {
			mint: mintSigner.publicKey,
			token: findAssociatedTokenPda(umi, {
				mint: mintSigner.publicKey,
				owner: umi.identity.publicKey,
			}),
			amount: BigInt(1000000000),
		});
		console.log("Sending transaction")
		const tx = await createFungibleIx
			.add(createTokenIx)
			.add(mintTokensIx)
			.sendAndConfirm(umi);
	
		// finally we can deserialize the signature that we can check on chain.
		const signature = base58.deserialize(tx.signature)[0];
	
		// Log out the signature and the links to the transaction and the NFT.
		// Explorer links are for the devnet chain, you can change the clusters to mainnet.
		console.log('\nTransaction Complete')
		console.log('View Transaction on Solana Explorer')
		console.log(`https://explorer.solana.com/tx/${signature}`)
		console.log('View Token on Solana Explorer')
		console.log(`https://explorer.solana.com/address/${mintSigner.publicKey}`)
		baseMint = new PublicKey(mintSigner.publicKey);
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

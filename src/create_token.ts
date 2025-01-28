import { Wallet } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, PublicKey } from "@solana/web3.js";
import { DEFAULT_COMMITMENT_LEVEL, MeteoraConfig, createPermissionlessDlmmPool, createPermissionlessDynamicPool, createTokenMint, parseConfigFromCli, safeParseKeypairFromFile } from ".";
import { mplTokenMetadata, createV1, TokenStandard, createFungible, mintV1 } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplToolbox, setComputeUnitPrice } from "@metaplex-foundation/mpl-toolbox";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { base58, generateSigner, keypairIdentity } from "@metaplex-foundation/umi";

async function main() {
  let config: MeteoraConfig = parseConfigFromCli();

  console.log(`> Using keypair file path ${config.keypairFilePath}`);
  let keypair = safeParseKeypairFromFile(config.keypairFilePath);

  console.log("\n> Initializing with general configuration...");
  console.log(`- Using RPC URL ${config.rpcUrl}`);
  console.log(`- Dry run = ${config.dryRun}`);
  console.log(`- Using payer ${keypair.publicKey} to execute commands`);

  const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL);
  const wallet = new Wallet(keypair);

  if (!config.createBaseToken) {
    throw new Error("Missing createBaseToken in configuration");
  }

  if (!config.createBaseToken.tokenMetadata) {
    throw new Error("Missing tokenMetadata in createBaseToken configuration");
  }

  console.log(`>>> Creating token mint and metadata...`);

  const umi = createUmi(connection).use(mplToolbox())
  umi.use(keypairIdentity(fromWeb3JsKeypair(keypair)));
  // Create new token mint
  const mint = generateSigner(umi);

  console.log(`>>> Prepare to create token mint ${mint.publicKey}`);

  let builder = createFungible(umi, {
    mint,
    name: config.createBaseToken.tokenMetadata.name as string,
    symbol: config.createBaseToken.tokenMetadata.symbol as string,
    uri: config.createBaseToken.tokenMetadata.uri as string,
    decimals: config.createBaseToken.baseDecimals,
    sellerFeeBasisPoints: {
      basisPoints: 0n,
      identifier: "%",
      decimals: 2,
    },
  });

  const supply = Number(config.createBaseToken.mintBaseTokenAmount);
  if (Number.isNaN(supply)) {
    throw new Error("Invalid mint base token amount, not a number");
  }
  builder = builder.add(
    mintV1(umi, {
      mint: mint.publicKey,
      tokenStandard: TokenStandard.Fungible,
      tokenOwner: fromWeb3JsPublicKey(wallet.publicKey),
      amount: supply * Math.pow(10, config.createBaseToken.baseDecimals),
    }),
  );

  builder = builder.prepend(setComputeUnitPrice(umi, {
    microLamports: config.computeUnitPriceMicroLamports
  }));

  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: DEFAULT_COMMITMENT_LEVEL } });

  console.log(`>>> Created token mint and token metadata successfully with tx hash ${base58.deserialize(signature)[0]}`);
}

main();

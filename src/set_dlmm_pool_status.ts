import { Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  DEFAULT_COMMITMENT_LEVEL,
  MeteoraConfig,
  safeParseKeypairFromFile,
  parseConfigFromCli,
  modifyComputeUnitPriceIx,
  runSimulateTransaction,
} from ".";
import { Wallet } from "@coral-xyz/anchor";
import DLMM from "@meteora-ag/dlmm";

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

  const poolAddress = new PublicKey(config.setDlmmPoolStatus.poolAddress);
  const enabled = config.setDlmmPoolStatus.enabled;

  console.log(`- Using pool address ${poolAddress.toString()}`);
  console.log(`- Using enabled ${enabled}`);

  const lbPair = await DLMM.create(connection, poolAddress);

  const tx = await lbPair.setPairStatusPermissionless(enabled, wallet.publicKey);
  modifyComputeUnitPriceIx(tx, config.computeUnitPriceMicroLamports);

  if (config.dryRun) {
    console.log(`\n> Simulating set DLMM pool status tx...`);
    await runSimulateTransaction(connection, [wallet.payer], wallet.publicKey, [
      tx,
    ]);
  } else {
    console.log(`>> Sending set DLMM pool status transaction...`);
    let txHash = await sendAndConfirmTransaction(
      connection,
      tx,
      [wallet.payer],
    ).catch((e) => {
      console.error(e);
      throw e;
    });
    console.log(
      `>>> Set DLMM pool status tx hash: ${txHash}`,
    );
  }
}

main();

import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  ALPHA_VAULT_PROGRAM_IDS,
  DLMM_PROGRAM_IDS,
  DYNAMIC_AMM_PROGRAM_IDS,
} from "../libs/constants";
import fs from "fs";

export const keypairFilePath =
  "./src/tests/keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json";
export const keypairBuffer = fs.readFileSync(keypairFilePath, "utf-8");
export const rpcUrl = "http://127.0.0.1:8899";
export const connection = new Connection("http://127.0.0.1:8899", "confirmed");
export const payerKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(keypairBuffer)),
);
export const payerWallet = new Wallet(payerKeypair);
export const DLMM_PROGRAM_ID = new PublicKey(DLMM_PROGRAM_IDS["localhost"]);
export const DYNAMIC_AMM_PROGRAM_ID = new PublicKey(
  DYNAMIC_AMM_PROGRAM_IDS["localhost"],
);
export const ALPHA_VAULT_PROGRAM_ID = new PublicKey(
  ALPHA_VAULT_PROGRAM_IDS["localhost"],
);

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { DLMM_PROGRAM_IDS, DYNAMIC_AMM_PROGRAM_IDS } from "../libs/constants";

const keypairBuffer = fs.readFileSync(
  "./src/tests/keys/localnet/admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json",
  "utf-8"
);
const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const keypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(keypairBuffer))
);
const DLMM_PROGRAM_ID = new PublicKey(DLMM_PROGRAM_IDS["localhost"]);
const DYNAMIC_AMM_PROGRAM_ID = new PublicKey(DYNAMIC_AMM_PROGRAM_IDS["localhost"]);

describe("Test Create Dynamic AMM pool", () => {
  it("Should able to create Dynamic AMM pool", async () => {

  })
})


describe("Test Create DLMM pool", () => {
  it("Should able to create DLMM pool", async () => {

  })
})
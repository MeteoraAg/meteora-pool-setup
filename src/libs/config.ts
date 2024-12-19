import {
  parseCliArguments,
  safeParseJsonFromFile,
  validate_config,
} from "./utils";
import Ajv, { JSONSchemaType } from "ajv";

const CONFIG_SCHEMA: JSONSchemaType<MeteoraConfig> = {
  type: "object",
  properties: {
    rpcUrl: {
      type: "string",
    },
    dryRun: {
      type: "boolean",
    },
    keypairFilePath: {
      type: "string",
    },
    computeUnitPriceMicroLamports: {
      type: "number",
    },
    createBaseToken: {
      type: "object",
      nullable: true,
      properties: {
        mintBaseTokenAmount: {
          anyOf: [{ type: "number" }, { type: "string" }],
        },
        baseDecimals: {
          type: "number",
        },
      },
      required: ["mintBaseTokenAmount", "baseDecimals"],
      additionalProperties: false,
    },
    baseMint: {
      type: "string",
      nullable: true,
    },
    quoteSymbol: {
      type: "string",
    },
    baseDecimals: {
      type: "number",
    },
    dynamicAmm: {
      type: "object",
      nullable: true,
      properties: {
        baseAmount: {
          anyOf: [{ type: "number" }, { type: "string" }],
        },
        quoteAmount: {
          anyOf: [{ type: "number" }, { type: "string" }],
        },
        tradeFeeNumerator: {
          type: "number",
        },
        activationType: {
          type: "string",
        },
        activationPoint: {
          type: "number",
          nullable: true,
        },
        hasAlphaVault: {
          type: "boolean",
        },
      },
      required: [
        "baseAmount",
        "quoteAmount",
        "tradeFeeNumerator",
        "activationType",
        "hasAlphaVault",
      ],
      additionalProperties: false,
    },
    dlmm: {
      type: "object",
      nullable: true,
      properties: {
        binStep: {
          type: "number",
        },
        feeBps: {
          type: "number",
        },
        initialPrice: {
          type: "number",
        },
        activationType: {
          type: "string",
        },
        activationPoint: {
          type: "number",
          nullable: true,
        },
        priceRounding: {
          type: "string",
        },
        hasAlphaVault: {
          type: "boolean",
        },
      },
      required: [
        "binStep",
        "feeBps",
        "initialPrice",
        "activationType",
        "priceRounding",
        "hasAlphaVault",
      ],
      additionalProperties: false,
    },
    alphaVault: {
      type: "object",
      nullable: true,
      properties: {
        poolType: { type: "string" },
        alphaVaultType: { type: "string" },
        depositingPoint: { type: "number" },
        startVestingPoint: { type: "number" },
        endVestingPoint: { type: "number" },
        maxDepositCap: { type: "number", nullable: true },
        individualDepositingCap: { type: "number", nullable: true },
        maxBuyingCap: { type: "number", nullable: true },
        escrowFee: { type: "number" },
        whitelistMode: { type: "string" },
      },
      required: [
        "poolType",
        "alphaVaultType",
        "depositingPoint",
        "startVestingPoint",
        "endVestingPoint",
        "escrowFee",
        "whitelistMode",
      ],
    },
    lockLiquidity: {
      type: "object",
      nullable: true,
      properties: {
        alllocations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              percentage: {
                type: "number",
              },
              address: {
                type: "string",
              },
            },
            required: ["percentage", "address"],
          },
        },
      },
      required: ["allocations"],
    },
    lfgSeedLiquidity: {
      type: "object",
      nullable: true,
      properties: {
        minPrice: {
          type: "number",
        },
        maxPrice: { type: "number" },
        curvature: { type: "number" },
        seedAmount: { type: "string" },
        basePositionKeypairFilepath: { type: "string" },
        operatorKeypairFilepath: { type: "string" },
        positionOwner: { type: "string" },
        feeOwner: { type: "string" },
        lockReleasePoint: { type: "number" },
        seedTokenXToPositionOwner: { type: "boolean" },
      },
      required: [
        "minPrice",
        "maxPrice",
        "curvature",
        "seedAmount",
        "basePositionKeypairFilepath",
        "operatorKeypairFilepath",
        "positionOwner",
        "feeOwner",
        "lockReleasePoint",
        "seedTokenXToPositionOwner",
      ],
    },
    singleBinSeedLiquidity: {
      type: "object",
      nullable: true,
      properties: {
        price: { type: "number" },
        priceRounding: { type: "string" },
        seedAmount: { type: "string" },
        basePositionKeypairFilepath: { type: "string" },
        operatorKeypairFilepath: { type: "string" },
        positionOwner: { type: "string" },
        feeOwner: { type: "string" },
        lockReleasePoint: { type: "number" },
        seedTokenXToPositionOwner: { type: "boolean" },
      },
      required: [
        "price",
        "priceRounding",
        "seedAmount",
        "basePositionKeypairFilepath",
        "operatorKeypairFilepath",
        "positionOwner",
        "feeOwner",
        "lockReleasePoint",
        "seedTokenXToPositionOwner",
      ],
    },
  },
  required: [
    "rpcUrl",
    "dryRun",
    "keypairFilePath",
    "computeUnitPriceMicroLamports",
    "quoteSymbol",
  ],
  additionalProperties: true,
};

export interface MeteoraConfig {
  rpcUrl: string;
  dryRun: boolean;
  keypairFilePath: string;
  computeUnitPriceMicroLamports: number;
  createBaseToken: CreateBaseMintConfig | null;
  baseMint: string | null;
  quoteSymbol: string;
  dynamicAmm: DynamicAmmConfig | null;
  dlmm: DlmmConfig | null;
  alphaVault: FcfsAlphaVaultConfig | ProrataAlphaVaultConfig | null;
  lockLiquidity: LockLiquidityConfig | null;
  lfgSeedLiquidity: LfgSeedLiquidityConfig | null;
  singleBinSeedLiquidity: SingleBinSeedLiquidityConfig | null;
}

export interface CreateBaseMintConfig {
  mintBaseTokenAmount: number | string;
  baseDecimals: number;
}

export interface DynamicAmmConfig {
  baseAmount: number | string;
  quoteAmount: number | string;
  tradeFeeNumerator: number;
  activationType: string;
  activationPoint: number | null;
  hasAlphaVault: boolean;
}

export interface DlmmConfig {
  binStep: number;
  feeBps: number;
  initialPrice: number;
  activationType: string;
  activationPoint: number | null;
  priceRounding: string;
  hasAlphaVault: boolean;
}

export interface FcfsAlphaVaultConfig {
  poolType: string;
  alphaVaultType: string;
  // absolute value, depend on the pool activation type it will be the timestamp in secs or the slot number
  depositingPoint: number;
  // absolute value
  startVestingPoint: number;
  // absolute value
  endVestingPoint: number;
  // total max deposit
  maxDepositCap: number;
  // user max deposit
  individualDepositingCap: number;
  // fee to create stake escrow account
  escrowFee: number;
  // whitelist mode: permissionless / permission_with_merkle_proof / permission_with_authority
  whitelistMode: string;
}

export interface ProrataAlphaVaultConfig {
  poolType: string;
  alphaVaultType: string;
  // absolute value, depend on the pool activation type it will be the timestamp in secs or the slot number
  depositingPoint: number;
  // absolute value
  startVestingPoint: number;
  // absolute value
  endVestingPoint: number;
  // total max deposit
  maxBuyingCap: number;
  // fee to create stake escrow account
  escrowFee: number;
  // whitelist mode: permissionless / permission_with_merkle_proof / permission_with_authority
  whitelistMode: string;
}

export interface LockLiquidityConfig {
  allocations: LockLiquidityAllocation[];
}

export interface LockLiquidityAllocation {
  percentage: number;
  address: string;
}

export interface LfgSeedLiquidityConfig {
  minPrice: number;
  maxPrice: number;
  curvature: number;
  seedAmount: string;
  basePositionKeypairFilepath: string;
  operatorKeypairFilepath: string;
  positionOwner: string;
  feeOwner: string;
  lockReleasePoint: number;
  seedTokenXToPositionOwner: boolean;
}

export interface SingleBinSeedLiquidityConfig {
  price: number;
  priceRounding: string;
  seedAmount: string;
  basePositionKeypairFilepath: string;
  operatorKeypairFilepath: string;
  positionOwner: string;
  feeOwner: string;
  lockReleasePoint: number;
  seedTokenXToPositionOwner: boolean;
}

/// Parse and validate config from CLI
export function parseConfigFromCli(): MeteoraConfig {
  const ajv = new Ajv();
  const cliArguments = parseCliArguments();
  if (!cliArguments.config) {
    throw new Error("Please provide a config file path to --config flag");
  }
  const configFilePath = cliArguments.config!;
  console.log(`> Using config file: ${configFilePath}`);

  const validate = ajv.compile(CONFIG_SCHEMA);

  let config: MeteoraConfig = safeParseJsonFromFile(configFilePath);

  const isValid = validate(config);
  if (!isValid) {
    console.error(validate.errors);
    throw new Error("Config file is invalid");
  }

  validate_config(config);

  return config;
}

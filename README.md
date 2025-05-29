# Meteora Pool Toolkit
Scripts to create Meteora pools easily.

## Quick Navigation
- [Installation](#installation)
- [Configuration](#configuration)
  - [General Configuration](#general-configuration)
  - [Create Base Token Configuration](#create-base-token-configuration)
  - [Dynamic AMM Configuration](#dynamic-amm-configuration)
  - [Dynamic AMM V2 Configuration](#dynamic-amm-v2-configuration)
  - [DLMM Configuration](#dlmm-configuration)
  - [DLMM Seed Liquidity Configurations](#dlmm-seed-liquidity-single-bin-configuration)
  - [Alpha Vault Configurations](#alpha-vault-configuration)
  - [M3M3 Configuration](#create-m3m3-configuration)
- [Testing](#testings)
- [Running Scripts](#run-the-scripts)
  - [Create Dynamic AMM Pool](#run-the-scripts)
  - [Create Dynamic AMM V2 Pool](#run-the-scripts)
  - [Create DLMM Pool](#run-the-scripts)
  - [Create Alpha Vault](#run-the-scripts)
  - [Seed Liquidity](#run-the-scripts)
  - [Create M3M3 Farm](#run-the-scripts)

## Installation
We need [bun](https://bun.sh/) to run the scripts, install it via [bun installation](https://bun.sh/docs/installation).

Then install the dependencies by running the command `bun install` 

## Configuration
There are a various of config file that can be found at `config` directory that we need to carefully take a look first. It contains all the configurations required to run the scripts.
Also we need to provide the keypair for the payer wallet in `keypair.json` file. 

### General configuration
- `rpcUrl`: Solana RPC URL to get data and send transactions.
- `keypairFilePath`: Keypair file path to send transactions.
- `dryRun`: Set to false to send transactions.
- `computeUnitPriceMicroLamports`: CU price in micro lamports unit. For example: 100000.
- `createBaseToken`: Configuration to create base token.
- `baseMint`: Base token address if the `createBaseToken` field is not set. 
- `quoteSymbol`: Quote token symbol, only `SOL` or `USDC` is supported.
- `quoteMint`: Quote token mint, in case the user wants to create a DLMM launch pool with a token other than SOL or USDC.
- `dynamicAmm`: Dynamic AMM pool configuration.
- `dynamicAmmV2`: Dynamic AMM V2 pool configuration.
- `dlmm`: DLMM pool configuration.
- `alphaVault`: Fcfs or Prorata Alpha Vault configuration.

**Some configuration constraints**:
- `createBaseToken` and `baseMint` cannot be used together.
- `dynamicAmm` and `dlmm` cannot be used together.

### Create Base Token configuration
- `mintBaseTokenAmount`: Base token amount to be minted.
- `baseDecimals`: Base token decimal.

### Dynamic AMM configuration
- `baseAmount`: Base token amount.
- `quoteAmount`: Quote token amount.
- `tradeFeeNumerator`: Trade fee numerator, with fee denominator is set to 100_000.
- `activationType`: To activate pool trading base on `slot` or `timestamp`.
- `activationPoint`: To activate pool trading at a point, either slot valut or timestamp value base on `activationType`.
- `hasAlphaVault`: Whether alpha vault is enabled or not for this pool.

### Dynamic AMM V2 configuration
- `baseAmount`: Base token amount.
- `quoteAmount`: Quote token amount (Nullable value)
- `initPrice`: Initial price for the pool
- `maxPrice`: Max price range setup (null to use default)
- `poolFees`:
    - `maxBaseFeeBps`: Starting fee in basis points (e.g., 25 = 0.25%). It is base fee if scheduler is not set.
    - `minBaseFeeBps`: Target fee after reduction periods. Should be equal `maxBaseFeeBps` when fee scheduler is not used.
    - `numberOfPeriod`: Number of periods for fee reduction schedule
    - `totalDuration`: Total duration of the fee schedule (in slots or seconds based on activation type). `totalDuration == 0` if the `FeeScheduler` not be set up.
    - `feeSchedulerMode`: Fee scheduler mode (0 = linear, 1 = exponential)
    - `useDynamicFee`: Whether to use dynamic fee calculation based on price volatility (true/false)
    - `dynamicFeeConfig`: Configuration when useDynamicFee is true if not provide will use as default params in scripts
        - `filterPeriod`: Period for filtering price updates
        - `decayPeriod`: Period for decaying volatility accumulator
        - `reductionFactor`: Factor for reducing the volatility impact
        - `variableFeeControl`: Parameter controlling the variable fee response
        - `maxVolatilityAccumulator`: Maximum value for the volatility accumulator
- `collectFeeMode`: Fee collection mode (0 = base + quote, 1 = only quote)
- `activationType`: To activate pool trading base on `slot` or `timestamp`.
- `activationPoint`: To activate pool trading at a point, either slot value or timestamp value base on `activationType`.
- `hasAlphaVault`: Whether alpha vault is enabled or not for this pool.

### DLMM configuration
- `binStep`: DLMM pool bin step.
- `feeBps`: Fee bps for DLMM pool.
- `initialPrice`: Initial pool price.
- `activationType`: To activate pool trading base on `slot` or `timestamp`.
- `activationPoint`: To activate pool trading at a point, either slot valut or timestamp value base on `activationType`.
- `priceRounding`: Should be `up` or `down`.
- `hasAlphaVault`: Whether alpha vault is enabled or not for this pool.
- `creatorPoolOnOffControl`: Allow creator to turn on/off pool control.

**NOTICE**: There is only one DLMM pool that can be created with the same base and quote tokens, using the instruction `initializeCustomizablePermissionlessLbPair`. So if users are using that instruction to create a new DLMM pool with the same base and quote tokens, but with different parameters, then the transaction will be failed.

### DLMM Seed Liquidity Single Bin configuration
- `price`: Price to add liquidity.
- `priceRounding`: Should be `up` or `down`.
- `seedAmount`: Number of liquidity base token to add.
- `basePositionKeypairFilepath`: Keypair file path for the base position.
- `operatorKeypairFilepath`: Keypair file path for the operator.
- `positionOwner`: Public key of the position owner.
- `feeOwner`: Publick key of the fee owner.
- `lockReleasePoint`: Timestamp that depositor can withdraw the liquidity from the position.
- `seedTokenXToPositionOwner`: Flag to indicate that whether the script should automatically send 1 lamport of token X to position owner to proof ownership.

### DLMM Seed Liquidity LFG configuration
- `minPrice`: Min price range to add liquidity.
- `maxPrice`: Max price range to add liquidity.
- `seedAmount`: Number of liquidity base token to add.
- `curvature`: Determines how liquidity is distributed across the price range.
- `basePositionKeypairFilepath`: Keypair file path for the base position.
- `operatorKeypairFilepath`: Keypair file path for the operator.
- `positionOwner`: Public key of the position owner.
- `feeOwner`: Publick key of the fee owner.
- `lockReleasePoint`: Timestamp that depositor can withdraw the liquidity from the position.
- `seedTokenXToPositionOwner`: Flag to indicate that whether the script should automatically send 1 lamport of token X to position owner to proof ownership.

### Alpha Vault configuration
- `poolType`: `dynamic` or `dlmm` pool type.
- `alphaVaultType`: Alpha Vault type, could be `fcfs` or `prorata`
- `depositingPoint`: Absolute value that, the slot or timestamp that allows deposit depend on the pool activation type.
- `startVestingPoint`: Absolute value, the slot or timestamp that start vesting depend on the pool activation type. 
- `endVestingPoint`: Absolute value, the slot or timestamp that end vesting depend on the pool activation type.  
- `maxDepositCap`: Maximum deposit cap.
- `individualDepositingCap`: Individual deposit cap.
- `escrowFee`: Fee to create stake escrow account.
- `whitelistMode`: `permissionless` or `permission_with_merkle_proof` or `permission_with_authority`.

### Prorata configuration
- `depositingPoint`: Absolute value that, the slot or timestamp that allows deposit depend on the pool activation type.
- `startVestingPoint`: Absolute value, the slot or timestamp that start vesting depend on the pool activation type. 
- `endVestingPoint`: Absolute value, the slot or timestamp that end vesting depend on the pool activation type.  
- `maxBuyingCap`: Maximum buying cap.
- `escrowFee`: Fee to create stake escrow account.
- `whitelistMode`: `permissionless` or `permission_with_merkle_proof` or `permission_with_authority`.

### Create M3M3 configuration
- `topListLength`: Length of the top list.
- `unstakeLockDurationSecs`: Duration need wait before withdraw. Starting from the unstack action timestamp.
- `secondsToFullUnlock`:  Time required for locked claim fee to be fully dripped.
- `startFeeDistributeTimestamp`: When the fee start distributes. The timestamp should be 48h after pool activate to accumulate more rewards to attract stakers as in [M3M3 reminder](https://docs.meteora.ag/for-memecoins/m3m3#important-reminder)

## Testings
First, run the localnet
```bash
bun run start-test-validator
```

Then run the test: `bun test`

## Run the scripts
Run the script with config file specified in the CLI, some examples:

**Create dynamic AMM pool**
```bash
bun run src/create_pool.ts --config ./config/create_dynamic_amm_pool.json
```

**Create customizable dynamic AMM V2 pool**
```bash
bun run src/create_damm_v2_customizable_pool.ts --config ./config/create_damm_v2_customize_pool.json
```

**Create dynamic AMM pool with new token mint**
```bash
bun run src/create_pool.ts --config ./config/create_dynamic_amm_pool_with_new_token.json
```

**Create new DLMM pool**
```bash
bun run src/create_pool.ts --config ./config/create_dlmm_pool.json
```

**Create new DLMM pool without strict quote token**
```bash
bun run src/create_pool.ts --config ./config/create_dlmm_pool_without_strict_quote_token.json
```

**Create new DLMM pool with alpha vault**
```bash
bun run src/create_pool.ts --config ./config/create_dlmm_pool_with_fcfs_alpha_vault.json
```
Then run
```bash
bun run src/create_alpha_vault.ts --config ./config/create_dlmm_pool_with_fcfs_alpha_vault.json
```

**Lock liquidity for Dynamic AMM pool**
```bash
bun run src/lock_liquidity.ts --config ./config/lock_liquidity.json
```

**Seed liquidity for DLMM pool with single bin strategy**
```bash
bun run src/seed_liquidity_single_bin.ts --config ./config/seed_liquidity_single_bin.json
```

**Seed liquidity for DLMM pool with LFG strategy**
```bash
bun run src/seed_liquidity_lfg.ts --config ./config/seed_liquidity_lfg.json
```

**Create M3M3 farm**
This script requires you to create the token mint and the pool first.
After that you need to lock the liquidity before creating the M3M3 farm. The addresses in the allocations should contains the fee farm address.
```bash
bun run src/lock_liquidity_for_m3m3.ts --config ./config/create_m3m3_farm.json
```

**Create the M3M3 fee farm**
```bash
bun run src/create_m3m3_farm.ts --config ./config/create_m3m3_farm.json
```

**Set DLMM pool status**
```bash
bun run src/set_dlmm_pool_status.ts --config ./config/set_dlmm_pool_status.json
```

**Create alpha vault with Permission with authority whitelist mode**
```bash
bun run src/create_alpha_vault.ts --config ./config/create_dynamic_amm_pool_with_permissioned_authority_vault.json
```

## After deployment
To view pool on the UI, access the links below
- For Dynamic AMM pool: `https://app.meteora.ag/pools/<POOL_ADDRESS>`
- For DLMM pool: `https://app.meteora.ag/dlmm/<POOL_ADDRESS>`

# Changelog
All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.INFO

## [1.4.7] - 2025-06-04 - [PR #44](https://github.com/MeteoraAg/meteora-pool-setup/pull/44)

### Fixed
- DLMM seed liquidity LFG price range

## [1.4.6] - 2025-05-08 - [PR #41](https://github.com/MeteoraAg/meteora-pool-setup/pull/12)
### Fixed
- Fix wrong position owner passed in `seedLiquidityLfg` function.

## [1.4.5] - 2025-05-08 - [PR #12](https://github.com/MeteoraAg/meteora-pool-setup/pull/12)
### Added
- Function to create alpha vault with permissioned with merkle proof whitelist mode.

## [1.4.4] - 2025-05-06 - [PR #37](https://github.com/MeteoraAg/meteora-pool-setup/pull/37)
### Added 
- Function to create damm v2 customizable pool with single side liquidity.
- Use `getDynamicFeeParams` to get dynamic fee params (Noted default max dynamic fee = 20% of base fee)
- Use `getBaseFeeParams` to get base fee params. Included calculate params for fee scheduler.

## [1.4.3] - 2025-03-28 - [PR #28](https://github.com/MeteoraAg/meteora-pool-setup/pull/28)
### Added 
- Update function to create DLMM pool with Token2022.
- Add prettier config file to format.

## [1.4.2] - 2025-03-06 - [PR #11](https://github.com/MeteoraAg/meteora-pool-setup/pull/11)
### Added 
- Add whitelist mode `permissioned_with_authority` when creating alpha vault.

## [1.4.1] - 2025-03-05 - [PR #24](https://github.com/MeteoraAg/meteora-pool-setup/pull/24)
### Added 
- Add field `creatorPoolOnOffControl` in DLMM configuration.
- Add script `set_dlmm_pool_status`.

### Changed

## [1.4.0] - 2025-01-27 - [PR #20](https://github.com/MeteoraAg/meteora-pool-setup/pull/20)
### Added 
- Add field `quoteMint` in configuration. 

### Changed
- Make field `quoteSymbol` to be optional in configuration.
- 

## [1.3.0] - 2025-01-21 - [PR #13](https://github.com/MeteoraAg/meteora-pool-setup/pull/13)
### Added 
- Script to create M3M3 fee farm.

## [1.2.0] - 2025-01-06 - [PR #8](https://github.com/MeteoraAg/meteora-pool-setup/pull/8)

### Added 
- Script to seed liquidity single bin for DLMM pool.
- GIthub workflow CI testing with `solana-test-validator`.

### Changed
- Moved `baseDecimals` config from general config to 

### Removed
- Removed `Anchor.toml` along with `anchor localnet` test setup.

## [1.1.0]

### Added
- Initial version
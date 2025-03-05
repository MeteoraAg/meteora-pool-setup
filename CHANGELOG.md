# Changelog
All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

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
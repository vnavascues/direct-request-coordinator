# Direct Request Coordinator 1.0.0 (DRCoordinator)

A framework that enables dynamic LINK payments on Direct Request (Any API), syncing the price with the network gas and token conditions. It targets node operators that seek being competitive on their Direct Request operations.

[See DRCoordinator 0.1.0 submission for the Chainlink Hackaton Spring 2022](https://devpost.com/software/direct-request-coordinator-drcoordinator)

## Inspiration

The first version of DRCoordinator presented at the Spring 2022 hackaton was rushed and felt like a PoC (in fact there was lots of prototype testing!). Since then, I really wanted to revamp it with production standards and give it closure. With OCR2DR in the works the place of DRCoordinator on Direct Request production integrations is uncertain. Nevertheless, DRCoordinator 1.0.0 will help well anyone who wants to learn Web3 development on Ethereum with Solidity & Hardhat and few Chainlink products in depth (Direct Request and Price Feeds).

[These are the new on-chain features](<(https://github.com/vnavascues/direct-request-coordinator/blob/main/contracts/drcoordinator/v0.8/DRCoordinator.sol#L158)>) (contracts):

- Adopted `fulfillData()` as fulfillment method instead of `fallback()` (which has been removed).
- Standardised and improved custom errors and removed unused ones.
- Standardised and improved events.
- Added `Spec.paymentType` which enables REQUEST LINK payment as a percentage (as permiryad), apart from the flat payment type already supported. A percentage REQUEST LINK payment is more beneficial from the Operator point of view and allows setting `minContractPaymentLinkJuels` as 0 Juels in all DRCoordinator TOML job specs (simplifying and standardising them all).
- Added support for whitelisting consumers on-chain per `Spec` (authorised consumers), as DRCoordinator TOML job specs must use the `requesters` field to protect themselves from spamming attacks (due to low `minContractPaymentLinkJuels`).
- Added a refund mode. If SPOT LINK payment is less than REQUEST LINK payment DRCoordinator refunds Consumer the difference.
- Added `consumerMaxPayment`, which allows Consumer to set a maximum LINK amount willing to pay per request.
- Added multi Price Feed support (2-hop mode). DRCoordinator can calculate the wei units of GASTKN per unit of LINK (`weiPerUnitLink`) using two price feeds: GASTKN / TKN (`priceFeed1`) and LINK / TKN (`priceFeed2`). This mode allows to deploy DRCoordinator on networks where the LINK / GASTKN Price Feed is not available, e.g. Gnosis Chain, Moonriver, Moonbeam, Metis, etc.
- Replaced the L2 Sequencer Offline Flag logic with [L2 Sequencer Uptime Status Feeds](https://docs.chain.link/data-feeds/l2-sequencer-feeds) to check L2 Sequencer availability on Arbitrum, Metis and Optimism.
- Added public lock in `DRCoordinator.sol` as per [Read-only Reentrancy](https://www.youtube.com/watch?v=8D5ZJyU-dX0). It may be useful for Consumer devs as DRCoordinator has methods like `availableFunds` which result varies if read during `requestData()` and `fulfillData()` execution.
- Added `permiryadFactor`, which allows tuning the fee percentage limits.
- Improved interfaces and contracts inheritance.
- Simplified `DRCoordinator.cancelRequest()` by loading `FulfillConfig.expiration` and `FulfillConfig.payment`.
- Improved the Consumer libraries (contracts), e.g. `DRCoordinatorClient.sol`, `ChainlinkExternalFulfillmentCompatible.sol`.
- Removed `minConfirmations` logic after understanding that the Consumer plays no role on it (see [Chainlink release v1.5.0](https://github.com/smartcontractkit/chainlink/releases/tag/v1.5.0) and [Adjusting Minimum Outgoing Confirmations for high throughput jobs](https://www.notion.so/EVM-performance-configuration-handbook-a36b9f84dcac4569ba68772aa0c1368c#e9998c2f722540b597301a640f53cfd4)). Also that it is still not possible [setting `minConfirmations` from a job pipeline variable](https://github.com/smartcontractkit/chainlink/issues/6680).
- Applied [Chainlink's Solidity Style Guide](https://github.com/smartcontractkit/chainlink/blob/00330f50f020e73d0280210c6073c4db9702dcf9/contracts/style.md).
- Added NatSpec.
- Upgraded to Solidity v0.8.17.

These are the new off-chain features (Hardhat repository):

- Fixed bugs in utils, tasks, methods, etc.
- Improved transaction `overrides` (from `ethers.js`) options.
- Improved Web3 provider and signer management.
- Extended the network support (e.g. Optimism / Arbitrum Goerli, Klaytn Baobab, etc.) with regards to the Chainlink framework (e.g. LinkToken, Price Feeds), contract deployment & verification, etc.
- Improved test suite and added GitHub Actions CI.
- Improved project folder structure.
- Improved tasks documentation.
- Updated dependencies.

## How it works

This is a high level overview of the Direct Request Model with DRCoordinator:

### 1. Deploying a DRCoordinator

NodeOps have to deploy and set up first a DRCoordinator:

- Deploy, set up and verify a DRCoordinator using the `drcoordinator:deploy` Hardhat task.
  - NB: By default it will attempt to fetch the LINK / TKN Price Feed on the network and it will error if it is not found. In this case NodeOps will require to deploy in Multi Price Feed mode (See [Price Feed Contract Addresses](https://docs.chain.link/data-feeds/price-feeds/addresses) for choosing the right Price Feeds).
- Amend any non-immutable config after deployment using the `drcoordinator:set-config` Hardhat task.
- NodeOps can check the DRCoordiantor storage detail using the `drcoordinator:detail` Hardhat task.

### 2. Adding the job on the Chainlink node

NodeOps have to add a DRCoordinator-friendly TOML job spec, which only requires to:

- Set the `minContractPaymentLinkJuels` field to 0 Juels. Make sure to set first the node env var `MINIMUM_CONTRACT_PAYMENT_LINK_JUELS` to 0 as well.
- Add the DRCoordinator address in `requesters` to prevent the job being spammed (due to 0 Juels payment).

### 3. Making the job requestable

NodeOps have to:

1. Create the `Spec` (see `SpecLibrary.sol`) of the TOML spec added above and upload it in the DRCoordinator storage via `DRCoordinator.setSpec()`.

- NodeOps should create the equivalent JSON Spec and upload it using the `drcoordinator:import-file` Hardhat task.

2. Use `DRCoordinator.addSpecAuthorizedConsumers()` if on-chain whitelisting of consumers is desired.
3. Share/communicate the `Spec` details (via its key) so the Consumer devs can monitor the `Spec` and act upon any change on it, e.g. `fee`, `payment`, etc.

### 4. Implementing the Consumer

Devs have to:

- Make Consumer inherit from `DRCoordinatorClient.sol` (an equivalent of `ChainlinkClient.sol` for DRCoordinator requests). This library only builds the `Chainlink.Request` and then sends it to DRCoordinator (via `DRCoordinator.requestData()`), which is responsible for extending it and ultimately send it to Operator.
- Request a `Spec` by passing the Operator address, the maximum amount of gas willing to spend, the maximum amount of LINK willing to pay and the `Chainlink.Request` (which includes the `Spec.specId` as `id` and the request parameters CBOR encoded).

Devs can time the request with any of these strategies if gas prices are a concern:

- Call `DRCoordinator.calculateMaxPaymentAmount()`.
- Call `DRCoordinator.calculateSpotPaymentAmount()`.
- Call `DRCoordinator.getFeedData()`.

### 5. Requesting the job spec

NB: Make sure Consumer has LINK balance in DRCoordinator.

When Consumer calls `DRCoordinator.requestData()` DRCoordinator does:

1. Validates the arguments.
2. Calculates MAX LINK payment amount, which is the amount of LINK Consumer would pay if all the `callbackGasLimit` was used fulfilling the request (tx `gasLimit`).
3. Checks that the Consumer balance can afford MAX LINK payment and that Consumer is willing to pay the amount.
4. Calculates the LINK payment amount (REQUEST LINK payment) to be hold in escrow by Operator. The payment can be either a flat amount or a percentage (permiryad) of MAX LINK payment. The `paymentType` and `payment` are set in the `Spec` by NodeOp.
5. Updates Consumer balancee.
6. Stores essential data from Consumer, `Chainlink.Request` and `Spec` in a `FulfillConfig` (by request ID) struct to be used upon fulfillment.
7. Extends the Consumer `Chainlink.Request` and sends it to Operator (paying the REQUEST LINK amount), which emits the `OracleRequest` event.

### 7. Requesting the Data Provider(s) API(s), processing its response and submitting the result on-chain

NB: all these steps are follow the standard Chainlink Direct Request Model.

1. The Chainlink node subscribed to the event triggers a `directrequest` job run.
2. The `OracleRequest` event data is decoded and the log and request parameters are processed and used to request the Data Povider(s) API(s).
3. The API(s) response(s) are processed and the result is submitted on-chain back to DRCoordinator via `Operator.fulfillOracleRequest2()`.

- NB: forwarding the response twice (i.e. Operator -> DRCoordinator -> Consumer) requires to encode the result as `bytes` twice (via `ethabiencode` or `ethabiencode2`)./
- NB: the `gasLimit` parameter of the `ethtx` task has set the amount defined by Consumer when called `DRCoordinator.requestData()`.

### 7. Fulfilling the request

1. Validates the request and its caller.
2. Loads the request configuration (`FulfillConfig`) and attempts to fulfill the request by calling the Consumer callback method passing the response data.
3. Calculates SPOT LINK payment, which is the equivalent gas amount used fulfilling the request in LINK, minus the REQUEST LINK payment, plus the fulfillment fee. The fee can be either a flat amount of a percentage (permiryad) of SPOT LINK payment. The `feeType` and `fee` are set in the `Spec` by NodeOp.
4. Checks that the Consumer balance can afford SPOT LINK payment and that Consumer is willing to pay the amount. It is worth mentioning that DRCoordinator can refund Consumer if REQUEST LINK payment was greater than SPOT LINK payment and DRCoordinator's balance is greater or equal than SPOT payment. Tuning the `Spec.payment` and `Spec.fee` should make this particular case very rare.
5. Updates Consumer and DRCoordinator balances.

## Challenges I ran into

The current DRCoordinator design makes it work as a "forwarder", as it forwards requests and responses between the Consumer & Operator contracts. I call this design DRCoordinator-Cooperator. The first task I addressed for this hackaton was prototyping a DRCoordinator-Operator, which would be a DRCoordinator that inherited from Operator and extended its functionallity for a new kind of requests using any of these approaches:

- Implement internal LINK balances (do not use `LINK.transferAndCall()`) and just emit an `OracleRequest` event (which is required to trigger `directrequest` jobs, but it does not require to be preceeded by a LINK payment).
- Use `LINK.transferAndCall()` and implement a new `DRCOORDINATOR_REQUEST_SELECTOR`.

None of them came to fruiton due to the `Operator.sol` subclass limitations; the key methods have `private` visibility. Despite either modifying `Operator.sol` or getting rid of it was an option, I wanted to stick to the Chainlink standards and do not increase the risk of NodeOps (`Operator.sol` has been audited & widely tested).

## Accomplishments that I'm proud of

Having the willpower of revamping the version presented at the previous Chainlink Hackaton knowing OCR2DR is in the works. DRCoordinator 1.0.0 is a more mature product and I've achieved many of the "What's Next?" bulletpoints listed on the previous hackaton.

Also running lots of experiments with `directrequest` jobs and trying the new built-in core tasks, e.g. `ethabiencode2`.

## What's next for DRCoordinator

- Factor in the L1 fees when having to calculate MAX / SPOT LINK payment amount on L2s. The [Chainlink KeeperRegistryBase1_3 does it for Arbitrum and Optimism](https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/KeeperRegistryBase1_3.sol#L176).
- Add Hardhat tasks to query and decode fulfillment transactions, like in [DRAFT](https://github.com/linkpoolio/draft).
- Consider extending `Spec` (or a related mapping) with job spec metadata, e.g. an optional IPFS CID that points to the integration docs.
- Fuzz testing.
- Support any NodeOp that wants to give it a try and consider generic tweaks.
- Improve the repository README.md and How To guides.
- Trying to understand DRCoordinator place in the ecosystem once OCR2DR is released.

## What I learned

An even deeper dive into Chainlink Direct Request.

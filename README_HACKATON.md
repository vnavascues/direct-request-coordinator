# Direct Request Coordinator

A framework, contracts & job specs mgmt tools, that enable a requester to pay to a node-op as much LINK as required to cover the gas used on fulfillment, plus some profit margin set by the node-op.

## Inspiration

Chainlink provides a wide variety of products and services. The market demand has reasonably caused that few of them evolve more than others. Unfortunately, the Direct Request model is lagging and it requires a revision if it is the product supposed to power the next wave of blockchain adoption.

The main problem Direct Request has is its pricing model. It is innacurate, prone to human error, time consuming, exponentially complex the more layers node operators have (i.e. jobs -> dynamic results -> nodes -> networks, and fulfillment contracts), and unbearable on volatile market and gas spike events. Chainlink node operators seek for profit, and Direct Request jobs do not seem nowadays very appealing to deal with, nor profitable for the time spent on them.

As a persona experience, the same day that the [AccuWeather adapter](https://market.link/data-providers/2e24e9d0-48dc-4e6e-9e29-b153b5a42d57/integrations) was released, the LINK token was at ~$34, and I remember spending quite a bit of time princing its 3 jobs on each supported network. A month later the LINK token was at ~$15 and the jobs were theoretically operating on a loss (for the good or the bad big adoption wasn't/is isn't here yet). The idea of implementing "dynamic LINK prices" (which has always been my project codename) started there. And this willing has been exacerbated by the recent increase on Direct Request integrations accross multiple networks, the incrementing gas spikes, and the recent market volatility. As an engineer, I don't want to feel that I'm wasting my engineering time pricing jobs without the right tools, an especially knowing that the final value won't be accurate enough.

A couple of weeks ago I read about the major improvements VRF v2 includes:

- A pay-as-you-go pricing model that leverages Chainlink Price Feeds to charge the gas used (converted to LINK) on fulfillment plus a flat fee.
- On-demand callback `gasLimit` set by the consumer.
- A versatile subscription model with a management app to pre-fund multiple requests.

And I thought, what if...:

- All these features were integrated in Direct Request as well?
- Node operators didn't have to worry about dynamic result sizes, gas limit fine tuning, defensive pricing, gas & token prices and conversions, gas spikes, and market volatility?
- Node operators had a framework to manage this?

Well, these were the motivations behind presenting Direct Request Coordinator on the Spring '22 Hackaton. OK;LG.

## What it does

A framework composed by contracts and job spec management tools, that enable a data requester to pay to a node operator as much LINK as required to cover the gas costs incurred by the data delivery, plus some profit margin set by the node operator on that particular job. More detail on each feature below:

### Feature Contracts

[DRCoordinator.sol](./contracts/drcoordinator/DRCoordinator.sol):

- It is owned by the node operator. Only one per network is required (no inconvenient having more).
- Interfaces a consumer with 1..N oracle contracts (`Operator`).
- Stores Specs; a mix of essential data found in a TOML job spec (i.e. `externalJobID`), business params (e.g. `feeType`, `fulfillmentFee`), and on-chain execution params (e.g. `operator`, `minConfirmations`, `gasLimit`).
- Contains the consumers' LINK balances, that can be topped-up by any EOA.
- It leverages the network LINK / TKN Price Feed to calculate the MAX (worst-case scenario using all the `gasLimit` on fulfillment) & SPOT (gas used on fulfillment) LINK payment amounts. It takes into account too whether the answer is stale and any L2 Sequencer Health Flag.
- It allows to fulfill requests on contracts that are not the requester (i.e. `callbackAddress !== msg.sender`).

[DRCoordinatorConsumer.sol](./contracts/drcoordinator/DRCoordinatorConsumer.sol):

- It is the `ChainlinkClient` equivalent (used on standard consumer contracts):
- It is the parent contract for `DRCoordinator` consumers.
- It provides methods for building, tracking and cancelling `DRCoordinator` requests (to be fulfilled either in the consumer itself on in another contract).
- It stores the `LINK`, `Operator` and `DRCoordinator` interfaces

[FulfillChainlinkExternalRequestCompatible.sol](./contracts/drcoordinator/FulfillChainlinkExternalRequestCompatible.sol):

- It is the contract to be inherited by a fulfillment contract that it isn't the requester (aka. split consumer pattern, `callbackAddress !== msg.sender`).
- It enables 1..N `DRCoordinator` (access controlled) to notify it about the upcoming external fulfillments.

### Example Contracts

[DRCConsumerCryptoCompare](./contracts/drcoordinator/DRCConsumerCryptoCompare.sol):

- A CrytpoCompare API consumer
- Requires [TOML job spec (fulfillment via fallback())](./specs-toml/drcoordinator/cryptocompare-get-prices-fallback.toml) or [TOML job spec (fulfillment via fulfillData())](./specs-toml/drcoordinator/cryptocompare-get-prices-fulfilldata.toml)

[DRCConsumerSportsdataio](./contracts/drcoordinator/DRCConsumerSportsdataio.sol):

- A Sportsdataio API consumer
- Requires [TOML job spec (fulfillment via fallback())](./specs-toml/drcoordinator/sportsdataio-get-schedule-v1.0.0-fallback.toml) or [TOML job spec (fulfillment via fulfillData())](./specs-toml/drcoordinator/sportsdataio-get-schedule-v1.0.0-fulfilldata.toml)

### Management Tools

A set of Hardhat tasks that allow:

- Deploy, setup and verify a `DRCoordinator` contract.
- Deploy, setup, fund and verify `DRCoordinatorConsumer` contracts.
- Log the `DRCoordinator` storage, e.g. configs, Spec keys, Spec details, etc.
- Sync JSON spec files with the `DRCoordinator` storage; create, update and delete (CUD) specs.
- Generate a Spec key for the given params, so it can be queried to the `DRCoordinator`.
- Calculate/simulate MAX and SPOT LINK payment amounts for the given network params.
- Set configuration parameters, pause/unpase the contract, transfer ownership, etc.
- Withdraw the LINK funds of the owner.

### Example specs

[TOML Job Specs](./specs-toml/drcoordinator/)

[JSON Specs](./specs/)

## How I built it

### Stack

This framework uses Solidity, TypeScript, Hardhat, ethers.js, TypeChain, Waffle/Mocha/Chai, Chainlink contracts, OpenZeppelin contracts, and Slither.
It just needs a copy of the [.env.example](./.env.example) with a `PRIVATE_KEY` and the provider's API key (Alchemy or Infura depending on the network). Optionally, the API key of the Etherscan-like explorer of the network if contract verification is needed.

### Scripts

All the call and transaction scripts are [documented](./tasks/drcoordinator/README.md) Hardhat tasks with a big effort on the [task argument validations](./utils/task-arguments-validations.ts), [logging](./utils/logger.ts) and [error messaging](./utils/errors-list.ts). I also included quite a bit of Chainlink-related [tooling and utils](./utils/chainlink.ts).

### Contracts

The [DRCoordinator.sol](./contracts/drcoordinator/DRCoordinator.sol) is a brand new contract that contains a slightly modified version of the [VRFCoordinatorV2](https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/VRFCoordinatorV2.sol) functions related with calculating the LINK payment amount. Ideally I'd like to have implemented at least its more versatile subscription model.

The [DRCoordinatorConsumer.sol](./contracts/drcoordinator/DRCoordinatorConsumer.sol) takes the essential and existing tooling from [ChainlinkClient](https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.7/ChainlinkClient.sol) (using `CustomError`), and adds specific one for `DRCoordinator` requests.

## Challenges I ran into

1. Fulfilling the request is of course the most challenging and critical step. `DRCoordinator` is not the `callbackAddress`, nor it has the `callbackFunctionId` of the Chainlink Request. It means when building and sending the Chainlink Request, you have to store and replace critical information about the original request (and load it on the fulfillment). It also forces you to make decisions about TOML job specs format, more or less off/on-chain data processing, etc. My first approach was being consistent and as less invasive as possible with the standard TOML job spec format/tasks. Many node operators have experience adding Chainlink Price Feed jobs, but don't too much tweaking a Direct Request one. For this very reason I handled it via the `fallback()` function. At some point I decided to experiment an alternative way, via the `fulfillData()` method, which is not that invasive and feels less hacky. I decided to preserve both ways on this hackaton project, so reviewers can see each one's implications. In fact fulfilling via `fulfillData()` requires a double encoding at TOML job spec level, and an extra `abi.encodePacked(fulfillConfig.callbackFunctionId, _data)` at `DRCoordinator` level.

2. Batch tranactions on CUD specs into `DRCoordinator`. If the node operator is just adding few JSON specs into the specs file and syncing them with `DRCoordinator` there won't be any problem. But what happens if the node operator has to suddently deploy +200 jobs on a fresh `DRCoordinator`? I experienced running out of gas and I had to chunk the array of specs.

3. Fine tunning most of the `DRCoordinator` constants. Few of them started as private variables set at constructor level (with getters & setters), but once I was profiling and benchmarking the contract for different data size cases, etc. I was able to convert them into constants (e.g. `GAS_AFTER_PAYMENT_CALCULATION`). Also worth mentioning that `MIN_CONSUMER_GAS_LIMIT` and `MAX_REQUEST_CONFIRMATIONS` have a values that come from other Chainlink contracts, so extra research on existing code was needed.

4. Calculating the MAX and SPOT LINK payment amount. Despite having the `VRFCoordinatorV2` implementation, I wanted to test it myself instead of just copy and pasting it. Also implementing the `PERMIRYAD` fee type.

5. Having the patience for carrying e2e tests (and see them failing). It requires to coordinate lots of elements (especially if Chainlink External Adapters (EAs), and/or external fulfillment contracts are involved), and take very specific steps. I relied a lot on code testing just to spare the effort of real e2e testing.

6. Finding the `minConfirmations` bug (reported as [GitHub issue](https://github.com/smartcontractkit/chainlink/issues/6680)). I was running a Chainlink node v1.2.0 and I had to make sure whether was sorted or not on the v1.4.1. I had modify contracts and replicate e2e tests.

## Accomplishments that I'm proud of

I'm proud of easing an everyday issue for me and other node operators (business and engineering-wise), and providing a more reliable, trustable, and fair product to Direct Request consumers. To be honest, I'm proud about something as low-key as the Hardhat task arguments verifications, and dryrun & forking modes, which provide an extra layer of reliability & security when it comes to run the scripts.

I don't expect at all node operators rushing to adopt this framework and make it "The Standard", nor that it's everyone's cup of tea (e.g. Chainlink Labs engineers, node operators, Direct Request consumers). My whole purpose was to lay the cards on the table about the current Direct Request pricing problem, and having an open conversation altogether about how it can be improved. For instance, which parts can be addressed by Chainlink Labs? Which other ones should be outsourced to 3rd parties? And which ones should be developed in-house by node operators? This implementation is just my current solution to the problem I see, and it is at a very early stage. Lots of business and engineering conversations have to happen to mature it.

## What's next for Direct Request Coordinator (DRCoordinator)

You'll find on the repository a more [granular list](./README.md#whats-next-for-direct-request-coordinator) of improvements and topics to address.
A high level overview would be:

- Business-wise, aligning it with the business interests with regards to pricing jobs, and it is well integrated with metrics.
- Engineering-wise, making the contracts more secure, cheap/efficient, tested and documented. Also improving the tooling experience interacting with `DRCoordiantor` and Specs management.
- Chainlink ecosystem-wise, having other node operators and Chainlink Labs engineers trying it and having a thought how we can all improve the current Direct Request model.

## What I learned

This journey has been a deep dive into the Chainlink Direct Request model, in particular the `ChainlinkClient` and the `Operator` contracts. There is so much thought and quality put on them by its engineers.

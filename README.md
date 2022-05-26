# Direct Request Coordinator

Chainlink Spring '22 hackaton

## TODO

- Business:

  - Discuss dynamic LINK prices would affect [market.link](https://market.link/) UI/UX with regards to job detail, and metrics.
  - Discuss the pricing model, e.g. tiers, fee types, etc.
  - Discuss how does it affect `directrequest` metrics in terms of LINK transferred from a consumer to an `Operator.sol`.

- Engineering:

  - BUG: parsing `minConfirmations` from `cborparse` output makes the jobrun fail, no matter if the value is sent as `uint256` or `string`.

    - [GitHub issue](https://github.com/smartcontractkit/chainlink/issues/6680)

  - Choose fulfilling via `fallback()`, or via `fulfillData()`, but don't keep both. Discuss pros & cons, for instance:

    - `fallback()`:

      - Pros: slightly cheaper (-2.4% at least, no extra `abi.encodePacked(fulfillConfig.callbackFunctionId, _data)` on-chain) and less TOML jobspec invasive (no extra `ethabiencode` task; leverages off-chain more).
      - Cons: feels hacky, and all the cons associated with addiing logic into the `fallback` function.

    - `fulfillData()`:
      - Pros: not using the `fallback()` function, and any advantage non-fallback methods have, for instance it can use `recordChainlinkFulfillment(requestId)`.
      - Cons: slithgly more expensive (+1.4% at least, as it requires an extra `abi.encodePacked(fulfillConfig.callbackFunctionId, _data)` on-chain, which is affected by the data size). It also requires as adding an extra `ethabiencode` task in the TOML jobspec. Nonetheless, DRCoordinator already forces node operators to create a new TOML jobspec, as the following fields/properties have to be amended: `minContractPaymentLinkJuels` (directrequest field), `gasLimit` (from `ethtx` task), and `minConfirmations` (from `ethtx` task).

  - Improve the existing tests, e.g fix coverage, more than a few integration tests should unit tests, address pending methods to test (e.g. withdraw methods, CUD specs, reentrancy, etc.), test more edge cases, run a fuzzer. Also run a proper SC audit.
  - Consider adding a more versatile subscription model, like `VRFCoordinatorV2.sol` one.
  - Improve the dev experience polishing the `DRCoordinatorConsumer` contract.
  - Add NatSpec.
  - Add support for calculating the `weiPerUnitLink` via `LINK / USD` + `TKN / USD` on networks where the `LINK / TKN` price feed is not available yet.
  - Iterate over it during the testing phase, refactoring, deleting unnecessary code, and aiming to make it cheaper (i.e. uncessary events and/or topics).
  - Consider integrating ENS domains in the process of populating the `LINK_TKN_FEED` instead of just relying on this repository addresses copied from the Chainlink docs (human error prone at multiple levels).
  - Improve the tooling (i.e. tasks).
  - Consider integrating Keepers for keeping up-to-date `fallbackWeiPerUnitLink` (this is tricky, as `performUpkeep()` is an external public function).
  - Consider storing the config (e.g. `fallbackWeiPerUnitLink`, `stalenessSeconds`) in a struct (evaluate management cost).

## FAQs

### Spec:

- `key`: composite key by `keccak256(abi.encodePacked(operator, specId))`. It allows storing N specs that share the same `externalJobID` but have different `operator` (via `Operator.sol`).
- `payment`: it must be greater or equal than `minContractPaymentLinkJuels` TOML jobspec field (or its non-explicit default). Setting a `payment` value is not trivial, beware of:

  - Chainlink node version and/or its `MINIMUM_CONTRACT_PAYMENT_LINK_JUELS`.
  - Network gas price.
  - Gas estimation given by `calculateMaxPaymentAmount()` (based on `Spec.gasLimit`).
  - Minimum LINK price on the network by writing `0x` (min ~44k gas) via Operator.sol.
  - Value range is: `0 < payment <= 1e27 (LINK_TOTAL_SUPPLY)`.

- `minConfirmations`:
  - Value range is: `0 <= minConfirmations <= 200 (MAX_REQUEST_CONFIRMATIONS)`.
- `fulfilmentFee`:
  - Value range for `FeeType.PERMIRYAD` is: `0 < fulfillmentFee <= 9999` (from 0.01% to 99.99%) -> TODO: check this
  - Value range for `FeeType.FLAT` is: `0 < fulfillmentFee <= 1e27 (LINK_TOTAL_SUPPLY)`

## How To

Operator: `0x878541888a928a31F9EAb4cB61DfD4e381EC2f00`

1. Deploy:

```sh
yarn hardhat drcoordinator:deploy \
--description beta-2 \
--fallbackweiperunitlink "8000000000000000" \
--gasafterpaymentcalc "56000" \
--stalenessseconds "86400" \
--setup \
--verify \
--network eth-kovan
```

Old: `0x7e70aBA8171e0bCf02AA40b5DAB64FF24b622C2a` (beta-1)
Old: `0xDC7e5C9B9B0E1433F92591BaeC40eD1077C5B7a1` (beta-1) - Works, but `minConfirmations` bug on jobrun
New: `0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b` (beta-2)

2. Import Specs file

NB: remember to replace `oracleAddr` address

```sh
yarn hardhat drcoordinator:import-file \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--filename local-demo2 \
--mode prod \
--network eth-kovan
```

3. Deploy consumer (cryptocompare & sportsdataio)

```sh
yarn hardhat drcoordinator:deploy-consumer \
--name DRCConsumerSportsdataio \
--funds "3000000000000000000" \
--verify \
--network eth-kovan
```

Address: `0x7Aad88929d07d51E5180656593fB9501A418E3E3`

```sh
yarn hardhat drcoordinator:deploy-consumer \
--name DRCConsumerCryptoCompare \
--funds "3000000000000000000" \
--verify \
--network eth-kovan
```

Address: `0x00690914AD25fCF447c254379d6bb7CC405069Ee`

4. Log detail

```sh
yarn hardhat drcoordinator:detail \
--address 0x7e70aBA8171e0bCf02AA40b5DAB64FF24b622C2a \
--keys \
--specs \
--network eth-kovan
```

## Demo - DRCConsumerSportsdataio

Address: `0x7Aad88929d07d51E5180656593fB9501A418E3E3`

### case: fallback

specId:
`0x3233356262656361363566333434623762613862336166353031653433363232`

requestId:
`0x06b207db93276c8cfaa5b79fec6238fa20289d1c15944b307146f94b7eac8b4c`

request tx:
https://kovan.etherscan.io/tx/0xc80650b51c39d3b0d571cb4ca11d747ebb802aabb0dd69d5288732f46eabfb55

fulfill tx:
https://kovan.etherscan.io/tx/0xce89c559367e6d81b2934ebd74ac2e258190e8ab048db373c82ec176047881e0

### case: fulfillData

specId:
`0x3834333130383662656635613435316639376633303762386637336364353232`

requestId
`0x7e0bd1c5fd7bb1cc73b521495ab9cebb9c498a29ecde0411caf289a474708c52`

request tx:
https://kovan.etherscan.io/tx/0x7187eec6fb672382014f4856b010fa576c1c0eb3e88ca8baf780b177f84af05e

fulfill tx:
https://kovan.etherscan.io/tx/0xc7258a7609a3f029a89e2c2ffc19535fa3614c18d6b3046436efb1f24240f753

## Demo - DRCConsumerCryptoCompare

Address: `0x00690914AD25fCF447c254379d6bb7CC405069Ee`

### case: fallback

specId:
`0x3130656330393839626362363463366261346334653138633766623561386133`

requestId:
`0x8cea783ddfffed7f4d2dea253ada929b97bc33cc32915207fd8ef2fd9407bfd8`

request tx:
https://kovan.etherscan.io/tx/0x849349d6661df54f4b34315d054b5ab27ab5750597a6ef54798a5ef1557eaa97

fulfill tx:
https://kovan.etherscan.io/tx/0x48d3bc7e5a56957b6e22f7c656c04684adda877d78cc0ec1f8003a49314204f6

### case: fulfillData

specId:
`0x6638623862383437363732303439326238626266626331306534386236323031`

requestId
`0xe6fecf182887f9a7d4bc5fe4e081186d7bc4b81e557e18a03c53e55ba65e6f0b`

request tx:
https://kovan.etherscan.io/tx/0x816ade63eedc3438a9ebd111841810f58d456bbfce925e8f7daeb587556efda6

fulfill tx:
https://kovan.etherscan.io/tx/0x0e80343aabb84ff7948c4222646527496298b40488dd318952f47f38bed2a8eb

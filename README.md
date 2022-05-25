# directrequest-fair-payment

Chainlink Spring 22 hackaton

## TODO

- Business:

  - Discuss if the current pay-as-you-go model makes any sense at all beyond this PoC.
  - Discuss dynamic LINK prices would affect market.link UI/UX.
  - Discuss the pricing model, e.g. tiers, fee types, etc.
  - Discuss how does it affect `directrequest` metrics in terms of LINK transferred from a consumer to an `Operator.sol`.

- Engineering:

  - Either fulfill via `fallback`, or via `fulfillData`. Choose une, probably is unjustified keeping both. Benchmark them (gas cost), consumer/node-operator pros & cons, etc.

    - `fallback`:

      - Pros: slightly less TOML jobspec invasive (no need to add an extra `ethabiencode`). Leverages off-chain, no extra `abi.encode()` on-chain.
      - Cons: feels hacky. Any con of using `fallback`.

    - `fulfillData`:
      - Pros: any pro of using a method instead of the fallback one. Can use `recordChainlinkFulfillment(requestId)`.
      - Cons: requires adding an extra TOML jobspec task (i.e. `ethabiencode`). Nonetheless, DRCoordinator already forces you to create a new TOML jobspec, as the following fields/properties have to be amended: `minContractPaymentLinkJuels` (directrequest field), `gasLimit` (from `ethtx` task), `minConfirmations` (from `ethtx` task).

  - Add support for a subscription model, like `VRFCoordinatorV2.sol`.
  - Support `cancelRequest` for consumers. Easier to implement on subscription model.
  - Improve the existing tests, e.g few integration tests should be moved into a unit test suite, add more unit tests, test more edge cases, run a fuzzer. Also run a proper SC audit.
  - Consider storing the config (e.g. `fallbackWeiPerUnitLink`, `gasAfterPaymentCalculation`, `stalenessSeconds`) in a struct.
  - Add support for calculating the `weiPerUnitLink` via `LINK / USD` + `TKN / USD` on networks where the `LINK / TKN` price feed is not available yet.
  - Consider integrating Keepers for keeping up-to-date `fallbackWeiPerUnitLink` (this is tricky, as `performUpkeep()` is an external public function).
  - Improve the tooling, and scripting.
  - Monitoring.

## FAQs

### Spec:

- `key`: composite key by `keccak256(abi.encodePacked(oracle, specId))`. It allows storing N specs that share the same `externalJobID` but have different `oracleAddr` (via `Operator.sol`).
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

1. Deploy:

```sh
yarn hardhat drcoordinator:deploy \
--description beta-1 \
--fallbackweiperunitlink "8000000000000000" \
--gasafterpaymentcalc "55000" \
--stalenessseconds "86400" \
--setup \
--verify \
--network eth-kovan
```

Address: `0x7e70aBA8171e0bCf02AA40b5DAB64FF24b622C2a` (beta-1)

2. Import Specs file

NB: remember to replace `oracleAddr` address

```sh
yarn hardhat drcoordinator:import-file \
--address 0x7e70aBA8171e0bCf02AA40b5DAB64FF24b622C2a \
--filename local-demo1 \
--mode prod \
--network eth-kovan
```

3. Deploy consumer (sportsdataio-linkpool)

```sh
yarn hardhat drcoordinator:deploy-consumer \
--name ADRCoordinatorConsumer \
--funds "10000000000000000000" \
--verify \
--network eth-kovan
```

4. Log detail

```sh
yarn hardhat drcoordinator:detail \
--address 0x7e70aBA8171e0bCf02AA40b5DAB64FF24b622C2a \
--keys \
--specs \
--network eth-kovan
```

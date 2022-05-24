# directrequest-fair-payment

Chainlink Spring 22 hackaton

## TODO

- Business:

  - Discuss if the current pay-as-you-go model makes any sense at all beyond this PoC.
  - Discuss dynamic LINK prices would affect market.link UI/UX.
  - Discuss the pricing model, e.g. tiers, fee types, etc.

- Engineering:

  - Add more testing, e.g. edge cases, run a fuzzer. Run a proper SC audit.
  - Consider integrating Keepers to TODO...
  - Add support for a subscription model, like `VRFCoordinatorV2.sol`.
  - Consider storing the config (e.g. fallbackWeiPerUnitLink, gasAfterPaymentCalculation, stalenessSeconds) in a struct.
  - Add support for calculating the `weiPerUnitLink` via `LINK / USD` + `TKN / USD` on networks where the `LINK / TKN` price feed is not available yet.
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

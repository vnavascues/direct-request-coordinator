# How To 01: DRCoordinator Basic Tutorial

In this section we'll showcase the most basic way to set up and use DRCoordinator mixing NodeOp and Consumer point of views.

**DRCoordinator setup**: deployed on a L1 network (ETH Goerli), single Price Feed (LINK / ETH).
**Requested jobs**: 3 jobs that request the CryptoCompare API and respectively return 1, 3 and 6 token prices in USD. This different in result size will make them having different gas demans, directly affecting their LINK payment amopunts.

The requirements are:

1. Clone or fork the [repository](https://github.com/vnavascues/direct-request-coordinator).
2. Create a .env that sets the `PRIVATE_KEY` (or `MNEMONIC`), and the provider's configuration (e.g. `INFURA_API_KEY`, `ETH_GOERLI_PROVIDER` & `ETH_GOERLI_PROTOCOL` for Infura). Also set credentials of the respective network block explorer (e.g. `ETHERSCAN_API_KEY`).
3. Install the requirements.
4. Get some testnet ETH and LINK (30 LINK at least). Here’s the [Chainlink faucet](https://faucets.chain.link/).
5. Run a [Chainlink node, e.g. v1.10.0](https://github.com/smartcontractkit/chainlink/releases/tag/v1.10.0) on ETH Goerli.
6. Deploy and setup an `Operator.sol`. Use [this Hardhat task](../tasks/chainlink/v0.7/operator/README.md#deploy-an-operator-100).

A [`DRCoordinator` on ETH Goerli](https://goerli.etherscan.io/address/0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f) (at address `0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f`) has been deployed for this tutorial just for the code along. You must deploy and own yours.

[The deployment tx is here](https://goerli.etherscan.io/tx/0x8ce909b535796616b28fa08feea8258492cf7939a21056d1d9e5091f7c4a75b7).

NB: be aware each DRCoordinator tx may require you to customise the `--overrides` wrt gas limit and gas prices.

## 1. Deploy DRCoordinator

Task documentation: [Deploy DRCoordinator](../tasks/drcoordinator/README.md#deploy-drcoordinator)

```sh
yarn hardhat drcoordinator:deploy \
--description "drc01 eth-goerli" \
--fallbackweiperunitlink "5198745300000000" \
--stalenessseconds "86400" \
--network eth-goerli \
--verify
```

[The deployment tx is here](https://goerli.etherscan.io/tx/0x8ce909b535796616b28fa08feea8258492cf7939a21056d1d9e5091f7c4a75b7)

## 2. Log DRCoordinator detail

Task documentation: [Log DRCoordinator detail](../tasks//drcoordinator/README.md#detail)

```sh
yarn hardhat drcoordinator:detail \
--address 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f \
--keys \
--specs \
--authconsumers \
--network eth-goerli
```

Which outputs:

```sh
INFO: connecting to DRCoordinator at: 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f
INFO: detail:
    address: "0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f"
    typeAndVersion: "DRCoordinator 1.0.0"
    description: "drc01 eth-goerli"
    owner: "0x4E269e03460719eC89Bb5e3B2610c7ba67BF900D"
    paused: false
    balance: "0.0LINK"
    profit: "0.0 LINK"
    LINK: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB"
    IS_MULTI_PRICE_FEED_DEPENDANT: false
    PRICE_FEED_1: "0xb4c4a493AB6356497713A78FFA6c60FB53517c63 (LINK / ETH)"
    PRICE_FEED_2: "0x0000000000000000000000000000000000000000 (N/A)"
    IS_L2_SEQUENCER_DEPENDANT: false
    L2_SEQUENCER_FEEED: "0x0000000000000000000000000000000000000000 (N/A)"
    L2_SEQUENCER_GRACE_PERIOD_SECONDS: "0 (N/A)"
    GAS_AFTER_PAYMENT_CALCULATION: "50000"
    fallbackWeiPerUnitLink: "5198745300000000"
    permiryadFeeFactor: "1"
    stalenessSeconds: "86400"
```

## 3. Add the jobs in the Chainlink node

NB: First, make sure that your Chainlink node has either:

- Legacy .env flattened config: `MINIMUM_CONTRACT_PAYMENT_LINK_JUELS` set to `0` (see [env var docs](https://docs.chain.link/chainlink-nodes/configuration-variables#minimum_contract_payment_link_juels)).
- Multichain .env TOML config: `MinContractPayment` set `'0'` for ETH Goerli (`ChainId = '42'`) (see code snippet below).

```toml
[[EVM]]
ChainID = '42'
MinContractPayment = '0'
Nodes = []
```

Open the Chainlink node and add the following jobs replacing the `requesters`, `contractAddress` and `ethtx.to` fields:

- [CryptoCompare Get Prices DRCoordinator LINK - DRC](../jobs/toml-specs/cryptocompare-get-prices-1.toml):

  - Returns the USD price of 1 token as: `(uint256 link)`.

- [CryptoCompare Get Prices DRCoordinator BTC | ETH | LINK - DRC](../jobs/toml-specs/cryptocompare-get-prices-3.toml):

  - Returns the USD prices of 3 tokens as: `(uint256 btc, uint256 eth, uint256 link)`.

- [CryptoCompare Get Prices DRCoordinator BTC | ETH | LINK | MATIC | AAVE | SNX - DRC](../jobs/toml-specs/cryptocompare-get-prices-6.toml):
  - Returns the USD prices of 6 tokens as: `(uint256 btc, uint256 eth, uint256 link, uint256 matic, uint256 aave, uint256 snx)`.

The specs above have very simple and low percentages (i.e. 1% and 10%), and just small changes on the `gasLimit` to make simple to understand the LINK payment amount calculations. Also cause higher values would probably require more LINK in the Consumer balance.

## 4. Deploy DRCConsumerCryptoCompare

NB: this step has been placed before creating the JSON specs and uploading them in DRCoordinator storage to demo the on-chain whitelisting, which requires knowing in advance the Consumer address.

Task documentation: [Deploy a DRCoordinator Consumer](../tasks/drcoordinator/README.md#deploy-a-drcoordinatorconsumer)

Deploy a [DRCConsumerCryptoCompare](../contracts/drcoordinator/v0.8/dev/DRCConsumerCryptoCompare.sol) and fund it with 3 LINK:

```sh
yarn hardhat drcoordinator:deploy-consumer \
--name DRCConsumerCryptoCompare \
--drcoordinator 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f \
--fund \
--amount "3000000000000000000" \
--verify \
--network eth-goerli
```

[The deployment tx is here](https://goerli.etherscan.io/tx/0x6a5e31bdc73d20655cf7192e1617ed3c7524bffe6285a150869a51209284b285)

[The `approve()` tx is here](https://goerli.etherscan.io/tx/0x8076437a49eef4bf06e813a0aeabcdcad7184da2ed48e7cfb6d920feef9421da)

[The `addFunds()` tx is here](https://goerli.etherscan.io/tx/0xc6b18d10ae32529cafa738a19ab840c4c89f92d506ccc719d6914cab8b502149)

[DRCConsumerCryptocompare](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29) deployed at `0x0507c8f8e62def7132135d617d11d1c7faa50d29`.

Logging the detail again shows DRCoordinator has 3 LINK:

```sh
INFO: connecting to DRCoordinator at: 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f
INFO: detail:
    address: "0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f"
    typeAndVersion: "DRCoordinator 1.0.0"
    description: "drc01 eth-goerli"
    owner: "0x4E269e03460719eC89Bb5e3B2610c7ba67BF900D"
    paused: false
    balance: "3.0LINK"
    profit: "0.0 LINK"
    LINK: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB"
    IS_MULTI_PRICE_FEED_DEPENDANT: false
    PRICE_FEED_1: "0xb4c4a493AB6356497713A78FFA6c60FB53517c63 (LINK / ETH)"
    PRICE_FEED_2: "0x0000000000000000000000000000000000000000 (N/A)"
    IS_L2_SEQUENCER_DEPENDANT: false
    L2_SEQUENCER_FEEED: "0x0000000000000000000000000000000000000000 (N/A)"
    L2_SEQUENCER_GRACE_PERIOD_SECONDS: "0 (N/A)"
    GAS_AFTER_PAYMENT_CALCULATION: "50000"
    fallbackWeiPerUnitLink: "5198745300000000"
    permiryadFeeFactor: "1"
    stalenessSeconds: "86400"
```

The exact Consumer balance can be checked by calling [`DRCoordinator.availableFunds()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F1) on Etherscan.

## 5. Top-up the Consumer LINK balance

Due to network gas price, LINK price and the minimum gas limit hard coded in `Operator.sol` for fulfilling requests (`400_000` gas units), the 3 LINK Consumer balance won't probably be enough to fulfill a simple `uint256` (as it will revert due to MAX LINK payment amount). Therefore we'll top-up the Consumer balance with 10 more LINK.

First approve 10 LINK to be spent by DRCoordinator from your signer address:

```sh
yarn hardhat tools:chainlink:approve \
--spender 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f \
--amount "10000000000000000000" \
--network eth-goerli
```

[The `approve()` tx is here](https://goerli.etherscan.io/tx/0xa49e8596df6e46890bfab3ce9882163cef72d8c963953c91e04eb3f59ca9f059)

Then call [`DRCoordinator.addFunds()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#writeContract#F2) on Etherscan with the following parameters:

```sh
_consumer (address):
0x0507c8f8e62def7132135d617d11d1c7faa50d29 // NB: replace with the Consumer address

_amount (uint256):
10000000000000000000
```

[The `addFunds()` tx is here](https://goerli.etherscan.io/tx/0x2db8416cc2633d4d90188ee5f432154253ea23a0cad3fc494c3c5b316af1061a)

Call again `DRCoordinator.availableFunds()` to make sure the Consumer balances have been updated.

## 6. Create the JSON specs file

First, either copy and rename the [hackaton-2022-02-fall-demo.json](../jobs/drcoordinator-specs/hackaton-2022-02-fall-demo.json) file in the same folder or create a new one. Then, replace each `externalJobId` (unless the jobs above were created keeping the file ones) and `operator` with your details. Optionally, replace each `consumers` addresses with the Consumer one (i.e. `DRCConsumerCryptocompare` address), which will allow to set up authorised consumers on-chain (just for demo purposes).

This is a high level overview of each one by name:

- CryptoCompare Get Prices DRCoordinator LINK - DRC:

  - REQUEST LINK payment: a 1% of MAX LINK payment (calculated with 500_000 gas units).
  - SPOT LINK payment: charges a 10% fee.

- CryptoCompare Get Prices DRCoordinator BTC | ETH | LINK - DRC:

  - REQUEST LINK payment: a 1% of MAX LINK payment (calculated with 750_000 gas units).
  - SPOT LINK payment: charges a 10% fee.

- CryptoCompare Get Prices DRCoordinator BTC | ETH | LINK | MATIC | AAVE | SNX - DRC:
  - REQUEST LINK payment: a 1% of MAX LINK payment (calculated with 1_000_000 gas units).
  - SPOT LINK payment: charges a 10% fee.

The specs above have very simple and low percentages (i.e. 1% and 10%), and just small changes on the `gasLimit` to make simple to understand the LINK payment amount calculations. Also cause higher values would probably require more LINK in the Consumer balance.

Task documentation: [Import a specs file](../tasks/drcoordinator/README.md#import-a-specs-file)

Check/validate the JSON specs file by importing it in `dryrun` mode, and amend anything if needed.

```sh
yarn hardhat drcoordinator:import-file \
--address 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f \
--filename hackaton-2022-02-fall-demo \
--mode dryrun
```

## 7. Upload the JSON specs in DRCoordinator storage

Task documentation: [Import a specs file](../tasks/drcoordinator/README.md#import-a-specs-file)

Sync the whole JSON specs file for the first time with:

```sh
yarn hardhat drcoordinator:import-file \
--address 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f \
--filename hackaton-2022-02-fall-demo \
--network eth-goerli \
--mode prod
```

The command above should not only create a `Spec` per each JSON Spec, but also add the authorised consumers per `Spec`.

Logging the detail again shows:

```sh
INFO: connecting to DRCoordinator at: 0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f
Duplicate definition of Transfer (Transfer(address,address,uint256,bytes), Transfer(address,address,uint256))
Duplicate definition of Transfer (Transfer(address,address,uint256,bytes), Transfer(address,address,uint256))
INFO: detail:
    address: "0x7A4DF9CB777992AcC6c7B41C0D84E9786C9bc76f"
    typeAndVersion: "DRCoordinator 1.0.0"
    description: "drc01 eth-goerli"
    owner: "0x4E269e03460719eC89Bb5e3B2610c7ba67BF900D"
    paused: false
    balance: "33.0 LINK"
    profit: "0.0 LINK"
    LINK: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB"
    IS_MULTI_PRICE_FEED_DEPENDANT: false
    PRICE_FEED_1: "0xb4c4a493AB6356497713A78FFA6c60FB53517c63 (LINK / ETH)"
    PRICE_FEED_2: "0x0000000000000000000000000000000000000000 (N/A)"
    IS_L2_SEQUENCER_DEPENDANT: false
    L2_SEQUENCER_FEEED: "0x0000000000000000000000000000000000000000 (N/A)"
    L2_SEQUENCER_GRACE_PERIOD_SECONDS: "0 (N/A)"
    GAS_AFTER_PAYMENT_CALCULATION: "50000"
    fallbackWeiPerUnitLink: "5198745300000000"
    permiryadFeeFactor: "1"
    stalenessSeconds: "86400"
INFO: keys:
    0: "0x1aba632881321bd33949c4e76fddf5ab11370018aa037288889bd7f434639861"
    1: "0xc97d370fe365db5e2eca17b11e914de3369c5cc9063e1aff573de9366aa2c547"
    2: "0x969d9964952e646831e5aad3664646f3de9c7d998d369869ad98c5d320336a0d"
INFO: specs:
    0: {
      "fee": {
        "type": "BigNumber",
        "hex": "0x03e8"
      },
      "feeType": 1,
      "gasLimit": 500000,
      "key": "0x1aba632881321bd33949c4e76fddf5ab11370018aa037288889bd7f434639861",
      "operator": "0x40AD637F7a5ECF8E04cc288EfF5A4de358f13252",
      "payment": {
        "type": "BigNumber",
        "hex": "0x64"
      },
      "paymentType": 1,
      "specId": "0x3935333337643437323537643434646661663636616439396531303564633532"
    }
    1: {
      "fee": {
        "type": "BigNumber",
        "hex": "0x03e8"
      },
      "feeType": 1,
      "gasLimit": 750000,
      "key": "0xc97d370fe365db5e2eca17b11e914de3369c5cc9063e1aff573de9366aa2c547",
      "operator": "0x40AD637F7a5ECF8E04cc288EfF5A4de358f13252",
      "payment": {
        "type": "BigNumber",
        "hex": "0x64"
      },
      "paymentType": 1,
      "specId": "0x6363346138336662626431613435613262386261663035623936663661356564"
    }
    2: {
      "fee": {
        "type": "BigNumber",
        "hex": "0x03e8"
      },
      "feeType": 1,
      "gasLimit": 1000000,
      "key": "0x969d9964952e646831e5aad3664646f3de9c7d998d369869ad98c5d320336a0d",
      "operator": "0x40AD637F7a5ECF8E04cc288EfF5A4de358f13252",
      "payment": {
        "type": "BigNumber",
        "hex": "0x64"
      },
      "paymentType": 1,
      "specId": "0x6264386136303333613334613437646461666637633634633764363034623362"
    }
INFO: authconsumers:
    0: [
      "0x0507C8f8E62dEf7132135D617D11d1C7Faa50D29"
    ]
    1: [
      "0x0507C8f8E62dEf7132135D617D11d1C7Faa50D29"
    ]
    2: [
      "0x0507C8f8E62dEf7132135D617D11d1C7Faa50D29"
    ]
```

[The `setSpecs()` tx is here](https://goerli.etherscan.io/tx/0x83c20799f226b4153f6b7f42d44b09d39939eb2fc9998537e615db8908120c9a)

[The `addSpecsAuthorizedConsumers()` is here](https://goerli.etherscan.io/tx/0xdf6b5157fdb36979d10c1da3ae8ce3288b6e6c239c266d6c489f2adfd19bd873)

Make sure to get familiar with the following DRCoordinator methods by calling them via Etherscan:

- [`getNumberOfSpecs()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F15)

- [`getSpecMapKeys()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F23)

- [`getSpec()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F20). This method requires the `Spec` key which can be generated with the [Generate Spec key task](../tasks/drcoordinator/README.md#generate-a-spec-key).

- [`getAuthorizedConsumers()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F21)

- [`isSpecAuhtorizedConsumer()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F25)

## 8. Calculate MAX LINK payment amount (Optional)

This step is absolutely optional but it will help to understand what MAX LINK payment is and the required Consumer balance during the `DRCoordinator.requestData()` and `DRCoordinator.fulfillData()` execution.

Call [`DRCoordinator.calculateMaxPaymentAmount()`](https://goerli.etherscan.io/address/0x7a4df9cb777992acc6c7b41c0d84e9786c9bc76f#readContract#F2) with the following arguments:

```sh
_weiPerUnitGas (uint256)
88000000000

_paymentInEscrow (uint96):
0

_gasLimit (uint32):
500000

_feeType (uint8):
1

_fee (uint96):
100
```

Which outputs `8710324234361841859` Juels. It means this Consumer require 8.71 LINK on its balance before requesting the job, otherwise it will revert. Make sure to replace each argument with the right JSON Spec data (e.g. fee, type of fee), but also the desired `gasLimit`. You can also use the [gas estimator tool](../tasks/tools/README.md#estimate-tkn-gas-per-network) to fill in the right `weiPerUnitGas`.

## 9. Request job 1: CryptoCompare Get Prices DRCoordinator LINK - DRC

### Request job

Convert first the `externalJobID` of Job 1 to `bytes32` with the [External Job ID to Spec ID task](../tasks/drcoordinator/README.md#convert-an-externaljobid-uuid-v4-into-a-specid-bytes32):

```sh
yarn hardhat drcoordinator:jobid-to-bytes32 \
--jobid 95337d47-257d-44df-af66-ad99e105dc52
```

Then use Etherscan to call [`DRCConsumerCryptoCompare.requestPrices()`](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29#writeContract#F5) with the following arguments:

```sh
_operatorAddr (address)
0x40AD637F7a5ECF8E04cc288EfF5A4de358f13252

_specId (bytes32)
0x3935333337643437323537643434646661663636616439396531303564633532 // externalJobID as bytes32

_callbackGasLimit (uint32)
500000 // How much gasLimit are you willing to set on the fulfillment tx

_consumerMaxPayment (uint96)
0 // How much TOTAL LINK are you willing to pay. Set 0 to deactivate the cap

_callbackFunctionId (bytes4)
0xd276286e // The fulfillment method ID
```

The generated `requestId` is: `0x5e95e2febcb1ed368ac29425025071a1a605aebe2e3fd43294024ae49d03ca4a`
The gas price is: 89.489544084 Gwei
The gas units used are: 264169 units
The REQUEST LINK amount is: 0.0955 LINK (`95500099850156466` Juels)

[The `requestData` tx is here](https://goerli.etherscan.io/tx/0x3152ff81e9262ee3bb18bc4506ec3036a4be92a88a636fb7371641216fb56d5b)

### Request fulfillment

The Chainlink Node run the job, requested the API, processed the result and submitted it. These are the tx highlighs:

The gas price is: 99.849328288 Gwei
The gas units used are: 112,748 units
The SPOT LINK amount is: 3.623 LINK (`3628749407362685089` Juels)
The TOTAL LINK cost is: 3.724 LINK (`3724249507212841555` Juels)

[The `fulfillOracleRequest2` tx is here](https://goerli.etherscan.io/tx/0xf60ee0365dfedd43ff6e1fde0336bf75eb66fe09137fde9fc8e16dd97f34ca80)

### Check result

Calling [`DRCConsumerCryptoCompare.requestIdToPriceData1()`](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29#readContract#F4) with `requestId` returns the following LINK price:

```sh
uint256 :  6237000 // 6.24 USD
```

## 10. Request job 2: CryptoCompare Get Prices DRCoordinator BTC | ETH | LINK - DRC

### Request job

Convert first the `externalJobID` of Job 2 to `bytes32` with the [External Job ID to Spec ID task](../tasks/drcoordinator/README.md#convert-an-externaljobid-uuid-v4-into-a-specid-bytes32):

```sh
yarn hardhat drcoordinator:jobid-to-bytes32 \
--jobid cc4a83fb-bd1a-45a2-b8ba-f05b96f6a5ed
```

Then use Etherscan to call [`DRCConsumerCryptoCompare.requestPrices()`](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29#writeContract#F5) with the following arguments:

```sh
_operatorAddr (address)
0x40AD637F7a5ECF8E04cc288EfF5A4de358f13252 // externalJobID as bytes32

_specId (bytes32)
0x6363346138336662626431613435613262386261663035623936663661356564

_callbackGasLimit (uint32)
500000 // How much gasLimit are you willing to set on the fulfillment tx

_consumerMaxPayment (uint96)
0 // How much TOTAL LINK are you willing to pay. Set 0 to deactivate the cap

_callbackFunctionId (bytes4)
0x3551fb7a // The fulfillment method ID
```

The generated `requestId` is: `0x2f8b594de464e46279eea9d12452f07d6af8ada143754882566164e6f1db173b`
The gas price is: 92.280717881 Gwei
The gas units used are: 264169 units
The REQUEST LINK amount is: 0.098438879979677674 (`98438879979677674` Juels)

[The `requestData` tx is here](https://goerli.etherscan.io/tx/0x66e29300b7cc9bb43fd70dcff198140c96562c6e9667e1f522d46de50088a37f)

### Request fulfillment

The Chainlink Node run the job, requested the API, processed the 3 results and submitted them. These are the tx highlighs:

The gas price is: 92.233711434 Gwei
The gas units used are: 154076 units
The SPOT LINK amount is: 4.22 LINK (`4220629881703268529` Juels)
The TOTAL LINK cost is: 4.319 LINK (`4319068761682946203` Juels)

[The `fulfillOracleRequest2` tx is here](https://goerli.etherscan.io/tx/0xc755362bcb1cfa11ad195c9f07537f0b2251c2cf55f390c0efd9a292caedfec0)

### Check result

Calling [`DRCConsumerCryptoCompare.requestIdToPriceData3()`](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29#readContract#F5) with the request ID returns:

```sh
btc   uint256 :  16716680000 // 16716.68 USD
eth   uint256 :  1211330000 // 1211.33 USD
link   uint256 :  6238000 // 6.24 USD
```

## 11. Request job 3: CryptoCompare Get Prices DRCoordinator BTC | ETH | LINK | MATIC | AAVE | SNX - DRC

### Request job

Convert first the `externalJobID` of Job 1 to `bytes32` with the [External Job ID to Spec ID task](../tasks/drcoordinator/README.md#convert-an-externaljobid-uuid-v4-into-a-specid-bytes32):

```sh
yarn hardhat drcoordinator:jobid-to-bytes32 \
--jobid bd8a6033-a34a-47dd-aff7-c64c7d604b3b
```

Then use Etherscan to call [`DRCConsumerCryptoCompare.requestPrices()`](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29#writeContract#F5) with the following arguments:

```sh
_operatorAddr (address)
0x40AD637F7a5ECF8E04cc288EfF5A4de358f13252

_specId (bytes32)
0x6264386136303333613334613437646461666637633634633764363034623362 // externalJobID as bytes32

_callbackGasLimit (uint32)
500000 // How much gasLimit are you willing to set on the fulfillment tx

_consumerMaxPayment (uint96)
0 // How much TOTAL LINK are you willing to pay. Set 0 to deactivate the cap

_callbackFunctionId (bytes4)
0xea4ed058 // The fulfillment method ID
```

The generated `requestId` is: `0x65f5632459f847a7954973c5fd4b48eddb0e1a04212a415e040c744a479b7bc0`
The gas price is: 66.56789301 Gwei
The gas units used are: 264169 units
The REQUEST LINK amount is: 0.071 LINK (`71010163130304467` Juels)

[The `requestData()` tx is here](https://goerli.etherscan.io/tx/0x347f293dd070512c3c425ecf28e68dff080c28f5b326c479810cab352b063364)

### Request fulfillment

The Chainlink Node run the job, requested the API, processed the 6 results and submitted them. These are the tx highlighs:

The gas price is: 47.672865955 Gwei
The gas units used are: 221505 units
The SPOT LINK amount is: 2.847 LINK (`2847075928369353739` Juels)
The TOTAL LINK cost is: 2.918 LINK (`2918086091499658206` Juels)

[The `fulfillOracleRequest2()` tx is here](https://goerli.etherscan.io/tx/0xab2ae149f20161858bf63cdfd2a612108ca36f49878a9c259f0fcac6ed379d65)

### Check result

Calling [`DRCConsumerCryptoCompare.requestIdToPriceData6()`](https://goerli.etherscan.io/address/0x0507c8f8e62def7132135d617d11d1c7faa50d29#readContract#F6) with the request ID returns:

```sh
btc   uint256 :  16696260000 // 16696.26 USD
eth   uint256 :  1209540000 // 1209.54 USD
link   uint256 :  6183000 // 6.18 USD
matic   uint256 :  883900 // 0.88 USD
aave   uint256 :  59310000 // 59.31 USD
snx   uint256 :  1725000 // 1.73 SUD
```

## Summary

Each job request has been summarised in this table:

| Job ID | No of uint256 returned | Callback gas limit (units) | Request Gas Price (Gwei) | Fulfillment Gas Price (Gwei) | Fulfillment Gas Units (units) | REQUEST LINK payment | SPOT LINK payment | TOTAL LINK payment |
| :----: | :--------------------: | :------------------------: | :----------------------: | :--------------------------: | :---------------------------: | :------------------: | :---------------: | :----------------: |
|   1    |           1            |           500000           |          89.49           |            99.85             |            112748             |        0.0955        |       3.623       |       3.724        |
|   2    |           3            |           500000           |          92.28           |            92.23             |            154076             |        0.0984        |       4.22        |       4.319        |
|   3    |           6            |           500000           |          66.57           |            47.67             |            221505             |        0.071         |       2.847       |       2.918        |

It is worth mentioning that the LINK / ETH Price Feed answer (`weiPerUnitOfLink`) remained quite stable (circa `5101991476354712` wei) during the 3 requests.

It is amazing to see that the request that put more data on-chain (6 `uint256`) was in fact the cheapest one (TOTAL LINK payment) due to the gas price conditions! And that for the same reason it got the lowest REQUEST and SPOT LINK payments.
It would make sense that consumers increased the `callbackGasLimit` on requests that put more data on-chain, increasing the MAX & REQUEST LINK payment.

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

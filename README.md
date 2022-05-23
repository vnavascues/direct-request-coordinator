# directrequest-fair-payment

Chainlink Spring 22 hackaton

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

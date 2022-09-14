# DRCoordinator Tasks

## Call scripts & generators

### Calculate max LINK payment amount

Task parameters:

| Required? |     Name      |                             Description                              |   Type    | Depends On |                     Options                      | Defaults to |
| :-------: | :-----------: | :------------------------------------------------------------------: | :-------: | :--------: | :----------------------------------------------: | :---------: |
|    ✅     |    address    |                  The DRCoordinator contract address                  |  address  |            |                                                  |             |
|           | weiperunitgas |                The wei per unit of gas on the network                |    int    |            |                                                  |             |
|    ✅     |    payment    | The initial LINK payment amount in Juels (in escrow in the Operator) | BigNumber |            |                                                  |             |
|    ✅     |   gaslimit    |                   The transaction gasLimit in gwei                   |    int    |            |                                                  |  `400000`   |
|    ✅     |    feetype    |                             The fee type                             | BigNumber |            |           `0` (flat), `1` (permiryad)            |             |
|    ✅     |      fee      |                         The fulfillment fee                          | BigNumber |            |                                                  |             |
|           |   provider    |           Uses the providers `gasPrice` as `weiPerUnitGas`           |   Flag    |            |                                                  |   `false`   |
|    ✅     |    network    |                       Hardhat `network` param                        |  string   |            | See `networkUserConfigs` in `/utils/networks.ts` |             |

Example calls:

```sh
yarn hardhat drcoordinator:calculate-max-amount \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--weiperunitgas 25000000000 \
--payment "50000000000000000" \
--gaslimit 500000 \
--feetype "1" \
--fee "1100" \
--network eth-kovan
```

```sh
yarn hardhat drcoordinator:calculate-max-amount \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--payment "7770000000000000000" \
--gaslimit 500000 \
--feetype "0" \
--fee "1500000000000000000" \
--provider \
--network eth-kovan
```

### Calculate spot LINK payment amount

More estimates than calculate with precision. It does not take into account the gas incurrend by `Operator::fulfillRequest2`
nor `DRCoordinator::fallback` or `DRCoordinator::fulfillData`. All of them are affected, among other things, by the data size and fulfillment function.
Therefore it is needed to fine tune `startGas`.

Task parameters:

| Required? |     Name      |                             Description                              |   Type    | Depends On |                     Options                      | Defaults to |
| :-------: | :-----------: | :------------------------------------------------------------------: | :-------: | :--------: | :----------------------------------------------: | :---------: |
|    ✅     |    address    |                  The DRCoordinator contract address                  |  address  |            |                                                  |             |
|    ✅     |   gaslimit    |                   The transaction gasLimit in gwei                   |    int    |            |                                                  |  `400000`   |
|    ✅     |   startgas    |                     The gasleft at the beginning                     |    int    |            |                                                  |  `400000`   |
|           | weiperunitgas |                The wei per unit of gas on the network                |    int    |            |                                                  |             |
|    ✅     |    payment    | The initial LINK payment amount in Juels (in escrow in the Operator) | BigNumber |            |                                                  |             |
|    ✅     |    feetype    |                             The fee type                             | BigNumber |            |           `0` (flat), `1` (permiryad)            |             |
|    ✅     |      fee      |                         The fulfillment fee                          | BigNumber |            |                                                  |             |
|           |   provider    |           Uses the providers `gasPrice` as `weiPerUnitGas`           |   Flag    |            |                                                  |   `false`   |
|    ✅     |    network    |                       Hardhat `network` param                        |  string   |            | See `networkUserConfigs` in `/utils/networks.ts` |             |

Example calls:

```sh
yarn hardhat drcoordinator:calculate-spot-amount \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--startgas 500000 \
--weiperunitgas 25000000000 \
--payment "50000000000000000" \
--feetype "1" \
--fee "1100" \
--network eth-kovan
```

```sh
yarn hardhat drcoordinator:calculate-spot-amount \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--gaslimit 350000 \
--startgas 350000 \
--weiperunitgas 25000000000 \
--payment "50000000000000000" \
--feetype "1" \
--fee "1100" \
--network eth-kovan
```

### Convert an externalJobID (UUID v4) into a specId (bytes32)

Task parameters:

| Required? | Name  |     Description     |  Type  | Options | Defaults to |
| :-------: | :---: | :-----------------: | :----: | :-----: | :---------: |
|    ✅     | jobid | The `externalJobID` | uuidv4 |         |             |

Example calls:

```sh
yarn hardhat drcoordinator:jobid-to-bytes32 \
--jobid cc677638-fe1b-4741-9bdf-8dd1d777a6a0
```

### Convert a specId (bytes32) to an externalJobID (UUID v4)

Task parameters:

| Required? |  Name  | Description  |  Type   | Options | Defaults to |
| :-------: | :----: | :----------: | :-----: | :-----: | :---------: |
|    ✅     | specid | The `specId` | bytes32 |         |             |

Example calls:

```sh
yarn hardhat drcoordinator:bytes32-to-jobid \
--specid 0x3266363836376532393037353438636661393138643564323931646139346365
```

### Detail

Log the detail of a DRCoordinator

Task parameters:

| Required? |     Name      |            Description             |  Type   | Depends On |                     Options                      | Defaults to |
| :-------: | :-----------: | :--------------------------------: | :-----: | :--------: | :----------------------------------------------: | :---------: |
|    ✅     |    address    | The DRCoordinator contract address | address |            |                                                  |             |
|           |     keys      |         Log the Spec keys          |  Flag   |            |                                                  |   `false`   |
|           |     specs     |           Log each Spec            |  Flag   |            |                                                  |   `false`   |
|           | authconsumers | Log each Spec authorized consumers |  Flag   |            |                                                  |   `false`   |
|    ✅     |    network    |      Hardhat `network` param       | string  |            | See `networkUserConfigs` in `/utils/networks.ts` |             |

Example calls:

```sh
yarn hardhat drcoordinator:detail \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--keys \
--specs \
--authconsumers \
--network eth-kovan
```

### Generate a Spec key

Task parameters:

| Required? |     Name      |                                Description                                |  Type   | Depends On | Options | Defaults to |
| :-------: | :-----------: | :-----------------------------------------------------------------------: | :-----: | :--------: | :-----: | :---------: |
|    ✅     |   operator    |                      The `Operator` contract address                      | address |            |         |             |
|           | externaljobid | The Job Specification ID that the request will be created for (as UUIDv4) | UUIDv4  |            |         |             |
|           |    specid     |                       The job spec ID (as bytes32)                        | bytes32 |            |         |             |

Example calls:

```sh
yarn hardhat drcoordinator:generate-key \
--operator 0x878541888a928a31F9EAb4cB61DfD4e381EC2f00 \
--externaljobid 235bbeca-65f3-44b7-ba8b-3af501e43622
```

```sh
yarn hardhat drcoordinator:generate-key \
--operator 0x878541888a928a31F9EAb4cB61DfD4e381EC2f00 \
--specid 0x3233356262656361363566333434623762613862336166353031653433363232
```

## Transaction scripts

### Deploy DRCoordinator

[DRCoordinator](../../contracts/drcoordinator/DRCoordinator.sol)

Task parameters:

| Required? |          Name          |                              Description                              |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :--------------------: | :-------------------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |      description       |                       The contract description                        |  string   |                      |                                                  |    `''`     |
|    ✅     | fallbackweiperunitlink |            The fallback amount of network TKN wei per LINK            | BigNumber |                      |                                                  |             |
|    ✅     |    stalenessseconds    | The number of seconds after which the feed answer is considered stale | BigNumber |                      |                                                  |             |
|           |         setup          |                 Configs the contract after deployment                 |   Flag    |                      |                                                  |   `false`   |
|           |         owner          |                 The address to transfer the ownership                 |  address  |       --setup        |                                                  |             |
|           |         verify         |             Verifies the contract on Etherscan at the end             |   Flag    |                      |                                                  |   `false`   |
|           |       overrides        |       Allows customising the tx overrides (ethers.js Overrides)       |   Flag    |                      |                                                  |   `false`   |
|           |        gaslimit        |                           The tx `gasLimit`                           |    int    |     --overrides      |                                                  |             |
|           |         txtype         |                              The tx type                              |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |        gasprice        |                 The type 0 tx `gasPrice` (in `gwei`)                  |   float   | --overrides --type 0 |                                                  |             |
|           |       gasmaxfee        |               The type 0 tx `maxFeePerGas` (in `gwei`)                |   float   | --overrides --type 2 |                                                  |             |
|           |     gasmaxpriority     |              The type 0 tx `gasmaxpriority` (in `gwei`)               |   float   | --overrides --type 2 |                                                  |             |
|           |        network         |                        Hardhat `network` param                        |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat drcoordinator:deploy \
--description beta-2 \
--fallbackweiperunitlink "8000000000000000" \
--stalenessseconds "86400" \
--setup \
--owner 0x0000000000000000000000000000000000000001 \
--verify \
--network eth-kovan
```

```sh
yarn hardhat drcoordinator:deploy \
--description beta-2 \
--fallbackweiperunitlink "8000000000000000" \
--stalenessseconds "86400" \
--setup \
--owner 0x0000000000000000000000000000000000000001 \
--verify \
--network eth-kovan \
--overrides \
--gaslimit 10000000 \
--txtype 0 \
--gasprice 72
```

### Deploy a DRCoordinatorConsumer

[DRCConsumerCryptocompare](../../contracts/drcoordinator/DRCConsumerCryptocompare.sol)

[DRCConsumerSportsdataio](../../contracts/drcoordinator/DRCConsumerSportsdataio.sol)

Task parameters:

| Required? |      Name      |                                      Description                                      |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :-----------------------------------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |      name      |                              The consumer contract name                               |  string   |                      |                                                  |             |
|    ✅     | drcoordinator  |                         The `DRCoordinator` contract address                          |  address  |                      |                                                  |             |
|           |      fund      | Top-up the consumer balance with LINK from the signer's wallet right after deployment |   Flag    |                      |                                                  |   `false`   |
|           |     amount     |        The amount of LINK (wei) to fund the consumer balance after deployment         | BigNumber |                      |                                                  |             |
|           |     verify     |                     Verifies the contract on Etherscan at the end                     |   Flag    |                      |                                                  |   `false`   |
|           |   overrides    |               Allows customising the tx overrides (ethers.js Overrides)               |   Flag    |                      |                                                  |   `false`   |
|           |    gaslimit    |                                   The tx `gasLimit`                                   |    int    |     --overrides      |                                                  |             |
|           |     txtype     |                                      The tx type                                      |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |                         The type 0 tx `gasPrice` (in `gwei`)                          |   float   | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |                       The type 0 tx `maxFeePerGas` (in `gwei`)                        |   float   | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |                      The type 0 tx `gasmaxpriority` (in `gwei`)                       |   float   | --overrides --type 2 |                                                  |             |
|           |    network     |                                Hardhat `network` param                                |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat drcoordinator:deploy-consumer \
--name DRCConsumerCryptoCompare \
--drcoordinator 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--verify \
--network eth-kovan
```

```sh
yarn hardhat drcoordinator:deploy-consumer \
--name DRCConsumerCryptoCompare \
--drcoordinator 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--fund \
--amount "3000000000000000000" \
--verify \
--network eth-kovan
```

### Import a specs file

Create, update & delete (CUD) specs in the DRCoordinator storage.

NB: the forking mode requires `HARDHAT_FORKING_ENABLED=true` and `HARDHAT_FORKING_URL=<provider_url>` in the .env file.

The purpose of the `dryrun` mode is running an integrity check over the specs file by the given network.

Task parameters:

| Required? |      Name      |                                 Description                                  |  Type   |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :--------------------------------------------------------------------------: | :-----: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |    address     |                      The DRCoordinator contract address                      | address |                      |                                                  |             |
|    ✅     |    filename    | The specs filename (without .json extension) in the specs folder (`./specs`) | address |                      |                                                  |             |
|    ✅     |      mode      |                              The execution mode                              | string  |                      |  `dryrun` (hardhat network), `forking`, `prod`   |  `dryrun`   |
|           |    nobatch     |                          Disables the batch import                           |  Flag   |                      |                                                  |   `false`   |
|           |   batchsize    |                     Number of specs per CUD transaction                      |   int   |                      |                                                  |    `50`     |
|           |   overrides    |          Allows customising the tx overrides (ethers.js Overrides)           |  Flag   |                      |                                                  |   `false`   |
|           |    gaslimit    |                              The tx `gasLimit`                               |   int   |     --overrides      |                                                  |             |
|           |     txtype     |                                 The tx type                                  |   int   |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |                     The type 0 tx `gasPrice` (in `gwei`)                     |  float  | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |                   The type 0 tx `maxFeePerGas` (in `gwei`)                   |  float  | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |                  The type 0 tx `gasmaxpriority` (in `gwei`)                  |  float  | --overrides --type 2 |                                                  |             |
|           |    network     |                           Hardhat `network` param                            | string  |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat drcoordinator:import-file \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--filename local-demo \
--mode dryrun
```

```sh
yarn hardhat drcoordinator:import-file \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--filename local-demo2 \
--batchsize 100 \
--mode prod \
--network eth-kovan
```

### Set config params

Task parameters:

| Required? |          Name          |                                Description                                |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :--------------------: | :-----------------------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |        address         |                    The DRCoordinator contract address                     |  address  |                      |                                                  |             |
|    ✅     |          mode          |                            The execution mode                             |  string   |                      |                `forking`, `prod`                 |  `forking`  |
|           |      description       |                       The new contract description                        |  string   |                      |                                                  |    `''`     |
|           | fallbackweiperunitlink |            The new fallback amount of network TKN wei per LINK            | BigNumber |                      |                                                  |             |
|           |         owner          |                 The new address to transfer the ownership                 |  address  |                      |                                                  |             |
|           |         pause          |                       Pause or unpause the contract                       |  boolean  |                      |                                                  |             |
|           |   permiryadfeefactor   |              The factor to be applied to the permiryad `fee`              |  number   |                      |                                                  |             |
|           |    stalenessseconds    | The new number of seconds after which the feed answer is considered stale | BigNumber |                      |                                                  |             |
|           |       overrides        |         Allows customising the tx overrides (ethers.js Overrides)         |   Flag    |                      |                                                  |   `false`   |
|           |        gaslimit        |                             The tx `gasLimit`                             |    int    |     --overrides      |                                                  |             |
|           |         txtype         |                                The tx type                                |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |        gasprice        |                   The type 0 tx `gasPrice` (in `gwei`)                    |   float   | --overrides --type 0 |                                                  |             |
|           |       gasmaxfee        |                 The type 0 tx `maxFeePerGas` (in `gwei`)                  |   float   | --overrides --type 2 |                                                  |             |
|           |     gasmaxpriority     |                The type 0 tx `gasmaxpriority` (in `gwei`)                 |   float   | --overrides --type 2 |                                                  |             |
|    ✅     |        network         |                          Hardhat `network` param                          |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |             |

Example calls:

```sh
yarn hardhat drcoordinator:set-config \
--mode forking \
--fallbackweiperunitlink "5000000000000000" \
--stalenessseconds "3600"
```

```sh
yarn hardhat drcoordinator:set-config \
--mode prod \
--pause true \
--network eth-kovan
```

### Withdraw LINK

Task parameters:

| Required? |      Name      |                                       Description                                        |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :--------------------------------------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |    address     |                            The DRCoordinator contract address                            |  address  |                      |                                                  |             |
|    ✅     |      mode      |                                    The execution mode                                    |  string   |                      |                `forking`, `prod`                 |  `forking`  |
|           |    granular    | Allows setting a payee and an amount. Otherwise the signer withdraws all funds available |   Flag    |                      |                                                  |   `false`   |
|           |     payee      |                            The address that receives the LINK                            |  address  |      `granular`      |                                                  |             |
|           |     amount     |                                     The LINK amount                                      | BigNumber |      `granular`      |                                                  |             |
|           |   overrides    |                Allows customising the tx overrides (ethers.js Overrides)                 |   Flag    |                      |                                                  |   `false`   |
|           |    gaslimit    |                                    The tx `gasLimit`                                     |    int    |     --overrides      |                                                  |             |
|           |     txtype     |                                       The tx type                                        |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |                           The type 0 tx `gasPrice` (in `gwei`)                           |   float   | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |                         The type 0 tx `maxFeePerGas` (in `gwei`)                         |   float   | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |                        The type 0 tx `gasmaxpriority` (in `gwei`)                        |   float   | --overrides --type 2 |                                                  |             |
|    ✅     |    network     |                                 Hardhat `network` param                                  |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |             |

Example calls:

```sh
yarn hardhat drcoordinator:withdraw \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--mode prod \
--network eth-kovan
```

```sh
yarn hardhat drcoordinator:withdraw \
--address 0x0FfF43fE72dEEa9E6340B5FE1B0E02E0429D5A5b \
--mode prod \
--granular \
--payee 0x0000000000000000000000000000000000000777 \
--amount "1000000000000000000" \
--network eth-kovan
```

## Verification

### Verify a DRCoordinator

Task parameters:

| Required? |          Name          |                              Description                              |   Type    | Depends On |                     Options                      | Defaults to |
| :-------: | :--------------------: | :-------------------------------------------------------------------: | :-------: | :--------: | :----------------------------------------------: | :---------: |
|    ✅     |        address         |                  The DRCoordinator contract address                   |  address  |            |                                                  |             |
|    ✅     |      description       |                       The contract description                        |  string   |            |                                                  |             |
|    ✅     | fallbackweiperunitlink |            The fallback amount of network TKN wei per LINK            | BigNumber |            |                                                  |             |
|    ✅     |    stalenessseconds    | The number of seconds after which the feed answer is considered stale | BigNumber |            |                                                  |             |
|    ✅     |        network         |                        Hardhat `network` param                        |  string   |            | See `networkUserConfigs` in `/utils/networks.ts` |             |

Example calls:

```sh
yarn hardhat drcoordinator:verify \
--description beta-2 \
--fallbackweiperunitlink "8000000000000000" \
--stalenessseconds "86400" \
--network eth-kovan
```

### Verify a DRCoordinatorConsumer

Task parameters:

| Required? |     Name      |             Description              |  Type   | Depends On | Options | Defaults to |
| :-------: | :-----------: | :----------------------------------: | :-----: | :--------: | :-----: | :---------: |
|    ✅     |     name      |      The consumer contract name      | string  |            |         |             |
|    ✅     | drcoordinator | The `DRCoordinator` contract address | address |            |         |             |
|    ✅     |   operator    |   The `Operator` contract address    | address |            |         |             |

Example calls:

```sh
yarn hardhat drcoordinator:verify \
--description beta-2 \
--fallbackweiperunitlink "8000000000000000" \
--stalenessseconds "86400" \
--network eth-kovan
```

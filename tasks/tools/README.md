# Tools

## ABI

[Source](./abi.ts)

### Generate the function signature (bytes4)

Task parameters:

| Required? |   Name   |    Description    |  Type  | Depends On | Options | Defaults to |
| :-------: | :------: | :---------------: | :----: | :--------: | :-----: | :---------: |
|    ✅     | function | The function name | string |            |         |             |

Example calls:

```sh
yarn hardhat tools:abi:functionsignature \
--function "fulfillBytesArray(bytes32,bytes[])"
```

```sh
yarn hardhat tools:abi:functionsignature \
--function "fulfillUint256Array(bytes32,uint256[])"
```

## Chainlink

[Source](./chainlink.ts)

### Approve LINK amount

Task parameters:

| Required? |      Name      |                        Description                        |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :-------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |    spender     |                    The spender address                    |  address  |                      |                                                  |             |
|    ✅     |     amount     |                 The amount to be approved                 | BigNumber |                      |                                                  |             |
|           |   overrides    | Allows customising the tx overrides (ethers.js Overrides) |   Flag    |                      |                                                  |   `false`   |
|           |    gaslimit    |                     The tx `gasLimit`                     |    int    |     --overrides      |                                                  |             |
|           |     txtype     |                        The tx type                        |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |           The type 0 tx `gasPrice` (in `gwei`)            |   float   | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |         The type 0 tx `maxFeePerGas` (in `gwei`)          |   float   | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |        The type 0 tx `gasmaxpriority` (in `gwei`)         |   float   | --overrides --type 2 |                                                  |             |
|    ✅     |    network     |                  Hardhat `network` param                  |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat tools:chainlink:approve \
--spender 0xED5AF388653567Af2F388E6224dC7C4b3241C544 \
--amount "7770000000000000000000" \
--network eth-kovan
```

### Convert an externalJobID (UUID v4) to bytes32

Task parameters:

| Required? | Name  |         Description         |  Type  | Depends On | Options | Defaults to |
| :-------: | :---: | :-------------------------: | :----: | :--------: | :-----: | :---------: |
|    ✅     | jobid | The externalJobID (UUID v4) | uuidv4 |            |         |             |

Example calls:

```sh
yarn hardhat tools:chainlink:jobid-to-bytes32 \
--jobid 2f6867e2-9075-48cf-a918-d5d291da94ce
```

### Convert bytes32 to an externalJobID (UUID v4)

Task parameters:

| Required? | Name  |                   Description                    |  Type   | Depends On | Options | Defaults to |
| :-------: | :---: | :----------------------------------------------: | :-----: | :--------: | :-----: | :---------: |
|    ✅     | jobid | The `bytes32` representation of an externalJobID | bytes32 |            |         |             |

Example calls:

```sh
yarn hardhat tools:chainlink:bytes32-to-jobid \
--jobid 0x3266363836376532393037353438636661393138643564323931646139346365
```

### Transfer a LINK amount

Task parameters:

| Required? |      Name      |                        Description                        |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :-------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |       to       |                   The receiver address                    |  address  |                      |                                                  |             |
|    ✅     |     amount     |                   The amount to be sent                   | BigNumber |                      |                                                  |             |
|           |   overrides    | Allows customising the tx overrides (ethers.js Overrides) |   Flag    |                      |                                                  |   `false`   |
|           |    gaslimit    |                     The tx `gasLimit`                     |    int    |     --overrides      |                                                  |             |
|           |     txtype     |                        The tx type                        |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |           The type 0 tx `gasPrice` (in `gwei`)            |   float   | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |         The type 0 tx `maxFeePerGas` (in `gwei`)          |   float   | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |        The type 0 tx `gasmaxpriority` (in `gwei`)         |   float   | --overrides --type 2 |                                                  |             |
|    ✅     |    network     |                  Hardhat `network` param                  |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat tools:chainlink:transfer \
--to 0xED5AF388653567Af2F388E6224dC7C4b3241C544 \
--amount "7770000000000000000000" \
--network eth-kovan
```

## Gas

[Source](./gas.ts)

### Estimate TKN gas per network

Estimation done via ethers.js provider `getFeeData()`.

Example calls:

```sh
yarn hardhat tools:gas:estimate --network matic-mainnet
```

## Library Contracts

[Library](./verify.ts)

### Deploy a library contract

Deploy any library that requires to be linked on deployment later on.

**BE AWARE**: use [verify a contract by address](#verify-a-contract-by-address) if the verification fail.

Optionally:

- Verify it (`--verify` flag).
- Customise tx overrides (`--overrides` flag).

Task parameters:

| Required? |      Name      |                                                        Description                                                        |  Type  |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :-----------------------------------------------------------------------------------------------------------------------: | :----: | :------------------: | :----------------------------------------------: | :---------: |
|    ✅     |      name      |                                        The consumer contract name (case sensitive)                                        | string |                      |                                                  |             |
|           |     verify     |                                       Verifies the contract on Etherscan at the end                                       |  Flag  |                      |                                                  |   `false`   |
|           |    contract    | The contract project path. This argument is required when more than one contract was found to match the deployed bytecode | string |       --verify       |                                                  |             |
|           |   overrides    |                                 Allows customising the tx overrides (ethers.js Overrides)                                 |  Flag  |                      |                                                  |   `false`   |
|           |    gaslimit    |                                                     The tx `gasLimit`                                                     |  int   |     --overrides      |                                                  |             |
|           |     txtype     |                                                        The tx type                                                        |  int   |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |                                           The type 0 tx `gasPrice` (in `gwei`)                                            | float  | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |                                         The type 0 tx `maxFeePerGas` (in `gwei`)                                          | float  | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |                                        The type 0 tx `gasmaxpriority` (in `gwei`)                                         | float  | --overrides --type 2 |                                                  |             |
|    ✅     |    network     |                                                  Hardhat `network` param                                                  | string |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat tools:library:deploy \
--name IterableMappingSpecRequestId \
--verify \
--network eth-kovan
```

```sh
yarn hardhat tools:library:deploy \
--name EntryLibrary \
--contract 'contracts/linkpool/EntryLibrary.sol:EntryLibrary' \
--verify \
--network eth-kovan
```

```sh
yarn hardhat tools:library:deploy \
--name IterableMappingSpecRequestId \
--verify \
--network eth-kovan \
--overrides \
--txtype 0 \
--gasprice 3
```

```sh
yarn hardhat tools:library:deploy \
--name IterableMappingSpecRequestId \
--verify \
--network eth-kovan \
--overrides \
--gaslimit 10000000 \
--txtype 2 \
--gasmaxfee 145 \
--gasmaxpriority 2
```

### Verify a library contract

Alternatively use [verify contract by address](#verify-a-contract-by-address)

Task parameters:

| Required? |  Name   |     Description      |  Type   | Depends On | Options | Defaults to |
| :-------: | :-----: | :------------------: | :-----: | :--------: | :-----: | :---------: |
|    ✅     | address | The contract address | address |            |         |             |

Example calls:

```sh
yarn hardhat tools:library:verify \
--address 0xf78bEE39fE8aEe48DeF63319aDA43cDF8Bf86354 \
--network eth-kovan
```

## Verify Contracts

[Verify](./verify.ts)

### Verify a contract by address

**BE AWARE**: this is a friendly wrapper of the default [hardhat-etherscan](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#usage) verification usage.

Task parameters:

| Required? |   Name   |                                                        Description                                                        |  Type   | Depends On | Options | Defaults to |
| :-------: | :------: | :-----------------------------------------------------------------------------------------------------------------------: | :-----: | :--------: | :-----: | :---------: |
|    ✅     | address  |                                                   The contract address                                                    | address |            |         |             |
|           | contract | The contract project path. This argument is required when more than one contract was found to match the deployed bytecode |  sring  |            |         |             |

Example calls:

```sh
yarn hardhat tools:verify:by-address \
--address 0xd94AE693007BF5eE652BB0a8bD09A5aE10EA1Bd0 \
--network matic-mumbai
```

```sh
yarn hardhat tools:verify:by-address \
--address 0xfAdc73c2972757E0EE3a291f1f4A206E294ca68A \
--contract 'contracts/linkpool/EntryLibrary.sol:EntryLibrary' \
--network eth-kovan
```

```sh
yarn hardhat tools:verify:Consumer \
--address 0xb9cF17BA6E2ea0042Ebe98c1Ce8B1350fa3D544F \
--oracle 0x480dDa3952b78F0A6318F5F0F1C5cc3C19043d6D \
--contract contracts/sportsdataio-linkpool/SportsdataioLinkPoolConsumer.sol:SportsdataioLinkPoolConsumer \
--network eth-kovan
```

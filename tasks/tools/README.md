# Tools

## ABI

[Source](./abi.ts)

### Generate the function selector (bytes4)

Task parameters:

| Required? |   Name   |    Description    | Options | Defaults to |
| :-------: | :------: | :---------------: | :-----: | :---------: |
|    ✅     | function | The function name |         |             |

Example calls:

```sh
yarn hardhat tools:abi:functionselector --function "fulfillBytesArray(bytes32,bytes[])"
```

```sh
yarn hardhat tools:abi:functionselector --function "fulfillUint256Array(bytes32,uint256[])"
```

## Gas

[Source](./gas.ts)

### Estimate the network gasPrice

Estimation done via ethers.js provider `getFeeData()`.

Example calls:

```sh
yarn hardhat tools:gas:estimate --network matic-mainnet
```

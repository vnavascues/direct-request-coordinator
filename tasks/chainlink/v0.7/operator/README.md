# Operator.sol 1.0.0 Tasks

## Transaction scripts

### Deploy an Operator 1.0.0

[Operator.sol](../../../../contracts/chainlink/v0.7/Operator.sol)

Optionally:

- Set it up (`--setup` flag): calls `setAuthorizedSenders()` -> calls `transferOwnership()`
- Verify it (`--verify` flag).
- Customise tx overrides (`--overrides` flag).

Task parameters:

| Required? |      Name      |                        Description                        |   Type    |      Depends On      |                     Options                      | Defaults to |
| :-------: | :------------: | :-------------------------------------------------------: | :-------: | :------------------: | :----------------------------------------------: | :---------: |
|           |     setup      |           Configs the contract after deployment           |   Flag    |                      |                                                  |   `false`   |
|           |     owner      |           The address to transfer the ownership           |  address  |       --setup        |                                                  |             |
|           |    senders     |             The authorized senders' addresses             | [address] |       --setup        |                                                  |             |
|           |     verify     |       Verifies the contract on Etherscan at the end       |   Flag    |                      |                                                  |   `false`   |
|           |   overrides    | Allows customising the tx overrides (ethers.js Overrides) |   Flag    |                      |                                                  |   `false`   |
|           |    gaslimit    |                     The tx `gasLimit`                     |    int    |     --overrides      |                                                  |             |
|           |     txtype     |                        The tx type                        |    int    |     --overrides      |           `0` (legacy), `2` (EIP-1559)           |             |
|           |    gasprice    |           The type 0 tx `gasPrice` (in `gwei`)            |   float   | --overrides --type 0 |                                                  |             |
|           |   gasmaxfee    |         The type 0 tx `maxFeePerGas` (in `gwei`)          |   float   | --overrides --type 2 |                                                  |             |
|           | gasmaxpriority |        The type 0 tx `gasmaxpriority` (in `gwei`)         |   float   | --overrides --type 2 |                                                  |             |
|    ✅     |    network     |                  Hardhat `network` param                  |  string   |                      | See `networkUserConfigs` in `/utils/networks.ts` |  `hardhat`  |

Example calls:

```sh
yarn hardhat operator:v0.7:deploy \
--setup \
--owner 0x797de2909991C66C66D8e730C8385bbab8D18eA6 \
--senders '["0x678B5Cb6E7867A37f2D1f06C49c34604579dac12", "0x4E269e03460719eC89Bb5e3B2610c7ba67BF900D"]' \
--verify \
--network eth-kovan
```

```sh
yarn hardhat operator:v0.7:deploy \
--setup \
--owner 0x797de2909991C66C66D8e730C8385bbab8D18eA6 \
--senders '["0x678B5Cb6E7867A37f2D1f06C49c34604579dac12", "0x4E269e03460719eC89Bb5e3B2610c7ba67BF900D"]' \
--verify \
--network eth-kovan \
--overrides \
--gaslimit 10000000 \
--txtype 0 \
--gasprice 72
```

```sh
yarn hardhat operator:v0.7:deploy \
--setup \
--owner 0x797de2909991C66C66D8e730C8385bbab8D18eA6 \
--senders '["0x678B5Cb6E7867A37f2D1f06C49c34604579dac12", "0x4E269e03460719eC89Bb5e3B2610c7ba67BF900D"]' \
--verify \
--network eth-kovan \
--overrides \
--gaslimit 10000000 \
--txtype 2 \
--gasmaxfee 145 \
--gasmaxpriority 2
```

## Verification

### Verify an Operator 1.0.0

Task parameters:

| Required? |   Name   |       Description       |  Type   | Depends On |                     Options                      |                            Defaults to                            |
| :-------: | :------: | :---------------------: | :-----: | :--------: | :----------------------------------------------: | :---------------------------------------------------------------: |
|    ✅     | address  |  The contract address   | address |            |                                                  |                                                                   |
|           | deployer |  The deployer address   | address |            |                                                  | Public key of `process.env.PRIVATE_KEY` or `process.env.MNEMONIC` |
|    ✅     | network  | Hardhat `network` param | string  |            | See `networkUserConfigs` in `/utils/networks.ts` |                             `hardhat`                             |

Example calls:

```sh
yarn hardhat operator:v0.7:verify \
--address 0x64010872daA06C317B8d3a7d7E9E9789CC918313 \
--deployer 0x75A0003E8a8ba51CB42905A976883338E7017B42 \
--network matic-mumbai
```

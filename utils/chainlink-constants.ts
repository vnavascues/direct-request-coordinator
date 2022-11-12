import { BigNumber } from "ethers";

import { ChainId } from "./constants";

export const LINK_TOTAL_SUPPLY = BigNumber.from("10").pow("27");
export const MIN_CONSUMER_GAS_LIMIT = 400_000; // From Operator.sol::MINIMUM_CONSUMER_GAS_LIMIT

// NB: KeeperRegistry 1.2.0 address accross networks is 0x02777053d6764996e594c3E88AF1D58D5363a2e6
export const chainIdFastGasFeed: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C"],
  [ChainId.ETH_RINKEBY, "0xCe3f7378aE409e1CE0dD6fFA70ab683326b73f04"],
  [ChainId.ETH_KOVAN, "0x3D400312Bb3456f4dC06D528B55707F08dFFD664"],
  [ChainId.BSC_MAINNET, "0xF6Ef201AE5D05a5cd04d71Ab3C90c901D4489E88"],
  [ChainId.BSC_TESTNET, "0xf666942A1E6275F929F2D87E03Bae1EA5D1031e2"],
  [ChainId.MATIC_MAINNET, "0xf824eA79774E8698E6C6D156c60ab054794C9B18"],
  [ChainId.FTM_MAINNET, "0xB71eB5CABCE02d55d1Fac0e26c5745E704b61021"],
  [ChainId.FTM_TESTNET, "0x409CF388DaB66275dA3e44005D182c12EeAa12A0"],
  [ChainId.AVAX_FUJI, "0x8a9880A18B77138875d0fb18Da4703bF1cda65D9"],
  [ChainId.AVAX_MAINNET, "0xd1cC11c5102bE7Dd8919715E6b04e1Af1e43fdc4"],
  [ChainId.MATIC_MUMBAI, "0x095BF5DBE28535B9eAC32f1ECd6784ef1c15d756"],
]);

export const chainIdFlags: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ARB_MAINNET, "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83"],
  [ChainId.ARB_RINKEBY, "0x491B1dDA0A8fa069bbC1125133A975BF4e85a91b"],
]);

//NB: don't make it readonly to allow dryrun deploys on the Hardhat network
export const chainIdLink: Map<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "0x514910771AF9Ca656af840dff83E8264EcF986CA"],
  [ChainId.ETH_RINKEBY, "0x01BE23585060835E02B77ef475b0Cc51aA1e0709"],
  [ChainId.ETH_GOERLI, "0x326c977e6efc84e512bb9c30f76e30c160ed06fb"],
  [ChainId.OPT_MAINNET, "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6"],
  [ChainId.RSK_MAINNET, "0x14AdaE34beF7ca957Ce2dDe5ADD97ea050123827"],
  [ChainId.ETH_KOVAN, "0xa36085F69e2889c224210F603D836748e7dC0088"],
  [ChainId.BSC_MAINNET, "0x404460C6A5EdE2D891e8297795264fDe62ADBB75"],
  [ChainId.OPT_KOVAN, "0x4911b761993b9c8c0d14Ba2d86902AF6B0074F5B"],
  [ChainId.BSC_TESTNET, "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06"],
  [ChainId.XDAI_MAINNET, "0xE2e73A1c69ecF83F464EFCE6A5be353a37cA09b2"],
  [ChainId.HECO_MAINNET, "0x9e004545c59D359F6B7BFB06a26390b087717b42"],
  [ChainId.MATIC_MAINNET, "0xb0897686c545045aFc77CF20eC7A532E3120E0F1"],
  [ChainId.FTM_MAINNET, "0x6F43FF82CCA38001B6699a8AC47A2d0E66939407"],
  [ChainId.OPT_GOERLI, "0xdc2CC710e42857672E7907CF474a69B63B93089f"],
  [ChainId.KLAYTN_BAOBAB, "0x04c5046A1f4E3fFf094c26dFCAA75eF293932f18"],
  [ChainId.METIS_MAINNET, "0x79892E8A3Aea66C8F6893fa49eC6208ef07EC046"],
  [ChainId.MOONBEAM_MAINNET, "0x012414A392F9FA442a3109f1320c439C45518aC3"],
  [ChainId.MOONBEAM_MOONRIVER, "0x8b12Ac23BFe11cAb03a634C1F117D64a7f2cFD3e"],
  [ChainId.FTM_TESTNET, "0xfaFedb041c0DD4fA2Dc0d87a6B0979Ee6FA7af5F"],
  [ChainId.ARB_MAINNET, "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4"],
  [ChainId.AVAX_FUJI, "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846"],
  [ChainId.AVAX_MAINNET, "0x5947BB275c521040051D82396192181b413227A3"],
  [ChainId.MATIC_MUMBAI, "0x326C977E6efc84E512bB9C30f76E30c160eD06FB"],
  [ChainId.ARB_RINKEBY, "0x615fBe6372676474d9e6933d310469c9b68e9726"],
  [ChainId.ARB_GOERLI, "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4"],
  [ChainId.ONE_MAINNET, "0x218532a12a389a4a92fC0C5Fb22901D1c19198aA"],
  [ChainId.ONE_TESTNET, "0x8b12Ac23BFe11cAb03a634C1F117D64a7f2cFD3e"],
]);

export const chainIdLinkTknFeed: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "0xDC530D9457755926550b59e8ECcdaE7624181557"],
  [ChainId.ETH_RINKEBY, "0xFABe80711F3ea886C3AC102c81ffC9825E16162E"],
  [ChainId.ETH_GOERLI, "0x464A1515ADc20de946f8d0DEB99cead8CEAE310d"],
  [ChainId.ETH_KOVAN, "0x3Af8C569ab77af5230596Acf0E8c2F9351d24C38"],
  [ChainId.BSC_MAINNET, "0xB38722F6A608646a538E882Ee9972D15c86Fc597"],
  [ChainId.BSC_TESTNET, "0x351Ff08FF5077d6E8704A4763836Fe187f074380"],
  [ChainId.OPT_MAINNET, "0x464A1515ADc20de946f8d0DEB99cead8CEAE310d"],
  [ChainId.OPT_GOERLI, "0x37410D317b96E1fED1814473E1CcD323D0eB4Eb1"],
  [ChainId.OPT_KOVAN, "0xB677bfBc9B09a3469695f40477d05bc9BcB15F50"],
  [ChainId.MATIC_MAINNET, "0x5787BefDc0ECd210Dfa948264631CD53E68F7802"],
  [ChainId.MATIC_MUMBAI, "0x12162c3E810393dEC01362aBf156D7ecf6159528"],
  [ChainId.FTM_MAINNET, "0x3FFe75E8EDA86F48e454e6bfb5F74d95C20744f4"],
  [ChainId.FTM_TESTNET, "0xF549af21578Cfe2385FFD3488B3039fd9e52f006"],
  [ChainId.AVAX_MAINNET, "0x1b8a25F73c9420dD507406C3A3816A276b62f56a"],
  [ChainId.AVAX_FUJI, "0x79c91fd4F8b3DaBEe17d286EB11cEE4D83521775"],
  [ChainId.ARB_MAINNET, "0xb7c8Fb1dB45007F98A68Da0588e1AA524C317f27"],
  [ChainId.ARB_GOERLI, "0x1AdDb2368414B3b4cF1BCe7A887d2De7Bfb6886f"],
  [ChainId.ARB_RINKEBY, "0x1a658fa1a5747d73D0AD674AF12851F7d74c998e"],
  [ChainId.ONE_MAINNET, "0x69348435ee4b3904df1AE528FA0aaf34DA1E9184"],
  [ChainId.KLAYTN_BAOBAB, "0xf49f81b3d2F2a79b706621FA2D5934136352140c"],
]);

// L2 Sequencer Uptime Status Feeds
export const chainIdL2SequencerFeed: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ARB_MAINNET, "0xFdB631F5EE196F0ed6FAa767959853A9F217697D"],
  [ChainId.ARB_GOERLI, "0x4da69F028a5790fCCAfe81a75C0D24f46ceCDd69"],
  [ChainId.OPT_MAINNET, "0x371EAD81c9102C9BF4874A9075FFFf170F2Ee389"],
  [ChainId.OPT_GOERLI, "0x4C4814aa04433e0FB31310379a4D6946D5e1D353"],
  [ChainId.METIS_MAINNET, "0x58218ea7422255EBE94e56b504035a784b7AA204"],
]);

// NB: deprecated in favor of chainIdL2SequencerFeed
export const chainIdSequencerOfflineFlag: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ARB_MAINNET, "chainlink.flags.arbitrum-seq-offline"],
  [ChainId.ARB_RINKEBY, "chainlink.flags.arbitrum-seq-offline"],
]);

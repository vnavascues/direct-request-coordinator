import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { BigNumber, ethers } from "ethers";

import { DRCoordinator } from "../../src/types";
import { ChainId } from "../../utils/constants";
import { Overrides } from "../../utils/types";
import { ChainlinkNodeId, ExternalAdapterId } from "./constants";

// TODO: type ethereumAddress (check ethers.js), type SpecId, type SpecKey

export interface ExternalAdapter {
  id: ExternalAdapterId;
  version: string;
}
export interface Description {
  adapter: null | ExternalAdapter;
  chainId: ChainId;
  jobId: number;
  jobName: string;
  nodeId: ChainlinkNodeId;
  notes: null | string;
}

export interface Configuration {
  externalJobId: string;
  fee: string;
  feeType: number;
  gasLimit: number;
  minConfirmations: number;
  operator: string;
  payment: string;
  paymentType: number;
}

export interface ConfigurationConverted {
  fee: BigNumber;
  feeType: number;
  gasLimit: number;
  key: string;
  minConfirmations: number;
  operator: string;
  payment: BigNumber;
  paymentType: number;
  specId: string;
}

export type Consumers = string[];
export type ConsumersConverted = string[];

export interface DeployData {
  drCoordinator: DRCoordinator;
  addressLink: string;
  isMultiPriceFeedDependant: boolean;
  addressPriceFeed1: string;
  addressPriceFeed2: string;
  isSequencerDependant: boolean;
  sequencerOfflineFlag: string;
  addressChainlinkFlags: string;
}

export interface SpecItem {
  description: Description;
  configuration: Configuration;
  consumers: Consumers;
}

export type SpecConverted = ConfigurationConverted;
export type SpecAuthorizedConsumersConverted = ConsumersConverted;

export interface SpecItemConverted {
  specConverted: SpecConverted;
  specAuthorizedConsumers: SpecAuthorizedConsumersConverted;
}

export interface TaskData {
  drCoordinator: DRCoordinator;
  signer: ethers.Wallet | SignerWithAddress;
  overrides: Overrides;
  specs?: SpecItem[];
}

export interface DRCoordinatorLogConfig {
  detail?: boolean;
  keys?: boolean;
  specs?: boolean;
  authconsumers?: boolean;
}

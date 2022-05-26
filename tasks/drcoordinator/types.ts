import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { BigNumber, ethers } from "ethers";

import { ChainlinkNodeId, ExternalAdapterId } from "./constants";
import { ChainId } from "../../utils/constants";
import { DRCoordinator } from "../../src/types";
import { Overrides } from "../../utils/types";

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
  feeType: number;
  fulfillmentFee: string;
  gasLimit: number;
  minConfirmations: number;
  oracleAddr: string;
  payment: string;
}

export interface ConfigurationConverted {
  feeType: number;
  fulfillmentFee: BigNumber;
  gasLimit: number;
  key: string;
  minConfirmations: number;
  operator: string;
  payment: BigNumber;
  specId: string;
}

export interface DeployData {
  drCoordinator: DRCoordinator;
  addressLink: string;
  addressLinkTknFeed: string;
  isSequencerDependant: boolean;
  sequencerOfflineFlag: string;
  addressChainlinkFlags: string;
}

export interface Spec {
  description: Description;
  configuration: Configuration;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SpecConverted extends ConfigurationConverted {}

export interface TaskData {
  drCoordinator: DRCoordinator;
  signer: ethers.Wallet | SignerWithAddress;
  overrides: Overrides;
  specs?: Spec[];
}

export interface DRCoordinatorLogConfig {
  detail?: boolean;
  keys?: boolean;
  specs?: boolean;
}

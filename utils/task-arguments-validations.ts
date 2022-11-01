import { BigNumber, ethers } from "ethers";
import type { CLIArgumentType } from "hardhat/types";

// TODO: patches importing HardhatError & ERRORS
import { HardhatError } from "./errors";
import { ERRORS } from "./errors-list";
import { networkUserConfigs } from "./networks";
import { reSemVer, reUUID } from "./regex";

export const address: CLIArgumentType<string> = {
  name: "address",
  parse: (argName: string, strValue: string) => strValue,
  /**
   * Check if argument value is of type "address"
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not a valid EVM address
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate: (argName: string, value: any): void => {
    if (!ethers.utils.isAddress(value)) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value,
        name: argName,
        type: address.name,
      });
    }
  },
};

export const addressesArray: CLIArgumentType<string[]> = {
  name: "addressesArray",
  parse(argName: string, strValue: string): string[] {
    try {
      return JSON.parse(strValue);
    } catch (error) {
      if (error instanceof Error) {
        throw new HardhatError(
          ERRORS.ARGUMENTS.INVALID_JSON_ARGUMENT,
          {
            param: argName,
            error: error.message,
          },
          error,
        );
      }
      throw error;
    }
  },
  /**
   * Check if argument value is of type "addressesArray".
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not an Array, or the items are not valid EVM addresses
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate: (argName: string, value: any): void => {
    if (!Array.isArray(value)) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
        value,
        name: argName,
        type: addressesArray.name,
        reason: "Not an Array",
      });
    }
    value.forEach((address: string) => {
      if (!ethers.utils.isAddress(address)) {
        throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_ADDRESSES, {
          address,
          value,
          name: argName,
          type: addressesArray.name,
        });
      }
    });
  },
};

export const bignumber: CLIArgumentType<BigNumber> = {
  name: "bignumber",
  parse(argName: string, strValue: string): BigNumber {
    try {
      return BigNumber.from(strValue);
    } catch (error) {
      if (error instanceof Error) {
        throw new HardhatError(
          ERRORS.ARGUMENTS.INVALID_BIGNUMBER_ARGUMENT,
          {
            param: argName,
            error: error.message,
          },
          error,
        );
      }
      throw error;
    }
  },
  /**
   * Check if argument value is of type "bignumber"
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not of type "bignumber"
   */
  validate: (argName: string, value: BigNumber): void => {
    const isBigNumber = BigNumber.isBigNumber(value);
    if (!isBigNumber) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value,
        name: argName,
        type: bignumber.name,
      });
    }
  },
};

export const bytes = (size?: number): CLIArgumentType<string> => {
  return {
    name: size ? `bytes${size}` : "bytes",
    parse: (argName: string, strValue: string) => strValue,
    /**
     * Check if argument value is of type "bytes"
     *
     * @param argName {string} argument's name - used for context in case of error.
     * @param value {any} argument's value to validate.
     *
     * @throws HH301 if value is not of type "bytes"
     */
    validate: (argName: string, value: string): void => {
      if (!value.startsWith("0x")) {
        throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
          value,
          name: argName,
          type: bytes(size).name,
          reason: `Not starts with 0x`,
        });
      }
      if (size === undefined) {
        if (!ethers.utils.isHexString(value)) {
          throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
            value,
            name: argName,
            type: bytes(size).name,
            reason: `Not a valid hex string`,
          });
        }
        return;
      }
      if (!ethers.utils.isHexString(value, size)) {
        throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
          value,
          name: argName,
          type: bytes(size).name,
          reason: `Not a valid ${size} bytes long hex string`,
        });
      }
    },
  };
};

export const bytesArray = (size?: number): CLIArgumentType<string[]> => {
  return {
    name: size ? `bytes${size}Array` : "bytesArray",
    parse(argName: string, strValue: string): string[] {
      try {
        return JSON.parse(strValue);
      } catch (error) {
        if (error instanceof Error) {
          throw new HardhatError(
            ERRORS.ARGUMENTS.INVALID_JSON_ARGUMENT,
            {
              param: argName,
              error: error.message,
            },
            error,
          );
        }
        throw error;
      }
    },
    /**
     * Check if argument value is of type "bytesArray".
     *
     * @param argName {string} argument's name - used for context in case of error.
     * @param value {any} argument's value to validate.
     *
     * @throws HH301 if value is not an Array, or the items are not valid bytes
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validate: (argName: string, value: any): void => {
      if (!Array.isArray(value)) {
        throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
          value,
          name: argName,
          type: addressesArray.name,
          reason: "Not an Array",
        });
      }
      value.forEach((item: string) => {
        if (!item.startsWith("0x")) {
          throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
            value: item,
            name: argName,
            type: bytes(size).name,
            reason: `Not starts with 0x`,
          });
        }
        if (size === undefined) {
          if (!ethers.utils.isHexString(item)) {
            throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
              value: item,
              name: argName,
              type: bytes(size).name,
              reason: `Not a valid hex string`,
            });
          }
          return;
        }
        if (!ethers.utils.isHexString(item, size)) {
          throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
            value: item,
            name: argName,
            type: bytes(size).name,
            reason: `Not a valid ${size} bytes long hex string`,
          });
        }
      });
    },
  };
};

export const stringArray: CLIArgumentType<string[]> = {
  name: "stringArray",
  parse(argName: string, strValue: string): string[] {
    try {
      return JSON.parse(strValue);
    } catch (error) {
      if (error instanceof Error) {
        throw new HardhatError(
          ERRORS.ARGUMENTS.INVALID_JSON_ARGUMENT,
          {
            param: argName,
            error: error.message,
          },
          error,
        );
      }
      throw error;
    }
  },
  /**
   * Check if argument value is of type "stringArray".
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not an Array, or the items are not strings
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate: (argName: string, value: any): void => {
    if (!Array.isArray(value)) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
        value,
        name: argName,
        type: addressesArray.name,
        reason: "Not an Array",
      });
    }
    value.forEach((item: string) => {
      if (typeof item !== "string") {
        throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
          value: item,
          name: argName,
          type: addressesArray.name,
          reason: "Not a string",
        });
      }
    });
  },
};

export const network: CLIArgumentType<string> = {
  name: "network",
  parse: (argName: string, strValue: string) => strValue,
  /**
   * Check if argument value is of type "network"
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not a supported network
   */
  validate: (argName: string, value: string): void => {
    if (!networkUserConfigs.has(value)) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
        value,
        name: argName,
        type: network.name,
        reason: `Unsupported network. Please, consider updating the networks map`,
      });
    }
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const optionsArray = (items: any[]): CLIArgumentType<string> => {
  return {
    name: "optionsArray",
    parse: (argName: string, strValue: string) => strValue,
    /**
     * Check if argument value is of type "optionsArray".
     *
     * @param argName {string} argument's name - used for context in case of error.
     * @param value {any} argument's value to validate.
     *
     * @throws HH301 if value is not an item of the Array
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validate: (argName: string, value: any): void => {
      const itemsAsString = items.map(item => item.toString());
      if (!itemsAsString.includes(value)) {
        throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE_WITH_REASON, {
          value,
          name: argName,
          type: optionsArray.name,
          reason: `Not in supported values: ${items.join(", ")}`,
        });
      }
    },
  };
};

export const semVer: CLIArgumentType<string> = {
  name: "semVer",
  parse: (argName: string, strValue: string) => strValue,
  /**
   * Check if argument value is of type "semVer"
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not a valid semantic versioning
   */
  validate: (argName: string, value: string): void => {
    if (!reSemVer.test(value)) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value,
        name: argName,
        type: semVer.name,
      });
    }
  },
};

export const uuid: CLIArgumentType<string> = {
  name: "uuid",
  parse: (argName: string, strValue: string) => strValue,
  /**
   * Check if argument value is of type "uuid"
   *
   * @param argName {string} argument's name - used for context in case of error.
   * @param value {any} argument's value to validate.
   *
   * @throws HH301 if value is not a valid uuid v4
   */
  validate: (argName: string, value: string): void => {
    if (!reUUID.test(value)) {
      throw new HardhatError(ERRORS.ARGUMENTS.INVALID_VALUE_FOR_TYPE, {
        value,
        name: argName,
        type: uuid.name,
      });
    }
  },
};

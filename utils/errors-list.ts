export const ERROR_PREFIX = "HH";

export interface ErrorDescriptor {
  number: number;
  // Message can use templates. See applyErrorMessageTemplate
  message: string;
  // Title and description can be Markdown
  title: string;
  description: string;
  shouldBeReported: boolean;
}

export function getErrorCode(error: ErrorDescriptor): string {
  return `${ERROR_PREFIX}${error.number}`;
}

export const ERRORS = {
  ARGUMENTS: {
    INVALID_VALUE_FOR_TYPE: {
      number: 301,
      message: "Invalid value %value% for argument %name% of type %type%",
      title: "Invalid argument type",
      description: `One of your Hardhat or task arguments has an invalid type.

      Please double check your arguments.`,
      shouldBeReported: false,
    },
    // NB: Custom Error
    INVALID_VALUE_FOR_TYPE_ADDRESSES: {
      number: 301,
      message: "Invalid value %address% in %value for argument %name% of type %type%",
      title: "Invalid argument type",
      description: `One of your Hardhat or task arguments has an invalid type.

      Please double check your arguments.`,
      shouldBeReported: false,
    },
    // NB: Custom Error
    INVALID_VALUE_FOR_TYPE_WITH_REASON: {
      number: 301,
      message: "Invalid value %value% for argument %name% of type %type%. %reason%",
      title: "Invalid argument type",
      description: `One of your Hardhat or task arguments has an invalid type.

      Please double check your arguments.`,
      shouldBeReported: false,
    },
    // NB: Custom Error
    INVALID_BIGNUMBER_ARGUMENT: {
      number: 311,
      message: "Error parsing BigNumber value for argument %param%: %error%",
      title: "Invalid BigNumber parameter",
      description: `You tried to run a task with an invalid BigNumber parameter. 

Please double check how you invoked Hardhat or ran your task.`,
      shouldBeReported: false,
    },
    INVALID_JSON_ARGUMENT: {
      number: 311,
      message: "Error parsing JSON value for argument %param%: %error%",
      title: "Invalid JSON parameter",
      description: `You tried to run a task with an invalid JSON parameter. 

Please double check how you invoked Hardhat or ran your task.`,
      shouldBeReported: false,
    },
  },
  INTERNAL: {
    TEMPLATE_INVALID_VARIABLE_NAME: {
      number: 900,
      message: "Variable names can only include ascii letters and numbers, and start with a letter, but got %variable%",
      title: "Invalid error message template",
      description: `An error message template contains an invalid variable name. This is a bug.

  Please [report it](https://github.com/nomiclabs/hardhat/issues/new) to help us improve Hardhat.`,
      shouldBeReported: true,
    },
    TEMPLATE_VALUE_CONTAINS_VARIABLE_TAG: {
      number: 901,
      message: "Template values can't include variable tags, but %variable%'s value includes one",
      title: "Invalid error message replacement",
      description: `Tried to replace an error message variable with a value that contains another variable name. This is a bug.

  Please [report it](https://github.com/nomiclabs/hardhat/issues/new) to help us improve Hardhat.`,
      shouldBeReported: true,
    },
    TEMPLATE_VARIABLE_TAG_MISSING: {
      number: 902,
      message: "Variable %variable%'s tag not present in the template",
      title: "Missing replacement value from error message template",
      description: `An error message template is missing a replacement value. This is a bug.

  Please [report it](https://github.com/nomiclabs/hardhat/issues/new) to help us improve Hardhat.`,
      shouldBeReported: true,
    },
  },
};

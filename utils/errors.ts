// TODO: *** REMOVE FROM HERE ***
// This file patches the impossibility of importing the proper HardhatError & ERRORS from:
//
// import { HardhatError } from "hardhat/src/internal/core/errors";
// import { ERRORS } from "hardhat/src/internal/core/errors-list";
//
// The issue has been reported on Hardhat Discord. If it's ever being fixed, remove this patch.
// Otherwise, please keep it up to date (call tasks that use custom types).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ERRORS, ErrorDescriptor, getErrorCode } from "./errors-list";

const inspect = Symbol.for("nodejs.util.inspect.custom");

/**
 * Replaces all the instances of [[toReplace]] by [[replacement]] in [[str]].
 */
export function replaceAll(str: string, toReplace: string, replacement: string) {
  return str.split(toReplace).join(replacement);
}

export class CustomError extends Error {
  constructor(message: string, public readonly parent?: Error) {
    // WARNING: Using super when extending a builtin class doesn't work well
    // with TS if you are compiling to a version of JavaScript that doesn't have
    // native classes. We don't do that in Hardhat.
    //
    // For more info about this, take a look at: https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    super(message);

    this.name = this.constructor.name;

    // We do this to avoid including the constructor in the stack trace
    if ((Error as any).captureStackTrace !== undefined) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  public [inspect]() {
    let str = this.stack;
    if (this.parent !== undefined) {
      const parentAsAny = this.parent as any;
      const causeString =
        parentAsAny[inspect]?.() ?? parentAsAny.inspect?.() ?? parentAsAny.stack ?? parentAsAny.toString();
      const nestedCauseStr = causeString
        .split("\n")
        .map((line: string) => `    ${line}`)
        .join("\n")
        .trim();
      str += `

    Caused by: ${nestedCauseStr}`;
    }
    return str;
  }
}

export class HardhatError extends CustomError {
  public static isHardhatError(other: any): other is HardhatError {
    return other !== undefined && other !== null && other._isHardhatError === true;
  }

  public static isHardhatErrorType(other: any, descriptor: ErrorDescriptor): other is HardhatError {
    return HardhatError.isHardhatError(other) && other.errorDescriptor.number === descriptor.number;
  }

  public readonly errorDescriptor: ErrorDescriptor;
  public readonly number: number;
  public readonly messageArguments: Record<string, any>;

  private readonly _isHardhatError: boolean;

  constructor(errorDescriptor: ErrorDescriptor, messageArguments: Record<string, any> = {}, parentError?: Error) {
    const prefix = `${getErrorCode(errorDescriptor)}: `;

    const formattedMessage = applyErrorMessageTemplate(errorDescriptor.message, messageArguments);

    super(prefix + formattedMessage, parentError);

    this.errorDescriptor = errorDescriptor;
    this.number = errorDescriptor.number;
    this.messageArguments = messageArguments;

    this._isHardhatError = true;
    Object.setPrototypeOf(this, HardhatError.prototype);
  }
}

/**
 * This function applies error messages templates like this:
 *
 *  - Template is a string which contains a variable tags. A variable tag is a
 *    a variable name surrounded by %. Eg: %plugin1%
 *  - A variable name is a string of alphanumeric ascii characters.
 *  - Every variable tag is replaced by its value.
 *  - %% is replaced by %.
 *  - Values can't contain variable tags.
 *  - If a variable is not present in the template, but present in the values
 *    object, an error is thrown.
 *
 * @param template The template string.
 * @param values A map of variable names to their values.
 */
export function applyErrorMessageTemplate(template: string, values: { [templateVar: string]: any }): string {
  return _applyErrorMessageTemplate(template, values, false);
}

function _applyErrorMessageTemplate(
  template: string,
  values: { [templateVar: string]: any },
  isRecursiveCall: boolean,
): string {
  if (!isRecursiveCall) {
    for (const variableName of Object.keys(values)) {
      if (variableName.match(/^[a-zA-Z][a-zA-Z0-9]*$/) === null) {
        throw new HardhatError(ERRORS.INTERNAL.TEMPLATE_INVALID_VARIABLE_NAME, {
          variable: variableName,
        });
      }

      const variableTag = `%${variableName}%`;

      if (!template.includes(variableTag)) {
        throw new HardhatError(ERRORS.INTERNAL.TEMPLATE_VARIABLE_TAG_MISSING, {
          variable: variableName,
        });
      }
    }
  }

  if (template.includes("%%")) {
    return template
      .split("%%")
      .map(part => _applyErrorMessageTemplate(part, values, true))
      .join("%");
  }

  for (const variableName of Object.keys(values)) {
    let value: string;

    if (values[variableName] === undefined) {
      value = "undefined";
    } else if (values[variableName] === null) {
      value = "null";
    } else {
      value = values[variableName].toString();
    }

    if (value === undefined) {
      value = "undefined";
    }

    const variableTag = `%${variableName}%`;

    if (value.match(/%([a-zA-Z][a-zA-Z0-9]*)?%/) !== null) {
      throw new HardhatError(ERRORS.INTERNAL.TEMPLATE_VALUE_CONTAINS_VARIABLE_TAG, { variable: variableName });
    }

    template = replaceAll(template, variableTag, value);
  }

  return template;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
// TODO: *** REMOVE TO HERE ***

export function throwNewError(message: string): never {
  throw new Error(message);
}

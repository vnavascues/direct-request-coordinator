const shell = require("shelljs");

// Plugin docs:
// https://github.com/sc-forks/solidity-coverage/blob/master/HARDHAT_README.md
module.exports = {
  istanbulReporter: ["html", "json", "lcov", "text"],
  providerOptions: {
    mnemonic: process.env.MNEMONIC,
  },
  configureYulOptimizer: true,
  skipFiles: ["chainlink/", "drcoordinator/test"],
};

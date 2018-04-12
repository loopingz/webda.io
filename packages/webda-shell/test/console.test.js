"use strict";
const assert = require("assert");
var consoleService = require('../lib/console/webda').default;
const fs = require('fs');

var output = "";

consoleService.output = function(...args) {
  output += args.join(' ');
}

function commandLine(line) {
  return Promise.resolve(consoleService.handleCommand(line.split(' ')));
}

function checkTestDeploymentConfig(config) {
  assert.equal(config.parameters.mainParameter, 'test');
  assert.equal(config.parameters.deploymentParameter, 'deploymentTest');
  assert.equal(config.parameters.config, 'deploymentTestConfig');
}

describe('Console', () => {
  beforeEach(() => {
    output = "";
  });
  it('help', () => {
    return commandLine("help");
  });
  it('unknown command fallback', () => {
    let fallback = false;
    consoleService.help = () => {
      fallback = true;
    };
    return commandLine("bouzouf").then(() => {
      assert.equal(fallback, true);
    });
  });
  describe('config', () => {
    it('exporter', () => {
      return commandLine("-d Test config test.exports.json").then(() => {
        checkTestDeploymentConfig(JSON.parse(fs.readFileSync('test.exports.json')));
      });
    });
    it('exporter - no file', () => {
      return commandLine("-d Test config").then(() => {
        checkTestDeploymentConfig(JSON.parse(output));
      });
    });
    it('exporter - bad deployment', () => {
      return commandLine("-d TestLambda config test.export.json").then(() => {
        assert.equal(output, 'Unknown deployment: TestLambda');
      });
    });
  });
});

"use strict";
const assert = require("assert");
var consoleService = require('../lib/console/webda').default;
const fs = require('fs');
const webda = require('webda');

function commandLine(line) {
  consoleService.logger = new webda.MemoryLogger(consoleService, 'MemoryLogger', {logLevels: 'CONSOLE,ERROR,WARN,INFO,DEBUG,TRACE', logLevel: 'WARN'});
  return Promise.resolve(consoleService.handleCommand(line.split(' ')));
}

function checkTestDeploymentConfig(config) {
  assert.notEqual(config, undefined);
  assert.equal(config.parameters.mainParameter, 'test');
  assert.equal(config.parameters.deploymentParameter, 'deploymentTest');
  assert.equal(config.parameters.config, 'deploymentTestConfig');
}

describe('Console', () => {
  beforeEach(() => {

  });
  it('help', () => {
    return commandLine("--noCompile help");
  });
  it('unknown command fallback', () => {
    let fallback = false;
    consoleService.help = () => {
      fallback = true;
    };
    return commandLine("--noCompile bouzouf").then(() => {
      assert.equal(fallback, true);
    });
  });
  describe('config', () => {
    it('exporter', () => {
      return commandLine("-d Test --noCompile config test.exports.json").then(() => {
        checkTestDeploymentConfig(JSON.parse(fs.readFileSync('test.exports.json')));
      });
    });
    it('exporter - no file', () => {
      return commandLine("-d Test --noCompile config").then(() => {
        //checkTestDeploymentConfig(JSON.parse(output));
      });
    });
    it('exporter - bad deployment', () => {
      return commandLine("-d TestLambda config test.export.json").then(() => {
        assert.equal(consoleService.logger.getLogs()[0].args[0], 'Unknown deployment: TestLambda');
      });
    });
  });
});

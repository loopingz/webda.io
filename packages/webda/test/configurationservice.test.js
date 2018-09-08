var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config-reload.json");
var webda;

const Utils = require("./utils");

describe('ConfigurationService', function() {
  beforeEach(async function() {
    webda = new Webda.Core(config);
    await webda.waitForInit();
    await (webda.getService('ConfigurationStore').__clean());
  });
  afterEach(async function() {
    await (webda.getService('ConfigurationStore').__clean());
    webda.getService('ConfigurationService').stop();
  });
  it('initial load', async function() {
    assert.equal(webda._config.services.Authentication.providers.email.text, 'Test');
    assert.equal(webda._config.services.Authentication.providers.email.mailer, 'DefinedMailer');
    let test = {
      uuid: 'test',
      'Authentication.providers.email.text': 'Plop'
    };
    let store = webda.getService('ConfigurationStore');
    let service = webda.getService('ConfigurationService');
    let otherService = webda.getService('Users');
    await store.save(test);
    await Utils.sleep(2100);
    assert.equal(webda._config.services.Authentication.providers.email.text, 'Plop');
    assert.equal(webda._config.services.Authentication.providers.email.mailer, 'DefinedMailer');
    assert.equal(service, webda.getService('ConfigurationService'), "ConfigurationService service should not change");
    assert.equal(store, webda.getService('ConfigurationStore'), "ConfigurationStore service should not change");
    assert.notEqual(otherService, webda.getService('Users'), "Users service should change");
    otherService = webda.getService('Users');
    await Utils.sleep(2100);
    assert.equal(service, webda.getService('ConfigurationService'), "ConfigurationService service should not change");
    assert.equal(store, webda.getService('ConfigurationStore'), "ConfigurationStore service should not change");
    // Should not reupdate as config as not changed
    assert.equal(otherService, webda.getService('Users'), "Users service should not change");
  });
});
var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config-reload.json");
var webda;

const Utils = require("./utils");

describe('ConfigurationService', function() {
  beforeEach(async function() {
    webda = new Webda.Core(config);
    await (webda.getService('ConfigurationStore').__clean());
    await webda.init();
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
    await store.save(test);
    await Utils.sleep(2100);
    assert.equal(webda._config.services.Authentication.providers.email.text, 'Plop');
    assert.equal(webda._config.services.Authentication.providers.email.mailer, 'DefinedMailer');
  });
});

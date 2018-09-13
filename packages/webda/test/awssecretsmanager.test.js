var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");
var webda;
var secrets;
var skipAWS = process.env["WEBDA_AWS_TEST"] === undefined;

const Utils = require("./utils");

describe('AwsSecretsManager', function() {
  beforeEach(async function() {
    if (skipAWS) {
      return;
    }
    webda = new Webda.Core(config);
    await webda.init();
    secrets = webda.getService('AwsSecretsManager');
    assert.notEqual(secrets, undefined);
    try {
      await secrets.delete('webda-test-unit-test', 7, true);
      // We have to wait for the secret to go away
      await Utils.sleep(15000);
    } catch (err) {
      // Skip bad delete
    }
  });
  afterEach(async function() {
    if (skipAWS) {
      return;
    }
    await secrets.delete('webda-test-unit-test', 7, true);
  });

  it('basic', async function() {
    if (skipAWS) {
      return;
    }
    let result = await secrets.get('webda-test-manual');
    assert.equal(result['webda-test-1'], 'Test1');
    assert.equal(result['webda-test-2'], 'Test2');
    let config = await secrets.getConfiguration('webda-test-manual');
    assert.equal(config['webda-test-1'], result['webda-test-1']);
    assert.equal(config['webda-test-2'], result['webda-test-2']);
    await secrets.create('webda-test-unit-test', {
      'Authentication.providers.email.text': 'Bouzouf'
    });
    result = await secrets.get('webda-test-unit-test');
    assert.equal(result['Authentication.providers.email.text'], 'Bouzouf');
    await secrets.put('webda-test-unit-test', {
      'Authentication.providers.email.text': 'Bouzouf2'
    });
    result = await secrets.get('webda-test-unit-test');
    assert.equal(result['Authentication.providers.email.text'], 'Bouzouf2');
  });
});

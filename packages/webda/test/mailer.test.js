"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");

describe("Mailer", function() {
  var webda;
  var ctx;
  var mailer;
  var lastLevel;
  var lastInfo;
  var lastOptions;
  var lastCallback;
  beforeEach(async () => {
    webda = new Webda.Core(config);
    await webda.init();
    lastLevel = lastInfo = lastOptions = lastCallback = undefined;
    ctx = webda.newContext();
    mailer = webda.getService('TrueMailer');
    // Mocking the transporter
    mailer._transporter = {};
    mailer._transporter.sendMail = (options, callback) => {
      lastOptions = options;
      lastCallback = callback;
      return Promise.resolve();
    }
    // Mocking the logger
    mailer._webda.log = (level, ...args) => {
      lastLevel = level;
      lastInfo = args;
    };
  });
  it('Unknown template', function() {
    mailer._getTemplate('plop');
    assert.equal(lastLevel, 'WARN');
    assert.equal(lastInfo[0], 'No template found for');
    assert.equal(lastInfo[1], 'plop');
  })
  it('Known template', function() {
    mailer._getTemplate('PASSPORT_EMAIL_RECOVERY');
    assert.equal(lastLevel, undefined);
    mailer._getTemplate('PASSPORT_EMAIL_RECOVERY');
    assert.equal(lastLevel, undefined);
  })
  it('Known template on send', function() {
    return mailer.send({
      template: 'PASSPORT_EMAIL_RECOVERY',
      from: 'test@webda.io'
    }).then(() => {
      assert.notEqual(lastOptions, undefined);
      assert.notEqual(lastOptions.subject, undefined);
      assert.notEqual(lastOptions.html, undefined);
      assert.notEqual(lastOptions.text, undefined);
    });
  })
  it('No transporter', function() {
    mailer._transporter = undefined;
    let error;
    return mailer.send({
      template: 'PASSPORT_EMAIL_RECOVERY',
      from: 'test@webda.io'
    }).catch((err) => {
      error = err;
    }).then(() => {
      assert.notEqual(error, undefined);
      assert.equal(lastLevel, 'ERROR');
    });
  })
});

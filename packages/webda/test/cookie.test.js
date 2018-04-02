const assert = require("assert");
const SecureCookie = require("../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js").SecureCookie;

var crypto = require('crypto'),
  algorithm = 'aes-256-ctr',
  password = 'd6F3Efeq';
var old_cookie;
describe('SecureCookie', function() {
  describe('needSave', function() {
    it('No changes', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {
        title: "TITLE",
        desc: "DESCRIPTION"
      }).getProxy();
      assert.equal(cookie['title'], "TITLE");
      assert.equal(cookie['desc'], "DESCRIPTION");
      assert.equal(cookie.needSave(), false);
    })
    it('Add a value', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {
        title: "TITLE",
        desc: "DESCRIPTION"
      }).getProxy();
      cookie.test = "PLOP";
      assert.equal(cookie['title'], "TITLE");
      assert.equal(cookie['desc'], "DESCRIPTION");
      old_cookie = cookie;
    })
    it('Change a value', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {
        title: "TITLE",
        desc: "DESCRIPTION"
      }).getProxy();
      cookie.title = "TITLE2";
      assert.equal(cookie['title'], "TITLE2");
      assert.equal(cookie['desc'], "DESCRIPTION");
      assert.equal(old_cookie.needSave(), true);
      old_cookie = cookie;
    })
    it('Delete a value', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {
        title: "TITLE",
        desc: "DESCRIPTION"
      }).getProxy();
      cookie['title'] = undefined;
      assert.equal(cookie['title'], undefined);
      assert.equal(cookie['desc'], "DESCRIPTION");
      assert.equal(old_cookie.needSave(), true);
      old_cookie = cookie;
    })
    it('Empty cookie', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {});
      assert.equal(cookie.needSave(), false);
      old_cookie = cookie;
    })
  });
  describe('encryption', function() {
    it('Normal enc/dec', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {
        title: "TITLE",
        desc: "DESCRIPTION"
      }).getProxy();
      assert.equal(cookie['title'], "TITLE");
      assert.equal(cookie['desc'], "DESCRIPTION");
      // Force encryption
      cookie._changed = true;
      var enc = cookie.save();
      var cookie2 = new SecureCookie({
        secret: "TEST"
      }, enc);
      assert.equal(cookie.title, cookie2.title);
      assert.equal(old_cookie.needSave(), false);
      assert.equal(cookie.desc, cookie2.desc);

    })
    it('Bad secret', function() {
      var cookie = new SecureCookie({
        secret: "TEST"
      }, {
        title: "TITLE",
        desc: "DESCRIPTION"
      }).getProxy();
      assert.equal(cookie['title'], "TITLE");
      assert.equal(cookie['desc'], "DESCRIPTION");
      var enc = cookie.save();
      var exception = false;
      try {
        new SecureCookie({
          secret: "TEST2"
        }, enc);
      } catch (err) {
        exception = true;
      }
      assert.equal(exception, false);
      // TODO Add test for s_fid=3C43F8B5AAFA0B87-0087E6884E64AFFD; s_dslv=1462619672626; s_dslv_s=Less%20than%201%20day;
    })
  })
});

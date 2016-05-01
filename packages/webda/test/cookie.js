var assert = require("assert")
var SecureCookie = require("../cookie.js");

var crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    password = 'd6F3Efeq';
var old_cookie;
describe('SecureCookie', function() {
  describe('needSave', function () {
  	it('No changes', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {title: "TITLE", desc: "DESCRIPTION"});
    	assert.equal(cookie['title'], "TITLE");
    	assert.equal(cookie['desc'], "DESCRIPTION");
    	old_cookie = cookie;
    })
    it('Add a value', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {title: "TITLE", desc: "DESCRIPTION"});
    	cookie.test = "PLOP";
    	assert.equal(cookie['title'], "TITLE");
    	assert.equal(cookie['desc'], "DESCRIPTION");
        // Tricks the slow observer
        assert.equal(old_cookie.needSave(), false);
        old_cookie = cookie;
    })
    it('Change a value', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {title: "TITLE", desc: "DESCRIPTION"});
    	cookie.title = "TITLE2";
    	assert.equal(cookie['title'], "TITLE2");
    	assert.equal(cookie['desc'], "DESCRIPTION");
        assert.equal(old_cookie.needSave(), true);
        old_cookie = cookie;
    })
    it('Delete a value', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {title: "TITLE", desc: "DESCRIPTION"});
    	cookie['title'] = undefined;
    	assert.equal(cookie['title'], undefined);
    	assert.equal(cookie['desc'], "DESCRIPTION");
    	assert.equal(old_cookie.needSave(), true);
        old_cookie = cookie;
    })
    it('Empty cookie', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {});
    	assert.equal(old_cookie.needSave(), true);
        old_cookie = cookie;
    })
  });
  describe('encryption', function () {
  	it('Normal enc/dec', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {title: "TITLE", desc: "DESCRIPTION"});
    	assert.equal(cookie['title'], "TITLE");
    	assert.equal(cookie['desc'], "DESCRIPTION");
    	var enc = cookie.save();
    	var cookie2 = new SecureCookie({secret: "TEST"}, enc);
    	assert.equal(cookie.title, cookie2.title);
        assert.equal(old_cookie.needSave(), false);
    	assert.equal(cookie.desc, cookie2.desc);
    		
    })
    it('Bad secret', function () {
    	var cookie = new SecureCookie({secret: "TEST"}, {title: "TITLE", desc: "DESCRIPTION"});
    	assert.equal(cookie['title'], "TITLE");
    	assert.equal(cookie['desc'], "DESCRIPTION");
    	var enc = cookie.save();
    	var exception = false;
    	try {
    		var cookie2 = new SecureCookie({secret: "TEST2"}, enc);
    	} catch (err) {
    		exception = true;
    	}
    	assert.equal(exception, true);
    })
  })
});

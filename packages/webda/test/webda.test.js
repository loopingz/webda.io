var assert = require("assert");
const Webda = require("../lib/index.js");
var Executor = Webda.Executor;
var config = require("./config.json");
var webda;
var ctx;
var executor;
const Utils = require("./utils");

function assertInitError(service, msg) {
  let serviceBean = webda.getService(service);
  assert.notEqual(serviceBean._initException, undefined, `${service} should have failed init with ${msg}`);
  assert.equal(serviceBean._initException.message.indexOf(msg) >= 0, true);
}

describe('Webda', function() {
  beforeEach(function() {
    webda = new Webda.Core(config);
    ctx = webda.newContext();
  });
  describe('getLocales()', function() {
    var headers = {};
    it('Get default locale', function() {
      headers['Accept-Language'] = 'zh-CN';
      ctx.setRoute({
        _http: {
          headers: headers
        }
      });
      assert.equal(ctx.getLocale(), 'es-ES');
    });
    it('Get approx locale', function() {
      headers['Accept-Language'] = 'en-US;q=0.6,en;q=0.4,es;q=0.2';
      ctx.setRoute({
        _http: {
          headers: headers
        }
      });
      assert.equal(ctx.getLocale(), 'en-GB');
    });
    it('Get exact locale', function() {
      headers['Accept-Language'] = 'fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2';
      ctx.setRoute({
        _http: {
          headers: headers
        }
      });
      assert.equal(ctx.getLocale(), 'fr-FR');
    });
    it('Get fallback locale', function() {
      headers['Accept-Language'] = 'zn-CH,zn;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2';
      ctx.setRoute({
        _http: {
          headers: headers
        }
      });
      assert.equal(ctx.getLocale(), 'en-GB');
    });
  });
  describe('getVersion()', function() {
    it('current', function() {
      assert.equal(webda.getVersion(), '0.10.3');
    });
  });
  describe('utils', function() {
    it('LambdaCaller', async function() {
      // CodeCoverage test
      const LambdaCaller = new Webda.LambdaCaller('plop', {});
      assert.throws(() => new Webda.LambdaCaller());
      new Webda.LambdaCaller('arn', {
        accessKeyId: 'PLOP'
      });
      await Utils.throws(LambdaCaller.execute.bind(LambdaCaller, undefined, true));

    });
    it('toPublicJson', function() {
      let obj = {
        _title: "private",
        title: "public"
      }
      webda.isDebug(); // Just for CodeCoverage
      assert.equal(webda.toPublicJSON(obj)._title, undefined);
    });
    it('errors checks', async function() {
      assert.throws(webda.getModel.bind(webda), 'test');
      assert.throws(webda.getModel.bind(webda, 'Ghost'), Error);
      assert.equal(webda.getService('Ghost'), undefined);
      assert.equal(webda.getService(), undefined);
      assert.equal(webda.getSession(), undefined);
      webda._currentExecutor = {
        session: 'test'
      };
      assert.equal(webda.getSession(), 'test');
      assert.notEqual(webda.loadConfiguration(__dirname + '/config.json'), undefined);
      webda._config.parameters.locales = undefined;
      assert.equal(webda.getLocales().indexOf("en-GB"), 0);
      webda._config._services = undefined;
      assert.equal(JSON.stringify(webda.getServices()), "{}");
      assert.equal(webda.getService('plop'), undefined);
      webda._config._models = undefined;
      assert.equal(JSON.stringify(webda.getModels()), "{}");
      webda._config = undefined;
      assert.equal(webda.getLocales().indexOf("en-GB"), 0);
      process.env.WEBDA_CONFIG = __dirname + '/config.broken.json';
      webda = new Webda.Core();
      await webda.init();
      assertInitError('ConfigurationService', 'Need a source for');
      assertInitError('ConfigurationServiceBadSource', 'Need a valid service');
      assertInitError('ConfigurationServiceBadSourceNoId', 'Need a valid source');
      assertInitError('ConfigurationServiceBadSourceWithId', 'is not implementing ConfigurationProvider interface');
      assertInitError('CloudWatchLogger', 'Require a log group');
    });
    it('context', function() {
      ctx.init();
      assert.notEqual(ctx.getWebda(), undefined);
      ctx.session = undefined;
      assert.equal(ctx.getCurrentUserId(), undefined);
      assert.notEqual(ctx.getStream(), undefined);
      ctx._cookie = undefined;
      ctx.cookie('test', 'plop');
      ctx.cookie('test2', 'plop2');
      assert.equal(ctx._cookie['test'], 'plop');
      assert.equal(ctx._cookie['test2'], 'plop2');
      ctx.writeHead(undefined, {
        test: 'plop'
      });
      assert.equal(ctx._headers['test'], 'plop');
      ctx.setHeader('X-Webda', 'HEAD');
      assert.equal(ctx._headers['X-Webda'], 'HEAD');
      ctx.write(400);
      assert.equal(ctx._body, 400);
      ctx.session = new Webda.SecureCookie({});
      Object.observe = (obj, callback) => {
        callback([{
          name: '_changed'
        }]);
        assert.equal(ctx.session._changed, false);
        callback([{
          name: 'zzz'
        }]);
        assert.equal(ctx.session._changed, true);
      }
      ctx.session.getProxy();
      Object.observe = undefined;
    });
  });
  describe('getService()', function() {
    it('normal', function() {
      assert.notEqual(null, webda.getService("Authentication"));
    });
  })
  describe('checkCSRF()', function() {
    it('string', function() {
      assert.equal(Webda.Core.checkCSRF('http://localhost:18181', 'http://localhost:18181'), true);
      assert.equal(Webda.Core.checkCSRF('http://localhost:18181', 'https://localhost:18181'), false);
      assert.equal(Webda.Core.checkCSRF('http://localhost:18181', 'localhost:18181'), true);
      assert.equal(Webda.Core.checkCSRF('http://localhost:18182', 'localhost:18181'), false);
      assert.equal(Webda.Core.checkCSRF('http://localhost2:18181', 'localhost:18181'), false);
    });
    it('array', function() {
      assert.equal(Webda.Core.checkCSRF('http://localhost:18181', ['http://localhost2:18181', 'http://localhost:18181']), true);
      assert.equal(Webda.Core.checkCSRF('http://localhost:18181', ['localhost2:18181', 'localhost:18181']), true);
      assert.equal(Webda.Core.checkCSRF('http://localhost2:18181', ['localhost2:18181', 'localhost:18181']), true);
      assert.equal(Webda.Core.checkCSRF('http://localhost:18182', ['localhost2:18181', 'localhost:18181']), false);
      assert.equal(Webda.Core.checkCSRF('http://localhost3:18181', ['localhost2:18181', 'localhost:18181']), false);
    });
    it('object', function() {
      assert.equal(Webda.Core.checkCSRF('http://localhost:18181', {
        url: 'localhost:18181'
      }), true);
      assert.equal(Webda.Core.checkCSRF('http://localhost2:18181', {
        url: 'localhost:18181'
      }), false);
      assert.equal(Webda.Core.checkCSRF('http://localhost:18182', {
        url: 'localhost:18181'
      }), false);
    });
  });
  describe('getModdas()', function() {
    it('normal', function() {
      let moddas = webda.getModdas();
      assert.equal(Object.keys(moddas).length, 20);
    });
    it('implementation', function() {
      let moddas = webda.getModdas(Webda.Store);
      assert.equal(Object.keys(moddas).length, 5);
    });
  })
  describe('getServicesImplementations()', function() {
    it('normal', function() {
      let stores = webda.getServicesImplementations(Webda.Store);
      assert.equal(Object.keys(stores).length, 10);
    });
    it('store', function() {
      assert.equal(Object.keys(webda.getStores()).length, Object.keys(webda.getServicesImplementations(Webda.Store)).length);
    });
  })
  describe('getExecutor()', function() {
    it('Known page', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/");
      assert.notEqual(executor, undefined);
      assert.equal(ctx['_route']['_http']["method"], "GET");
      assert.equal(ctx['_route']['_http']["url"], "/");
      assert.equal(ctx['_route']['_http']["host"], "test.webda.io");
      assert.equal(ctx["_params"]["TEST_ADD"], undefined);
      assert.equal(ctx["_params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(ctx["_params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
      // Debug is Executor
      assert(executor instanceof Executor);
    });
    it('Known page - multiple method', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "POST", "/");
      assert.notEqual(executor, undefined);
      assert.equal(ctx['_route']['_http']["method"], "POST");
      assert.equal(ctx['_route']['_http']["url"], "/");
      assert.equal(ctx['_route']['_http']["host"], "test.webda.io");
      assert.equal(ctx["_params"]["TEST_ADD"], undefined);
      assert.equal(ctx["_params"]["accessKeyId"], "LOCAL_ACCESS_KEY");
      assert.equal(ctx["_params"]["secretAccessKey"], "LOCAL_SECRET_KEY");
    });
    it('Known page - unknown method', function() {
      assert.equal(webda.getExecutor(ctx, "test.webda.io", "PUT", "/"), undefined);
    });
    it('Unknown page', function() {
      assert.equal(webda.getExecutor(ctx, "test.webda.io", "GET", "/test"), undefined);
    });
    it('Known template page', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
      assert.notEqual(executor, undefined);
      assert.equal(ctx['_route']['_http']["method"], "GET");
      assert.equal(ctx['_route']['_http']["url"], "/urltemplate/666");
      assert.equal(ctx['_route']['_http']["host"], "test.webda.io");
      assert.equal(ctx['_params']['id'], 666);
      assert.equal(ctx["_params"]["TEST_ADD"], "Users");
      assert.equal(ctx["_params"]["TEST"], "Global");
      // Default is Executor
      assert(executor instanceof Executor);
    });
    it('Passport executor', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/facebook");
      assert.notEqual(executor, undefined);
      assert.notEqual(executor._extended, true);
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/facebook/callback?code=xxx&plop=test");
      assert.notEqual(executor, undefined);
      assert.equal(ctx._params.code, "xxx");
      assert.equal(ctx._params.provider, "facebook");
    });
    it('/ inside querystring', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/google/callback?code=4/5FGBh9iF5CxUkekcWQ8ZykvQnjRskeLZ9gFN3uTjLy8");
      assert.notEqual(executor, undefined);
      assert.equal(ctx._params.code, "4/5FGBh9iF5CxUkekcWQ8ZykvQnjRskeLZ9gFN3uTjLy8");
      assert.equal(ctx._params.provider, "google");
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/google/callback?code=4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k#");
      assert.equal(ctx._params.code, "4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k#");
      assert.equal(ctx._params.provider, "google");

    });
    it('/ inside path', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666/test");
      assert.notEqual(executor, undefined);
      assert.notEqual(ctx._params.id, "666/test");
      assert.equal(ctx._params.other, "test");
    });
    it('/me', function() {
      executor = webda.getExecutor(ctx, "test.webda.io", "GET", "/auth/me");
      assert.notEqual(executor, undefined);
      assert.equal(ctx._params.provider, undefined);

    });
  });
  describe('reinitServices', function() {
    it('updateConfiguration', async function() {
      let service = webda.getService('Authentication');
      assert.equal(service._params.providers.email.text, '');
      assert.equal(service._params.providers.email.mailer, 'DefinedMailer');
      await webda.reinit({
        'Authentication.providers.email.text': 'New Text'
      });
      let newService = webda.getService('Authentication');
      assert.equal(newService._params.providers.email.text, 'New Text');
      assert.equal(newService._params.providers.email.mailer, 'DefinedMailer');
      await Utils.throws(webda.reinit.bind(webda, {
        'Bouzouf.plop': 'Testor'
      }), Error);
    })
  });
});

/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
//var fakeJson = {"global":{"params":{"accessKeyId":"ssss","secretAccessKey":"sss","TEST":"Global"},"services":{"Authentication":{"successRedirect":"https://shootandprove.loopingz.com/user.html","failureRedirect":"/login-error","providers":{"facebook":{"clientID":"12121333","clientSecret":"3333333","scope":["email","public_profile"]},"email":{},"phone":{},"twitter":{},"google":{"clientID":"wwwwwww","clientSecret":"wewewew","scope":["https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/userinfo.profile"]},"github":{"clientID":"wwww","clientSecret":"wwww","scope":"user:email"}}},"Mailer":{"transport":"ses","accessKeyId":"ppp","secretAccessKey":"...","region":"us-east-1"},"TaskService":{},"Idents":{"map":{"Users":{"key":"user","target":"idents","fields":"type","cascade":true,"-onerror":"NoStore"}},"expose":{"restrict":{"create":true,"update":true,"get":true},"url":"/idents"},"type":"FileStore","folder":"/data/idents/"},"Users":{"model":"User","expose":{"url":"/users","restrict":{"authentication":"uuid","create":true}},"type":"FileStore","folder":"/data/users/"},"Devices":{"map":{"Users":{"key":"user","target":"devices","fields":"type,name","cascade":true,"-onerror":"NoStore"}},"expose":{"restrict":{"authentication":true},"url":"/devices"},"type":"FileStore","folder":"/data/devices/"},"Tasks":{"inject":"user","check":"user","map":{"Users":{"key":"user","target":"tasks","fields":"uid,lastUpdate","cascade":true,"-onerror":"NoStore"}},"expose":{"restrict":{"authentication":true},"url":"/tasks"},"type":"FileStore","folder":"/data/tasks/"},"Templates":{"expose":{"url":"/templates","restrict":{}},"type":"FileStore","folder":"/data/templates/"},"Wiki":{"expose":{"restrict":{"authentication":false},"url":"/wiki"},"type":"FileStore","folder":"/data/wiki/"},"Binary":{"expose":true,"type":"FileBinary","folder":"/data/binaries/","map":{"Tasks":["images","renditions"]}}},"models":{"User":{"extends":null,"displayName":{"type":"string","indexed":true}}}},"/webda":{"method":"GET","executor":"lambda","lambda":"arn:aws:lambda:us-west-2:277712386420:function:webda-test","accessKeyId":"sss","secretAccessKey":"sss","params":{},"-manual":true},"/":{"method":"GET","executor":"string","result":"Webda root","mime":"text/plain","-manual":true},"/login-successful":{"method":"GET","executor":"string","result":"<b>Welcome guy</b>","mime":"text/html","-manual":true},"/login-error":{"method":"GET","executor":"string","result":"login unsuccessful","mime":"text/plain","-manual":true},"/me":{"method":"GET","executor":"file","-manual":true},"/me/tasks":{"method":"GET","executor":"file","-manual":true},"/me/archives":{"method":"GET","executor":"file","params":{"archive":true},"-manual":true},"/me/templates":{"method":"GET","executor":"file","-manual":true},"/library":{"method":"GET","executor":"file","-manual":true},"/templates/register":{"method":"POST","executor":"file","-manual":true},"/templates/{uid}/unregister":{"method":"DELETE","executor":"file","-manual":true},"/templates/{uid}/qrcode/{userid}":{"method":"GET","executor":"file","-manual":true},"/search":{"method":"POST","executor":"file","-manual":true},"/device/auth":{"method":"POST","executor":"file","-manual":true},"/cookie":{"method":"GET","executor":"inline","callback":"function(webda) { webda.cookie('test', 'Test'); webda.writeHead(200, {'Content-type': 'application/json'}); webda.write(JSON.stringify('cookie set')); webda.end();};","-manual":true},"/session":{"method":"GET","executor":"inline","callback":"function(webda) { console.log('session');webda.writeHead(200, {'Content-type': 'application/json'}); webda.write(JSON.stringify(webda.session)); webda.end();};","-manual":true},"/eula":{"method":"GET","executor":"inline","callback":"function(webda) { webda.writeHead(200, {'Content-type': 'application/json'}); webda.write(JSON.stringify({'version':1, 'url': 'https://shootandprove.loopingz.com/eula.html'})); webda.end();};","-manual":true},"/echo":{"method":"GET","executor":"string","result":"<b>echo</b>","mime":"text/html","-manual":true},"/auth/{provider}":{"method":["POST","GET"],"executor":"Authentication"},"/auth/{provider}/callback":{"method":"GET","executor":"Authentication"},"/auth/{provider}/return":{"method":"GET","executor":"Authentication"},"/idents":{"method":["POST","GET"],"executor":"Idents","expose":{"restrict":{"create":true,"update":true,"get":true},"url":"/idents"}},"/idents/{uuid}":{"method":["GET","PUT","DELETE"],"executor":"Idents","expose":{"restrict":{"create":true,"update":true,"get":true},"url":"/idents"}},"/users":{"method":["POST","GET"],"executor":"Users","expose":{"url":"/users","restrict":{"authentication":"uuid","create":true}}},"/users/{uuid}":{"method":["GET","PUT","DELETE"],"executor":"Users","expose":{"url":"/users","restrict":{"authentication":"uuid","create":true}}},"/devices":{"method":["POST","GET"],"executor":"Devices","expose":{"restrict":{"authentication":true},"url":"/devices"}},"/devices/{uuid}":{"method":["GET","PUT","DELETE"],"executor":"Devices","expose":{"restrict":{"authentication":true},"url":"/devices"}},"/tasks":{"method":["POST","GET"],"executor":"Tasks","expose":{"restrict":{"authentication":true},"url":"/tasks"}},"/tasks/{uuid}":{"method":["GET","PUT","DELETE"],"executor":"Tasks","expose":{"restrict":{"authentication":true},"url":"/tasks"}},"/templates":{"method":["POST","GET"],"executor":"Templates","expose":{"url":"/templates","restrict":{}}},"/templates/{uuid}":{"method":["GET","PUT","DELETE"],"executor":"Templates","expose":{"url":"/templates","restrict":{}}},"/wiki":{"method":["POST","GET"],"executor":"Wiki","expose":{"restrict":{"authentication":false},"url":"/wiki"}},"/wiki/{uuid}":{"method":["GET","PUT","DELETE"],"executor":"Wiki","expose":{"restrict":{"authentication":false},"url":"/wiki"}},"/binary/{store}/{uid}/{property}/{index}":{"method":["GET"],"executor":"Binary","expose":{"url":"/binary","restrict":{}}},"/binary/{store}/{uid}/{property}":{"method":["POST"],"executor":"Binary","expose":{"url":"/binary","restrict":{}}},"/binary/{store}/{uid}/{property}?c={challenge}&h={hash}":{"method":["POST"],"executor":"Binary","expose":{"url":"/binary","restrict":{}}},"/binary/{store}/{uid}/{property}/{index}/{hash}":{"method":["DELETE","PUT"],"executor":"Binary","expose":{"url":"/binary","restrict":{}}},"/binary/{store}/{uid}/{property}/{index}/{hash}?c={challenge}&h={hash}":{"method":["PUT"],"executor":"Binary","expose":{"url":"/binary","restrict":{}}}};
//var fakeVhosts = ["*", "api.shootandprove.loopingz.com"];
(function(document) {
  'use strict';

  // Grab a reference to our auto-binding template
  // and give it some initial binding values
  // Learn more about auto-binding templates at http://goo.gl/Dx1u2g
  var app = document.querySelector('#app');

  // Sets app default base URL
  app.baseUrl = '/';
  if (window.location.port === '') {  // if production
    // Uncomment app.baseURL below and
    // set app.baseURL to '/your-pathname/' if running from folder in production
    // app.baseUrl = '/polymer-starter-kit/';
  }

  app.getUrl = function(url) {
    return "http://localhost:18181" + url;
  }

  app.newObject = function () {
    console.log(app.route);
    if (app.route == "api") {
      app.$.newExecutorDialog.open();
    } else if (app.route == "services") {
      app.$.newServiceDialog.open();
    } else if (app.route == "deployments") {
      app.$.newDeploymentDialog.open();
    }
  }
  app.deleteCurrentComponent = function () {
    if (app.currentComponent === undefined || app.currentComponent._type === undefined) return;
    if (app.currentComponent._type === "Route") {
      this.$.ajax.method = 'DELETE';
      this.$.ajax.body = {'url': app.currentComponent._name};
      this.$.ajax.url = app.getUrl('/routes');
      this.$.ajax.contentType = 'application/json';
      this.$.ajax.generateRequest().completes.then( () => {
        app.currentComponent = undefined;
        this.refresh();
      });
      return;
    }
    this.$.ajax.method = 'DELETE';
    this.$.ajax.url = app.getUrl('/' + app.currentComponent._type.toLowerCase() + 's/' + app.currentComponent._name);
    this.$.ajax.contentType = 'application/json';
    this.$.ajax.body = {};
    this.$.ajax.generateRequest().completes.then( () => {
      app.currentComponent = undefined;
      this.refresh();
    });
    console.log(app.currentComponent);
  }
  app.onGetDeployments = function (evt) {
    var deployments = evt.target.lastResponse;
    if (deployments === undefined) {
      deployments = [];
    } else {
      for (var i in deployments) {
        deployments[i]._type = "Deployment";
        deployments[i]._name = deployments[i].uuid;
      }
    }
    deployments.splice(0,0,{"uuid":"Global","_type": "Configuration","_name": "Global","params":app.config.global.params});
    app.deployments = deployments;
  }
  /*
  if (fakeJson !== undefined) {
    app.retrievedConfig({target: {lastResponse: fakeJson}});
  }
  */
  app.getAttribute = function(name, obj) {
    var res = undefined;
    if (obj === undefined) {
      return obj;
    }
    res = obj[name];
    while ((res === undefined || res === '') && obj !== null) {
      res = obj[name];
      obj = obj.parentNode;
    }
    return res;
  }

  var jsonFilter = function (key, value) {
    if (key[0] === "_") return;
    if (key[0] === "-") return;
    return value;
  };
  app.strip = function (obj, recursive) {
    var res = {};
    for (var i in obj) {
      if (!recursive) {
        if (i == "type") continue;
        if (i == "method") continue;
        if (i == "executor") continue;
      }
      res[i] = jsonFilter(i, obj[i]);
      if (typeof(res[i]) == "object") {
        res[i] = app.strip(res[i]);
      }
    }
    return res;
  }

  app.mapServices = function(evt) {
    console.log(app.services);
    for (var i in app.services) {
      app.mapServices[app.services[i]._name]=app.services[i];
    }
  }

  app.jsonify = function(obj) {
    console.log(JSON.stringify(obj, jsonFilter, 4));
    return JSON.stringify(obj, jsonFilter, 4).trim();
  }
  app.onSelectDeployment = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      app.currentComponent = app.deployments[index];
      if (index == 0) {
        app.currentDeployment = undefined;
      } else {
        app.currentDeployment = app.deployments[index];
      }
      app.activeDeployment = app.currentDeployment;
    }
  }
  app.onSelectRoute = function(evt) {
    var validate = jsen({ type: 'string' });
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      var route = app.routes[index];
      if (app.mapServices[route.executor] !== undefined) {
        app.currentComponent = app.mapServices[route.executor];
      } else {
        app.currentComponent = app.routes[index];
      }
    }
  }
  app.onSelectService = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      app.currentComponent = app.services[index];
    }
  };

  app.setVhost = function (vhost) {
    app.currentVhost = vhost;
    app.refresh();
  }
  app.refresh = function () {
    app.$.routesAjax.generateRequest();
    app.$.deploymentsAjax.generateRequest();
    app.$.servicesAjax.generateRequest();
  }

  app.handleVhosts = function (evt) {
    var vhosts = [];
    for  (var i in evt.target.lastResponse) {
      if (evt.target.lastResponse[i] !== "*") {
        vhosts.push(evt.target.lastResponse[i]);
      }
    }
    if (!app.currentVhost) {
      app.setVhost(vhosts[0]);
    }
    app.vhosts = vhosts;
  }

  app.getRouteLabel = function (label) {
    var labels = {'routes': 'Routes', 'services': 'Services', 'deployments': 'Deployments'};
    return labels[label];
  }
  app.displayInstalledToast = function() {
    // Check to make sure caching is actually enabled—it won't be in the dev environment.
    if (!Polymer.dom(document).querySelector('platinum-sw-cache').disabled) {
      Polymer.dom(document).querySelector('#caching-complete').show();
    }
  };

  // Listen for template bound event to know when bindings
  // have resolved and content has been stamped to the page
  app.addEventListener('dom-change', function() {
    console.log('Our app is ready to rock!');
  });

  // See https://github.com/Polymer/polymer/issues/1381
  window.addEventListener('WebComponentsReady', function() {
    // imports are loaded and elements have been registered
    app.$.newDeploymentDialog.addEventListener('iron-overlay-closed', function (evt) {
      console.log("new deployment");
      console.log(evt);
    });
    app.$.newServiceDialog.addEventListener('iron-overlay-closed', function (evt) {
      console.log("new service");
      console.log(evt);
    });
    app.$.newExecutorDialog.addEventListener('iron-overlay-closed', function (evt) {
      console.log("new executor");
      console.log(evt);
    });
  });

  // Scroll page to top and expand header
  app.scrollPageToTop = function() {
    app.$.headerPanelMain.scrollToTop(true);
  };

  app.closeDrawer = function() {
    app.$.paperDrawerPanel.closeDrawer();
  };

})(document);

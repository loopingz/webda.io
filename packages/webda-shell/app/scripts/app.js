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
var Webda = {
  services: {},
  workers: [],
  deployers: {},
  models: []
};
(function(document) {
  'use strict';

  // Grab a reference to our auto-binding template
  // and give it some initial binding values
  // Learn more about auto-binding templates at http://goo.gl/Dx1u2g
  var app = document.querySelector('#app');

  // Sets app default base URL
  app.baseUrl = '/';
  app.schemas = {};
  app.canDeploy = false;
  app.deployButton = false;
  app.noCurrentComponent = true;
  app.activeDeployment = "";
  app.resolvedComponent = {parameters: {}};
  if (window.location.port === '') {  // if production
    // Uncomment app.baseURL below and
    // set app.baseURL to '/your-pathname/' if running from folder in production
    // app.baseUrl = '/polymer-starter-kit/';
  }

  app.getUrl = function(url) {
    return "http://localhost:18181/api" + url;
  }

  Webda.getModels = function() {
    return Webda.models;
  }
  app.updateModels = function() {
    Webda.models = app.models;
  }

  app.saveCurrentComponent = function () {
    if (app.currentComponent === undefined || app.currentComponent._type === undefined) return;
    app.$.ajax.method = 'PUT';
    app.$.ajax.contentType = 'application/json';
    if (app.currentComponent._type === "Route") {
      app.$.ajax.body = app.currentComponent;
      app.$.ajax.url = app.getUrl('/routes');
    } else {
      app.$.ajax.url = app.getUrl('/' + app.currentComponent._type.toLowerCase() + 's/' + app.currentComponent._name);
      app.$.ajax.body = app.currentComponent;
    }
    app.$.ajax.generateRequest().completes.then( () => {
      // Refresh for now but should be changed
      app.$.toast.text = 'Updated';
      app.$.toast.show();
      app.refresh();
    }, () => {
      app.$.toast.text = 'An error occurs';
      app.$.toast.show();
    });
  }

  app.newDeployment = function() {
    app.$.newDeployment.open();
  }

  app.newObject = function () {
    if (app.route == "routes") {
      app.$.newRouteDialog.open();
    } else if (app.route == "services") {
      app.$.newServiceDialog.open();
    } else if (app.route == "deployments") {
      app.$.newDeploymentGroupDialog.open();
    } else if (app.route == "models") {
      app.$.newModelDialog.open();
    }
  }

  window.addEventListener('iron-select', (evt) => {
    if (evt.detail &&
        evt.detail.item &&
        evt.detail.item.parentElement &&
        evt.detail.item.parentElement.classList &&
        evt.detail.item.parentElement.classList.contains('serviceSelector') &&
        app.deployments) {
      app.currentService = undefined;
      app.services.forEach( (service) => {
        if (service._name === app.activeService) {
          app.currentService = service;
        }
      });
      app.resolvedComponent = {parameters: app.getRealConfiguration(app.currentService)};
      console.log(app.resolvedComponent);
    }
    if (evt.detail &&
        evt.detail.item &&
        evt.detail.item.parentElement &&
        evt.detail.item.parentElement.classList &&
        evt.detail.item.parentElement.classList.contains('deploymentSelector') &&
        app.deployments) {
      app.currentDeployment = undefined;
      app.deployments.forEach( (deployment) => {
        if (deployment.uuid === app.activeDeployment) {
          app.currentDeployment = deployment;
        }
      });
      app.resolvedComponent = {parameters: app.getRealConfiguration(app.currentService)};
    }
  });


  app.confirmDeleteCurrentComponent = function () {
    if (app.currentComponent === undefined || app.currentComponent._type === undefined) return;
    this.$.confirmDeletion.open();
  };

  app.deleteCurrentComponent = function () {
    if (app.currentComponent === undefined || app.currentComponent._type === undefined) return;
    if (app.currentComponent._type === "Configuration") {
      app.currentComponent.params = {};
      return;
    }
    this.$.ajax.method = 'DELETE';
    this.$.ajax.contentType = 'application/json';
    if (app.currentComponent._type === "Route") {
      this.$.ajax.body = {'url': app.currentComponent._name};
      this.$.ajax.url = app.getUrl('/routes');
    } else {
      this.$.ajax.url = app.getUrl('/' + app.currentComponent._type.toLowerCase() + 's/' + app.currentComponent._name);
      this.$.ajax.body = {};
    }
    this.$.ajax.generateRequest().completes.then( () => {
      app.currentComponent = undefined;
      app.noCurrentComponent = true;
      this.refresh();
    }, () => {
      app.$.toast.text = 'An error occurs';
      app.$.toast.show();
    });
  }

  app.onGetDeployments = function (evt) {
    var deployments = evt.target.lastResponse;
    console.log(deployments);
    if (deployments === undefined) {
      deployments = [];
    } else {
      for (var i in deployments) {
        deployments[i]._type = "Deployment";
        deployments[i]._name = deployments[i].uuid;
      }
    }
    //deployments.splice(0,0,{"uuid":"Global","_type": "Configuration","_name": "Global","params":app.config.global.params});
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

  app.resetComponent = function() {
    app.currentComponent = undefined;
    app.noCurrentComponent = true;
    app.selectedIndex = -1;
    app.newEnable = app.route !== 'configuration';
  }

  Webda.getWorkers = function() {
    return JSON.parse(JSON.stringify(Webda.workers));
  }

  Webda.getModda = function(type) {
    for (let i in app.moddas) {
      if (app.moddas[i].uuid === type) {
        return app.moddas[i];
      }
    }
  }

  app.mapServices = function(evt) {
    for (var i in app.services) {
      Webda.services[app.services[i]._name] = app.services[i];
      if (app.services[i]._worker) {
        console.log('adding', app.services[i]._name, 'to worker');
        Webda.workers.push(app.services[i]);
      }
      app.mapServices[app.services[i]._name]=app.services[i];
    }
  }

  app.jsonify = function(obj) {
    return JSON.stringify(obj, jsonFilter, 4).trim();
  }

  app.displayJson = function (json) {
    app.json = json;
    app.$.displayJsonDialog.open();
  }

  app.selectComponent = function( component ) {
    app.noCurrentComponent = false;
    // Duplicate the original component to be able to modify it
    app.currentComponent = JSON.parse(JSON.stringify(component));
    // Not yet ready, need to improve the fire change on editor ( dont fire them if component is detached )
    app.dirty = true;
  }

  app.deploy = function() {
    app.fire('deploy', app.currentComponent.uuid);
  }

  app.onSelectDeployment = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      app.selectedIndex = index;
      app.selectComponent(app.deployments[index]);
      app.canDeploy = true;
    } else {
      app.canDeploy = false;
    }
  }
  app.onSelectModel = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    var customModels = [];
    app.models.forEach((item) => {if (!item.builtin) customModels.push(item)})
    if (index !== undefined) {
      app.selectedIndex = index;
      customModels[index]._type = 'Model';
      customModels[index]._name = customModels[index].name;
      app.selectComponent(customModels[index]);
    }
  }
  app.onSelectRoute = function(evt) {
    var validate = jsen({ type: 'string' });
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      var route = app.routes[index];
      app.selectedIndex = index;
      if (app.mapServices[route.executor] !== undefined) {
        app.selectComponent(app.mapServices[route.executor]);
      } else {
        app.selectComponent(app.routes[index]);
      }
    }
  }
  app.onSelectService = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      app.selectedIndex = index;
      app.selectComponent(app.services[index]);
    }
  };

  app.setVhost = function (vhost) {
    app.currentVhost = vhost;
  }

  app.refresh = function () {
    app.$.routesAjax.generateRequest();
    app.$.deploymentsAjax.generateRequest();
    app.$.servicesAjax.generateRequest();
    app.$.moddasAjax.generateRequest();
    app.$.versionsAjax.generateRequest();
    app.$.modelsAjax.generateRequest();
  }

  app.handleConfig = function (evt) {
    app.configComponent = {parameters: evt.target.lastResponse};
    app.resolvedComponent = {parameters: evt.target.lastResponse};
  }


  /**** Schemas handling ***/

  app.hasSchema = function(name) {
    return app.schemas[name] !== undefined;
  }

  app.loadSchemas = function() {
    if (app.ajx === undefined) {
      app.ajv = Ajv();
    }

    // Load the schemas for each moddas
    for (let i in app.moddas) {
      if (!app.moddas[i].configuration.schema) continue;
      try {
        app.schemas[app.moddas[i].uuid]=true;
        app.ajv.addSchema(app.moddas[i].configuration.schema, app.moddas[i].uuid);
      } catch (ex) {
        console.log('Error loading modda', app.moddas[i].uuid,app.moddas[i].configuration.schema, ex);
      }
    }

  }

  /**** Configuration mapper   ****/

  app._extend = function(target, source) {
    for (var i in source) {
      target[i] = source[i];
    }
    return target;
  }

  app.getRealConfiguration = function(params) {
    // First take Global params
    var res = app._extend({}, app.configComponent.parameters);
    // Add or replace the one from the deployment
    if (app.currentDeployment) {
      app._extend(res, app.currentDeployment.parameters);
    }
    if (!params) {
      return res;
    }
    // Then take the local one
    app._extend(res, params);
    if (params._type === "Service" && app.currentDeployment &&
                  app.currentDeployment.services && app.currentDeployment.services[params._name]) {
      res = merge.recursive(true, res, app.currentDeployment.services[params._name]);
    }
    let filtered = {};
    for (let i in res) {
      if (i.startsWith('_')) continue;
      filtered[i] = res[i];
    }
    return filtered;
  }

  /********/


  /*****/

  app.getRouteLabel = function (label) {
    var labels = {'routes': 'Routes', 'services': 'Services', 'deployments': 'Deployments', 'models': 'Models', 'configuration': 'Configuration'};
    return labels[label];
  }
  app.displayInstalledToast = function() {
    // Check to make sure caching is actually enabled—it won't be in the dev environment.
    if (!Polymer.dom(document).querySelector('platinum-sw-cache').disabled) {
      Polymer.dom(document).querySelector('#caching-complete').show();
    }
  };

  // See https://github.com/Polymer/polymer/issues/1381
  window.addEventListener('WebComponentsReady', function() {
    // Fire all network :)
    app.$.configAjax.url = app.getUrl('/global');
    app.$.versionsAjax.url = app.getUrl('/versions');
    app.$.deploymentsAjax.url = app.getUrl('/deployments');
    app.$.servicesAjax.url = app.getUrl('/services');
    app.$.routesAjax.url = app.getUrl('/routes');
    app.$.moddasAjax.url = app.getUrl('/moddas');
    app.$.deployersAjax.url = app.getUrl('/deployers');
    app.$.modelsAjax.url = app.getUrl('/models');
    app.$.mainMenu.addEventListener('iron-select', (evt) => {
      app.deployButton = app.route === 'deployments';
      app.canDeploy = false;
    });

    app.connect();

    app.addEventListener('deploy', function (evt) {
      // Reinit deployment infos
      var deployer = {finished: false, output: [], type: 'aws'};
      app.deployAction = "Deploying ...";
      for (let i in app.deployments) {
        if (evt.detail == app.deployments[i]._name) {
          deployer.type = app.deployments[i].type;
          break;
        }
      }
      app.deployStepper = deployer;

      // Launch the deployment
      app.$.ajax.method = 'GET';
      app.$.ajax.url = app.getUrl('/deploy/' + evt.detail);
      app.$.ajax.contentType = 'application/json';
      app.$.ajax.generateRequest();

      app.$.deploymentProgress.open();


      //Use for debug purpose
      //app.i = 0;
      //setTimeout(app.fakeOutput, 1000);

    });

    var fake = ["[1/4] Start to deploy","[2/4] Lambda","[3/4] Gateway","[4/4] Permission", "DONE"]
    app.fakeOutput = function () {
      app.handleServerMessage(fake[app.i]);
      if (app.i < fake.length) {
        app.i++;
        setTimeout(app.fakeOutput, 1000);
      }
    }

    window.addEventListener('webda-save-current-component', app.saveCurrentComponent);

    // imports are loaded and elements have been registered
    app.$.newModelDialog.addEventListener('iron-overlay-closed', function (evt) {
      if (!evt.detail.confirmed) return;
      app.refresh();
      app.$.toast.text = 'Model created';
      app.$.toast.show();
    });
    app.$.newServiceDialog.addEventListener('iron-overlay-closed', function (evt) {
      if (!evt.detail.confirmed) return;
      app.refresh();
      app.$.toast.text = 'Service created';
      app.$.toast.show();
    });
    app.$.newRouteDialog.addEventListener('iron-overlay-closed', function (evt) {
      if (!evt.detail.confirmed) return;
      app.refresh();
      app.$.toast.text = 'Route created';
      app.$.toast.show();
    });
    app.$.confirmDeletion.addEventListener('iron-overlay-closed', function (evt) {
      if (evt.detail.confirmed) {
        app.deleteCurrentComponent();
      }
    });
  });

  // Handle websockets here
  app.handleServerMessage = function(data) {
    if (data === undefined) return;

    // Handle stepper
    var re = /\[(\d+)\/(\d+)\] (.*)/
    var groups = data.match(re);
    if (groups) {
      app.deployStepper.max = groups[2];
      app.deployCurrent = groups[1];
      app.deployAction = groups[3];
    }

    // Store output
    app.push('deployStepper.output', data);
    if (data == "DONE") {
      app.deployCurrent++;
      app.deployAction = "Deployment Finished";
      app.deployStepper.finished = true;
    }
  }

  app.createDeploymentGroup = function () {
    app.$.ajax.method = 'POST';
    // Clone default config
    app.$.ajax.body = {type: 'deployment', uuid: app.newDeploymentGroupName};
    app.$.ajax.url = app.getUrl('/deployments');
    app.$.ajax.contentType = 'application/json';
    app.$.ajax.generateRequest().completes.then( () => {
      app.refresh();
      app.$.toast.text = 'Deployment group created';
      app.$.toast.show();
      app.$.newDeploymentGroupDialog.close();
      app.newDeploymentGroupName = '';
    }, (err) => {
      if (err.message.endsWith("409")) {
        app.$.toast.text = 'This name is already used';
        app.$.toast.show();
      } else {
        app.$.toast.text = err.message;
        app.$.toast.show();
      }
    });
  }

  app._noBuiltin = function(item) {
    return !item.builtin;
  }

  app.connect = function() {
    app.socket = new WebSocket("ws://localhost:18182");
    app.socket.onmessage = function(evt) {
      app.handleServerMessage(evt.data);
    }
    app.socket.onclose = function(evt) {
      app.$.logo.classList.add('disconnect');
      setTimeout(app.connect, 15000);
    }
    app.socket.onerror = function(evt) {
      app.$.logo.classList.add('disconnect');
    }
    app.socket.onopen = function(evt) {
      app.$.logo.classList.remove('disconnect');
      app.refresh();
    }
  }

  // Scroll page to top and expand header
  app.scrollPageToTop = function() {
    app.$.headerPanelMain.scrollToTop(true);
  };

  app.closeDrawer = function() {
    app.$.paperDrawerPanel.closeDrawer();
  };

})(document);

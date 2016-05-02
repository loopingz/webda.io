/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

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

  app.retrievedConfig = function(evt) {
    app.config = evt.target.lastResponse;
    // Prepare URLs
    var urls = [];
    for (var i in app.config) {
      if (i === 'global') continue;
      app.config[i]._url = i;
      urls.push(app.config[i]);
    }
    urls.sort( function (a,b) {
      if (a["-manual"] && !b["-manual"]) {
        return -1;
      } else if (!a["-manual"] && b["-manual"]) {
        return 1;
      }
      return a._url.localeCompare(b._url);
    });
    app.urls = urls;

    // Prepare Services
    var services = [];
    for (var i in app.config.global.services) {
      app.config.global.services[i]._name = i;
      services.push(app.config.global.services[i]);
    }
    services.sort( function (a,b) {
      return a._name.localeCompare(b._name);
    });
    app.services = services;

    // Prepare deployments
    var deployments = app.config.global.deployments;
    if (deployments === undefined) {
      deployments = ['Development','QA','Production'];
    }
    deployments.splice(0,0,"Global");
    app.deployments = deployments;
  }

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

  app.selectDeployment = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      console.log("select deployment");
    }
  }
  app.selectUrl = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      var url = app.urls[index];
      if (app.config.global.services[url.executor] !== undefined) {
        console.log("should select a service");
      } else {
        console.log("should select a 'executor'");
      }
    }
  }
  app.selectService = function(evt) {
    var index = app.getAttribute('dataIndex', evt.target);
    if (index !== undefined) {
      console.log("select service: " + JSON.stringify(app.services[index]));
    }
  };

  app.setVhost = function (vhost) {
    app.currentVhost = vhost;
    app.$.configAjax.generateRequest();
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
    app.$.vhostAjax.on
  });

  // Scroll page to top and expand header
  app.scrollPageToTop = function() {
    app.$.headerPanelMain.scrollToTop(true);
  };

  app.closeDrawer = function() {
    app.$.paperDrawerPanel.closeDrawer();
  };

})(document);

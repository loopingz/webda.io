![](http://webda.io/images/touch/icon-128x128.png)

# webda-shell

**Composable Serverless API**

This is the configuration interface, deployment interface for the project [Webda](http://github.com/loopingz/webda.git)

[http://webda.io](http://webda.io)

Check our video presentation on [Youtube](https://www.youtube.com/playlist?list=PLfn1MAL4_e7ERdqj9rWlmEkK5gMkL4bKI)

## Install


```
npm install -g webda-shell
```

#### Configuration UI

Just type 

```
webda config
```

You'll get the configuration UI for your project

```
# To avoid opening browser
webda config --serve

# Display the configuration for a specific deployment
webda config -d deploymentName

# Export the configuration for a specific deployment to a file
webda config -d deploymentName export.json
```


#### Serve the current project

This will load the Webda framework and run your project with it on port 18080


```
webda serve
```

You can serve with a specific deployment configuration by adding the deployment name

```
webda -d deploymentName serve
```

#### Debug the current project

```
webda debug
```

It will serve the project on port 18080 and restart the server on any changes made on the folder files

As for serve you can also specify the deployment name to use


#### Deploy

First you need to create a deployment, from the configuration UI

Prior to version 0.4, the deployment is specified as an argument right after deploy argument

Then just use the Deploy button on the UI or the webda bin :

```
webda -d deploymentName deploy
```

#### Generate Swagger/Postman configuration 

If you use Amazon we expose a way for you to get the Postman configuration of your API using AWS

```
webda -d deploymentName deploy export swagger postman postman.json
```

#### Only redeploy Lambda code on AWS

```
webda -d deploymentName deploy lambda
```


## Configuration UI

Here is some screenshots of the ui, it is accessible once the webda config is running, it will launch your browser for you to use the configurator.

#### Routes

![image](http://webda.io/images/schemas/ui_route_create.png) ![image](http://webda.io/images/schemas/ui_route_config.png) 

#### Services

![image](http://webda.io/images/schemas/ui_service_create.png) ![image](http://webda.io/images/schemas/ui_service_config.png)

#### Deployments

![image](http://webda.io/images/schemas/ui_deployment_create.png) ![image](http://webda.io/images/schemas/ui_deployment_config.png) ![image](http://webda.io/images/schemas/ui_deployment_deploy.png)

## Requirements

Node.js >= 5.0.0

## Licence

LGPL 3.0

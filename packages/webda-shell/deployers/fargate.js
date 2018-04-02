"use strict";
const AWSDeployer = require("./aws");
const DockerMixIn = require("./docker-mixin");
const ECS_ROLE_POLICY = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}';

class FargateDeployer extends DockerMixIn(AWSDeployer) {

  deploy(args) {
    // Fallback on us-east-1 if needed
    this.resources.region = this.resources.FargateRegion || 'us-east-1';
    this._AWS = this._getAWS(this.resources);
    this._ecr = new this._AWS.ECR();
    this._ecs = new this._AWS.ECS();

    this._sentContext = false;
    this._maxStep = 2;

    this._workers = {};
    this.resources.workers.forEach((worker) => {
      this._workers[worker.toLowerCase()] = {
        name: worker
      };
    });

    // Init the default values
    if (!this.resources.serviceName) {
      throw Error('Need to define at least a serviceName');
    }
    this.resources.publicIp = this.resources.publicIp || 'ENABLED';
    this.resources.taskCpu = this.resources.taskCpu || '512';
    this.resources.taskMemory = this.resources.taskMemory || '1024';
    this.resources.clusterName = this.resources.clusterName || 'webda-cluster';
    this.resources.repositoryNamespace = this.resources.repositoryNamespace === undefined ? this.resources.serviceName : this.resources.repositoryNamespace;
    this.resources.tasksNumber = this.resources.tasksNumber || 2;
    this.resources.taskDefinition = this.resources.taskDefinition || this.resources.serviceName;

    // Split subnets by comma
    let promise = Promise.resolve();
    if (this.resources.subnets) {
      this._subnets = this.resources.subnets.split(',');
    } else {
      // If no subnets is provided retrieve the default ones
      promise = this._getDefaultVPC();
    }

    return promise.then(() => {
      return this._createLogGroup();
    }).then(() => {
      return this._createRepository();
    }).then(() => {
      return this.buildDockers();
    }).then(() => {
      if (this.resources.taskRole) {
        return Promise.resolve(this.resources.taskRole);
      }
      return this.generateRoleARN(this.resources.serviceName, ECS_ROLE_POLICY);
    }).then((res) => {
      this._taskRole = res;
      return this._createTaskDefinition();
    }).then(() => {
      return this._createCluster();
    }).then(() => {
      return this._createService();
    });
  }

  _createLogGroup() {
    let cloudwatch = new this._AWS.CloudWatchLogs();
    let name = '/ecs/' + this.resources.taskDefinition;
    return cloudwatch.describeLogGroups({
      logGroupNamePrefix: name
    }).promise().then((res) => {
      res.logGroups.forEach((log) => {
        if (log.logGroupName === name) {
          this._logGroupName = log.arn;
        }
      });
      if (!this._logGroupName) {
        return cloudwatch.createLogGroup({
          logGroupName: name
        }).promise();
      }
      return Promise.resolve();
    });
  }

  getARNPolicy(accountId, region) {
    let statements = super.getARNPolicy(accountId, region);
    statements.push({
      "Sid": "WebdaECRAuth",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": ['*']
    });
    let statement = {
      "Sid": "WebdaPullImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": []
    };
    let resourceType = "arn:aws:ecr:" + region + ":" + accountId + ":repository/" + this.resources.repositoryNamespace + '/';
    for (let i in this._workers) {
      statement.Resource.push(resourceType + i);
    }
    statements.push(statement);
    return statements;
  }

  buildDockers() {
    let promise = this._ecr.getAuthorizationToken({}).promise().then((res) => {
      // Login to the AWS repository
      let creds = Buffer.from(res.authorizationData[0].authorizationToken, 'base64').toString();
      creds = creds.substr(4);
      let repo = res.authorizationData[0].proxyEndpoint;
      return this.execute('docker', ['login', '--username', 'AWS', '--password-stdin', repo], this.out.bind(this), this.out.bind(this), creds);
    });
    for (let i in this._workers) {
      let worker = this._workers[i];
      promise = promise.then(() => {
        let cmd = '';
        if (worker.name !== 'API') {
          cmd = 'worker ' + worker.name;
        }
        console.log('Building the image');
        return this.buildDocker(worker.repository, null, this.getDockerfile(cmd)).then(() => {
          console.log('Pushing the image');
          return this.pushDocker(worker.repository);
        });
      })
    }
    return promise;
  }

  _createService() {
    return this._ecs.listServices({
      cluster: this._cluster.clusterName,
      launchType: 'FARGATE'
    }).promise().then((res) => {
      let serviceName = this._replaceForAWS(this.resources.serviceName);
      for (let i in res.serviceArns) {
        if (res.serviceArns[i].split('/')[1] === serviceName) {
          this._service = res.serviceArns[i];
          break;
        }
      }
      let serviceDefinition = {
        desiredCount: this.resources.tasksNumber,
        taskDefinition: this._taskDefinitionArn,
        cluster: this._cluster.clusterName,
        serviceName: serviceName,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: this._subnets,
            assignPublicIp: this.resources.publicIp,
            securityGroups: []
          }
        }
      };
      if (this.resources.securityGroup) {
        serviceDefinition.networkConfiguration.awsvpcConfiguration.securityGroups.push(this.resources.securityGroup);
      }
      if (!this._service) {
        // Create the service
        return this._ecs.createService(serviceDefinition).promise();
      } else {
        serviceDefinition.service = serviceDefinition.serviceName;
        delete serviceDefinition.serviceName;
        delete serviceDefinition.launchType;
        // Update the service
        return this._ecs.updateService(serviceDefinition).promise();
      }
    })
  }

  _createRepository() {
    let repositories = [];
    this.resources.workers.forEach((worker) => {
      if (this.resources.repositoryNamespace.length > 0) {
        repositories.push((this.resources.repositoryNamespace + '/' + worker).toLowerCase());
      } else {
        repositories.push(worker.toLowerCase());
      }
    });
    // Might want to use only one repository with tagging to optimize storage
    return this._ecr.describeRepositories({}).promise().then((res) => {
      res.repositories.forEach((repo) => {
        let idx = repositories.indexOf(repo.repositoryName);
        if (idx >= 0) {
          if (this._workers[repo.repositoryName]) {
            this._workers[repo.repositoryName].repository = repo.repositoryUri;
          } else {
            this._workers[repo.repositoryName.split('/')[1]].repository = repo.repositoryUri;
          }
          repositories.splice(idx, 1);
        }
      });
      let promise = Promise.resolve();
      repositories.forEach((repo) => {
        promise = promise.then(() => {
          return this._ecr.createRepository({
            repositoryName: repo
          }).promise().then((res) => {
            let repo = res.repository;
            if (this._workers[repo.repositoryName]) {
              this._workers[repo.repositoryName].repository = repo.repositoryUri;
            } else {
              this._workers[repo.repositoryName.split('/')[1]].repository = repo.repositoryUri;
            }
          });
        });
      });
      return promise;
    });
  }

  _getWorkersDefinition() {
    let containerDefinitions = [];
    for (let i in this._workers) {
      let worker = this._workers[i];
      containerDefinitions.push({
        name: this._replaceForAWS(i),
        essential: true,
        image: worker.repository,
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-group': '/ecs/' + this.resources.serviceName,
            'awslogs-region': this._AWS.config.region,
            'awslogs-stream-prefix': 'ecs-webda'
          }
        }
      });
    }
    return containerDefinitions;
  }

  _needWorkersDefinitionUpdate(oldDef) {
    let newDef = this._getWorkersDefinition();
    if (
      oldDef.cpu !== this.resources.taskCpu ||
      oldDef.memory !== this.resources.taskMemory ||
      oldDef.executionRoleArn !== this._taskRole ||
      oldDef.taskRoleArn !== this._taskRole) {
      return true;
    }
    // For now let's expected the order to be the same
    // TODO Easy improvement - implement order check
    // For each worker definition
    for (let i in newDef) {
      // For each key defined for this worker
      for (let k in newDef[i]) {
        if (!oldDef.containerDefinitions[i] || newDef[i][k] !== oldDef.containerDefinitions[i][k]) {
          return true;
        }
      }
    }
    return false;
  }

  _registerTaskDefinition(taskDefinition) {
    taskDefinition = this._replaceForAWS(taskDefinition);
    return this._ecs.registerTaskDefinition({
      containerDefinitions: this._getWorkersDefinition(),
      family: taskDefinition,
      taskRoleArn: this._taskRole,
      volumes: [],
      requiresCompatibilities: ['FARGATE'],
      networkMode: 'awsvpc',
      cpu: this.resources.taskCpu,
      memory: this.resources.taskMemory,
      executionRoleArn: this._taskRole
    }).promise().then((res) => {
      this._taskDefinitionArn = res.taskDefinition.taskDefinitionArn;
    });
  }

  _createTaskDefinition() {
    // Check role ARN for cloudwatch and pull images
    let taskDefinition = this.resources.taskDefinition;
    //taskDefinition = 'webda-demo-fargate'
    return this._ecs.describeTaskDefinition({
      taskDefinition: taskDefinition
    }).promise().then((res) => {
      if (this._needWorkersDefinitionUpdate(res.taskDefinition)) {
        console.log('Need to update the task definition');
        return this._registerTaskDefinition(taskDefinition);
      }
      this._taskDefinitionArn = res.taskDefinition.taskDefinitionArn;
      return Promise.resolve();
    }).catch((err) => {
      // Describe throw an error if not found
      console.log('Create task definition', taskDefinition);
      return this._registerTaskDefinition(taskDefinition);
    });
  }

  _createCluster() {
    return this._ecs.listClusters().promise().then((res) => {
      for (let i in res.clusterArns) {
        if (res.clusterArns[i].endsWith(this.resources.clusterName)) {
          return this._ecs.describeClusters({
            clusters: [res.clusterArns[i]]
          }).promise().then((res) => {
            this._cluster = res.clusters[0];
          });
        }
      }
      if (!this._cluster) {
        return this._ecs.createCluster({
          clusterName: this.resources.clusterName
        }).promise().then((res) => {
          this._cluster = res.cluster;
        });
      }
    });
  }

  _getDefaultVPC() {
    let vpcFilter;
    this._ec2 = new this._AWS.EC2();
    return this._ec2.describeVpcs().promise().then((res) => {
      for (let i in res.Vpcs) {
        if (res.Vpcs[i].IsDefault) {
          this._vpc = res.Vpcs[i].VpcId;
          break;
        }
      }
      vpcFilter = {
        Filters: [{
          Name: 'vpc-id',
          Values: [this._vpc]
        }]
      }
      return this._ec2.describeSubnets(vpcFilter).promise();
    }).then((res) => {
      this._subnets = [];
      for (let i in res.Subnets) {
        this._subnets.push(res.Subnets[i].SubnetId);
      }
      return Promise.resolve();
    });
  }

  out(data) {
    data = data.toString();
    // Should filter output
    console.log(data);
  }

  static getModda() {
    return {
      "uuid": "WebdaDeployer/Fargate",
      "label": "Fargate",
      "description": "Create a Fargate deploymentF",
      "webcomponents": [],
      "logo": "images/icons/fargate.png",
      "configuration": {
        "widget": {
          "tag": "webda-fargate-deployer",
          "url": "elements/deployers/webda-fargate-deployer.html"
        },
        "default": {
          "workers": []
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = FargateDeployer;

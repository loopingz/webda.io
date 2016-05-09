"use strict";
const Deployer = require("./deployer");
const fs = require('fs');
const crypto = require('crypto');

class DockerDeployer extends Deployer {
	deploy(args) {
		console.log("Creating a Dockerfile on the fly if needed");
		console.log("Will run the docker build and push depending on the deployment configuration");
	}
}
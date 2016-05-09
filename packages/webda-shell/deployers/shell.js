"use strict";
const Deployer = require("./deployer");
const fs = require('fs');
const crypto = require('crypto');

class ShellDeployer extends Deployer {
	deploy(args) {
		console.log("Creating a Dockerfile on the fly if needed");
		console.log("Will run the docker build and push depending on the deployment configuration");
	}

	execute() {
		exec('~/./play.sh /media/external/' + req.params.movie,
		function (error, stdout, stderr) {
			console.log('stdout: ' + stdout);
			console.log('stderr: ' + stderr);
			if (error !== null) {
				console.log('exec error: ' + error);
		    }
		});
		const spawn = require('child_process').spawn;
		const ls = spawn('ls', ['-lh', '/usr']);

		ls.stdout.on('data', (data) => {
		  console.log(`stdout: ${data}`);
		});

		ls.stderr.on('data', (data) => {
		  console.log(`stderr: ${data}`);
		});

		ls.on('close', (code) => {
		  console.log(`child process exited with code ${code}`);
		});
	}
}
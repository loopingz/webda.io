"use strict";
const Executor = require('../services/executor.js');
const mime = require("mime");

/**
 * Output a file raw from the hard drive
 *
 * Configuration
 * '/url': {
 *    'type': 'resource',
 *    'file': 'images/test.png'	
 * }
 *
 */
class ResourceRouteHelper extends Executor {
  /** @ignore */
  execute(ctx) {
    return new Promise((resolve, reject) => {
      fs.readFile(ctx._params.file, 'utf8', (err, data) => {
        if (err) {
          return reject(err);
        }
        var mime_file = mime.lookup(ctx._params.file);
        if (mime_file) {
          ctx.writeHead(200, {'Content-Type': mime_file});
        }
        ctx.write(data);
        ctx.end();
        return resolve();
      });
    });
  }
}

module.exports = ResourceRouteHelper
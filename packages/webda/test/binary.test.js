const assert = require("assert")
const Webda = require("../lib/index.js");
const config = require("./config.json");
const fs = require("fs");
const Utils = require("./utils");


async function normal(userStore, binary, map, webda, exposePath) {
  var eventFired = 0;
  var events = ['binaryGet', 'binaryUpdate', 'binaryCreate', 'binaryDelete'];
  for (let evt in events) {
    binary.on(events[evt], function() {
      eventFired++;
    });
  }
  // Check CREATE - READ
  var hash;
  var user1;
  var user2;
  var user;
  var ctx;
  var error;
  user1 = await userStore.save({
    "test": "plop"
  });
  user2 = await userStore.save({
    "test": "plop"
  });
  await binary.store(userStore, user1, map, {
    'path': './test/Dockerfile'
  }, {});
  user1 = await userStore.get(user1.uuid);
  assert.notEqual(user1[map], undefined);
  assert.equal(user1[map].length, 1);
  hash = user1[map][0].hash;
  let value = await binary.getUsageCount(hash);
  assert.equal(value, 1);
  await binary.store(userStore, user2, map, {
    'path': './test/Dockerfile'
  }, {});
  user = await userStore.get(user2.uuid);
  assert.notEqual(user[map], undefined);
  assert.equal(user[map].length, 1);
  assert.equal(user[map][0].constructor.name, 'BinaryMap');
  hash = user[map][0].hash;
  value = await binary.getUsageCount(hash);
  assert.equal(value, 2);
  await binary.delete(userStore, user, map, 0);
  user = await userStore.get(user2.uuid);
  assert.equal(user[map].length, 0);
  value = await binary.getUsageCount(hash);
  assert.equal(value, 1);
  // Try to get images on user1 as user2
  ctx = webda.newContext({
    "type": "CRUD",
    "uuid": "PLOP"
  });
  error = false;
  ctx.session.userId = user2.uuid;
  let executor = webda.getExecutor(ctx, "test.webda.io", "GET", exposePath + "/users/" + user1.uuid + "/" + map + "/0");
  await Utils.throws(executor.execute.bind(executor, ctx), res => res == 403);
  ctx.session.userId = user1.uuid;
  executor = webda.getExecutor(ctx, "test.webda.io", "GET", exposePath + "/users/" + user1.uuid + "/" + map + "/0");
  await executor.execute(ctx);
  // We dont check for result as FileBinary will return datas and S3 a redirect
  if (fs.existsSync('./downloadTo.tmp')) {
    fs.unlinkSync('./downloadTo.tmp');
  }
  await binary.downloadTo(user1[map][0], './downloadTo.tmp');
  // Check the result is the same
  assert.equal(fs.readFileSync('./downloadTo.tmp').toString(), fs.readFileSync('./test/Dockerfile').toString());
  await userStore.delete(user1.uuid);
  value = await binary.getUsageCount(hash);
  assert.equal(value, 0);
}

async function notMapped(userStore, binary) {
  var exception = false;
  let user1 = await userStore.save({
    "test": "plop"
  });
  await Utils.throws(binary.store.bind(binary, userStore, user1, 'images2', {
    'path': './test/Dockerfile'
  }, {}), err => true);
}

async function update(userStore, binary, map) {
  var user1;
  var user;
  let hash;
  user1 = await userStore.save({
    "test": "plop"
  });
  await binary.store(userStore, user1, map, {
    'path': './test/Dockerfile'
  }, {});
  user = await userStore.get(user1.uuid);
  assert.notEqual(user[map], undefined);
  assert.equal(user[map].length, 1);
  let value = await binary.getUsageCount(user[map][0].hash);
  assert.equal(value, 1);
  await binary.update(userStore, user, map, 0, {
    'path': './test/Dockerfile.txt'
  }, {});
  user = await userStore.get(user1.uuid);
  assert.notEqual(user[map], undefined);
  assert.equal(user[map].length, 1);
  assert.notEqual(hash, user[map][0].hash);
  assert.equal(user[map][0].mimetype, 'text/plain');
  assert.equal(user[map][0].name, 'Dockerfile.txt');
  value = await binary.getUsageCount(hash);
  assert.equal(value, 0);
  value = await binary.getUsageCount(user[map][0].hash)
  assert.equal(value, 1);
}

describe('Binary', function() {
  var webda;
  var binary;
  var userStore;
  var skipS3;
  before(function() {
    skipS3 = process.env["WEBDA_AWS_TEST"] === undefined;
    if (skipS3) {
      console.log("Not running S3Binary test as no AWS env found");
    }
  });
  beforeEach(async function() {
    webda = new Webda.Core(config);
    await webda.init();
  });
  describe('Binary', function() {
    const Binary = Webda.Binary;
    var service = new Binary();

    it('abstract', function() {

      Utils.throws(service.store, Error);
      Utils.throws(service.getUsageCount, Error);
      Utils.throws(service.update, Error);
      Utils.throws(service.delete, Error);

    })

  });
  describe('FileBinary', function() {
    beforeEach(async () => {
      userStore = webda.getService("Users");
      binary = webda.getService("binary");
      assert.notEqual(userStore, undefined);
      assert.notEqual(binary, undefined);
      await userStore.__clean();
      await binary.__clean();
    });
    it('normal', function() {
      return normal(userStore, binary, 'images', webda, '/binary');
    });
    it('not-mapped', function() {
      return notMapped(userStore, binary);
    });
    it('update', function() {
      return update(userStore, binary, 'images');
    });
  });
  describe('S3Binary', function() {
    beforeEach(async () => {
      if (skipS3) {
        return;
      }
      userStore = webda.getService("users");
      binary = webda.getService("s3binary");
      assert.notEqual(userStore, undefined);
      assert.notEqual(binary, undefined);
      await userStore.__clean();
      await binary.__clean();
    });
    it('normal', function() {
      if (skipS3) {
        this.skip();
        return;
      }
      return normal(userStore, binary, 's3images', webda, '/s3binary');
    });
    it('not-mapped', function() {
      if (skipS3) {
        this.skip();
        return;
      }
      return notMapped(userStore, binary);
    });
    it('update', function() {
      if (skipS3) {
        this.skip();
        return;
      }
      return update(userStore, binary, 's3images');
    });
    it('getARN', function() {
      if (skipS3) {
        this.skip();
        return;
      }
      assert.equal(binary.getARNPolicy().Resource[0], 'arn:aws:s3:::webda-test');
    })
  });
  describe('challenge()', function() {
    it('_isValidChallenge', function() {
      binary = webda.getService("binary");
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e8157980"), true);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798G"), false);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798"), false);
      assert.equal(binary._validChallenge("54b249c8a7c2cdc6945c5c426fbe2b4b41e5045059c43ddc5e134b17e815798."), false);
    });
  });
});

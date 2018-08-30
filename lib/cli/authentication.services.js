
const assert = require('assert');
const { cwd } = require('process');
const { join } = require('path');

const loginPassword = 'orprotroiyotrtouuikj';
const loginEmail = 'hdsjkhsdkhfhfdhgfjffghfghfghfh';

module.exports = function checkHealthAuthTest(appRoot = cwd()) {
  const defaultJson = require(`${appRoot}/config/default.json`);
  const { ensureCanSeedData, expandSpecsForTest, localStorage, loginLocal, loginJwt, makeClient } =
    require('../');

  const configClient = (defaultJson.tests || {}).client;
  const port = configClient.port || 3030;
  const ioOptions = configClient.ioOptions || {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {},
  };
  const primusOptions = configClient.primusOptions || { transformer: 'ws' };
  const serverUrl = (configClient.restOptions || {}).url || 'http://localhost:3030';
  // Authentication is assumed active on each method for services generated with authentication.
  // No authentication is assumed active on each method for services generated without authentication.
  // Of course you could change this by removing or adding authenticate(strategy) hooks.
  // You could even disallow client access to some methods entirely.
  // Only such authentication or disallow changes need be specified here.
  // schedules: {
  //   patch:  'auth',    // authentication added to path method in service schedules
  //   update: 'noauth',  // authentication removed from update method in service schedules
  //   remove: 'disallow' // client cannot call remove method in service schedules
  // }
  const overriddenAuth = configClient.overriddenAuth || {};

  // Check we can run this test.
  describe(`Test ${__filename.substring(__dirname.length + 1)}`, () => {
    let genSpecs;

    // Check if we can seed data.
    let cannotRunTest = ensureCanSeedData(appRoot);

    // Check if app generated with required features.
    if (!cannotRunTest) {
      ({ err: cannotRunTest, genSpecs } = expandSpecsForTest(appRoot, {
        strats: ['local'],
        overriddenAuth,
      }));
    }

    it('Check this test may not seed data', () => {
      assert.equal(cannotRunTest, '', cannotRunTest);
    });

    if (!cannotRunTest) {
      const seedData = require(join(appRoot, 'seeds', 'fake-data.json'));

      tests(seedData, {
        genSpecs,
        transports: genSpecs.app.providers,
        usersName: genSpecs.authentication.entity,
        usersPath: genSpecs.authentication._entityPath
      });
    }
  });

// Run the tests.
  function tests(seedData, { genSpecs, transports, usersName, usersPath }) {
    transports.forEach(transport => {

      describe(`Test ${transport} transport`, () => {
        testServices(true, transport, seedData, genSpecs, transports, usersName, usersPath);
        testServices(false, transport, seedData, genSpecs, transports, usersName, usersPath);
      });

    });
  }

  function testServices(ifAuth, transport, seedData, genSpecs, transports, usersName, usersPath) {
    describe(ifAuth ? 'With authentication.' : 'Without authentication', () => {
      let app;
      let server;
      let appClient;

      before(function (done) {
        localStorage.clear();

        const usersRecs = seedData[usersName];
        if (!(usersRecs || []).length) {
          throw new Error(`No fake records for ${usersName} in seeds/fake-data.json.`);
        }

        delete require.cache[require.resolve(`${appRoot}/src1/app`)];
        app = require(`${appRoot}/src1/app`);

        server = app.listen(port);
        server.once('listening', async () => {
          appClient = makeClient({ transport, serverUrl, ioOptions, primusOptions });

          if (ifAuth) {
            const usersService = app.service(usersPath);
            await usersService.remove(null);
            const user = Object.assign({}, usersRecs[0], { email: loginEmail, password: loginPassword });
            await usersService.create(user);

            await loginLocal(appClient, loginEmail, loginPassword);
          }

          done();
        });
      });

      after(function (done) {
        server.close();
        setTimeout(() => done(), 500);
      });

      const genServices = genSpecs.services;
      Object.keys(genServices).forEach(name => {

        describe(`Service ${name}.`, () => {
          const genService = genServices[name];
          const isAuthEntity = genService.isAuthEntity;
          const authByMethod = genSpecs._authByMethod[name];
          const ourSeedData = seedData[name];

          if (!ourSeedData || !ourSeedData.length) {
            console.log(`SKIP service ${name} - no fake data.`);
            return;
          }

          const ourSeedId = 'id' in ourSeedData[0] ? 'id' : '_id';

          Object.keys(authByMethod).forEach(method => {
            const authThisMethod = authByMethod[method];

            let ifFail = authThisMethod === 'disallow' ?
              true : (ifAuth ? false : authThisMethod === 'auth');
            if (isAuthEntity && method === 'create') { // user-entity create has no authentication
              ifFail = false;
            }

            it(`${method} ${displayCode(ifFail, authThisMethod)}.`, async () => {
              const service = appClient.service(genService.path);
              let prop;
              let rec, rec1;
              let result;

              switch (method) {
                case 'create':
                  await app.service(genService.path).remove(null);

                  result = await runMethod(ifFail, () => service.create(ourSeedData));
                  if (!ifFail) {
                    assert.equal(resultLen(result), ourSeedData.length, 'Unexpected result length.');
                  } else {
                    assert(true);
                  }
                  break;
                case 'find':
                  result = await runMethod(ifFail, () => service.find());
                  if (!ifFail) assert.equal(resultLen(result), ourSeedData.length, 'Unexpected result length.');
                  break;
                case 'get':
                  rec = ourSeedData[0];
                  result = await runMethod(ifFail, () => service.get(rec[ourSeedId]));
                  if (!ifFail) assert.equal(resultLen(result), 1, 'Unexpected result length.');
                  if (!ifFail) assert.deepEqual(result, rec, 'Unexpected record returned');
                  break;
                case 'patch':
                  rec = ourSeedData[0];
                  prop = Object.keys(rec)[1];
                  result = await runMethod(ifFail, () => service.patch(rec[ourSeedId], { [prop]: ourSeedData[1][prop] }));
                  if (!ifFail) assert.equal(resultLen(result), 1, 'Unexpected result length.');
                  break;
                case 'update':
                  rec = ourSeedData[0];
                  rec1 = Object.assign({}, rec);
                  rec1[ourSeedId] = rec[ourSeedId];
                  result = await runMethod(ifFail, () => service.update(rec[ourSeedId], rec1));
                  if (!ifFail) assert.equal(resultLen(result), 1, 'Unexpected result length.');
                  break;
                case 'remove':
                  rec = ourSeedData[isAuthEntity ? 1 : 0];
                  result = await runMethod(ifFail, () => service.remove(rec[ourSeedId]));
                  if (!ifFail) assert.equal(resultLen(result), 1, 'Unexpected result length.');
                  if (!ifFail) assert.deepEqual(result, rec, 'Unexpected record returned');
                  break;
              }
            });

          });

        });
      });
    });
  }
};

function displayCode(ifFail, authThisMethod) {
  const part1 = ifFail ? 'should fail' : 'should succeed';
  const part2 = authThisMethod === 'disallow'
    ? 'configured to disallow clients'
    : (authThisMethod === 'auth' ? 'configured with auth' : 'configured without auth');
  return `${part1}: ${part2}`;
}

function runMethod(shouldFail, callMethod) {
  return new Promise((resolve, reject) => {
    callMethod()
      .then(result => {
        if (shouldFail) {
          reject(new Error('Call unexpectedly succeeded.'));
        } else {
          resolve(result);
        }
      })
      .catch(err => {
        if (!shouldFail) {
          reject(new Error('Call unexpectedly failed.'))
        } else {
          resolve(null);
        }
      });
  });
}

function resultLen(result) {
  if (!result) return -1;

  if (result.data) return result.data.length;
  return Array.isArray(result) ? result.length : 1;
}

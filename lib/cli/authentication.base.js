
const assert = require('assert');
const { cwd } = require('process');
const { join } = require('path');

const ensureCanSeedData = require('./ensure-can-seed-data');
const expandSpecsForTest = require('./expand-specs-for-test');
const localStorage = require('../local-storage');
const loginLocal = require('../login-local');
const loginJwt = require('../login-jwt');
const makeClient = require('../make-client');

const loginPassword = 'orprotroiyotrtouuikj';
const loginEmail = 'hdsjkhsdkhfhfd@hgfjffghfgh.com';

module.exports = function checkHealthAuthTest(appRoot = cwd(), options = {}) {
  const delayAfterServerOnce = options.delayAfterServerOnce || 500;
  const delayAfterServerClose = options.delayAfterServerClose || 500;
  const timeoutForStartingServerAndClient = options.timeoutForStartingServerAndClient || 30000;
  const timeoutForClosingingServerAndClient = options.timeoutForClosingingServerAndClient || 30000;

  const defaultJson = require(`${appRoot}/config/default.json`);

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
  let genSpecs;

  // Check if we can seed data.
  let cannotRunTest = ensureCanSeedData(appRoot);

  // Check if app generated with required features.
  if (!cannotRunTest) {
    ({ err: cannotRunTest, genSpecs } = expandSpecsForTest(appRoot, {
      strats: ['local'],
    }));
  }

  // Check we can run this test.
  describe(`Test ${__filename.substring(__dirname.length + 1)}`, () => {
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
  function tests(seedData, { transports, usersName, usersPath }) {
    transports.forEach(transport => {

      describe(`Test ${transport} transport`, function () {
        let app;
        let server;
        let appClient;
        let jwt;

        beforeEach(function (done) {
          this.timeout(timeoutForStartingServerAndClient);
          localStorage.clear();

          const usersRecs = seedData[usersName];
          if (!(usersRecs || []).length) {
            throw new Error(`No fake records for ${usersName} in seeds/fake-data.json.`);
          }

          // Restarting app.*s is required if the last mocha test did REST calls on its server.
          delete require.cache[require.resolve(`${appRoot}/${genSpecs.app.src}/app`)];
          app = require(`${appRoot}/${genSpecs.app.src}/app`);
          if (genSpecs.options.ts) app = app.default;

          server = app.listen(port);
          server.once('listening', () => {
            setTimeout(async () => {
              const usersService = app.service(usersPath);
              await usersService.remove(null);
              const user = Object.assign({}, usersRecs[0], { email: loginEmail, password: loginPassword });
              await usersService.create(user);

              appClient = makeClient({ transport, serverUrl, ioOptions, primusOptions });

              done();
            }, delayAfterServerOnce);
          });
        });

        afterEach(function (done) {
          this.timeout(timeoutForClosingingServerAndClient);
          server.close();
          setTimeout(() => done(), delayAfterServerClose);
        });

        // Run several tests together to reduce their runtime.
        it(`Can make local authenticated call on ${usersPath} service`, async function () {
          this.timeout(timeoutForStartingServerAndClient);

          await loginLocal(appClient, loginEmail, loginPassword);
          jwt = localStorage.getItem('feathers-jwt');

          assert(typeof jwt === 'string', 'jwt not a string');
          assert(jwt.length > 100, 'jwt too short');

          const usersClient = appClient.service(usersPath);
          const result = await usersClient.find({ query: { email: loginEmail }});
          const rec = result.data[0] || result;

          assert.equal(rec.email, loginEmail, 'wrong email');
        });

        it(`Can make jwt authenticated call on ${usersPath} service`, async function () {
          this.timeout(timeoutForStartingServerAndClient);

          await loginJwt(appClient, jwt);
          const jwt1 = localStorage.getItem('feathers-jwt');

          assert(typeof jwt1 === 'string', 'jwt not a string');
          assert(jwt1.length > 100, 'jwt too short');
          assert.notEqual(jwt1, jwt, 'new token unexpectedly same as authentication token.');

          const usersClient = appClient.service(usersPath);
          const result = await usersClient.find({ query: { email: loginEmail }});
          const rec = result.data[0] || result;

          assert.equal(rec.email, loginEmail, 'wrong email');
        });

        it('throws on no authentication, incorrect email or password', async function () {
          this.timeout(timeoutForStartingServerAndClient);
          const usersClient = appClient.service(usersPath);

          let testShouldPass = true;
          try {
            // eslint-disable-next-line no-console
            await usersClient.find({ query: { email: loginEmail }});

            // False assertion here will be caught be catch-block.
            testShouldPass = false;
          } catch (err) {
            assert(true);
          }
          assert(testShouldPass, 'call unexpectedly succeeded');

          testShouldPass = true;
          try {
            // eslint-disable-next-line no-console
            await loginLocal(appClient, '#$%^&*()', loginPassword);

            // False assertion here will be caught be catch-block.
            testShouldPass = false;
          } catch (err) {
            assert(true);
          }
          assert(testShouldPass, 'login unexpectedly succeeded');

          testShouldPass = true;
          try {
            // eslint-disable-next-line no-console
            await loginLocal(appClient, loginEmail, '$%^&*()');

            // False assertion here will be caught be catch-block.
            testShouldPass = false;
          } catch (err) {
            assert(true);
          }
          assert(testShouldPass, 'login unexpectedly succeeded');
        });
      });

    });
  }
};

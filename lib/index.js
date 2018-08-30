
const cli = require('./cli');
const doesFileExist = require('./does-file-exist');
const localStorage = require('./local-storage');
const loginJwt = require('./login-jwt');
const loginLocal = require('./login-local');
const makeClient = require('./make-client');

module.exports = Object.assign(
  {
    ensureCanSeedData,
    expandSpecsForTest,
    localStorage,
    loginLocal,
    loginJwt,
    makeClient,
  },
  cli
);

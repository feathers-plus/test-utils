
const cli = require('./cli');
const doesFileExist = require('./does-file-exist');
const localStorage = require('./local-storage');
const loginJwt = require('./login-jwt');
const loginLocal = require('./login-local');
const makeClient = require('./make-client');
const readJsonFileSync = require('./read-json-file-sync');

module.exports = Object.assign({},
  {
    doesFileExist,
    localStorage,
    loginLocal,
    loginJwt,
    makeClient,
    readJsonFileSync,
  },
  cli
);

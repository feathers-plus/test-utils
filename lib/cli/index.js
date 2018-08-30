
const authenticationBase = require('./authentication.base.js');
const authenticationService = require('./authentication.service.js');
const ensureCanSeedData = require('./ensure-can-seed-data');
const expandSpecsForTest = require('./expand-specs-for-test');

module.exports = {
  authenticationBase,
  authenticationService,
  ensureCanSeedData,
  expandSpecsForTest,
};

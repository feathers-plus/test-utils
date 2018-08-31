
const doesFileExist = require('./does-file-exist');
const jsonFile = require('jsonfile');

module.exports = function readJsonFileSync(path) {
  return !doesFileExist(path) ? null :  jsonFile.readFileSync(path, { throw: false });
};

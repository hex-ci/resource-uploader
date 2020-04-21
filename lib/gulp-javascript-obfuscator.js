const through2 = require('through2');
const JavaScriptObfuscator = require('javascript-obfuscator');
const PluginError = require('plugin-error');

module.exports = function gulpJavaScriptObfuscator(options = {}) {
  return through2.obj(function(file, enc, cb) {
    if (file.isNull()) {
      return cb(null, file);
    }

    if (!file.isBuffer()) {
      throw new PluginError('gulp-javascript-obfuscator', 'Only Buffers are supported!');
    }

    file.sourceMap = false;

    try {
      const obfuscationResult = JavaScriptObfuscator.obfuscate(String(file.contents), options);

      file.contents = new Buffer(obfuscationResult.getObfuscatedCode());

      return cb(null, file);
    }
    catch (err) {
      throw new PluginError('gulp-javascript-obfuscator', err);
    }
  });
};

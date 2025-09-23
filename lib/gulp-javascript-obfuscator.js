import through2 from 'through2';
import JavaScriptObfuscator from 'javascript-obfuscator';
import PluginError from 'plugin-error';

function gulpJavaScriptObfuscator(options = {}) {
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

      file.contents = Buffer.from(obfuscationResult.getObfuscatedCode());

      return cb(null, file);
    }
    catch (err) {
      throw new PluginError('gulp-javascript-obfuscator', err);
    }
  });
}

export default gulpJavaScriptObfuscator;

'use strict';

const PluginError = require('plugin-error');
const htmlmin = require('html-minifier');
const through = require('through2-concurrent');

module.exports = options => {
  return through.obj(function(file, enc, next) {
    if (file.isNull()) {
      next(null, file);
      return;
    }

    const minify = (buf, _, cb) => {
      try {
        const contents = Buffer.from(htmlmin.minify(buf.toString(), options));
        if (next === cb) {
          file.contents = contents;
          cb(null, file);
          return;
        }
        cb(null, contents);
        next(null, file);
      }
      catch (err) {
        const opts = Object.assign({}, options, { fileName: file.path });
        const error = new PluginError('gulp-htmlmin', err, opts);
        if (next !== cb) {
          next(error);
          return;
        }
        cb(error);
      }
    };

    if (file.isStream()) {
      file.contents = file.contents.pipe(through(minify));
    }
    else {
      minify(file.contents, null, next);
    }
  });
};

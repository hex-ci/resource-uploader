'use strict';

import PluginError from 'plugin-error';
import htmlmin from 'html-minifier';
import through from 'through2-concurrent';

const gulpHtmlmin = options => {
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

export default gulpHtmlmin;

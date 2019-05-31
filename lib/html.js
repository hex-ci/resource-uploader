const path = require('path');
const through2 = require('through2-concurrent');
const PluginError = require('plugin-error');
const chalk = require('chalk');
const log = require('fancy-log');
const cssnano = require('cssnano');
const autoprefixer = require('autoprefixer');
const use = require('postcss-use');
const DataURI = require('datauri');
const gulp = require('gulp');
const gulpLoadPlugins = require('gulp-load-plugins');
const $ = gulpLoadPlugins();

const oss = require('./alioss.js');
const extractResource = require('./extract-resource.js');
const imagemin = require('./imagemin.js');
const less = require('./gulp-less.js');
const sass = require('./gulp-sass.js');

const pkg = require('../package.json');

const browsers = pkg.browserslist;
const pxtoremDefault = pkg.pxtorem;
const babelPlugins = pkg.babelPlugins.map(item => {
  if (Array.isArray(item)) {
    item[0] = require.resolve(item[0], { paths: [path.join(__dirname, '..')] })
  }
  else {
    item = require.resolve(item, { paths: [path.join(__dirname, '..')] })
  }

  return item;
});

const showError = (event) => {
  log(chalk.red('error!'));

  console.log(event.message);
};

const replaceExt = (filepath, ext) => {
  const filename = path.basename(filepath, path.extname(filepath)) + ext;

  return path.join(path.dirname(filepath), filename);
};

const toDatauri = () => {
  return through2.obj({ maxConcurrency: 8 }, function(file, enc, cb) {
    const ext = path.extname(file.path);

    if (/^\.(?:jpg|jpeg|png|gif|cur|eot|woff|ttf|svg)$/i.test(ext) && file.contents.length <= 1024 * 10) {
      const datauri = new DataURI();

      datauri.format(ext, file.contents);

      file.datauri = datauri.content;
      file.noCdn = true;
    }

    return cb(null, file);
  });
};

const css = () => {
  return through2.obj({ maxConcurrency: 8 }, function(file, enc, cb) {
    const result = extractResource.css(file);

    const sources = [];
    const maps = {};
    const stub = {};

    result.forEach((item) => {
      if (maps[item.path]) {
        return;
      }

      maps[item.path] = item.name;
      sources.push(item.path);
    });

    gulp.src(sources)
      .pipe($.if(/\.(png|jpg|jpeg|gif|svg)$/i, imagemin([
        imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
        imagemin.jpegtran({ progressive: true }),
        imagemin.optipng({ optimizationLevel: 7 })
      ])).on('error', showError))

      .pipe(toDatauri())

      .pipe(oss.upload({}, true))
      .pipe(through2.obj({ maxConcurrency: 8 }, (file, enc, callback) => {
        stub[maps[file.path]] = file.datauri ? file.datauri : file.cdn;

        callback(null, file);
      }, (callback) => {
        let contents = file.contents.toString();

        contents = contents.replace(/___cdn_name\$\$\$[a-z0-9]{32}\$\$\$___/g, function(match) {
          if (stub[match]) {
            return stub[match];
          }
          else {
            log(chalk.red(`Error: stub ${match} not found!`));

            return match;
          }
        });

        //console.log(contents);

        //console.log(file.contents.toString());

        file.contents = new Buffer(contents);

        cb(null, file);

        callback();
      }));
  });
};


module.exports = function() {

  return through2.obj({ maxConcurrency: 8 }, function(file, enc, cb) {
    if (file.isDirectory()) {
      return cb();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('html', 'Streams are not supported!'));
      return cb();
    }

    const result = extractResource.html(file);

    const sources = [];
    const maps = {};
    const stub = {};

    result.forEach((item) => {
      if (maps[item.path]) {
        return;
      }

      maps[item.path] = item.name;
      sources.push(item.path);
    });

    gulp.src(sources)
      .pipe($.if(/\.(png|jpg|jpeg|gif|svg)$/i, imagemin([
        imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
        imagemin.jpegtran({ progressive: true }),
        imagemin.optipng({ optimizationLevel: 7 })
      ])).on('error', showError))

      .pipe($.if(/\.(js|css|less|scss|sass)$/i, $.sourcemaps.init()))

      .pipe($.if(/\.less$/i, less()).on('error', showError))
      .pipe($.if(/\.less$/i, $.sourcemaps.write({ addComment: false })))
      .pipe($.if(/\.(scss|sass)$/i, sass({ outputStyle: 'expanded' })).on('error', sass.logError))
      .pipe($.if(/\.(scss|sass)$/i, $.sourcemaps.write({ addComment: false })))
      .pipe($.if(/\.(css|less|scss|sass)$/i, $.postcss([ use({
        modules: [ 'postcss-pxtorem' ],
        options: {
          'postcss-pxtorem': pxtoremDefault
        }
      }), cssnano({
        preset: ['default', {
          autoprefixer: false,
          zindex: false,
          reduceIdents: false,
          reduceTransforms: false
        }]
      }), autoprefixer({
        browsers
      }) ])))
      .pipe($.if('*.css', css()))
      .pipe($.if(/\.(css|less|scss|sass)$/i, $.sourcemaps.write({ addComment: false })))

      .pipe($.if('*.js', $.babel({
        babelrc: false,
        compact: false,
        plugins: babelPlugins,
        presets: [
          [
            require.resolve('@babel/preset-env', { paths: [path.join(__dirname, '..')] }),
            {
              targets: { browsers }
            }
          ]
        ]
      })).on('error', showError))
      .pipe($.if('*.js', $.sourcemaps.write({ addComment: false })))
      .pipe($.if('*.js', $.uglify({
        ie8: true,
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      })).on('error', showError))
      .pipe($.if('*.js', $.sourcemaps.write({ addComment: false })))

      .pipe(toDatauri())

      .pipe(oss.upload({}, true))
      .pipe(through2.obj({ maxConcurrency: 8 }, (file, enc, callback) => {
        let filepath = file.path;

        if (!maps[filepath]) {
          filepath = replaceExt(filepath, '.scss');

          if (!maps[filepath]) {
            filepath = replaceExt(filepath, '.less');

            if (!maps[filepath]) {
              filepath = replaceExt(filepath, '.sass');
            }
          }
        }

        stub[maps[filepath]] = file.datauri ? file.datauri : file.cdn;

        callback(null, file);
      }, (callback) => {
        let contents = file.contents.toString();

        contents = contents.replace(/___cdn_name\$\$\$[a-z0-9]{32}\$\$\$___/g, function(match) {
          if (stub[match]) {
            return stub[match];
          }
          else {
            log(chalk.red(`Error: stub ${match} not found!`));

            return match;
          }
        });

        //console.log(contents);

        //console.log(file.contents.toString());

        file.contents = new Buffer(contents);

        cb(null, file);

        callback();
      }));
  });

};

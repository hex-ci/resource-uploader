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

const oss = require('./alioss');
const extractResource = require('./extract-resource');
const imagemin = require('./imagemin');
const less = require('./gulp-less');
const sass = require('./gulp-sass');
const wrapper = require('./gulp-wrapper');
const terser = require('./gulp-terser');
const javascriptObfuscator = require('./gulp-javascript-obfuscator');

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

const css = (argv) => {
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

    if (sources.length < 1) {
      cb(null, file);
      return;
    }

    gulp.src(sources).on('error', showError)
      .pipe($.if(file => argv.compress && /\.(png|jpg|jpeg|gif|svg)$/i.test(file.path), imagemin([
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

        file.contents = Buffer.from(contents);

        cb(null, file);

        callback();
      }));
  });
};


module.exports = function(argv) {

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

    if (sources.length < 1) {
      cb(null, file);
      return;
    }

    gulp.src(sources).on('error', showError)
      .pipe($.if(file => argv.compress && /\.(png|jpg|jpeg|gif|svg)$/i.test(file.path), imagemin([
        imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
        imagemin.jpegtran({ progressive: true }),
        imagemin.optipng({ optimizationLevel: 7 })
      ])).on('error', showError))

      .pipe($.if(file => !argv.raw && /\.(js|css|less|scss|sass)$/i.test(file.path), $.sourcemaps.init()))

      .pipe($.if(file => argv.less && /\.less$/i.test(file.path), less()).on('error', showError))
      .pipe($.if(file => argv.less && /\.less$/i.test(file.path), $.sourcemaps.write({ addComment: false })))

      .pipe($.if(file => argv.sass && /\.(scss|sass)$/i.test(file.path), sass({ outputStyle: 'expanded' })).on('error', sass.logError))
      .pipe($.if(file => argv.sass && /\.(scss|sass)$/i.test(file.path), $.sourcemaps.write({ addComment: false })))

      .pipe($.if(file => argv.compress && /\.(css|less|scss|sass)$/i.test(file.path), $.postcss([ use({
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
        overrideBrowserslist: browsers
      }) ])))
      .pipe($.if('*.css', css(argv)))
      .pipe($.if(file => !argv.raw && /\.(css|less|scss|sass)$/i.test(file.path), $.sourcemaps.write({ addComment: false })))

      .pipe($.if(file => argv.babel && /\.js$/i.test(file.path), $.babel({
        cwd: path.join(__dirname, '..'),
        babelrc: false,
        compact: false,
        plugins: babelPlugins,
        presets: [
          [
            require.resolve('@babel/preset-env', { paths: [path.join(__dirname, '..')] }), {
              modules: false,
              targets: { browsers }
            }
          ]
        ]
      })).on('error', showError))

      .pipe($.if(file => argv.compress && argv.iife && /\.js$/i.test(file.path), wrapper({
        header: '+function() {',
        footer: '}()'
      })).on('error', showError))

      .pipe($.if(file => argv.compress && argv.iife && /\.js$/i.test(file.path), $.sourcemaps.write({ addComment: false })))

      .pipe($.if(file => argv.compress && /\.js$/i.test(file.path), terser({
        ie8: true,
        safari10: true,
        compress: {
          drop_console: true
        }
      })).on('error', showError))
      .pipe($.if(file => argv.compress && /\.js$/i.test(file.path), $.sourcemaps.write({ addComment: false })))

      .pipe($.if(file => argv.obfuscate && /\.js$/i.test(file.path), javascriptObfuscator({ compact: true })))

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

        file.contents = Buffer.from(contents);

        cb(null, file);

        callback();
      }));
  });

};

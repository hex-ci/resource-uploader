import path from 'path';
import through2 from 'through2-concurrent';
import PluginError from 'plugin-error';
import chalk from 'chalk';
import log from 'fancy-log';
import cssnano from 'cssnano';
import autoprefixer from 'autoprefixer';
import DataURI from 'datauri';
import gulp from 'gulp';
import * as dartSass from 'sass';
import gulpSass from 'gulp-sass';
import gulpIf from 'gulp-if';
import gulpImagemin, { gifsicle, mozjpeg, optipng } from 'gulp-imagemin';
import gulpBabel from 'gulp-babel';
import gulpSourceMaps from 'gulp-sourcemaps';
import gulpPostcss from 'gulp-postcss';

import use from './postcss-use.js';
import oss from './alioss.js';
import extractResource from './extract-resource.js';
import less from './gulp-less.js';
import wrapper from './gulp-wrapper.js';
import terser from './gulp-terser.js';
import javascriptObfuscator from './gulp-javascript-obfuscator.js';

import pkg from '../package.json' with { type: 'json' };

const __dirname = path.resolve();
const sass = gulpSass(dartSass);
const browsers = pkg.browserslist;
const pxtoremDefault = pkg.pxtorem;

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

const cssProcess = (argv) => {
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

    gulp.src(sources, { encoding: false }).on('error', showError)
      .pipe(gulpIf(file => argv.compress && /\.(png|jpg|jpeg|gif|svg)$/i.test(file.path), gulpImagemin([
        gifsicle({ interlaced: true, optimizationLevel: 3 }),
        mozjpeg({ progressive: true }),
        optipng({ optimizationLevel: 7, autoInterlacedMinSize: 1024 * 50 })
      ], { silent: true })).on('error', showError))

      .pipe(toDatauri())

      .pipe(oss.upload({}, true))
      .pipe(through2.obj({ maxConcurrency: 8 }, (file, enc, callback) => {
        stub[maps[file.path]] = file.datauri ? file.datauri : file.cdn;

        callback(null, file);
      }, (callback) => {
        let contents = file.contents.toString();

        contents = contents.replace(/___cdn_name\|\|\|[a-z0-9]{32}\|\|\|___/g, function(match) {
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

function htmlProcess(argv) {

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

    gulp.src(sources, { encoding: false }).on('error', showError)
      .pipe(gulpIf(file => argv.compress && /\.(png|jpg|jpeg|gif|svg)$/i.test(file.path), gulpImagemin([
        gifsicle({ interlaced: true, optimizationLevel: 3 }),
        mozjpeg({ progressive: true }),
        optipng({ optimizationLevel: 7, autoInterlacedMinSize: 1024 * 50 })
      ], { silent: true })).on('error', showError))

      .pipe(gulpIf(file => !argv.raw && /\.(js|css|less|scss|sass)$/i.test(file.path), gulpSourceMaps.init()))

      .pipe(gulpIf(file => argv.less && /\.less$/i.test(file.path), less()).on('error', showError))
      .pipe(gulpIf(file => argv.less && /\.less$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.sass && /\.(scss|sass)$/i.test(file.path), sass({ style: 'expanded' })).on('error', sass.logError))
      .pipe(gulpIf(file => argv.sass && /\.(scss|sass)$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.compress && /\.(css|less|scss|sass)$/i.test(file.path), gulpPostcss([ use({
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
      .pipe(gulpIf('*.css', cssProcess(argv)))
      .pipe(gulpIf(file => !argv.raw && /\.(css|less|scss|sass)$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.babel && /\.js$/i.test(file.path), gulpBabel({
        cwd: path.join(__dirname, '..'),
        babelrc: false,
        compact: false,
        presets: [
          [
            '@babel/preset-env',
            {
              modules: false,
              targets: { browsers }
            }
          ]
        ]
      })).on('error', showError))

      .pipe(gulpIf(file => argv.compress && argv.iife && /\.js$/i.test(file.path), wrapper({
        header: '+function() {',
        footer: '}()'
      })).on('error', showError))

      .pipe(gulpIf(file => argv.compress && argv.iife && /\.js$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.compress && /\.js$/i.test(file.path), terser({
        ie8: true,
        safari10: true,
        compress: {
          drop_console: true
        }
      })).on('error', showError))
      .pipe(gulpIf(file => argv.compress && /\.js$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.obfuscate && /\.js$/i.test(file.path), javascriptObfuscator({ compact: true })))

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

        contents = contents.replace(/___cdn_name\|\|\|[a-z0-9]{32}\|\|\|___/g, function(match) {
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
}

export default htmlProcess;

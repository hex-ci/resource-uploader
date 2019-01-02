#!/usr/bin/env node

const yargs = require('yargs');
const gulp = require('gulp');
const path = require('path');
const fs = require('fs');
const os = require('os');
const process = require('process');
const inquirer = require('inquirer');
const gulpLoadPlugins = require('gulp-load-plugins');
const cssnano = require('cssnano');
const autoprefixer = require('autoprefixer');
const colors = require('gulp-util').colors;
const log = require('gulp-util').log;
const through2 = require('through2-concurrent');
const use = require('postcss-use');

const oss = require('./lib/alioss.js');
const html = require('./lib/html.js');
const inlineCompress = require('./lib/inline-compress.js');
const imagemin = require('./lib/imagemin.js');

const version = require('./package.json').version;
const browsers = require('./package.json').browserslist;
const pxtoremDefault = require('./package.json').pxtorem;

const $ = gulpLoadPlugins();

const argv = yargs.usage('用法: $0 [选项] 文件') // usage string of application.
  .option('h', {
    alias: 'help',
    description: '显示帮助信息'
  }).option('compress', {
    alias: 'c',
    type: 'boolean',
    default: true,
    description: '是否压缩文件'
  }).option('prefix', {
    alias: 'p',
    type: 'string',
    description: '自定义 URL 路径'
  }).option('name', {
    type: 'string',
    description: '自定义 URL 文件名'
  }).option('base64', {
    type: 'boolean',
    default: false,
    description: '是否处理成 base64 内容，而不上传 CDN'
  }).option('dest', {
    type: 'string',
    description: '本机文件系统路径，\n使用此参数将保存文件到指定路径，而不上传 CDN'
  }).option('output-simple', {
    type: 'boolean',
    default: false,
    description: '是否简化控制台输出'
  }).option('concat', {
    type: 'boolean',
    default: false,
    description: '是否合并文件'
  }).option('refresh', {
    alias: 'r',
    type: 'boolean',
    default: false,
    description: '是否刷新 CDN 资源'
  }).option('init-config', {
    type: 'boolean',
    default: false,
    description: '初始化配置文件'
  })
  .help('help')
  .version('version', '显示版本信息', version)
  .alias('version', 'v')
  .example('$0 filename.png', '上传资源到 CDN')
  .locale('zh_CN')
  .argv;


const homeDir = os.homedir();
const configFile = path.join(homeDir, '.config', 'resource-uploader', 'config.json');

const showError = (event) => {
  log(colors.red('error!'));

  console.log(event.message);
};

const getConcatName = () => {
  if (argv.name) {
    return argv.name;
  }
  else {
    return 'all' + path.extname(argv._[0]);
  }
};

gulp.task('alioss', (cb) => {

  const isMulti = !!(argv.concat && typeof argv._ === 'object' && argv._.length > 1);

  const aliossOptions = {
    uriPrefix: argv.prefix || '',
    uriName: argv.name || ''
  };

  if (argv.refresh) {
    oss.refresh(aliossOptions, (typeof argv._ === 'object' && argv._.length ? argv._[0]: argv._), argv.outputSimple).then((a) => {
      !argv.outputSimple && log(colors.cyan('done.'));
    }).then(cb);

    return;
  }
  else {
    const toBase64 = (file, enc, cb) => {
      const Datauri = require('datauri');
      const sizeOf = require('image-size');

      if (file.isDirectory() || file.isStream()) {
        return cb();
      }

      try {
        const dimensions = sizeOf(file.path);

        if (!argv.outputSimple && dimensions) {
          log('width:', colors.green(dimensions.width) + 'px', 'height:', colors.green(dimensions.height) + 'px');
        }
      }
      catch (e) {
      }

      const datauri = new Datauri(file.path);

      file.contents = Buffer.from(datauri.content);

      // console.log(datauri.content);

      return cb(null, file);
    };

    const toClipboard = (file, enc, cb) => {
      const copyPaste = require('copy-paste');

      if (file.isDirectory() || file.isStream()) {
        return cb();
      }

      copyPaste.copy(file.contents, function() {
        if (argv.outputSimple) {
          console.log(colors.green(file.path));
        }
        else {
          log('Copy to clipboard is OK:', colors.green(file.path));
        }

        return cb(null, file);
      });
    };

    if (!argv.compress) {
      const run = () => {
        return gulp.src(argv._)
          .pipe($.if(isMulti, $.concat(getConcatName())))
          .pipe($.if(/\.(png|jpg|jpeg|gif|svg)$/i, imagemin([
            imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
            imagemin.jpegtran({ progressive: true }),
            imagemin.optipng({ optimizationLevel: 7 })
          ])).on('error', showError))
      };

      if (argv.dest) {
        return run().pipe($.if(!!argv.name, $.rename(argv.name))).pipe(gulp.dest(argv.dest)).on('data', (file) => {
          if (argv.outputSimple) {
            console.log(colors.green(file.path));
          }
          else {
            log('OK: ' + colors.green(file.path));
          }
        }).on('end', () => {
          !argv.outputSimple && log(colors.cyan('done.'));
        });
      }
      else {
        return run().pipe(oss.upload(aliossOptions, argv.outputSimple)).on('end', () => {
          !argv.outputSimple && log(colors.cyan('done.'));
        });
      }
    }
    else {
      const run = () => {
        return gulp.src(argv._)
          .pipe($.if(/\.(js|css|less|scss|sass)$/i, $.sourcemaps.init()))
          .pipe($.if(isMulti, $.concat(getConcatName())))

          .pipe($.if(/\.(htm|html)$/i, html()))
          .pipe($.if(/\.(htm|html)$/i, inlineCompress()))
          .pipe($.if(/\.(htm|html)$/i, $.htmlmin({
            collapseBooleanAttributes: true,
            removeComments: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            removeRedundantAttributes: true,
            useShortDoctype: true,
            removeEmptyAttributes: true
          })).on('error', showError))

          .pipe($.if(/\.(png|jpg|jpeg|gif|svg)$/i, imagemin([
            imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
            imagemin.jpegtran({ progressive: true }),
            imagemin.optipng({ optimizationLevel: 7 })
          ])).on('error', showError))

          .pipe($.if('*.js', $.babel({
            presets: [
              [
                require.resolve('@babel/preset-env'),
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

          .pipe($.if(/\.less$/i, $.less()).on('error', showError))
          .pipe($.if(/\.less$/i, $.sourcemaps.write({ addComment: false })))
          .pipe($.if(/\.(scss|sass)$/i, $.sass({ outputStyle: 'expanded' })).on('error', $.sass.logError))
          .pipe($.if(/\.(scss|sass)$/i, $.sourcemaps.write({ addComment: false })))
          .pipe($.if(/\.(css|less|scss|sass)$/i, $.postcss([ use({
            modules: [ 'postcss-pxtorem' ],
            options: {
              'postcss-pxtorem': pxtoremDefault
            }
          }), cssnano({
            autoprefixer: false,
            zindex: false,
            reduceIdents: false,
            reduceTransforms: false
          }), autoprefixer({
            browsers
          }) ])))
          .pipe($.if(/\.(css|less|scss|sass)$/i, $.sourcemaps.write({ addComment: false })))
      };

      if (argv.dest) {
        return run()
          .pipe($.if(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toBase64)))
          .pipe($.if(!!argv.name, $.rename(argv.name)))
          .pipe(gulp.dest(argv.dest)).on('data', (file) => {
            if (argv.outputSimple) {
              console.log(colors.green(file.path));
            }
            else {
              log('OK: ' + colors.green(file.path));
            }
          }).on('end', () => {
            !argv.outputSimple && log(colors.cyan('done.'));
          });
      }
      else {
        return run()
          .pipe($.if(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toBase64)))
          .pipe($.if(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toClipboard)))
          .pipe($.if(!argv.base64, oss.upload(aliossOptions, argv.outputSimple))).on('end', () => {
            !argv.outputSimple && log(colors.cyan('done.'));
          });
      }
    }
  }

});

if (argv.initConfig) {
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
  }
}

if (!fs.existsSync(configFile)) {
  const questions = [
    {
      type: 'input',
      name: 'accessKeyId',
      message: '请输入阿里云 OSS AccessKeyId:',
      validate: (value) => {
        if (value.trim() != '') {
          return true;
        }

        return '请输入 AccessKeyId';
      }
    },
    {
      type: 'input',
      name: 'secretAccessKey',
      message: '请输入阿里云 OSS AccessKeySecret:',
      validate: (value) => {
        if (value.trim() != '') {
          return true;
        }

        return '请输入 AccessKeySecret';
      }
    },
    {
      type: 'input',
      name: 'bucket',
      message: '请输入阿里云 OSS Bucket 名称:',
      validate: (value) => {
        if (value.trim() != '') {
          return true;
        }

        return '请输入 Bucket';
      }
    },
    {
      type: 'input',
      name: 'urlPrefix',
      message: '请输入阿里云 OSS 自定义域名(请按 http://domain.com/ 格式输入):',
      validate: (value) => {
        if (value.trim() != '') {
          return true;
        }

        return '请输入自定义域名';
      }
    },
  ];

  inquirer.prompt(questions).then(answers => {
    if (!fs.existsSync(path.join(homeDir, '.config'))) {
      fs.mkdirSync(path.join(homeDir, '.config'))
    }

    if (!fs.existsSync(path.join(homeDir, '.config', 'resource-uploader'))) {
      fs.mkdirSync(path.join(homeDir, '.config', 'resource-uploader'))
    }

    fs.writeFileSync(configFile, JSON.stringify({ alioss: answers }, null, '  '), { mode: 0o600 });

    log(colors.cyan('config saved!'));
  });

  return;
}

if (argv._.length) {
  !argv.outputSimple && log(colors.cyan('starting...'));

  gulp.start('alioss');
}
else {
  yargs.showHelp();
}

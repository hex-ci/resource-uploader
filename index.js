#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import gulp from 'gulp';
import path from 'path';
import fs from 'fs';
import os from 'os';
import process from 'process';
import inquirer from 'inquirer';
import cssnano from 'cssnano';
import autoprefixer from 'autoprefixer';
import chalk from 'chalk';
import log from 'fancy-log';
import through2 from 'through2-concurrent';
import readline from 'readline';
import Datauri from 'datauri';
import sizeOf from 'image-size';
import copyPaste from 'copy-paste';
import * as dartSass from 'sass';
import gulpSass from 'gulp-sass';
import gulpIf from 'gulp-if';
import gulpConcat from 'gulp-concat';
import gulpRename from 'gulp-rename';
import gulpImagemin, { gifsicle, mozjpeg, optipng } from 'gulp-imagemin';
import gulpBabel from 'gulp-babel';
import gulpSourceMaps from 'gulp-sourcemaps';
import gulpPostcss from 'gulp-postcss';
import use from 'postcss-use-plus';

import oss from './lib/alioss.js';
import html from './lib/html.js';
import inlineCompress from './lib/inline-compress.js';
import htmlmin from './lib/gulp-htmlmin.js';
import less from './lib/gulp-less.js';
import javascriptObfuscator from './lib/gulp-javascript-obfuscator.js';
import terser from './lib/gulp-terser.js';
import wrapper from './lib/gulp-wrapper.js';

import pkg from './package.json' with { type: 'json' };

const __dirname = path.resolve();
const sass = gulpSass(dartSass);
const version = pkg.version;
const browsers = pkg.browserslist;
const pxtoremDefault = pkg.pxtorem;

const parsedYargs = yargs(hideBin(process.argv)).usage('用法: $0 [命令] [选项] 文件')
  .command('refresh <URL>', '刷新已存在的 OSS 资源缓存')
  .option('h', {
    alias: 'help',
    description: '显示帮助信息'
  }).option('compress', {
    alias: 'c',
    type: 'boolean',
    default: true,
    description: '是否压缩文件'
  }).option('babel', {
    type: 'boolean',
    default: true,
    description: '是否使用 Babel 转译 JS 文件'
  }).option('iife', {
    type: 'boolean',
    default: false,
    description: 'JS 文件是否使用 IIFE（立即执行函数）包裹，启用压缩选项才可使用'
  }).option('obfuscate', {
    alias: 'o',
    type: 'boolean',
    default: false,
    description: '是否开启 JS 深度混淆'
  }).option('sass', {
    type: 'boolean',
    default: true,
    description: '是否使用 Sass 预处理器'
  }).option('less', {
    type: 'boolean',
    default: true,
    description: '是否使用 Less 预处理器'
  }).option('raw', {
    type: 'boolean',
    default: false,
    description: '是否上传原始文件'
  }).option('concat', {
    type: 'boolean',
    default: false,
    description: '是否合并文件'
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
    description: '是否处理成 base64 内容，而不上传 OSS'
  }).option('dest', {
    type: 'string',
    description: '本机文件系统路径，\n使用此参数将保存文件到指定路径，而不上传 OSS'
  }).option('output-simple', {
    type: 'boolean',
    default: false,
    description: '是否简化控制台输出'
  }).option('config', {
    type: 'string',
    default: '',
    description: '自定义配置文件'
  }).option('init-config', {
    type: 'boolean',
    default: false,
    description: '初始化配置文件'
  })
  .version('version', '显示版本信息', version)
  .alias('version', 'v')
  .example('$0 filename.png', '上传资源到 OSS')
  .example('$0 refresh http://domain.com/filename.png', '刷新已存在的 OSS 资源缓存')
  .help()
  .wrap(95)
  .locale('zh_CN')

const argv = parsedYargs.argv;

const homeDir = os.homedir();
let configFile = path.join(homeDir, '.config', 'resource-uploader', 'config.json');

const showError = (event) => {
  log(chalk.red('error!'));

  console.log(event.message || (event.error && event.error.message));
};

const getConcatName = () => {
  if (argv.name) {
    return argv.name;
  }
  else {
    return 'all' + path.extname(argv._[0]);
  }
};

const clearConsole = () => {
  if (process.stdout.isTTY) {
    const blank = '\n'.repeat(process.stdout.rows)
    console.log(blank)
    readline.cursorTo(process.stdout, 0, 0)
    readline.clearScreenDown(process.stdout)
  }
}

if (argv.config) {
  configFile = argv.config;
}

if (argv.raw) {
  argv.compress = false;
  argv.babel = false;
  argv.iife = false;
  argv.sass = false;
  argv.less = false;
}

const aliossOptions = {
  uriPrefix: argv.prefix || '',
  uriName: argv.name || ''
};

gulp.on('error', showError);

// 上传资源到 OSS
const uploadTask = gulp.series(() => {

  const isMulti = !!(argv.concat && typeof argv._ === 'object' && argv._.length > 1);

  const toBase64 = (file, enc, cb) => {
    if (file.isDirectory() || file.isStream()) {
      return cb();
    }

    try {
      const buffer = fs.readFileSync(file.path);
      const dimensions = sizeOf(buffer);

      if (!argv.outputSimple && dimensions) {
        log('width:', chalk.green(dimensions.width) + 'px', 'height:', chalk.green(dimensions.height) + 'px');
      }
    }
    catch (e) {
    }

    const datauri = new Datauri(file.path);

    datauri.then((result) => {
      file.contents = Buffer.from(result);

      cb(null, file);
    });
  };

  const toClipboard = (file, enc, cb) => {
    if (file.isDirectory() || file.isStream()) {
      return cb();
    }

    copyPaste.copy(file.contents, function() {
      if (argv.outputSimple) {
        console.log(chalk.green(file.path));
      }
      else {
        log('Copy to clipboard is OK:', chalk.green(file.path));
      }

      return cb(null, file);
    });
  };

  const run = () => {
    return gulp.src(argv._, { encoding: false }).on('error', showError)
      .pipe(gulpIf(file => !argv.raw && /\.(js|css|less|scss|sass)$/i.test(file.path), gulpSourceMaps.init()))
      .pipe(gulpIf(isMulti, gulpConcat(getConcatName())))

      .pipe(gulpIf(/\.(htm|html)$/i, html(argv)))
      .pipe(gulpIf(file => argv.compress && /\.(htm|html)$/i.test(file.path), inlineCompress()))
      .pipe(gulpIf(file => argv.compress && /\.(htm|html)$/i.test(file.path), htmlmin({
        collapseBooleanAttributes: true,
        removeComments: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true
      })).on('error', showError))

      .pipe(gulpIf(file => argv.compress && /\.(png|jpg|jpeg|gif|svg)$/i.test(file.path), gulpImagemin([
        gifsicle({ interlaced: true, optimizationLevel: 3 }),
        mozjpeg({ progressive: true }),
        optipng({ optimizationLevel: 7, autoInterlacedMinSize: 1024 * 50 })
      ], { silent: true })).on('error', showError))

      .pipe(gulpIf(file => argv.babel && /\.js$/i.test(file.path), gulpBabel({
        cwd: __dirname,
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

      .pipe(gulpIf(file => argv.less && /\.less$/i.test(file.path), less()).on('error', showError))
      .pipe(gulpIf(file => argv.less && /\.less$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.sass && /\.(scss|sass)$/i.test(file.path), sass({ style: 'expanded' })).on('error', sass.logError))
      .pipe(gulpIf(file => argv.sass && /\.(scss|sass)$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

      .pipe(gulpIf(file => argv.compress && /\.(css|less|scss|sass)$/i.test(file.path), gulpPostcss([ use.default({
        ruleName: 'postcss-use',
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
      .pipe(gulpIf(file => argv.compress && /\.(css|less|scss|sass)$/i.test(file.path), gulpSourceMaps.write({ addComment: false })))

  };

  if (argv.dest) {
    return run()
      .pipe(gulpIf(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toBase64)))
      .pipe(gulpIf(!!argv.name, gulpRename(argv.name)))
      .pipe(gulp.dest(argv.dest)).on('data', (file) => {
        if (argv.outputSimple) {
          console.log(chalk.green(file.path));
        }
        else {
          log('OK: ' + chalk.green(file.path));
        }
      }).on('end', () => {
        !argv.outputSimple && log(chalk.cyan('done.'));
      });
  }
  else {
    return run()
      .pipe(gulpIf(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toBase64)))
      .pipe(gulpIf(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toClipboard)))
      .pipe(gulpIf(!argv.base64, oss.upload(aliossOptions, argv.outputSimple))).on('end', () => {
        !argv.outputSimple && log(chalk.cyan('done.'));
      });
  }

});

// 刷新 OSS 资源
const refreshTask = gulp.series(cb => {
  oss.refresh(aliossOptions, argv.url, argv.outputSimple).then(() => {
    !argv.outputSimple && log(chalk.cyan('done.'));
  }).then(cb);
});

if (argv.initConfig) {
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
  }
}

if (!fs.existsSync(configFile)) {
  clearConsole();
  console.log(chalk.whiteBright(`\n欢迎使用 Resource Uploader v${version}\n`));
  console.log(chalk.white(`请设置阿里云 OSS 相关信息：\n`));

  const questions = [
    {
      type: 'input',
      name: 'accessKeyId',
      message: '请输入阿里云 OSS AccessKeyId:',
      filter: value => value.trim(),
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
      filter: value => value.trim(),
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
      filter: value => value.trim(),
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
      filter: value => value.trim(),
      validate: (value) => {
        if (value.trim() === '') {
          return '请输入自定义域名';
        }
        if (!value.trim().endsWith('/')) {
          return '自定义域名需要以 / 结尾';
        }

        return true;
      }
    }
  ];

  inquirer.prompt(questions).then(answers => {
    if (!fs.existsSync(path.join(homeDir, '.config'))) {
      fs.mkdirSync(path.join(homeDir, '.config'))
    }

    if (!fs.existsSync(path.join(homeDir, '.config', 'resource-uploader'))) {
      fs.mkdirSync(path.join(homeDir, '.config', 'resource-uploader'))
    }

    oss.getBucketLocation(answers).then(({ isSuccess, data }) => {
      if (isSuccess) {
        answers.endpoint = `http://${data.LocationConstraint}.aliyuncs.com`;

        fs.writeFileSync(configFile, JSON.stringify({ alioss: answers }, null, '  '), { mode: 0o600 });

        console.log(chalk.green('\n配置保存成功。\n'));
      }
      else {
        console.log(chalk.red('\n' + data.message));
        console.log(chalk.red('\n获取 Bucket 数据中心失败！请重新配置 Resource Uploader！\n'));
      }
    });

  });
}
else {
  if (argv.config) {
    oss.setConfigFile(argv.config);
  }

  if (argv._.length) {
    !argv.outputSimple && log(chalk.cyan('starting...'));

    if (argv._[0] === 'refresh') {
      if (argv.url) {
        refreshTask();
      }
      else {
        parsedYargs.showHelp('log');
      }
    }
    else {
      uploadTask();
    }
  }
  else {
    parsedYargs.showHelp('log');
  }
}

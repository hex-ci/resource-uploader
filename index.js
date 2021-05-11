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
const chalk = require('chalk');
const log = require('fancy-log');
const through2 = require('through2-concurrent');
const use = require('postcss-use');
const readline = require('readline');

const oss = require('./lib/alioss');
const html = require('./lib/html');
const inlineCompress = require('./lib/inline-compress');
const imagemin = require('./lib/imagemin');
const htmlmin = require('./lib/gulp-htmlmin');
const less = require('./lib/gulp-less');
const sass = require('./lib/gulp-sass');
const javascriptObfuscator = require('./lib/gulp-javascript-obfuscator');
const terser = require('./lib/gulp-terser');
const wrapper = require('./lib/gulp-wrapper');

const pkg = require('./package.json');

const version = pkg.version;
const browsers = pkg.browserslist;
const pxtoremDefault = pkg.pxtorem;
const babelPlugins = pkg.babelPlugins.map(item => {
  if (Array.isArray(item)) {
    item[0] = require.resolve(item[0], { paths: [__dirname] })
  }
  else {
    item = require.resolve(item, { paths: [__dirname] })
  }

  return item;
});

const $ = gulpLoadPlugins();

const argv = yargs.usage('用法: $0 [命令] [选项] 文件')
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
    default: true,
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
  .argv;


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
    const Datauri = require('datauri');
    const sizeOf = require('image-size');

    if (file.isDirectory() || file.isStream()) {
      return cb();
    }

    try {
      const dimensions = sizeOf(file.path);

      if (!argv.outputSimple && dimensions) {
        log('width:', chalk.green(dimensions.width) + 'px', 'height:', chalk.green(dimensions.height) + 'px');
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
        console.log(chalk.green(file.path));
      }
      else {
        log('Copy to clipboard is OK:', chalk.green(file.path));
      }

      return cb(null, file);
    });
  };

  const run = () => {
    return gulp.src(argv._).on('error', showError)
      .pipe($.if(file => !argv.raw && /\.(js|css|less|scss|sass)$/i.test(file.path), $.sourcemaps.init()))
      .pipe($.if(isMulti, $.concat(getConcatName())))

      .pipe($.if(/\.(htm|html)$/i, html(argv)))
      .pipe($.if(file => argv.compress && /\.(htm|html)$/i.test(file.path), inlineCompress()))
      .pipe($.if(file => argv.compress && /\.(htm|html)$/i.test(file.path), htmlmin({
        collapseBooleanAttributes: true,
        removeComments: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true
      })).on('error', showError))

      .pipe($.if(file => argv.compress && /\.(png|jpg|jpeg|gif|svg)$/i.test(file.path), imagemin([
        imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
        imagemin.jpegtran({ progressive: true }),
        imagemin.optipng({ optimizationLevel: 7 })
      ])).on('error', showError))

      .pipe($.if(file => argv.babel && /\.js$/i.test(file.path), $.babel({
        cwd: __dirname,
        babelrc: false,
        compact: false,
        plugins: babelPlugins,
        presets: [
          [
            require.resolve('@babel/preset-env', { paths: [__dirname] }), {
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
      .pipe($.if(file => argv.compress && /\.(css|less|scss|sass)$/i.test(file.path), $.sourcemaps.write({ addComment: false })))

  };

  if (argv.dest) {
    return run()
      .pipe($.if(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toBase64)))
      .pipe($.if(!!argv.name, $.rename(argv.name)))
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
      .pipe($.if(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toBase64)))
      .pipe($.if(!!argv.base64, through2.obj({ maxConcurrency: 8 }, toClipboard)))
      .pipe($.if(!argv.base64, oss.upload(aliossOptions, argv.outputSimple))).on('end', () => {
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
        if (value.trim() != '') {
          return true;
        }

        return '请输入自定义域名';
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
        yargs.showHelp('log');
      }
    }
    else {
      uploadTask();
    }
  }
  else {
    yargs.showHelp('log');
  }
}

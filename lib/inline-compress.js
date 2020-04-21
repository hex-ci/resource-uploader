const path = require('path');
const through2 = require('through2-concurrent');
const htmlparser = require("htmlparser2");
const _ = require('lodash');
const cssnano = require('cssnano');
const uglify = require('uglify-js');
const crypto = require('crypto');
const babel = require('@babel/core');
const sass = require('node-sass');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const use = require('postcss-use');
const log = require('fancy-log');
const chalk = require('chalk');
const PluginError = require('plugin-error');

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

const getHash = function(str) {
  return crypto.createHash('md5').update(str).digest('hex');
};

const getStub = function(seed) {
  return '___inline_code$$$' + getHash(seed) + '$$$___';
};

RegExp.escape = function(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

module.exports = function() {
  const reScript = /<script(?:\s+?[^>]+?|[\s]*?)>[\s\S]*?<\/script>/ig;
  const reStyle = /<style(?:\s+?[^>]+?|[\s]*?)>[\s\S]*?<\/style>/ig;

  return through2.obj({ maxConcurrency: 8 }, function(file, enc, cb) {
    let contents;
    let element;
    const queue = [];

    if (file.isNull()) {
      cb();
      return;
    }

    if (file.isStream()) {
      cb(new PluginError('Inline', 'Streaming not supported'));
      return;
    }

    //gutil.log(gutil.colors.green(file.path));

    contents = file.contents.toString();

    contents = contents.replace(reScript, function(content) {
      element = htmlparser.parseDOM(content)[0];

      if (!element || _.isString(element.attribs.src) || !element.children.length || (_.isString(element.attribs.type) && element.attribs.type != 'text/javascript')) {
        return content;
      }

      if (_.isString(element.attribs.nocompress)) {
        delete element.attribs.nocompress;
        return htmlparser.DomUtils.getOuterHTML(element);
      }

      if (element.children.length == 0) {
        return content;
      }

      let js = element.children[0].data;
      let result;

      js = js.trim();

      //console.log(js);

      try {
        try {
          const compileResult = babel.transform(js, {
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
          });

          if (compileResult.code) {
            js = compileResult.code;
          }
        }
        catch (e) {
        }

        result = uglify.minify(js, {
          ie8: true,
          compress: {
            drop_debugger: true,
            drop_console: true,
            warnings: true
          }
        });

        if (result.code) {
          element.children[0].data = result.code;
        }
        else {
          return content;
        }
      }
      catch (e) {
        return content;
      }

      return htmlparser.DomUtils.getOuterHTML(element);
    }).replace(reStyle, function(content) {
      element = htmlparser.parseDOM(content)[0];

      if (!element) {
        return content;
      }

      if (_.isString(element.attribs.nocompress)) {
        delete element.attribs.nocompress;
        return htmlparser.DomUtils.getOuterHTML(element);
      }

      if (element.children.length == 0) {
        return content;
      }

      const needCompile = (element.attribs.type == 'text/sass' || element.attribs.type == 'text/scss');
      const isSass = (element.attribs.type == 'text/sass');

      let css = element.children[0].data;

      css = css.trim();

      const hash = getHash(css);
      const name = getStub(content);

      if (needCompile) {
        try {
          const sassResult = sass.renderSync({
            data: css,
            indentedSyntax: isSass,
            includePaths: [file.base],
            outputStyle: 'expanded'
          });

          if (sassResult.css) {
            element.attribs.type = 'text/css';
            css = sassResult.css;
          }
        }
        catch (e) {
          log('Sass error: ', file.path, chalk.red(e.message));
        }
      }

      queue.push({
        name: name,
        text: css,
        hash: hash
      });

      element.children[0].data = name;

      //console.log(htmlparser.DomUtils.getOuterHTML(element));

      return htmlparser.DomUtils.getOuterHTML(element);
    });


    let len = 0;
    const run = function() {
      postcss([use({
        modules: [ 'postcss-pxtorem' ],
        options: {
          'postcss-pxtorem': pxtoremDefault
        }
      }), cssnano({
        autoprefixer: false,
        zindex: false,
        reduceIdents: false,
        reduceTransforms: false
      }), autoprefixer({ overrideBrowserslist: browsers })]).process(queue[len].text, { from: undefined }).then(function(result) {
        contents = contents.replace(new RegExp(RegExp.escape(queue[len].name), 'g'), () => result.css);

        len++;
        if (len >= queue.length) {

          file.contents = new Buffer(contents);

          return cb(null, file);
        }
        else {
          run();
        }
      }, function() {
        contents = contents.replace(new RegExp(RegExp.escape(queue[len].name), 'g'), () => queue[len].text);

        len++;
        if (len >= queue.length) {

          file.contents = new Buffer(contents);

          return cb(null, file);
        }
        else {
          run();
        }
      });
    };

    if (queue.length > 0) {
      return run();
    }
    else {
      file.contents = new Buffer(contents);

      return cb(null, file);
    }
  });
};

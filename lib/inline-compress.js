import path from 'path';
import through2 from 'through2-concurrent';
import * as htmlparser from "htmlparser2";
import _ from 'lodash';
import cssnano from 'cssnano';
import * as terser from 'terser';
import crypto from 'crypto';
import babel from '@babel/core';
import * as sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import log from 'fancy-log';
import chalk from 'chalk';
import PluginError from 'plugin-error';
import renderHTML from 'dom-serializer';
import use from 'postcss-use-plus';

import pkg from '../package.json' with { type: 'json' };

const __dirname = path.resolve();

const browsers = pkg.browserslist;
const pxtoremDefault = pkg.pxtorem;

const getHash = function(str) {
  return crypto.createHash('md5').update(str).digest('hex');
};

const getStub = function(seed) {
  return '___inline_code$$$' + getHash(seed) + '$$$___';
};

RegExp.escape = function(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

export default function() {
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
      element = htmlparser.parseDocument(content).children[0];

      if (!element || _.isString(element.attribs.src) || !element.children.length || (_.isString(element.attribs.type) && element.attribs.type != 'text/javascript')) {
        return content;
      }

      if (_.isString(element.attribs.nocompress)) {
        delete element.attribs.nocompress;
        return renderHTML(element);
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
            presets: [
              [
                '@babel/preset-env',
                {
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

        result = terser.minify(js, {
          ie8: true,
          safari10: true,
          compress: {
            drop_console: true
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

      return renderHTML(element);
    }).replace(reStyle, function(content) {
      element = htmlparser.parseDocument(content).children[0];

      if (!element) {
        return content;
      }

      if (_.isString(element.attribs.nocompress)) {
        delete element.attribs.nocompress;
        return renderHTML(element);
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
          const sassResult = sass.compileString(css, {
            syntax: isSass,
            loadPaths: [file.base],
            style: 'expanded'
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

      return renderHTML(element);
    });


    let len = 0;
    const run = function() {
      postcss([use.default({
        ruleName: 'postcss-use',
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

          file.contents = Buffer.from(contents);

          return cb(null, file);
        }
        else {
          run();
        }
      }, function() {
        contents = contents.replace(new RegExp(RegExp.escape(queue[len].name), 'g'), () => queue[len].text);

        len++;
        if (len >= queue.length) {

          file.contents = Buffer.from(contents);

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
      file.contents = Buffer.from(contents);

      return cb(null, file);
    }
  });
};

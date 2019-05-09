const fs = require('fs');
const path = require('path');
const url = require('url');
const htmlparser = require('htmlparser2');
const _ = require('lodash');
const shortid = require('shortid');
const crypto = require('crypto');

RegExp.escape = function(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

const getHash = str => crypto.createHash('md5').update(str).digest('hex');

const getCdnName = (name) => {
  return '___cdn_name$$$' + getHash(name) + '$$$___';
};

const getFullPath = (rootPath, currentPath, filePath) => {
  const urlObject = url.parse(filePath);
  let fullPath;

  filePath = unescape(urlObject.pathname);

  if (urlObject.protocol) {
    // CDN资源
    fullPath = '';
  }
  else if (/^\/[^/\s]/.test(filePath)) {
    fullPath = path.resolve(rootPath, filePath.slice(1));
  }
  else {
    fullPath = path.resolve(currentPath, filePath);
  }

  return fullPath;
};

const fileExists = (filepath) => {
  try {
    return fs.statSync(filepath).isFile();
  }
  catch (e) {
    return false;
  }
};

const isInvalid = (filepath) => {
  return !!(
    filepath == ''
    || filepath.indexOf('base64,') > -1
    || filepath.indexOf('about:blank') > -1
    || filepath.indexOf('//') > -1
    || filepath.indexOf('http://') > -1
    || filepath.indexOf('https://') > -1
  );
};

const css = function(file, options) {
  options = options || {};

  const asset = options.asset || file.base;

  const reCssUrl = /url\(['"]?(.+?)['"]?\)/ig;

  const queue = [];

  let contents, fullPath, cdnName;

  // const noCdnStub = '[___nocdn~' + shortid.generate() + String((new Date()).getTime() + Math.floor(Math.random() * 9999)) + '___]';
  // const reNoCdnStub = new RegExp(RegExp.escape(noCdnStub), 'gi');

  if (file.isNull()) {
    return;
  }

  if (file.isStream()) {
    return;
  }

  const mainPath = path.dirname(file.path);

  //gutil.log(gutil.colors.green(file.path));

  contents = file.contents.toString();

  contents = contents.replace(reCssUrl, function(content, filePath) {
    let newFilePath = filePath.replace(/['"]*/g, "").trim();
    const urlObject = url.parse(newFilePath);

    if (isInvalid(newFilePath)) {
      return content;
    }

    newFilePath = urlObject.pathname;

    fullPath = getFullPath(asset, mainPath, newFilePath);

    if (fileExists(fullPath)) {
      //gutil.log('replacing image ' + newFilePath + ' version in css file: ' + file.path);

      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });

      return `url(${cdnName})`;
    }
    else {
      return content;
    }
  });

  file.contents = new Buffer(contents);

  return queue;
};


const html = function(file, options) {
  options = options || {};

  const asset = options.asset || file.base;

  const reLink = /<link(?:\s+?[^>]+?\s+?|\s+?)href\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?)>/ig;
  const reScript = /<script(?:\s+?[^>]+?\s+?|\s+?)src\s*?=\s*?"[^"]+?"(?:\s+?[^>]+?\s*?|\s*?)>\s*?<\/script>/ig;
  const reImg = /<img(?:\s+?.+?\s+?|\s+?)src\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  const reEmbed = /<embed(?:\s+?.+?\s+?|\s+?)src\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  const reParam = /<param(?:\s+?.+?\s+?|\s+?)value\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  const reObject = /<object(?:\s+?.+?\s+?|\s+?)data\s*?=\s*?".+?"(?:\s+?.+?\s*?|\s*?|\s*\/)>/ig;
  const reStyle = /<style(?:\s+?[^>]+?|[\s]*?)>([\s\S]*?)<\/style>/ig;
  const reCssUrl = /url\(['"]?(.+?)['"]?\)/ig;
  const reCommon = new RegExp('["\'\\(]\\s*([\\w\\_/\\.\\-]+\\.(' + (options.exts ? options.exts.join('|') : 'jpg|jpeg|png|gif|cur|js|css|swf|eot|woff|ttf|svg') + '))([^\\)"\']*)\\s*[\\)"\']', 'gim');

  const queue = [];

  let contents, element, filePath, fullPath, cdnName;

  const noCdnStub = '[___nocdn~' + shortid.generate() + String((new Date()).getTime() + Math.floor(Math.random() * 9999)) + '___]';
  const reNoCdnStub = new RegExp(RegExp.escape(noCdnStub), 'gi');

  if (file.isNull()) {
    return;
  }

  if (file.isStream()) {
    return;
  }

  const mainPath = path.dirname(file.path);
  // const extname = path.extname(file.path);

  //gutil.log(gutil.colors.green(file.path));

  contents = file.contents.toString();

  contents = contents.replace(reLink, function(content) {
    element = htmlparser.parseDOM(content)[0];

    if (!element) {
      return content;
    }

    if (_.isString(element.attribs.nocdn)) {
      delete element.attribs.nocdn;
      element.attribs.href += noCdnStub;
      return htmlparser.DomUtils.getOuterHTML(element);
    }

    filePath = element.attribs.href || '';

    if (isInvalid(filePath)) {
      return content;
    }

    fullPath = getFullPath(asset, mainPath, filePath);

    if (fileExists(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });
      element.attribs.href = cdnName;

      return htmlparser.DomUtils.getOuterHTML(element);
    }
    else {
      return content;
    }
  }).replace(reScript, function(content) {
    element = htmlparser.parseDOM(content)[0];

    if (!element) {
      return content;
    }

    if (_.isString(element.attribs.nocdn)) {
      delete element.attribs.nocdn;
      element.attribs.src += noCdnStub;
      return htmlparser.DomUtils.getOuterHTML(element);
    }

    filePath = element.attribs.src || '';

    if (isInvalid(filePath)) {
      return content;
    }

    fullPath = getFullPath(asset, mainPath, filePath);

    if (fileExists(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });
      element.attribs.src = cdnName;

      return htmlparser.DomUtils.getOuterHTML(element);
    }
    else {
      return content;
    }
  }).replace(reImg, function(content) {
    element = htmlparser.parseDOM(content)[0];

    if (!element) {
      return content;
    }

    if (_.isString(element.attribs.nocdn)) {
      delete element.attribs.nocdn;
      element.attribs.src += noCdnStub;
      return htmlparser.DomUtils.getOuterHTML(element);
    }

    filePath = element.attribs.src || '';

    fullPath = getFullPath(asset, mainPath, filePath);

    if (fileExists(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });
      element.attribs.src = cdnName;

      return htmlparser.DomUtils.getOuterHTML(element);
    }
    else {
      return content;
    }
  }).replace(reParam, function(content) {
    element = htmlparser.parseDOM(content)[0];

    if (!element) {
      return content;
    }

    if (_.isString(element.attribs.nocdn)) {
      delete element.attribs.nocdn;
      element.attribs.value += noCdnStub;
      return htmlparser.DomUtils.getOuterHTML(element);
    }

    filePath = element.attribs.value || '';
    fullPath = getFullPath(asset, mainPath, filePath);

    if (fileExists(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });
      element.attribs.value = cdnName;

      return htmlparser.DomUtils.getOuterHTML(element);
    }
    else {
      return content;
    }
  }).replace(reObject, function(content) {
    element = htmlparser.parseDOM(content)[0];

    if (!element) {
      return content;
    }

    if (_.isString(element.attribs.nocdn)) {
      delete element.attribs.nocdn;
      element.attribs.data += noCdnStub;
      // object 标签替换的返回值需要手动去掉 </object>
      return htmlparser.DomUtils.getOuterHTML(element).replace('</object>', '');
    }

    filePath = element.attribs.data || '';
    fullPath = getFullPath(asset, mainPath, filePath);

    if (fileExists(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });
      element.attribs.data = cdnName;

      // object 标签替换的返回值需要手动去掉 </object>
      return htmlparser.DomUtils.getOuterHTML(element).replace('</object>', '');
    }
    else {
      return content;
    }
  }).replace(reStyle, function(text) {
    return text.replace(reCssUrl, function(content, filePath) {
      let newFilePath = filePath.replace(/['"]*/g, '').trim();
      const urlObject = url.parse(newFilePath);

      if (isInvalid(newFilePath)) {
        return content;
      }

      newFilePath = urlObject.pathname;

      fullPath = getFullPath(asset, mainPath, newFilePath);

      if (fileExists(fullPath)) {
        cdnName = getCdnName(fullPath);
        queue.push({
          name: cdnName,
          path: fullPath
        });

        return `url(${cdnName})`;
      }
      else {
        return content;
      }
    });
  }).replace(reEmbed, function(content) {
    element = htmlparser.parseDOM(content)[0];

    if (!element) {
      return content;
    }

    if (_.isString(element.attribs.nocdn)) {
      delete element.attribs.nocdn;
      element.attribs.src += noCdnStub;
      return htmlparser.DomUtils.getOuterHTML(element);
    }

    filePath = element.attribs.src || '';

    fullPath = getFullPath(asset, mainPath, filePath);

    if (fileExists(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });
      element.attribs.src = cdnName;

      return htmlparser.DomUtils.getOuterHTML(element);
    }
    else {
      return content;
    }
  }).replace(reCommon, function(content, filePath, ext, other) {
    if (isInvalid(filePath)) {
      return content;
    }

    // 带 nocdn 标记的自动忽略
    if (reNoCdnStub.test(other)) {
      return content.replace(reNoCdnStub, '');
    }

    const fullPath = getFullPath(asset, mainPath, filePath);

    if (fs.existsSync(fullPath)) {
      cdnName = getCdnName(fullPath);
      queue.push({
        name: cdnName,
        path: fullPath
      });

      return content.replace(other, '').replace(filePath, cdnName.replace(/\$/g, '$$$$'));
    }
    else {
      return content;
    }
  }).replace(reNoCdnStub, '');

  //console.log(contents);

  file.contents = new Buffer(contents);

  return queue;
};

module.exports = {
  html,
  css
};

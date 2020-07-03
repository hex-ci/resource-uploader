const fs = require('fs');
const path = require('path');
const through2 = require('through2-concurrent');
const PluginError = require('plugin-error');
const chalk = require('chalk');
const log = require('fancy-log');
const ALY = require('aliyun-sdk');
const Moment = require('moment');
const crypto = require('crypto');
const _ = require('lodash');
const zlib = require('zlib');
const sizeOf = require('image-size');
const os = require('os');
const pinyin = require('pinyin');
const url = require('url');
const mime = require('mime');

const userInfo = os.userInfo();

let configFile = path.join(os.homedir(), '.config', 'resource-uploader', 'config.json');
let cacheFile = path.join(os.tmpdir(), `resource-uploader-manifest-${userInfo.username}.json`);

let aliossOptions = require('../package.json').alioss;

let cdnCache = {};

mime.define({
  'application/xml': ['plist']
});

const sha1 = str => crypto.createHash('md5').update(str).digest('hex').slice(16);

const getPinyin = str => {
  const ext = path.extname(str);
  const name = path.basename(str, ext);

  return name.split('-').map(item => pinyin(item, {
    style: pinyin.STYLE_NORMAL,
    segment: true
  }).join('-')).join('-') + ext;
};

const encodeUrl = str => url.format(url.parse(str));

const getHashName = (name, hash) => {
  return hash + '/' + getPinyin(name);
};

const getHashCdnName = (hashName) => {
  return '-/' + hashName;
};

// 用于外部获取 CDN URL
const getCdnUrl = (filepath) => {
  const name = path.basename(filepath);
  const hash = sha1(fs.readFileSync(filepath));

  return aliossOptions.urlPrefix + getHashCdnName(getHashName(name, hash));
};

const putObject = (instance, options) => new Promise((resolve) => {
  instance.putObject(options, (err) => {
    if (err) {
      err.isSuccess = false;
      resolve(err);
    }
    else {
      resolve({ isSuccess: true });
    }
  });
});

const refreshObject = (instance, options) => new Promise((resolve) => {
  instance.refreshObjectCaches(options, (err) => {
    if (err) {
      err.isSuccess = false;
      resolve(err);
    }
    else {
      resolve({ isSuccess: true });
    }
  });
});

const mergeAliossOptions = () => {
  if (fs.existsSync(configFile)) {
    aliossOptions = Object.assign({}, aliossOptions, JSON.parse(fs.readFileSync(configFile)).alioss);
  }
};

const refresh = async(options, url, isQuiet = false) => {
  mergeAliossOptions();

  options = Object.assign({}, aliossOptions, options);

  const cdnClient = new ALY.CDN({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpointCdn,
    apiVersion: options.apiVersionCdn
  });

  const result = await refreshObject(cdnClient, {
    ObjectType: 'File',
    ObjectPath: url
  });

  if (result.isSuccess) {
    if (isQuiet) {
      console.log(chalk.green(encodeUrl(url)));
    }
    else {
      log('OK:', chalk.green(encodeUrl(url)));
    }
  }
  else {
    log('Refresh CDN ERR:', chalk.red(encodeUrl(url)));
  }
};

const getBucketLocation = (options) => new Promise((resolve) => {
  options = Object.assign({}, aliossOptions, options);

  const ossClient = new ALY.OSS({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpoint,
    apiVersion: options.apiVersion
  });

  ossClient.getBucketLocation({ Bucket: options.bucket }, (err, data) => {
    if (err) {
      resolve({ isSuccess: false, data: err });
    }
    else {
      resolve({ isSuccess: true, data });
    }
  });
});

const upload = (options, isQuiet = false) => {
  mergeAliossOptions();

  options = Object.assign({}, aliossOptions, options);

  const ossClient = new ALY.OSS({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpoint,
    apiVersion: options.apiVersion
  });

  const cdnClient = new ALY.CDN({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpointCdn,
    apiVersion: options.apiVersionCdn
  });

  try {
    cdnCache = _(cdnCache).merge(JSON.parse(fs.readFileSync(cacheFile))).value();
  }
  catch (e) {
  }

  return through2.obj({ maxConcurrency: 8 }, async function(file, enc, cb) {
    if (file.isDirectory()) {
      return cb();
    }

    if (file.isStream()) {
      this.emit('error', new PluginError('alioss', 'Streams are not supported!'));
      return cb();
    }

    if (file.noCdn) {
      return cb(null, file);
    }

    if (file.contents.length >= 1024 * 1024 * 100) {
      log('file size too big:', chalk.yellow(file.path + "\t" + file.contents.length));

      return cb(null, file);
    }

    const ext = path.extname(file.path);
    let name;
    let filename;
    let hash;
    let hashName;
    let cdnKey;
    let dimensions;

    try {
      dimensions = sizeOf(file.path);
    }
    catch (e) {
    }

    if (options.uriPrefix) {
      name = options.uriName || path.relative(file.base, file.path);
      filename = '!/' + options.uriPrefix + '/' + getPinyin(name).toLowerCase();

      file.cdn = options.urlPrefix + filename;
    }
    else {
      name = path.basename(file.path);
      hash = sha1(file.contents);
      hashName = getHashName(name, hash);
      filename = getHashCdnName(hashName).toLowerCase();
      cdnKey = hashName;

      file.cdn = options.urlPrefix + filename;

      if (cdnCache[cdnKey]) {
        if (isQuiet) {
          console.log(chalk.green(encodeUrl(options.urlPrefix + filename)));
        }
        else {
          if (dimensions) {
            log('width:', chalk.green(dimensions.width) + 'px', 'height:', chalk.green(dimensions.height) + 'px');
          }

          log('OK:', chalk.green(encodeUrl(options.urlPrefix + filename)));
        }

        return cb(null, file);
      }
    }

    if (file.sourceMap) {
      if (options.uriPrefix && options.uriName) {
        file.sourceMap.sources = [name];
        file.sourceMap.file = name;
      }

      file.contents = Buffer.concat([
        file.contents,
        new Buffer('\n' + (ext === '.css' ? '/*# sourceMappingURL=' + name + '.map */' : '//# sourceMappingURL=' + name + '.map'))
      ]);
    }

    let contentType = '';

    const gzipMimes = {
      '.plist': 6,
      '.html': 6,
      '.htm': 6,
      '.js': 6,
      '.css': 6,
      '.svg': 6
    };

    const charsetMimes = {
      '.js': 'utf-8',
      '.css': 'utf-8',
      '.html': 'utf-8',
      '.htm': 'utf-8',
      '.svg': 'utf-8'
    };

    contentType = mime.getType(ext) || 'application/octet-stream';

    if (charsetMimes[ext]) {
      contentType += '; charset=' + charsetMimes[ext];
    }

    //console.log(filename);

    const opt = {
      Bucket: options.bucket,
      Key: filename,
      Body: file.contents,
      AccessControlAllowOrigin: '*',
      ContentType: contentType,
      CacheControl: 'max-age=315360000',
      Expires: Moment().add(10, 'years').unix()
    };

    if (gzipMimes[ext]) {
      opt.ContentEncoding = 'gzip';
      opt.Body = zlib.gzipSync(file.contents, {level: gzipMimes[ext]});
    }

    let isSuccess;
    let code = 0;

    ({ isSuccess, code } = await putObject(ossClient, opt));

    if (isSuccess) {
      if (isQuiet) {
        console.log(chalk.green(encodeUrl(file.cdn)));
      }
      else {
        if (dimensions) {
          log('width:', chalk.green(dimensions.width) + 'px', 'height:', chalk.green(dimensions.height) + 'px');
        }

        log('OK:', chalk.green(encodeUrl(file.cdn)));
      }

      if (file.sourceMap) {
        await putObject(ossClient, {
          Bucket: options.bucket,
          Key: filename + '.map',
          Body: JSON.stringify(file.sourceMap),
          AccessControlAllowOrigin: '*',
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'max-age=315360000',
          Expires: Moment().add(10, 'years').unix()
        });

        if (options.uriPrefix) {
          ({ isSuccess } = await refreshObject(cdnClient, {
            ObjectType: 'File',
            ObjectPath: options.urlPrefix + filename
          }));

          if (!isSuccess) {
            log('Refresh CDN ERR:', chalk.red(encodeUrl(filename)));
          }

          ({ isSuccess } = await refreshObject(cdnClient, {
            ObjectType: 'File',
            ObjectPath: options.urlPrefix + filename + '.map'
          }));

          if (!isSuccess) {
            log('Refresh CDN ERR:', chalk.red(encodeUrl(filename) + '.map'));
          }

          cb();
        }
        else {
          cdnCache[cdnKey] = true;

          cb(null, file);
        }
      }
      else {
        if (options.uriPrefix) {
          ({ isSuccess } = await refreshObject(cdnClient, {
            ObjectType: 'File',
            ObjectPath: options.urlPrefix + filename
          }));

          if (!isSuccess) {
            log('Refresh CDN ERR:', chalk.red(encodeUrl(filename)));
          }

          cb();
        }
        else {
          cdnCache[cdnKey] = true;

          cb(null, file);
        }
      }
    }
    else {
      log('ERR:', chalk.red(encodeUrl(filename) + "\t" + code));

      cb();
    }
  }, (cb) => {
    fs.writeFileSync(cacheFile, JSON.stringify(cdnCache, null, '  '));

    cb();
  });
};

const setConfigFile = (filename) => {
  if (filename) {
    configFile = filename;

    const hash = sha1(fs.readFileSync(filename));

    cacheFile = path.join(os.tmpdir(), `resource-uploader-manifest-${userInfo.username}-${hash}.json`);
  }
};

module.exports = {
  upload,
  refresh,
  getCdnUrl,
  getBucketLocation,
  setConfigFile
};

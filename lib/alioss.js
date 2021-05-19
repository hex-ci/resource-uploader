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
const mime = require('mime');
const url = require('url');

const userInfo = os.userInfo();

const sha1 = str => crypto.createHash('md5').update(str).digest('hex').slice(16);

const getConfigFileHash = (file) => {
  let content = '';

  try {
    content = fs.readFileSync(file).toString();
  }
  catch (error) {
    content = '';
  }

  return sha1(`${userInfo.username}${content}`);
};

let configFile = path.join(os.homedir(), '.config', 'resource-uploader', 'config.json');
let cacheFile = path.join(os.tmpdir(), `resource-uploader-manifest.${getConfigFileHash(configFile)}.json`);

let aliossOptions = require('../package.json').alioss;

let cdnCache = {};

mime.define({
  'application/xml': ['plist']
});

const encodeUrl = str => str.split('/').map(item => encodeURIComponent(item)).join('/');

const getHashName = (name, hash, encodeUrl = false) => {
  return `${hash}/${encodeUrl ? encodeURIComponent(name) : name}`;
};

const getHashCdnName = (hashName) => {
  return '-/' + hashName;
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
      console.log(chalk.green(url));
    }
    else {
      log('OK:', chalk.green(url));
    }
  }
  else {
    log('Refresh CDN ERR:', chalk.red(url));
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

  let urlPrefix = options.urlPrefix;
  if (urlPrefix.indexOf('//') === 0) {
    urlPrefix = `http:${urlPrefix}`;
  }
  const urlObject = url.parse(urlPrefix);
  const keyPrefix = urlObject.pathname;

  const ossClient = new ALY.OSS({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpoint,
    apiVersion: options.apiVersion
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
      filename = `!/${options.uriPrefix}/${name}`;

      const encodeUri = encodeUrl(options.uriPrefix);

      file.cdn = `${options.urlPrefix}!/${encodeUri}/${encodeUrl(name)}`;
    }
    else {
      name = path.basename(file.path);
      hash = sha1(file.contents);
      hashName = getHashName(name, hash);
      filename = getHashCdnName(hashName);
      cdnKey = hashName;

      file.cdn = `${options.urlPrefix}${getHashCdnName(getHashName(name, hash, true))}`;

      if (cdnCache[cdnKey]) {
        if (isQuiet) {
          console.log(chalk.green(file.cdn));
        }
        else {
          log('file:', name);

          if (dimensions) {
            log('width:', chalk.green(dimensions.width) + 'px', 'height:', chalk.green(dimensions.height) + 'px');
          }

          log('OK:', chalk.green(file.cdn));
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
        Buffer.from('\n' + (ext === '.css' ? '/*# sourceMappingURL=' + name + '.map */' : '//# sourceMappingURL=' + name + '.map'))
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

    // console.log(filename);

    const key = `${keyPrefix}${filename}`.replace(/^\/+/, '');

    const opt = {
      Bucket: options.bucket,
      Key: key,
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

    const { isSuccess, code } = await putObject(ossClient, opt);

    if (isSuccess) {
      if (isQuiet) {
        console.log(chalk.green(file.cdn));
      }
      else {
        log('file:', name);

        if (dimensions) {
          log('width:', chalk.green(dimensions.width) + 'px', 'height:', chalk.green(dimensions.height) + 'px');
        }

        log('OK:', chalk.green(file.cdn));
      }

      if (file.sourceMap) {
        await putObject(ossClient, {
          Bucket: options.bucket,
          Key: key + '.map',
          Body: JSON.stringify(file.sourceMap),
          AccessControlAllowOrigin: '*',
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'max-age=315360000',
          Expires: Moment().add(10, 'years').unix()
        });

        if (options.uriPrefix) {
          cb();
        }
        else {
          cdnCache[cdnKey] = true;

          cb(null, file);
        }
      }
      else {
        if (options.uriPrefix) {
          cb();
        }
        else {
          cdnCache[cdnKey] = true;

          cb(null, file);
        }
      }
    }
    else {
      log('ERR:', chalk.red(filename + "\t" + code));

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
    cacheFile = path.join(os.tmpdir(), `resource-uploader-manifest.${getConfigFileHash(configFile)}.json`);
  }
};

module.exports = {
  upload,
  refresh,
  getBucketLocation,
  setConfigFile
};

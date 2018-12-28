const fs = require('fs');
const path = require('path');
const through2 = require('through2-concurrent');
const PluginError = require('gulp-util').PluginError;
const colors = require('gulp-util').colors;
const log = require('gulp-util').log;
const ALY = require('aliyun-sdk');
const Moment = require('moment');
const crypto = require('crypto');
const _ = require('lodash');
const zlib = require('zlib');
const sizeOf = require('image-size');
const os = require('os');
const pinyin = require('pinyin');
const url = require('url');

const aliossOptions = require('../package.json').alioss;

let cdnCache = {};

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

const refresh = async (options, url) => {
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
    log('OK:', colors.green(encodeUrl(url)));
  }
  else {
    log('Refresh CDN ERR:', colors.red(encodeUrl(url)));
  }
};

const upload = (options, isQuiet = false) => {
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
    cdnCache = _(cdnCache).merge(JSON.parse(fs.readFileSync(os.tmpdir() + '/alioss-manifest.json'))).value();
  }
  catch (e) {}

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

    if (file.contents.length >= 1024 * 1024 * 50) {
      log('file size too big:', colors.yellow(file.path + "\t" + file.contents.length));
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
          console.log(colors.green(encodeUrl(options.urlPrefix + filename)));
        }
        else {
          if (dimensions) {
            log('width:', colors.green(dimensions.width) + 'px', 'height:', colors.green(dimensions.height) + 'px');
          }

          log('OK:', colors.green(encodeUrl(options.urlPrefix + filename)));
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

    const mimes = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.less': 'text/x-less',
      '.sass': 'text/x-sass',
      '.scss': 'text/x-scss',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.swf': 'application/x-shockwave-flash',
      '.ttf': 'application/font-ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.woff': 'application/font-woff',
      '.woff2': 'application/font-woff2',
      '.svg': 'image/svg+xml',
      '.otf': 'application/x-font-opentype',
      '.ico': 'image/x-icon',
      '.gif': 'image/gif',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.pdf': 'application/pdf',
      '.mov': 'video/quicktime',
      '.mp4': 'video/mp4',
      '.map': 'application/json',
      '.json': 'application/json',
      '.mp3': 'audio/mpeg',
      '.htm': 'text/html',
      '.html': 'text/html',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.apk': 'application/vnd.android.package-archive',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.plist': 'application/xml'
    };

    const gzipMimes = {
      '.plist': 6,
      '.html': 6,
      '.htm': 6,
      '.js': 6
    };

    if (mimes[ext]) {
      contentType = mimes[ext];
    }
    else {
      contentType = 'application/octet-stream';
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
        console.log(colors.green(encodeUrl(file.cdn)));
      }
      else {
        if (dimensions) {
          log('width:', colors.green(dimensions.width) + 'px', 'height:', colors.green(dimensions.height) + 'px');
        }

        log('OK:', colors.green(encodeUrl(file.cdn)));
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
            log('Refresh CDN ERR:', colors.red(encodeUrl(filename)));
          }

          ({ isSuccess } = await refreshObject(cdnClient, {
            ObjectType: 'File',
            ObjectPath: options.urlPrefix + filename + '.map'
          }));

          if (!isSuccess) {
            log('Refresh CDN ERR:', colors.red(encodeUrl(filename) + '.map'));
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
            log('Refresh CDN ERR:', colors.red(encodeUrl(filename)));
          }

          cb();
        }
        else {
          cdnCache[cdnKey] = true;

          // cdnClient.refreshObjectCaches({
          //   ObjectType: 'File',
          //   ObjectPath: file.cdn,
          // }, function (err, res) {
          //   if (err) {
          //     log('Refresh CDN ERR:');
          //   }
          // });

          cb(null, file);
        }
      }
    }
    else {
      log('ERR:', colors.red(encodeUrl(filename) + "\t" + code));

      cb();
    }
  }, (cb) => {
    fs.writeFileSync(os.tmpdir() + '/alioss-manifest.json', JSON.stringify(cdnCache, null, '  '));

    cb();
  });
}

module.exports = {
  upload,
  refresh,
  getCdnUrl
};

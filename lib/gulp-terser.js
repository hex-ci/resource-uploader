import through2 from 'through2';
import * as terser from 'terser';
import PluginError from 'plugin-error';
import applySourceMap from 'vinyl-sourcemaps-apply';

const PLUGIN_NAME = 'terser';

/**
 * @param { Object } defaultOption: gulp传递的配置
 * @return { Function }
 */
function gulpTerser(defaultOption = {}) {
  // source-map option
  defaultOption.sourceMap = defaultOption.sourceMap || {};

  const stream = through2.obj(function(file, enc, callback) {
    if (file.isStream()) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
      return callback();
    }

    if (file.isBuffer()) {
      try {
        // terser option
        const option = { ...defaultOption };

        if (file.sourceMap) {
          option.sourceMap.filename = file.sourceMap.file;
        }

        // 配置需要兼容
        const str = file.contents.toString('utf8');
        let build /* string | Object */ = {};

        if ('sourceMap' in file && 'file' in file.sourceMap) {
          build[file.sourceMap.file] = str;
        }
        else {
          build = str;
        }

        // 压缩代码
        const result = terser.minify_sync(build, option);

        // 输出报错信息
        if ('error' in result) {
          throw new Error(result.error.message);
        }

        // Buffer
        file.contents = Buffer.from(result.code);

        // 输出source-map
        if (file.sourceMap && result.map) {
          applySourceMap(file, result.map);
        }

        this.push(file);

        return callback();
      }
      catch (err) {
        this.emit('error', new PluginError(PLUGIN_NAME, err));
        return callback();
      }
    }
  });

  return stream;
}

export default gulpTerser;

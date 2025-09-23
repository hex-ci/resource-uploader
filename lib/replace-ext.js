'use strict';

import path from 'path';

function replaceExt(npath, ext) {
  if (typeof npath !== 'string') {
    return npath;
  }

  if (npath.length === 0) {
    return npath;
  }

  const nFileName = path.basename(npath, path.extname(npath)) + ext;

  return path.join(path.dirname(npath), nFileName);
}

export default replaceExt;

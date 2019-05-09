'use strict';

const execBuffer = require('exec-buffer');
const isPng = require('is-png');
const optipng = require('optipng-bin');

module.exports = options => input => {
  options = Object.assign({
    optimizationLevel: 3,
    bitDepthReduction: true,
    colorTypeReduction: true,
    paletteReduction: true,
    interlaced: false
  }, options);

  if (!Buffer.isBuffer(input)) {
    return Promise.reject(new TypeError('Expected a buffer'));
  }

  if (!isPng(input)) {
    return Promise.resolve(input);
  }

  if (input.length > 1024 * 50) {
    options.interlaced = true;
  }

  const args = [
    '-strip',
    'all',
    '-clobber',
    '-fix',
    '-o',
    options.optimizationLevel,
    '-out',
    execBuffer.output
  ];

  if (!options.bitDepthReduction) {
    args.push('-nb');
  }

  if (!options.colorTypeReduction) {
    args.push('-nc');
  }

  if (!options.paletteReduction) {
    args.push('-np');
  }

  if (options.interlaced) {
    args.push('-i', '1');
  }

  args.push(execBuffer.input);

  return execBuffer({
    input,
    bin: optipng,
    args
  }).catch(error => {
    error.message = error.stderr || error.message;
    throw error;
  });
};

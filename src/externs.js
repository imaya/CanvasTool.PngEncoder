var Canvas2PNG = {};

/*****************************************************************************
 *
 * copy from canvas2png.js
 *****************************************************************************/

Canvas2PNG.Library = function() {
  var canvas = function() {};

  /**
   * Canvas エレメント
   * @type {Element}
   */
  this.canvas = canvas;

  /**
   * 2D コンテキスト
   * @type {Object}
   */
  this.ctx = canvas.getContext('2d');

  /**
   * 横幅
   * @type {number}
   */
  this.width = canvas.width;

  /**
   * 縦幅
   * @type {number}
   */
  this.height = canvas.height;

  /**
   * ビット深度
   * @type {number}
   */
  this.bitDepth = 8;

  /**
   * 色空間
   * @type {Canvas2PNG.Library.ColourType}
   */
  this.colourType = Canvas2PNG.Library.ColourType.TRUECOLOR_WITH_ALPHA;

  /**
   * 圧縮方法
   * @type {Canvas2PNG.Library.CompressionMethod}
   */
  this.compressionMethod = Canvas2PNG.Library.CompressionMethod.DEFLATE;

  /**
   * フィルタ方法
   * @type {Canvas2PNG.Library.FilterMethod}
   */
  this.filterMethod = Canvas2PNG.Library.FilterMethod.BASIC;

  /**
   * 基本フィルタのタイプ
   * @type {Canvas2PNG.Library.BasicFilterType}
   */
  this.filterType = Canvas2PNG.Library.BasicFilterType.NONE;

  /**
   * インタレース方法
   * @type {Canvas2PNG.Library.InterlaceMethod}
   */
  this.interlaceMethod = Canvas2PNG.Library.InterlaceMethod.NONE;

  /**
   * パレット使用時にαチャンネルを保存するか
   * @type {boolean}
   */
  this.saveAlpha = true;

};

/**
 * チャンクタイプ
 * @enum {string}
 */
Canvas2PNG.Library.ChunkType = {
  // 必須チャンク
  IHDR: 'IHDR',
  PLTE: 'PLTE',
  IDAT: 'IDAT',
  IEND: 'IEND',
  // 補助チャンク
  TRNS: 'tRNS'
};

/**
 * 圧縮方法
 * 現在は Deflate 圧縮のみ定義されている
 * @enum {number}
 */
Canvas2PNG.Library.CompressionMethod = {
  DEFLATE: 0
};

/**
 * 色空間の定義
 * 1 ビット目(0x01)が立っていればパレット使用,
 * 2 ビット目(0x02)が立っていればカラー,
 * 3 ビット目(0x04)が立っていればαチャンネル付き
 * @enum {number}
 */
Canvas2PNG.Library.ColourType = {
  GRAYSCALE: 0,
  TRUECOLOR: 2,
  INDEXED_COLOR: 3,
  GRAYSCALE_WITH_ALPHA: 4,
  TRUECOLOR_WITH_ALPHA: 6
};

/**
 * フィルタ方法
 * 現在は 0 の基本 5 種類のフィルタのみ定義
 * @enum {number}
 */
Canvas2PNG.Library.FilterMethod = {
  BASIC: 0
};

/**
 * 基本となる 5 種類のフィルタ
 * @enum {number}
 */
Canvas2PNG.Library.BasicFilterType = {
  NONE: 0,
  SUB: 1,
  UP: 2,
  AVERAGE: 3,
  PAETH: 4
};

/**
 * インタレース方法
 * @enum {number}
 */
Canvas2PNG.Library.InterlaceMethod = {
  NONE: 0,
  ADAM7: 1
};


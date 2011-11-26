/**
 * JavaScript PNG Encoder
 *
 * The MIT License
 *
 * Copyright (c) 2011 imaya
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * @fileoverview JavaScript による PNG Encoder の実装.
 * @see http://www.w3.org/TR/PNG/
 */

goog.provide('CanvasTool.PngEncoder');
goog.provide('CanvasTool.PngEncoder.ChunkType');
goog.provide('CanvasTool.PngEncoder.CompressionFlag');
goog.provide('CanvasTool.PngEncoder.CompressionMethod');
goog.provide('CanvasTool.PngEncoder.ColourType');
goog.provide('CanvasTool.PngEncoder.FilterMethod');
goog.provide('CanvasTool.PngEncoder.BasicFilterType');
goog.provide('CanvasTool.PngEncoder.InterlaceMethod');
goog.provide('CanvasTool.PngEncoder.RenderingIntent');
goog.provide('CanvasTool.PngEncoder.UnitSpecifier');

goog.require('Zlib');


goog.scope(function() {

/**
 * Canvas to PNG converter
 * @param {Element|Array|CanvasPixelArray} canvas 対象となる Canvas エレメント
 *     もしくはその CanvasPixelArray 互換の配列.
 * @param {Object=} opt_param 変換オプション. canvsa が Canvas エレメントの場合
 *     以外では、かならず width と height が必要となる.
 * @constructor
 */
CanvasTool.PngEncoder = function(canvas, opt_param) {
  var ctx, width, height;

  /**
   * @type {Array|CanvasPixelArray}
   */
  this.data = [];

  if (canvas instanceof Element) {
    width = canvas.width;
    height = canvas.height;

    /**
     * 2D コンテキスト
     * @type {Object}
     */
    ctx = canvas.getContext('2d');

    this.data = ctx.getImageData(0, 0, width, height).data;
  } else if (typeof(canvas.length) === 'number') {
    if (typeof(opt_param) !== 'object') {
      throw new Error('need opt_param object');
    }
    if (typeof(opt_param.width) !== 'number') {
      throw new Error('width property not found');
    }
    if (typeof(opt_param.height) !== 'number') {
      throw new Error('height property not found');
    }

    width = opt_param.width;
    height = opt_param.height;
    this.data = canvas;
  } else {
    throw new Error('invalid arguments');
  }

  this.setParameters(width, height, opt_param);
};

/**
 * PNG パラメータの設定
 * @param {number} width 横幅.
 * @param {number} height 縦幅.
 * @param {Object=} opt_param 変換オプション.
 */
CanvasTool.PngEncoder.prototype.setParameters =
function(width, height, opt_param) {
  var param;

  if (typeof opt_param !== 'object') {
    opt_param = {};
  }

  /**
   * 横幅
   * @type {number}
   */
  this.width = width;

  /**
   * 縦幅
   * @type {number}
   */
  this.height = height;

  /**
   * ビット深度
   * @type {number}
   */
  this.bitDepth = 8;

  /**
   * 色空間
   * @type {CanvasTool.PngEncoder.ColourType}
   */
  this.colourType = CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA;

  /**
   * 圧縮方法
   * @type {CanvasTool.PngEncoder.CompressionMethod}
   */
  this.compressionMethod = CanvasTool.PngEncoder.CompressionMethod.DEFLATE;

  /**
   * フィルタ方法
   * @type {CanvasTool.PngEncoder.FilterMethod}
   */
  this.filterMethod = CanvasTool.PngEncoder.FilterMethod.BASIC;

  /**
   * 基本フィルタのタイプ
   * @type {CanvasTool.PngEncoder.BasicFilterType}
   */
  this.filterType = CanvasTool.PngEncoder.BasicFilterType.NONE;

  /**
   * インタレース方法
   * @type {CanvasTool.PngEncoder.InterlaceMethod}
   */
  this.interlaceMethod = CanvasTool.PngEncoder.InterlaceMethod.NONE;

  /**
   * ガンマ値 ( null の場合 gAMA チャンクは付与されない)
   * @type {?number}
   */
  this.gamma = null;

  /**
   * 基礎色度 ( null の場合 cHRM チャンクは付与されない)
   * Primary chromaticities and white point
   * @type {?{
   *   whitePointX: number,
   *   whitePointY: number,
   *   redX: number,
   *   redY: number,
   *   greenX: number,
   *   greenY: number,
   *   blueX: number,
   *   blueY: number}}
   */
  this.chrm = null;

  /**
   * 推奨パレット
   * name はパレット名, num は以下の通り.
   * 負数の時は出現する全ての色を推奨パレットに含める
   * 0 は無効 ( sPLT チャンクを付与しない)
   * 1 以上の時は出現頻度上位 n 件まで推奨パレットに含める
   * @type {?{
   *   name: string,
   *   num: number
   * }}
   */
  this.splt = null;

  /**
   * Standard RGB colour space ( null の場合 sRGB チャンクは付与されない)
   * @type {?CanvasTool.PngEncoder.RenderingIntent}
   */
  this.srgb = null;

  /**
   * Significant bits ( null の場合 sBIT チャンクは付与されない)
   * @type {Array.<number>}
   */
  this.sbit = null;

  /**
   * ICC プロファイル ( null の場合 iCCP チャンクは付与されない)
   * @type {?{
   *   name: string,
   *   compressionMethod: CanvasTool.PngEncoder.CompressionMethod,
   *   profile: Array
   * }}
   */
  this.iccp = null;

  /**
   * Image Histogram を保存するかどうか (true で hIST チャンクを付与する)
   * @type {boolean}
   */
  this.hist = false;

  /**
   * Physical pixel dimensions
   * @type {?{
   *   x: number,
   *   y: number,
   *   unit: CanvasTool.PngEncoder.UnitSpecifier
   * }}
   */
  this.phys = null;

  /**
   * Image last-modification time
   * @type {Date}
   */
  this.time = null;

  /**
   * Textual data
   * @type {?{
   *   keyword: string,
   *   text: string
   * }}
   */
  this.text = null;

  /**
   * Compressed textual data
   * @type {?{
   *   keyword: string,
   *   text: string,
   *   compressionMethod: CanvasTool.PngEncoder.CompressionMethod
   * }}
   */
  this.ztxt = null;

  /**
   * パレット使用時にαチャンネルを保存するか
   * @type {boolean}
   */
  this.trns = true;

  // パラメータによる設定の適用
  for (param in opt_param) {
    this[param] = opt_param[param];
  }

  /**
   * フィルタメソッド
   * @type {function(Array, number):Array}
   * @private
   */
  this.filter_;

  /**
   * フィルタ(Up, Average, Paeth)で使用する直前のライン
   * @type {Array}
   * @private
   */
  this.prevLine_;

  /**
   * インターレースメソッド
   * @type {function(Array.<Array.<number>>):Array.<number>}
   * @private
   */
  this.interlace_;

  /**
   * パレット
   * @type {Array.<number>}
   * @private
   */
  this.palette_ = null;

  /**
   * 色出現回数
   * @type {
   *   Array.<{
   *     red: number,
   *     green: number,
   *     blue: number,
   *     alpha: number,
   *     count: number
   *   }>
   * }
   * @private
   */
  this.colourHistogram_ = [];

  /**
   * パレットの色出現回数
   * @type {Array.<number>}
   * @private
   */
  this.paletteHistogram_ = [];

  // バリデーション
  this.validate_();
};

/**
 * チャンクタイプ
 * @enum {Array.<number>}
 */
CanvasTool.PngEncoder.ChunkType = {
  // 必須チャンク
  IHDR: bytearray_('IHDR'),
  PLTE: bytearray_('PLTE'),
  IDAT: bytearray_('IDAT'),
  IEND: bytearray_('IEND'),
  // 補助チャンク
  TRNS: bytearray_('tRNS'),
  GAMA: bytearray_('gAMA'),
  CHRM: bytearray_('cHRM'),
  SBIT: bytearray_('sBIT'),
  SRGB: bytearray_('sRGB'),
  ICCP: bytearray_('iCCP'),
  BKGD: bytearray_('bKGD'),
  HIST: bytearray_('hIST'),
  PHYS: bytearray_('pHYs'),
  SPLT: bytearray_('sPLT'),
  TEXT: bytearray_('tEXt'),
  ZTXT: bytearray_('zTXt'),
  ITXT: bytearray_('iTXt'),
  TIME: bytearray_('tIME')
};

/**
 * 圧縮フラグ
 * @enum {number}
 */
CanvasTool.PngEncoder.CompressionFlag = {
  UNCOMPRESSED: 0,
  COMPRESSED: 1
};

/**
 * 圧縮方法
 * 現在は Deflate 圧縮のみ定義されている
 * @enum {number}
 */
CanvasTool.PngEncoder.CompressionMethod = {
  DEFLATE: 0
};

/**
 * 色空間の定義
 * 1 ビット目(0x01)が立っていればパレット使用,
 * 2 ビット目(0x02)が立っていればカラー,
 * 3 ビット目(0x04)が立っていればαチャンネル付き
 * @enum {number}
 */
CanvasTool.PngEncoder.ColourType = {
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
CanvasTool.PngEncoder.FilterMethod = {
  BASIC: 0
};

/**
 * 基本となる 5 種類のフィルタ
 * @enum {number}
 */
CanvasTool.PngEncoder.BasicFilterType = {
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
CanvasTool.PngEncoder.InterlaceMethod = {
  NONE: 0,
  ADAM7: 1
};

/**
 * Rendering intent for Standard RGB colour space
 * @enum {number}
 */
CanvasTool.PngEncoder.RenderingIntent = {
  PERCEPTUAL: 0,
  RELATIVE: 1,
  SATURATION: 2,
  ABSOLUTE: 3
};

/**
 * Unit Specifier for Physical pixel dimensions
 * @enum {number}
 */
CanvasTool.PngEncoder.UnitSpecifier = {
  UNKNOWN: 0,
  METRE: 1
};

/**
 * PNG フォーマットのシグネチャ
 * @const
 */
CanvasTool.PngEncoder.Signature = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * 輝度変換に使用する赤の重み
 * @type {number}
 * @const
 * @private
 */
CanvasTool.PngEncoder.RedWeight_ = 0.29891;

/**
 * 輝度変換に使用する緑の重み
 * @type {number}
 * @const
 * @private
 */
CanvasTool.PngEncoder.GreenWeight_ = 0.58661;

/**
 * 輝度変換に使用する青の重み
 * @type {number}
 * @const
 * @private
 */
CanvasTool.PngEncoder.BlueWeight_ = 0.11448;

/**
 * CRC32 で使用するテーブル
 * @type {Array.<number>}
 * @const
 * @private
 */
CanvasTool.PngEncoder.Crc32Table_ = [
  0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
  0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
  0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
  0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
  0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
  0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
  0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
  0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
  0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
  0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
  0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
  0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
  0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
  0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
  0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
  0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
  0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
  0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
  0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
  0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
  0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
  0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
  0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
  0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
  0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
  0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
  0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
  0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
  0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
  0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
  0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
  0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
  0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
  0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
  0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
  0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
  0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
  0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
  0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
  0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
  0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
  0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
  0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d
];

/**
 * Adam7 で使用する、各パスの初期位置とステップ数のテーブル
 * @type {Array.<Object>}
 * @const
 * @private
 */
CanvasTool.PngEncoder.Adam7Table_ = [
  /* 1 */ {xStart: 0, yStart: 0, xStep: 8, yStep: 8},
  /* 2 */ {xStart: 4, yStart: 0, xStep: 8, yStep: 8},
  /* 3 */ {xStart: 0, yStart: 4, xStep: 4, yStep: 8},
  /* 4 */ {xStart: 2, yStart: 0, xStep: 4, yStep: 4},
  /* 5 */ {xStart: 0, yStart: 2, xStep: 2, yStep: 4},
  /* 6 */ {xStart: 1, yStart: 0, xStep: 2, yStep: 2},
  /* 7 */ {xStart: 0, yStart: 1, xStep: 1, yStep: 2}
];

/**
 * PNG へ変換を行う
 * @return {string} PNGバイナリ.
 */
CanvasTool.PngEncoder.prototype.convert = function(opt_canvasArray) {
  return str_(this.makePng_());
};

/**
 * パレットの取得
 * @return {Array.<number>} パレットの配列.
 */
CanvasTool.PngEncoder.prototype.getPalette = function() {
  var palette, imageInfo;

  if (this.palette_ instanceof Array) {
    return this.palette_;
  }

  imageInfo = this.makeImageArray(this.data);
  palette = imageInfo.PLTE;

  return palette.map(function(e) {
    return e.split('').map(function(e) {
      return e.charCodeAt(0);
    });
  });
};

/**
 * パラメータのバリデーション
 * @private
 */
CanvasTool.PngEncoder.prototype.validate_ = function() {
  var allowDepth, i, l, isArrow = false;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      allowDepth = [1, 2, 4, 8, 16];
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      allowDepth = [1, 2, 4, 8];
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      allowDepth = [8, 16];
      break;
    default:
      throw new Error('invalid colour type');
  }

  for (i = 0, l = allowDepth.length; i < l; i++) {
    if (this.bitDepth === allowDepth[i]) {
      isArrow = true;
      break;
    }
  }

  if (isArrow === false) {
    throw new Error('invalid parameter');
  }
};

/**
 * PNG の作成
 * @return {Array} PNG バイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makePng_ = function() {
  var png = [], imageInfo;

  imageInfo = this.makeImageArray(this.data);

  // signature
  push_(png, CanvasTool.PngEncoder.Signature);

  // IHDR
  push_(png, this.makeIHDR_());

  // cHRM
  if (typeof(this.chrm) === 'object' && this.chrm !== null) {
    push_(png, this.makecHRM_(this.chrm));
  }

  // gAMA
  if (typeof(this.gamma) === 'number') {
    push_(png, this.makegAMA_(this.gamma));
  }

  // iCCP
  if (typeof(this.iccp) === 'object' && this.iccp !== null) {
    push_(png, this.makeiCCP_(this.iccp));
  }

  // sBIT
  if (this.sbit instanceof Array) {
    push_(png, this.makesBIT_(this.sbit));
  }

  // sRGB
  if (typeof(this.srgb) === 'number') {
    push_(png, this.makesRGB_(this.srgb));
  }

  // PLTE
  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      push_(png, this.makePLTE_(imageInfo.PLTE));
      this.palette_ = imageInfo.PLTE;

      // bKGD
      if (this.bkgd instanceof Array) {
        push_(png, this.makebKGD_(this.bkgd, this.palette_));
      }

      // hIST
      if (this.hist) {
        push_(png, this.makehIST_(this.paletteHistogram_));
      }

      // tRNS
      if (this.trns) {
        push_(png, this.maketRNS_(imageInfo.tRNS));
      }
      break;
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      break;
    default:
      throw new Error('unknown colour type');
  }

  // pHYs
  if (typeof(this.phys) === 'object' && this.phys !== null) {
    push_(png, this.makepHYs_(this.phys));
  }

  // sPLT
  if (typeof(this.splt) === 'object' && this.splt !== null) {
    push_(png, this.makesPLT_(this.splt, this.colourHistogram_));
  }

  // tIME
  if (this.time instanceof Date) {
    push_(png, this.maketIME_(this.time));
  }

  // tEXt
  if (typeof(this.text) === 'object' && this.text !== null) {
    push_(png, this.maketEXt_(this.text));
  }

  // zTXt
  if (typeof(this.ztxt) === 'object' && this.ztxt !== null) {
    push_(png, this.makezTXt_(this.ztxt));
  }

  // iTXt
  if (typeof(this.itxt) === 'object' && this.itxt !== null) {
    push_(png, this.makeiTXt_(this.itxt));
  }

  // IDAT
  push_(png, this.makeIDAT_(imageInfo.IDAT));

  // IEND
  push_(png, this.makeIEND_());

  return png;
};

/**
 * Image Header
 * @return {Array} IHDR チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeIHDR_ = function() {
  var data = [];

  push_(data, this.networkByteOrder_(this.width, 4));
  push_(data, this.networkByteOrder_(this.height, 4));
  push_(data, this.networkByteOrder_(this.bitDepth, 1));
  push_(data, this.networkByteOrder_(this.colourType, 1));
  push_(data, this.networkByteOrder_(this.compressionMethod, 1));
  push_(data, this.networkByteOrder_(this.filterMethod, 1));
  push_(data, this.networkByteOrder_(this.interlaceMethod, 1));

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.IHDR, data);
};

/**
 * make PLTE and IDAT data
 * @return {Object} PLTE プロパティにパレット、IDAT プロパティにピクセル配列,
 *     tRNS プロパティに透明度パレットを含むオブジェクト.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeImageArray = function(canvasArray) {
  var pixelArray = [], img = canvasArray,
      saveAlpha = this.trns,
      depth = this.bitDepth,
      palette = [], alphaPalette = [], paletteTemp = {}, revTable = {},
      paletteKeys = [],
      red = 0, green = 0, blue = 0, alpha = 0,
      histIndex = {}, hi = 0, hl = 0,
      color, withAlpha, index, length, tmp, max, mod;

  /*
   * パレットの作成を ColourType に関わらず行っているのは
   * 減色パレットを作成するときの為
   */
  for (index = 0, length = canvasArray.length; index < length; index += 4) {
    if (saveAlpha) {
      color = this.rgba2str_(this.slice_(canvasArray, index, 4));
    } else {
      color = this.rgb2str_(this.slice_(canvasArray, index, 3));
    }
    paletteTemp[color] = (paletteTemp[color] | 0) + 1;

    // ヒストグラム
    red = canvasArray[index];
    green = canvasArray[index + 1];
    blue = canvasArray[index + 2];
    alpha = canvasArray[index + 3];
    hi = ((red << 8 | green) << 8 | blue) << 8 | alpha;

    if (histIndex[hi] === undefined) {
      hl = this.colourHistogram_.length;
      this.colourHistogram_.push({
        red: red,
        green: green,
        blue: blue,
        alpha: alpha,
        count: 0
      });
      histIndex[hi] = hl;
    }

    this.colourHistogram_[histIndex[hi]].count++;
  }

  withAlpha = (this.colourType & 0x04) > 0;

  /*
   * ColourType 別に IDAT の未圧縮データを作成する
   */
  switch (this.colourType) {
    // Grayscale
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      max = (8 / this.bitDepth);

      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        color = this.rgb2y_.apply(this, this.slice_(canvasArray, index, 3));
        alpha = canvasArray[index + 3];

        if (depth < 8) {
          color >>>= (8 - depth);
          alpha >>>= (8 - depth);
        }

        color = [color];

        if (withAlpha) {
          color.push(alpha);
        }

        pixelArray.push(color);
      }
      break;
    // Truecolor
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        tmp = this.slice_(canvasArray, index, withAlpha ? 4 : 3);

        pixelArray.push(tmp);
      }
      break;
    // Indexed-Color
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      // XXX: 出現回数でsortした方が良いか？

      // パレットの作成
      for (color in paletteTemp) {
        paletteKeys.push(color);
      }

      // tRNS チャンクを付与する際はアルファ値 255 のパレットを後方に配置する
      if (saveAlpha) {
        paletteKeys.sort(function(a, b) {
          return (a.charCodeAt(3) < b.charCodeAt(3)) ? -1 :
                 (a.charCodeAt(3) > b.charCodeAt(3)) ? 1 :
                 (a.charCodeAt(0) < b.charCodeAt(0)) ? -1 :
                 (a.charCodeAt(0) > b.charCodeAt(0)) ? 1 :
                 (a.charCodeAt(1) < b.charCodeAt(1)) ? -1 :
                 (a.charCodeAt(1) > b.charCodeAt(1)) ? 1 :
                 (a.charCodeAt(2) < b.charCodeAt(2)) ? -1 :
                 (a.charCodeAt(2) > b.charCodeAt(2)) ? 1 :
                 0;
        });
        /*
        for (index = 0, length = paletteKeys.length; index < length; index++) {
          if (paletteKeys[index].charCodeAt(3) === 255) {
            paletteKeys.push(paletteKeys.splice(index, 1).shift());
            index--; length--;
          }
        }
        */
      }

      for (index = 0, length = paletteKeys.length; index < length; index++) {
        color = paletteKeys[index];

        if (saveAlpha) {
          if (color.charCodeAt(3) !== 255) {
            alphaPalette[index] = color.charCodeAt(3);
          }
          revTable[color] = index;
        } else {
          revTable[color.slice(0, 3)] = index;
        }
        palette.push(color.charCodeAt(0));
        palette.push(color.charCodeAt(1));
        palette.push(color.charCodeAt(2));
      }

      // 背景色が指定されていた場合, 背景色もパレットに含める
      if (this.bkgd instanceof Array) {
        if (this.bkgd.length !== 3) {
          throw new Error('wrong background-color length');
        }
        if (!(this.rgb2str_(this.bkgd) in paletteTemp)) {
          if ((palette.length / 3) === (1 << this.bitDepth)) {
            throw new Error('can not add background-color to palette');
          }
          palette.push(this.bkgd[0]);
          palette.push(this.bkgd[1]);
          palette.push(this.bkgd[2]);
        }
      }

      // パレット数のチェック
      if ((palette.length / 3) > (1 << this.bitDepth)) {
        throw new Error('over ' + (1 << this.bitDepth) + ' colors');
      }

      // ヒストグラムの初期化
      for (index = 0, length = palette.length / 3; index < length; index++) {
        this.paletteHistogram_[index] = 0;
      }

      // make image array
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        if (saveAlpha) {
          color = this.rgba2str_(this.slice_(canvasArray, index, 4));
        } else {
          color = this.rgb2str_(this.slice_(canvasArray, index, 3));
        }
        this.paletteHistogram_[revTable[color]]++;
        pixelArray.push([revTable[color]]);
      }

      break;
    default:
      throw new Error('invalid colour type');
  }

  return {
    PLTE: palette,
    tRNS: alphaPalette,
    IDAT: pixelArray
  };
};

/**
 * 基礎色度
 * @param {{
 *   whitePointX: number,
 *   whitePointY: number,
 *   redX: number,
 *   redY: number,
 *   greenX: number,
 *   greenY: number,
 *   blueX: number,
 *   blueY: number}} chrm 基礎色度情報.
 * @return {Array} cHRM チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makecHRM_ = function(chrm) {
  var data = [];

  push_(data, this.networkByteOrder_(chrm.whitePointX * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.whitePointY * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.redX * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.redY * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.greenX * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.greenY * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.blueX * 10000 | 0, 4));
  push_(data, this.networkByteOrder_(chrm.blueY * 10000 | 0, 4));

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.CHRM, data);
};

/**
 * ガンマ値
 * @param {number} gamma ガンマ値.
 * @return {Array} gAMA チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makegAMA_ = function(gamma) {
  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.GAMA,
    this.networkByteOrder_((100000 / gamma) + 0.5 | 0, 4)
  );
};
/**
 * Significant bits
 * @param {Array.<number>} sbit 元データの各色の有効ビット数を格納した配列.
 * @return {Array} sBIT チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makesBIT_ = function(sbit) {
  var data = [];

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      // grayscale bits
      if (sbit.length !== 1) {
        throw new Error('wrong sBIT length');
      }
      push_(data, sbit.slice(0, 1));
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
      // red, green, blue bits
      if (sbit.length !== 3) {
        throw new Error('wrong sBIT length');
      }
      push_(data, sbit.slice(0, 3));
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      // red, green, blue bits
      if (sbit.length !== 3) {
        throw new Error('wrong sBIT length');
      }
      push_(data, sbit.slice(0, 3));
      break;
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
      // grayscale, alpha bits
      if (sbit.length !== 2) {
        throw new Error('wrong sBIT length');
      }
      push_(data, sbit.slice(0, 2));
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      // red, green, blue, alpha bits
      if (sbit.length !== 4) {
        throw new Error('wrong sBIT length');
      }
      push_(data, sbit.slice(0, 4));
      break;
    default:
      throw new Error('unknown colour type');
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.SBIT,
    data
  );
};

/**
 * Standard RGB colour space.
 * @param {CanvasTool.PngEncoder.RenderingIntent} ri レンダリング時の解釈仕様.
 * @return {Array} sRGB チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makesRGB_ = function(ri) {
  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.SRGB,
    [ri]
  );
};

/**
 * ICC プロファイル
 * XXX: 未テスト.
 * @param {?{
 *   name: string,
 *   compressionMethod: CanvasTool.PngEncoder.CompressionMethod,
 *   profile: Array
 * }} iccp ICCP プロファイル.
 * @return {Array} iCCP チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeiCCP_ = function(iccp) {
  var data = [],
      namearray, c, i, l;

  // profile name
  namearray = bytearray_(iccp.name);
  l = namearray.length;
  if (l > 79) {
    throw new Error('ICCP Profile name is over 79 characters');
  }
  for (i = 0; i < l; i++) {
    if (!isLatin1Printable_(namearray[i])) {
      throw new Error('wrong iccp profile name.');
    }
  }
  push_(data, namearray);

  // null separator
  data.push(0);

  // compression method
  data.push(iccp.compressionMethod);

  // profile
  switch (iccp.compressionMethod) {
    case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
      push_(data, Zlib.Deflate.compress(iccp.profile));
      break;
    default:
      throw new Error('unknown ICC Profile compression method');
      break;
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.ICCP,
    data
  );
};

/**
 * Background colour
 * @param {Array.<number>} backgroundColour 背景色を表す配列.
 *     グレースケールの際はグレーレベル(0-65535),
 *     それ以外では Red, Green, Blue (0-65535) の順に格納された配列.
 *     ビット深度が16未満の際は下位ビットのみ使用される.
 * @param {Array.<number>} palette Indexed-Colour の際に使用するパレット配列.
 * @return {Array.<number>} bKGD チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makebKGD_ =
function(backgroundColour, palette) {
  var data = [],
      paletteIndex = null,
      i, l;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
      // grayscale
      if (backgroundColour.length !== 1) {
        throw new Error('wrong background-color length');
      }
      push_(data, this.networkByteOrder_(backgroundColour[0], 2));
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      // red, green, blue
      if (backgroundColour.length !== 3) {
        throw new Error('wrong background-color length');
      }
      push_(data, this.networkByteOrder_(backgroundColour[0], 2));
      push_(data, this.networkByteOrder_(backgroundColour[1], 2));
      push_(data, this.networkByteOrder_(backgroundColour[2], 2));
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      // red, green, blue
      if (backgroundColour.length !== 3) {
        throw new Error('wrong background-color length');
      }
      // palette index
      for (i = 0, l = palette.length; i < l; i += 3) {
        if (palette[i + 0] === backgroundColour[0] &&
            palette[i + 1] === backgroundColour[1] &&
            palette[i + 2] === backgroundColour[2]) {
          paletteIndex = i / 3;
        }
      }
      // 対象となる色が見つからなかった場合は bKGD チャンクを付与しない
      // ただし、PLTE チャンクを作成時に背景色もパレットに追加するため
      // 実装が正常である場合にこの条件は満たされることはない
      if (paletteIndex === null) {
        return [];
      }
      data.push(paletteIndex);
      break;
    default:
      throw new Error('unknown colour type');
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.BKGD,
    data
  );
};

/**
 * Image Histogram
 * @param {Array.<number>} hist パレットエントリ毎の出現回数配列.
 * @return {Array.<number>} hIST チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makehIST_ = function(hist) {
  var data = [],
      max = max_(hist),
      h = 0,
      i = 0,
      l = hist.length;

  // make histogram
  for (; i < l; i++) {
    // 0 は出現していない色のみであるべきなので 1 回でも出現したものは
    // 1-65535 の範囲に分布する必要がある.
    h = hist[i];
    h = (h === 0) ? 0 : (h / max * (0xffff - 1) + 1) + 0.5 | 0;
    push_(data, this.networkByteOrder_(h, 2));
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.HIST,
    data
  );
};

/**
 * Suggested palette
 * @param {?{
 *   name: string,
 *   num: number
 * }} splt sPLT 設定オブジェクト.
 * @param {Array.<number>} hist パレットエントリ毎の出現回数配列.
 * @return {Array.<number>} sPLT チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makesPLT_ = function(splt, hist) {
  var data = [],
      sortedHist,
      max = 0,
      i = 0,
      l = splt.num < 0 ? hist.length : splt.num,
      freq = 0,
      red, green, blue, alpha;

  // チャンクを付与しない
  if (l === 0) {
    return [];
  }

  // name
  push_(data, bytearray_(splt.name));

  // null separator
  data.push(0);

  // sample depth, RGBA value
  switch (this.bitDepth) {
    case 16:
      data.push(16);
      break;
    case 8:
    case 4:
    case 2:
    case 1:
      data.push(8);
      break;
    default:
      throw new Error('invalid bit depth');
  }

  // 出現頻度順にソート
  sortedHist = hist.sort(function(a, b) {
    return a.count < b.count ? 1 :
           a.count > b.count ? -1 :
           0;
  });
  max = sortedHist[0].count;

  // make histogram
  for (; i < l; i++) {
    hist = sortedHist[i];

    switch (this.bitDepth) {
      // RGBA
      case 16:
        push_(data, this.networkByteOrder_(hist.red << 8 | hist.red, 2));
        push_(data, this.networkByteOrder_(hist.green << 8 | hist.green, 2));
        push_(data, this.networkByteOrder_(hist.blue << 8 | hist.blue, 2));
        push_(data, this.networkByteOrder_(hist.alpha << 8 | hist.alpha, 2));
        break;
      case 8:
      case 4:
      case 2:
      case 1:
        data.push(hist.red);
        data.push(hist.green);
        data.push(hist.blue);
        data.push(hist.alpha);
        break;
      default:
        throw new Error('invalid bit depth');
    }

    // freq: 0-65535 の範囲にする
    freq = hist.count / max * 0xffff + 0.5 | 0;
    push_(data, this.networkByteOrder_(freq, 2));
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.SPLT,
    data
  );
};

/**
 * Palette
 * @param {Array} palette パレット配列.
 * @return {Array} PLTE チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makePLTE_ = function(palette) {
  if (palette.length > 256) {
    throw new Error('over 256 colors');
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.PLTE,
    palette
  );
};

/**
 * Physical pixel dimensions
 * @param {?{
 *   x: number,
 *   y: number,
 *   unit: CanvasTool.PngEncoder.UnitSpecifier
 * }} phys phisical pixel dimensions settings.
 * @return {Array} pHYs チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makepHYs_ = function(phys) {
  var data = [];

  push_(data, this.networkByteOrder_(phys.x, 4));
  push_(data, this.networkByteOrder_(phys.y, 4));
  data.push(phys.unit);

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.PHYS,
    data
  );
};

/**
 * Textual data
 * @param {?{
 *   keyword: string,
 *   text: string
 * }} text text data.
 * @return {Array} tEXt チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.maketEXt_ = function(text) {
  var data = [];

  // keyword
  push_(data, bytearray_(text.keyword));

  // null separator
  data.push(0);

  // text string
  push_(data, bytearray_(text.text));

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.TEXT,
    data
  );
};


/**
 * Compressed textual data
 * @param {?{
 *   keyword: string,
 *   text: string,
 *   compressionMethod: CanvasTool.PngEncoder.CompressionMethod
 * }} text text data.
 * @return {Array} zTXt チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makezTXt_ = function(text) {
  var data = [];

  // keyword
  push_(data, bytearray_(text.keyword));

  // null separator
  data.push(0);

  // compression method
  data.push(text.compressionMethod);

  // data
  switch (text.compressionMethod) {
    case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
      push_(data, Zlib.Deflate.compress(bytearray_(text.text)));
      break;
    default:
      throw new Error('unknown compression method');
      break;
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.ZTXT,
    data
  );
};

/**
 * International textual data
 * @param {?{
 *   keyword: string,
 *   text: string,
 *   lang: string,
 *   translatedKeyword: string,
 *   compressionMethod: ?CanvasTool.PngEncoder.CompressionMethod
 * }} text text data.
 * @return {Array} iTXt チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeiTXt_ = function(text) {
  var data = [], compressedText;

  // keyword
  push_(data, bytearray_(text.keyword));

  // null separator
  data.push(0);

  if (typeof(text.compressionMethod) === 'number') {
    // compression flag
    data.push(CanvasTool.PngEncoder.CompressionFlag.COMPRESSED);

    // compression method
    data.push(text.compressionMethod);

    // text compression
    switch (text.compressionMethod) {
      case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
        compressedText = Zlib.Deflate.compress(bytearray_(utf8_(text.text)));
        break;
      default:
        throw new Error('unknown compression method');
    }
  } else {
    // compression flag
    data.push(CanvasTool.PngEncoder.CompressionFlag.UNCOMPRESSED);

    // compression method
    data.push(0);

    // text
    compressedText = bytearray_(utf8_(text.text));
  }

  // language tag
  push_(data, bytearray_(text.lang));

  // null separator
  data.push(0);

  // translated keyword
  if (typeof(text.translatedKeyword) === 'string') {
    push_(data, bytearray_(utf8_(text.translatedKeyword)));
  }

  // null separator
  data.push(0);

  // text
  push_(data, compressedText);

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.ITXT,
    data
  );
};


/**
 * Image last-modification time
 * @param {Date} time last-modification time.
 * @return {Array} tIME チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.maketIME_ = function(time) {
  var data = [];

  push_(data, this.networkByteOrder_(time.getUTCFullYear(), 2));
  data.push(time.getUTCMonth() + 1);
  data.push(time.getUTCDate());
  data.push(time.getUTCHours());
  data.push(time.getUTCMinutes());
  data.push(time.getUTCSeconds());

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.TIME,
    data
  );
};

/**
 * Image Data
 * @param {Array} pixelArray イメージのバイナリ配列.
 * @return {Array} IDAT チャンクバイナリ Array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeIDAT_ = function(pixelArray) {
  var idat = [],
      filterMethod = this.filterMethod,
      filterType = this.filterType,
      interlaceMethod = this.interlaceMethod,
      width, y, lines, line, bpp,
      passlist, pass, index, length;

  // インターレースの決定
  this.interlace_ = this.getInterlace_();

  // フィルタの決定
  this.filter_ = this.getFilter_();

  // データ幅を決定する(左のピクセルの Byte との距離)
  bpp = this.getBytesPerCompletePixel_();

  // インターレース処理 (パスの作成)
  passlist = this.interlace_(pixelArray);

  // 各パスの処理
  for (index = 0, length = passlist.length; index < length; index++) {
    pass = passlist[index];
    pixelArray = pass.pixelArray;

    // 空のパスはスキップする
    if (pixelArray.length === 0) {
      continue;
    }

    width = pass.width;

    // データ領域の作成
    this.prevLine_ = null;
    for (y = 0, lines = pass.height; y < lines; y++) {
      line = this.slice_(pixelArray, y * width, width);

      // Pixel Array -> Byte Array
      // おそらくスキャンライン単位で行うのが正しい
      line = this.pixelArrayToByteArray_(line);

      switch (filterMethod) {
        case CanvasTool.PngEncoder.FilterMethod.BASIC:
          idat.push(filterType);
          push_(idat, this.filter_(line, bpp));
          break;
        default:
          throw new Error('unknown filter method');
      }

      this.prevLine_ = line;
    }
  }

  // データの圧縮
  switch (this.compressionMethod) {
    case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
      idat = Zlib.Deflate.compress(idat);
      break;
    default:
      throw new Error('unknown compression method');
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.IDAT, idat);
};

/**
 * Image End
 * @return {Array} IEND チャンクバイナリ Array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeIEND_ = function() {
  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.IEND, []);
};

/**
 * Transparency
 * @param {Array.<number>} alpha α値.
 *     Indexed-Color では Palette に対応するα値の配列,
 *     Grayscale では透明として扱うグレーレベルを [Gray],
 *     Truecolor では透明として扱う色を [Red, Green, Blue] で指定.
 * @return {Array.<number>} tRNS チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.maketRNS_ = function(alpha) {
  var data = [], i;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      push_(data, this.networkByteOrder_(alpha[0], 2));
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
      push_(data, this.networkByteOrder_(alpha[0], 2));
      push_(data, this.networkByteOrder_(alpha[1], 2));
      push_(data, this.networkByteOrder_(alpha[2], 2));
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      data = alpha;
      break;
    default:
      throw new Error('invalid colour type');
  }

  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.TRNS,
    data
  );
};


/**
 * bytes per complete pixel (bpp) の取得
 * @return {number} bpp.
 * @private
 */
CanvasTool.PngEncoder.prototype.getBytesPerCompletePixel_ = function() {
  var bpp, withAlpha = (this.colourType & 0x04) > 0;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      bpp = 1;
      break;
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
      bpp = 1;
      if (withAlpha) {
        bpp += 1;
      }
      if (this.bitDepth === 16) {
        bpp *= 2;
      }
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      bpp = 3;
      if (withAlpha) {
        bpp += 1;
      }
      if (this.bitDepth === 16) {
        bpp *= 2;
      }
      break;
    default:
      throw new Error('unknown colour type');
  }

  return bpp;
};

/**
 * インターレースメソッドの取得
 * @return {function(Array):Array.<CanvasTool.PngEncoder.Pass_>} 描画パスのリスト.
 * @private
 */
CanvasTool.PngEncoder.prototype.getInterlace_ = function() {
  var interlace;

  switch (this.interlaceMethod) {
    case CanvasTool.PngEncoder.InterlaceMethod.NONE:
      interlace = this.interlaceNone_;
      break;
    case CanvasTool.PngEncoder.InterlaceMethod.ADAM7:
      interlace = this.interlaceAdam7_;
      break;
    default:
      throw new Error('unknown interlace method');
  }

  return interlace;
};

/**
 * Pass
 * @param {number} width パスの横幅.
 * @param {number} height パスの縦幅.
 * @param {Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @constructor
 */
CanvasTool.PngEncoder.Pass_ = function(width, height, pixelArray) {
  this.width = width;
  this.height = height;
  this.pixelArray = pixelArray;
};

/**
 * Interlace None
 * @param {Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @return {Array.<CanvasTool.PngEncoder.Pass_>} 描画パスのリスト.
 * @private
 */
CanvasTool.PngEncoder.prototype.interlaceNone_ = function(pixelArray) {
  return [new CanvasTool.PngEncoder.Pass_(this.width, this.height, pixelArray)];
};

/**
 * Interlace Adam7
 * @param {Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @return {Array.<CanvasTool.PngEncoder.Pass_>} 描画パスのリスト.
 * @private
 */
CanvasTool.PngEncoder.prototype.interlaceAdam7_ = function(pixelArray) {
  var height = this.height,
      width = pixelArray.length / height,
      x, y, blockx, blocky, passx, passy, linex, liney,
      pixel,
      index, length,
      table = CanvasTool.PngEncoder.Adam7Table_, config,
      passlist, pass;

  // 7 回分のパスを作成
  passlist = [
    new CanvasTool.PngEncoder.Pass_(0, 0, []),
    new CanvasTool.PngEncoder.Pass_(0, 0, []),
    new CanvasTool.PngEncoder.Pass_(0, 0, []),
    new CanvasTool.PngEncoder.Pass_(0, 0, []),
    new CanvasTool.PngEncoder.Pass_(0, 0, []),
    new CanvasTool.PngEncoder.Pass_(0, 0, []),
    new CanvasTool.PngEncoder.Pass_(0, 0, [])
  ];

  // 各パスの処理
  for (index = 0, length = table.length; index < length; index++) {
    pass = passlist[index];
    config = table[index];
    linex = liney = 0;

    // Y 方向にブロック→パスの順に進めていく
    for (blocky = 0; blocky < height; blocky += 8) {
      for (passy = config.yStart; passy < 8; passy += config.yStep) {

        // X 方向にブロック→パスの順に進めていく
        for (blockx = 0; blockx < width; blockx += 8) {
          for (passx = config.xStart; passx < 8; passx += config.xStep) {
            pixel = pixelArray[(blockx + passx) + (blocky + passy) * width];

            if (pixel) {
              linex = (blockx + passx - config.xStart) / config.xStep;
              liney = (blocky + passy - config.yStart) / config.yStep;
              pass.pixelArray.push(pixel);
            }
          }
        }

      }
    }
    // linex, liny は終了時に現時点での最大 x, y を取るので +1 することで
    // 縦横の長さが求まる
    pass.width = linex + 1;
    pass.height = liney + 1;
  }

  return passlist;
};

/**
 * Pixel Array to Byte Array
 * @param {Array|CanvasPixelArray} pixelArray canvas pixel array like.
 * @return {Array} pixel byte array.
 */
CanvasTool.PngEncoder.prototype.pixelArrayToByteArray_ = function(pixelArray) {
  var byteArray = [], pixel, color,
      index, length, pIndex, pLength,
      depth = this.bitDepth, colourType = this.colourType, sep, current;

  sep = 8 / depth;
  for (index = 0, length = pixelArray.length; index < length; index++) {
    pixel = pixelArray[index];
    // Bit Depth 8 未満は GRAYSCALE か INDEXED_COLORのみなので、
    // サンプル数は 1 を前提として良い
    // αチャンネルが付く場合も 8 以上しか許容しないので考えないで良い
    if (depth < 8) {
      if ((index % sep) === 0) {
        current = index / sep;
        byteArray[current] = 0;
      }
      byteArray[current] |= pixel[0] << ((sep - (index % sep) - 1) * depth);
      continue;
    }

    // Bit Depth 8 以上はピクセルをそのまま ByteArray に放り込んでいけば良い
    for (pIndex = 0, pLength = pixel.length; pIndex < pLength; pIndex++) {
      color = pixel[pIndex];
      byteArray.push(color);
      if (depth === 16) {
        byteArray.push(color);
      }
    }
  }

  return byteArray;
};

/**
 * フィルタメソッドの取得
 * @return {function(Array.<number>, number):Array} フィルタメソッド.
 * @private
 */
CanvasTool.PngEncoder.prototype.getFilter_ = function() {
  var filter;

  switch (this.filterMethod) {
    case CanvasTool.PngEncoder.FilterMethod.BASIC:
      switch (this.filterType) {
        case CanvasTool.PngEncoder.BasicFilterType.NONE:
          filter = this.filterNone_;
          break;
        case CanvasTool.PngEncoder.BasicFilterType.SUB:
          filter = this.filterSub_;
          break;
        case CanvasTool.PngEncoder.BasicFilterType.UP:
          filter = this.filterUp_;
          break;
        case CanvasTool.PngEncoder.BasicFilterType.AVERAGE:
          filter = this.filterAverage_;
          break;
        case CanvasTool.PngEncoder.BasicFilterType.PAETH:
          filter = this.filterPaeth_;
          break;
        default:
          throw new Error('unknown filter type');
      }
      break;
    default:
      throw new Error('unknown filter method');
  }

  return filter;
};

/**
 * Filter None
 * @param {Array.<number>} lineByteArray line byte array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {Array} filtered line byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.filterNone_ = function(lineByteArray, sub) {
  var filteredImageLine = lineByteArray;

  filteredImageLine = lineByteArray;

  return filteredImageLine;
};

/**
 * Filter Sub
 * @param {Array.<number>} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {Array} filtered line byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.filterSub_ = function(lineByteArray, sub) {
  var filteredImageLine = [], left = 0, index, length;

  for (index = 0, length = lineByteArray.length; index < length; index++) {
    left = lineByteArray[index - sub] || 0;
    filteredImageLine.push((lineByteArray[index] - left + 0x0100) & 0xff);
  }

  return filteredImageLine;
};

/**
 * Filter Up
 * @param {Array.<number>} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {Array} filtered line byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.filterUp_ = function(lineByteArray, sub) {
  var filteredImageLine = [], up, prevLine = this.prevLine_, index, length;

  for (index = 0, length = lineByteArray.length; index < length; index++) {
    up = (prevLine && prevLine[index]) ? prevLine[index] : 0;
    filteredImageLine.push((lineByteArray[index] - up + 0x0100) & 0xff);
  }

  return filteredImageLine;
};

/**
 * Filter Average
 * @param {Array.<number>} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {Array} filtered line byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.filterAverage_ = function(lineByteArray, sub) {
  var filteredImageLine = [],
      left, up, average,
      prevLine = this.prevLine_, index, length;

  for (index = 0, length = lineByteArray.length; index < length; index++) {
    left = lineByteArray[index - sub] || 0;
    up = prevLine && prevLine[index] || 0;
    average = (left + up) >>> 1;

    filteredImageLine.push((lineByteArray[index] + 0x0100 - average) & 0xff);
  }

  return filteredImageLine;
};

/**
 * Filter Paeth
 * @param {Array.<number>} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {Array} filtered line byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.filterPaeth_ = function(lineByteArray, sub) {
  var filteredImageLine = [],
      left, up, leftup, paeth,
      prevLine = this.prevLine_, index, length;

  for (index = 0, length = lineByteArray.length; index < length; index++) {
    left = lineByteArray[index - sub] || 0;
    up = prevLine && prevLine[index] || 0;
    leftup = prevLine && prevLine[index - sub] || 0;
    paeth = this.paethPredictor_(left, up, leftup);

    filteredImageLine.push((lineByteArray[index] - paeth + 0x0100) & 0xff);
  }

  return filteredImageLine;
};

/**
 * Paeth Algorithm
 * @param {number} a 1st byte.
 * @param {number} b 2nd byte.
 * @param {number} c 3rd byte.
 * @return {number} nearest byte.
 * @private
 */
CanvasTool.PngEncoder.prototype.paethPredictor_ = function(a, b, c) {
  var p, pa, pb, pc;

  p = a + b - c;
  pa = Math.abs(p - a);
  pb = Math.abs(p - b);
  pc = Math.abs(p - c);

  return (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
};

/**
 * Array 風のオブジェクトに対する slice 実装.
 * CanvasPixelArray 用に使用する.
 * @param {Array|Object} arraylike slice の対象となる Array 風のオブジェクト.
 * @param {number} start 開始 index.
 * @param {number} length 切り出す長さ.
 * @return {Array} 指定した範囲の新しい配列.
 * @private
 */
CanvasTool.PngEncoder.prototype.slice_ = function(arraylike, start, length) {
  var result, arraylength = arraylike.length;

  if (arraylike instanceof Array) {
    return arraylike.slice(start, start + length);
  }

  result = [];

  for (var i = 0; i < length; i++) {
    if (start + i >= arraylength) {
      break;
    }
    result.push(arraylike[start + i]);
  }

  return result;
};

/**
 * チャンクの作成
 * @param {CanvasTool.PngEncoder.ChunkType} type Chunk type.
 * @param {Array} data Chunk data byte array.
 * @return {Array} Chunk byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeChunk_ = function(type, data) {
  var chunk = [], length = data.length, crcTarget = [];

  // Length
  push_(chunk, this.networkByteOrder_(length, 4));
  // Type
  push_(chunk, type);
  // Data
  push_(chunk, data);
  // CRC
  push_(crcTarget, type);
  push_(crcTarget, data);
  push_(chunk, this.networkByteOrder_(this.getCRC32_(crcTarget), 4));

  return chunk;
};

/**
 * network byte order integer
 * @param {number} number source number.
 * @param {number=} size size.
 * @return {Array} network byte order byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.networkByteOrder_ = function(number, size) {
  var tmp = [], octet, nullchar;

  do {
    octet = number & 0xff;
    tmp.push(octet);
    number >>>= 8;
  } while (number > 0);

  if (typeof(size) === 'number') {
    nullchar = 0;
    while (tmp.length < size) {
      tmp.push(nullchar);
    }
  }

  return tmp.reverse();
};

/**
 * CRC32ハッシュ値を更新
 * @param {Array} data data byte array.
 * @param {number} crc CRC32.
 * @return {number} CRC32.
 * @private
 */
CanvasTool.PngEncoder.prototype.updateCRC32_ = function(data, crc) {
  var octet = 0;

  for (var i = 0, l = data.length; i < l; i++) {
    octet = (crc ^ data[i]) & 0xff;
    crc = (crc >>> 8) ^ CanvasTool.PngEncoder.Crc32Table_[octet];
  }

  return crc;
};

/**
 * CRC32 ハッシュ値を取得
 * @param {Array} data data byte array.
 * @return {number} CRC32.
 * @private
 */
CanvasTool.PngEncoder.prototype.getCRC32_ = function(data) {
  return this.updateCRC32_(data, 0xffffffff) ^ 0xffffffff;
};

/**
 * RGB -> Y 変換
 * @param {number} red 赤要素の値 (0-255).
 * @param {number} green 緑要素の値 (0-255).
 * @param {number} blue 青要素の値 (0-255).
 * @return {number} 輝度 (0-255).
 * @private
 */
CanvasTool.PngEncoder.prototype.rgb2y_ = function(red, green, blue) {
  var y;

  y = red * CanvasTool.PngEncoder.RedWeight_ +
      green * CanvasTool.PngEncoder.GreenWeight_ +
      blue * CanvasTool.PngEncoder.BlueWeight_ +
      0.0001; // 丸め

  return (y > 255 ? 255 : y) | 0;
};

/**
 * [R, G, B(, A)]の形に並んでいる配列からバイナリ文字列に変換する
 * @param {Array.<number>} color [R, G, B(, A)]形式の配列.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
CanvasTool.PngEncoder.prototype.rgb2str_ = function(color) {
  return color.slice(0, 3).map(this.fromCharCode_).join('');
};

/**
 * [R, G, B, A]の形に並んでいる配列からバイナリ文字列に変換する
 * @param {Array.<number>} color [R, G, B, A]形式の配列.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
CanvasTool.PngEncoder.prototype.rgba2str_ = function(color) {
  return color.map(this.fromCharCode_).join('');
};

/**
 * XXX: 必要?
 * String.fromCharCode を使用するとゴミが混じる事があるので、
 * 先頭文字だけを切り出す
 * @param {number} code 変換するキャラクタコード.
 * @return {string} 変換された文字列.
 * @private
 */
CanvasTool.PngEncoder.prototype.fromCharCode_ = function(code) {
  return String.fromCharCode(code).charAt(0);
};

/**
 * 配列の末尾への結合を破壊的に行う.
 * @param {Array} dst 結合先となる配列.
 * @param {Array} src 結合元となる配列.
 */
function push_(dst, src) {
  var i = 0, dl = src.length, sl = src.length, pushImpl = (!!dst.push);

  if (pushImpl) {
    for (; i < sl; i++) {
      dst.push(src[i]);
    }
  } else {
    for (; i < sl; i++) {
      dst[dl + i] = src[i];
    }
  }

  return dst.length;
}

/**
 * 文字列から bytearray への変換
 * @param {string} str byte array に変換する文字列.
 * @return {Array.<number>} 変換した byte array.
 * @private
 */
function bytearray_(str) {
  var srcarray = str.split(''),
      bytearray = [], i, l;

  for (i = 0, l = srcarray.length; i < l; i++) {
    bytearray[i] = srcarray[i].charCodeAt(0);
  }

  return bytearray;
}

/**
 * Math.max.apply 代替
 * @param {Array.<number>} array 対象となる配列.
 * @return {number} array の中で最大の数値.
 * @private
 */
function max_(array) {
  var max = 0,
      i = 0,
      l = array.length;

  for (; i < l; i++) {
    max = (max < array[i] || i === 0) ? array[i] : max;
  }

  return max;
}

/**
 * bytearray から string へ変換
 * @private
 */
function str_(bytearray) {
  var tmp = [], i = 0, l = bytearray.length;

  for (; i < l; i++) {
    tmp[i] = String.fromCharCode(bytearray[i]);
  }

  return tmp.join('');
}

/**
 * Latin-1 で表示可能な文字か判別する.
 * @param {number} charCode check character code.
 * @return {boolean} Latin-1 の表示可能な文字ならば true, それ以外ならば false.
 * @private
 */
function isLatin1Printable_(charCode) {
  return !((charCode < 32) ||
           (charCode > 126 && charCode < 161) ||
           (charCode > 255));
}

/**
 * 文字列を UTF-8 文字列に変換する
 * @param {string} str UTF-8 に変換する文字列.
 * @return {string} UTF-8 文字列.
 * @private
 */
function utf8_(str) {
  return unescape(encodeURIComponent(str));
}


//*****************************************************************************
// export
//*****************************************************************************

/**
 * @define {boolean} no export symbols.
 */
CanvasTool.PngEncoder.NO_EXPORT = true;

if (!CanvasTool.PngEncoder.NO_EXPORT) {
  goog.exportSymbol(
    'CanvasTool.PngEncoder',
    CanvasTool.PngEncoder
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.ChunkType',
    CanvasTool.PngEncoder.ChunkType
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.CompressionMethod',
    CanvasTool.PngEncoder.CompressionMethod
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.ColourType',
    CanvasTool.PngEncoder.ColourType
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.FilterMethod',
    CanvasTool.PngEncoder.FilterMethod
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.BasicFilterType',
    CanvasTool.PngEncoder.BasicFilterType
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.InterlaceMethod',
    CanvasTool.PngEncoder.InterlaceMethod
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.RenderingIntent',
    CanvasTool.PngEncoder.RenderingIntent
  );
  goog.exportSymbol(
    'CanvasTool.PngEncoder.UnitSpecifier',
    CanvasTool.PngEncoder.UnitSpecifier
  );
  goog.exportProperty(
    CanvasTool.PngEncoder.prototype,
    'convert',
    CanvasTool.PngEncoder.prototype.convert
  );
}

// end of scope
});

/* vim: set expandtab ts=2 sw=2 tw=80: */

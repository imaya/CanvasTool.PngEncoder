/**
 * canvas2png.js
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
 * @fileoverview JavaScript による PNG の実装.
 * @see http://www.w3.org/TR/PNG/
 */

goog.provide('Canvas2PNG.Library');

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
Canvas2PNG.Library = function(canvas, opt_param) {
  var ctx, width, heigth;
  console.log(canvas);

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
      throw Error('need opt_param object');
    }
    if (typeof(opt_param.width) !== 'number') {
      throw Error('width property not found');
    }
    if (typeof(opt_param.height) !== 'number') {
      throw Error('height property not found');
    }

    width = opt_param.width;
    height = opt_param.height;
    this.data = canvas;
  } else {
    throw Error('invalid arguments');
  }

  this.setParameters(width, height, opt_param);
};

/**
 * PNG パラメータの設定
 * @param {number} width 横幅.
 * @param {number} height 縦幅.
 * @param {Object=} opt_param 変換オプション.
 */
Canvas2PNG.Library.prototype.setParameters =
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
   * @type {Array}
   * @private
   */
  this.palette_;


  // バリデーション
  this.validate_();
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

/**
 * PNG フォーマットのシグネチャ
 * @const
 */
Canvas2PNG.Library.Signature = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * 輝度変換に使用する赤の重み
 * @type {number}
 * @const
 * @private
 */
Canvas2PNG.Library.RedWeight_ = 0.29891;

/**
 * 輝度変換に使用する緑の重み
 * @type {number}
 * @const
 * @private
 */
Canvas2PNG.Library.GreenWeight_ = 0.58661;

/**
 * 輝度変換に使用する青の重み
 * @type {number}
 * @const
 * @private
 */
Canvas2PNG.Library.BlueWeight_ = 0.11448;

/**
 * CRC32 で使用するテーブル
 * @type {Array.<number>}
 * @const
 * @private
 */
Canvas2PNG.Library.Crc32Table_ = [
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
Canvas2PNG.Library.Adam7Table_ = [
  /* 1 */ {xStart: 0, yStart: 0, xStep: 8, yStep: 8},
  /* 2 */ {xStart: 4, yStart: 0, xStep: 8, yStep: 8},
  /* 3 */ {xStart: 0, yStart: 4, xStep: 4, yStep: 8},
  /* 4 */ {xStart: 2, yStart: 0, xStep: 4, yStep: 4},
  /* 5 */ {xStart: 0, yStart: 2, xStep: 2, yStep: 4},
  /* 6 */ {xStart: 1, yStart: 0, xStep: 2, yStep: 2},
  /* 7 */ {xStart: 0, yStart: 1, xStep: 1, yStep: 2}
];

/**
 * PNGへ変換を行う
 * @return {string} PNGバイナリ.
 */
Canvas2PNG.Library.prototype.convert = function(opt_canvasArray) {
  return String.fromCharCode.apply(this, this.makePng_());
};

/**
 * パレットの取得
 * @return {Array.<number>} パレットの配列.
 */
Canvas2PNG.Library.prototype.getPalette = function() {
  var palette, imageInfo;

  if (typeof(this.palette_) === 'array') {
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
Canvas2PNG.Library.prototype.validate_ = function() {
  var allowDepth, i, l, isArrow = false;

  switch (this.colourType) {
    case Canvas2PNG.Library.ColourType.GRAYSCALE:
      allowDepth = [1, 2, 4, 8, 16];
      break;
    case Canvas2PNG.Library.ColourType.INDEXED_COLOR:
      allowDepth = [1, 2, 4, 8];
      break;
    case Canvas2PNG.Library.ColourType.TRUECOLOR:
    case Canvas2PNG.Library.ColourType.GRAYSCALE_WITH_ALPHA:
    case Canvas2PNG.Library.ColourType.TRUECOLOR_WITH_ALPHA:
      allowDepth = [8, 16];
      break;
    default:
      throw 'invalid colour type';
  }

  for (i = 0, l = allowDepth.length; i < l; i++) {
    if (this.bitDepth === allowDepth[i]) {
      isArrow = true;
      break;
    }
  }

  if (isArrow === false) {
    throw 'invalid parameter';
  }
};

/**
 * PNG の作成
 * @return {Array} PNG バイナリ byte array.
 * @private
 */
Canvas2PNG.Library.prototype.makePng_ = function() {
  var png = [], imageInfo;

  push_(png, Canvas2PNG.Library.Signature);
  push_(png, this.makeIHDR_());

  imageInfo = this.makeImageArray(this.data);

  switch (this.colourType) {
    case Canvas2PNG.Library.ColourType.INDEXED_COLOR:
      push_(png, this.makePLTE_(imageInfo.PLTE));
      if (this.saveAlpha) {
        push_(png, this.maketRNS_(imageInfo.tRNS));
      }
      break;
    case Canvas2PNG.Library.ColourType.GRAYSCALE:
    case Canvas2PNG.Library.ColourType.TRUECOLOR:
    case Canvas2PNG.Library.ColourType.GRAYSCALE_WITH_ALPHA:
    case Canvas2PNG.Library.ColourType.TRUECOLOR_WITH_ALPHA:
      break;
    default:
      throw 'TODO';
  }

  push_(png, this.makeIDAT_(imageInfo.IDAT));
  push_(png, this.makeIEND_());

  return png;
};

/**
 * Image Header
 * @return {Array} IHDR チャンクバイナリ byte array.
 * @private
 */
Canvas2PNG.Library.prototype.makeIHDR_ = function() {
  var data = [];

  push_(data, this.convertNetworkByteOrder_(this.width, 4));
  push_(data, this.convertNetworkByteOrder_(this.height, 4));
  push_(data, this.convertNetworkByteOrder_(this.bitDepth, 1));
  push_(data, this.convertNetworkByteOrder_(this.colourType, 1));
  push_(data, this.convertNetworkByteOrder_(this.compressionMethod, 1));
  push_(data, this.convertNetworkByteOrder_(this.filterMethod, 1));
  push_(data, this.convertNetworkByteOrder_(this.interlaceMethod, 1));

  return this.makeChunk_(Canvas2PNG.Library.ChunkType.IHDR, data);
};

/**
 * make PLTE and IDAT data
 * @return {Object} PLTE プロパティにパレット、IDAT プロパティにピクセル配列、
 *     tRNS プロパティに透明度パレットを含むオブジェクト.
 * @private
 */
Canvas2PNG.Library.prototype.makeImageArray = function(canvasArray) {
  var pixelArray = [], img = canvasArray,
      saveAlpha = this.saveAlpha,
      depth = this.bitDepth,
      palette = [], alphaPalette = [], paletteTemp = {}, revTable = {},
      color, alpha, withAlpha, index, length, tmp, max, mod;

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
  }

  withAlpha = (this.colourType & 0x04) > 0;

  /*
   * ColourType 別に IDAT の未圧縮データを作成する
   */
  switch (this.colourType) {
    // Grayscale
    case Canvas2PNG.Library.ColourType.GRAYSCALE_WITH_ALPHA:
    case Canvas2PNG.Library.ColourType.GRAYSCALE:
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
    case Canvas2PNG.Library.ColourType.TRUECOLOR:
    case Canvas2PNG.Library.ColourType.TRUECOLOR_WITH_ALPHA:
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        tmp = this.slice_(canvasArray, index, withAlpha ? 4 : 3);

        pixelArray.push(tmp);
      }
      break;
    // Indexed-Color
    case Canvas2PNG.Library.ColourType.INDEXED_COLOR:
      // XXX: 出現回数でsortした方が良いか？

      // パレットの作成
      index = 0;
      for (color in paletteTemp) {
        if (saveAlpha) {
          alphaPalette[index] = color.charAt(3);
          revTable[color] = index;
        } else {
          revTable[color.slice(0, 3)] = index;
        }
        palette[index] = color.slice(0, 3);
        index++;
      }

      // パレット数のチェック
      if (palette.length > (1 << this.bitDepth)) {
        throw 'over ' + (1 << this.bitDepth) + ' colors';
      }

      // make image array
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        if (saveAlpha) {
          color = this.rgba2str_(this.slice_(canvasArray, index, 4));
        } else {
          color = this.rgb2str_(this.slice_(canvasArray, index, 3));
        }
        pixelArray.push([revTable[color]]);
      }

      break;
    default:
      throw 'invalid colour type';
  }

  return {
    PLTE: palette,
    tRNS: alphaPalette,
    IDAT: pixelArray
  };
};

/**
 * Palette
 * @return {Array} PLTE チャンクバイナリ byte array.
 * @private
 */
Canvas2PNG.Library.prototype.makePLTE_ = function(palette) {
  if (palette.length > 256) {
    throw 'over 256 colors';
  }
  return this.makeChunk_(
    Canvas2PNG.Library.ChunkType.PLTE,
    palette
  );
};

/**
 * Image Data
 * @param {Array} pixelArray イメージのバイナリ配列.
 * @return {Array} IDAT チャンクバイナリ Array.
 * @private
 */
Canvas2PNG.Library.prototype.makeIDAT_ = function(pixelArray) {
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
        case Canvas2PNG.Library.FilterMethod.BASIC:
          idat.push(filterType);
          push_(idat, this.filter_(line, bpp));
          break;
        default:
          throw 'unknown filter method';
      }

      this.prevLine_ = line;
    }
  }

  // データの圧縮
  switch (this.compressionMethod) {
    case Canvas2PNG.Library.CompressionMethod.DEFLATE:
      idat = Zlib.Deflate.compress(idat);
      break;
    default:
      throw 'unknown compression method';
  }

  return this.makeChunk_(Canvas2PNG.Library.ChunkType.IDAT, idat);
};

/**
 * Image End
 * @return {Array} IEND チャンクバイナリ Array.
 * @private
 */
Canvas2PNG.Library.prototype.makeIEND_ = function() {
  return this.makeChunk_(Canvas2PNG.Library.ChunkType.IEND, []);
};

/**
 * Transparency
 */
Canvas2PNG.Library.prototype.maketRNS_ = function(palette) {
  var alphaPalette = [];

  switch (this.colourType) {
    case Canvas2PNG.Library.ColourType.GRAYSCALE:
    case Canvas2PNG.Library.ColourType.TRUECOLOR:
      throw 'TODO'; // TODO
      break;
    case Canvas2PNG.Library.ColourType.INDEXED_COLOR:
      alphaPalette = palette;
      break;
    default:
      throw 'invalid colour type';
  }

  return this.makeChunk_(
    Canvas2PNG.Library.ChunkType.TRNS,
    alphaPalette
  );
};


/**
 * bytes per complete pixel (bpp) の取得
 * @return {number} bpp.
 * @private
 */
Canvas2PNG.Library.prototype.getBytesPerCompletePixel_ = function() {
  var bpp, withAlpha = (this.colourType & 0x04) > 0;

  switch (this.colourType) {
    case Canvas2PNG.Library.ColourType.INDEXED_COLOR:
      bpp = 1;
      break;
    case Canvas2PNG.Library.ColourType.GRAYSCALE:
    case Canvas2PNG.Library.ColourType.GRAYSCALE_WITH_ALPHA:
      bpp = 1;
      if (withAlpha) {
        bpp += 1;
      }
      if (this.bitDepth === 16) {
        bpp *= 2;
      }
      break;
    case Canvas2PNG.Library.ColourType.TRUECOLOR:
    case Canvas2PNG.Library.ColourType.TRUECOLOR_WITH_ALPHA:
      bpp = 3;
      if (withAlpha) {
        bpp += 1;
      }
      if (this.bitDepth === 16) {
        bpp *= 2;
      }
      break;
    default:
      throw 'unknown colour type';
  }

  return bpp;
};

/**
 * インターレースメソッドの取得
 * @return {function(Array):Array.<Canvas2PNG.Library.Pass_>} 描画パスのリスト.
 * @private
 */
Canvas2PNG.Library.prototype.getInterlace_ = function() {
  var interlace;

  switch (this.interlaceMethod) {
    case Canvas2PNG.Library.InterlaceMethod.NONE:
      interlace = this.interlaceNone_;
      break;
    case Canvas2PNG.Library.InterlaceMethod.ADAM7:
      interlace = this.interlaceAdam7_;
      break;
    default:
      throw 'TODO';
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
Canvas2PNG.Library.Pass_ = function(width, height, pixelArray) {
  this.width = width;
  this.height = height;
  this.pixelArray = pixelArray;
};

/**
 * Interlace None
 * @param {Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @return {Array.<Canvas2PNG.Library.Pass_>} 描画パスのリスト.
 * @private
 */
Canvas2PNG.Library.prototype.interlaceNone_ = function(pixelArray) {
  return [new Canvas2PNG.Library.Pass_(this.width, this.height, pixelArray)];
};

/**
 * Interlace Adam7
 * @param {Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @return {Array.<Canvas2PNG.Library.Pass_>} 描画パスのリスト.
 * @private
 */
Canvas2PNG.Library.prototype.interlaceAdam7_ = function(pixelArray) {
  var height = this.height,
      width = pixelArray.length / height,
      x, y, blockx, blocky, passx, passy, linex, liney,
      pixel,
      index, length,
      table = Canvas2PNG.Library.Adam7Table_, config,
      passlist, pass;

  // 7 回分のパスを作成
  passlist = [
    new Canvas2PNG.Library.Pass_(0, 0, []),
    new Canvas2PNG.Library.Pass_(0, 0, []),
    new Canvas2PNG.Library.Pass_(0, 0, []),
    new Canvas2PNG.Library.Pass_(0, 0, []),
    new Canvas2PNG.Library.Pass_(0, 0, []),
    new Canvas2PNG.Library.Pass_(0, 0, []),
    new Canvas2PNG.Library.Pass_(0, 0, [])
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
 */
Canvas2PNG.Library.prototype.pixelArrayToByteArray_ = function(pixelArray) {
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
Canvas2PNG.Library.prototype.getFilter_ = function() {
  var filter;

  switch (this.filterMethod) {
    case Canvas2PNG.Library.FilterMethod.BASIC:
      switch (this.filterType) {
        case Canvas2PNG.Library.BasicFilterType.NONE:
          filter = this.filterNone_;
          break;
        case Canvas2PNG.Library.BasicFilterType.SUB:
          filter = this.filterSub_;
          break;
        case Canvas2PNG.Library.BasicFilterType.UP:
          filter = this.filterUp_;
          break;
        case Canvas2PNG.Library.BasicFilterType.AVERAGE:
          filter = this.filterAverage_;
          break;
        case Canvas2PNG.Library.BasicFilterType.PAETH:
          filter = this.filterPaeth_;
          break;
        default:
          throw 'TODO';
      }
      break;
    default:
      throw 'unknown filter method';
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
Canvas2PNG.Library.prototype.filterNone_ = function(lineByteArray, sub) {
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
Canvas2PNG.Library.prototype.filterSub_ = function(lineByteArray, sub) {
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
Canvas2PNG.Library.prototype.filterUp_ = function(lineByteArray, sub) {
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
Canvas2PNG.Library.prototype.filterAverage_ = function(lineByteArray, sub) {
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
Canvas2PNG.Library.prototype.filterPaeth_ = function(lineByteArray, sub) {
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
Canvas2PNG.Library.prototype.paethPredictor_ = function(a, b, c) {
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
Canvas2PNG.Library.prototype.slice_ = function(arraylike, start, length) {
  var result, arraylength = arraylike.length;

  if (typeof(arraylike) === 'array') {
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
 * @param {canvas2png.ChunkType} type Chunk type.
 * @param {Array} data Chunk data byte array.
 * @return {Array} Chunk byte array.
 * @private
 */
Canvas2PNG.Library.prototype.makeChunk_ = function(type, data) {
  var chunk = [], length = data.length;

  // XXX チャンクタイプは文字列ではなくバイト列で宣言するか？
  type = type.split('').map(function(c) { return c.charCodeAt(0); });

  // Length*
  push_(chunk,
      this.convertNetworkByteOrder_(length, 4));
  // Type
  push_(chunk, type);
  // Data
  push_(chunk, data);
  // data の方が一般的には大きくなるため data に type を結合する
  unshift_(data, type);
  // CRC
  push_(
    chunk,
    this.convertNetworkByteOrder_(this.getCRC32_(data), 4)
  );

  return chunk;
};

/**
 * network byte order integer
 * @param {number} number source number.
 * @param {number=} size size.
 * @return {Array} network byte order byte array.
 * @private
 */
Canvas2PNG.Library.prototype.convertNetworkByteOrder_ = function(number, size) {
  var tmp = [], octet, nullchar;

  do {
    octet = number & 0xff;
    tmp.unshift(octet);
    number >>>= 8;
  } while (number > 0);

  if (typeof(size) === 'number') {
    nullchar = 0;
    while (tmp.length < size) {
      tmp.unshift(nullchar);
    }
  }

  return tmp;
};

/**
 * CRC32ハッシュ値を更新
 * @param {Array} data data byte array.
 * @param {number} crc CRC32.
 * @return {number} CRC32.
 * @private
 */
Canvas2PNG.Library.prototype.updateCRC32_ = function(data, crc) {
  var octet = 0;

  for (var i = 0, l = data.length; i < l; i++) {
    octet = (crc ^ data[i]) & 0xff;
    crc = (crc >>> 8) ^ Canvas2PNG.Library.Crc32Table_[octet];
  }

  return crc;
};

/**
 * CRC32 ハッシュ値を取得
 * @param {Array} data data byte array.
 * @param {number} crc CRC32.
 * @return {number} CRC32.
 * @private
 */
Canvas2PNG.Library.prototype.getCRC32_ = function(data) {
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
Canvas2PNG.Library.prototype.rgb2y_ = function(red, green, blue) {
  var y;

  y = red * Canvas2PNG.Library.RedWeight_ +
      green * Canvas2PNG.Library.GreenWeight_ +
      blue * Canvas2PNG.Library.BlueWeight_ +
      0.0001; // 丸め

  return (y > 255 ? 255 : y) | 0;
};

/**
 * [R, G, B(, A)]の形に並んでいる配列からバイナリ文字列に変換する
 * @param {Array.<number>} color [R, G, B(, A)]形式の配列.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
Canvas2PNG.Library.prototype.rgb2str_ = function(color) {
  return color.slice(0, 3).map(this.fromCharCode_).join('');
};

/**
 * [R, G, B, A]の形に並んでいる配列からバイナリ文字列に変換する
 * @param {Array.<number>} color [R, G, B, A]形式の配列.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
Canvas2PNG.Library.prototype.rgba2str_ = function(color) {
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
Canvas2PNG.Library.prototype.fromCharCode_ = function(code) {
  return String.fromCharCode(code).charAt(0);
};

/**
 * Array.prototype.push.apply ショートカット
 * @param {Array} dst 結合先となる配列.
 * @param {Array} src 結合元となる配列.
 */
function push_(dst, src) {
  return Array.prototype.push.apply(dst, src);
}

/**
 * Array.prototype.unshift.apply ショートカット
 * @param {Array} dst 結合先となる配列.
 * @param {Array} src 結合元となる配列.
 * @private
 */
function unshift_(dst, src) {
  return Array.prototype.unshift.apply(dst, src);
}


//*****************************************************************************
// export
//*****************************************************************************

/**
 * @define {boolean} no export symbols.
 */
Canvas2PNG.NO_EXPORT = false;

if (!Canvas2PNG.NO_EXPORT) {
  goog.exportSymbol('Canvas2PNG', Canvas2PNG.Library);
  goog.exportSymbol(
    'Canvas2PNG.ChunkType',
    Canvas2PNG.Library.ChunkType
  );
  goog.exportSymbol(
    'Canvas2PNG.CompressionMethod',
    Canvas2PNG.Library.CompressionMethod
  );
  goog.exportSymbol(
    'Canvas2PNG.ColourType',
    Canvas2PNG.Library.ColourType
  );
  goog.exportSymbol(
    'Canvas2PNG.FilterMethod',
    Canvas2PNG.Library.FilterMethod
  );
  goog.exportSymbol(
    'Canvas2PNG.BasicFilterType',
    Canvas2PNG.Library.BasicFilterType
  );
  goog.exportSymbol(
    'Canvas2PNG.InterlaceMethod',
    Canvas2PNG.Library.InterlaceMethod
  );
  goog.exportProperty(
    Canvas2PNG.Library.prototype,
    'convert',
    Canvas2PNG.Library.prototype.convert
  );
}

// end of scope
});

/* vim: set expandtab ts=2 sw=2 tw=80: */

/**
 * canvas2png.js
 *
 * @author imaya <imaya.devel@gmail.com>
 */

// XXX: TODO: ImageMagick で 8 ビットグレースケールのインタレース画像を作ってみ
// てデータ配列を研究する
(function(global) {

'use strict';
global['Canvas2PNG'] = Canvas2PNG;

/**
 * Canvas to PNG converter
 * @param {Element} canvas 対象となる Canvas エレメント.
 * @param {Object=} opt_param 変換オプション.
 * @constructor
 */
function Canvas2PNG(canvas, opt_param) {
  var param;

  if (typeof opt_param !== 'object') {
    opt_param = {};
  }

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
   * @type {Canvas2PNG.ColourType}
   */
  this.colourType = Canvas2PNG.ColourType.TRUECOLOR_WITH_ALPHA;

  /**
   * 圧縮方法
   * @type {Canvas2PNG.CompressionMethod}
   */
  this.compressionMethod = Canvas2PNG.CompressionMethod.DEFLATE;

  /**
   * フィルタ方法
   * @type {Canvas2PNG.FilterMethod}
   */
  this.filterMethod = Canvas2PNG.FilterMethod.BASIC;

  /**
   * 基本フィルタのタイプ
   * @type {Canvas2PNG.BasicFilterType}
   */
  this.filterType = Canvas2PNG.BasicFilterType.NONE;

  /**
   * インタレース方法
   * @type {Canvas2PNG.InterlaceMethod}
   */
  this.interlaceMethod = Canvas2PNG.InterlaceMethod.NONE;

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
   * @type {function(Array, number):string}
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
Canvas2PNG.ChunkType = {
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
Canvas2PNG.CompressionMethod = {
  DEFLATE: 0
};

/**
 * 色空間の定義
 * 1 ビット目(0x01)が立っていればパレット使用,
 * 2 ビット目(0x02)が立っていればカラー,
 * 3 ビット目(0x04)が立っていればαチャンネル付き
 * @enum {number}
 */
Canvas2PNG.ColourType = {
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
Canvas2PNG.FilterMethod = {
  BASIC: 0
};

/**
 * 基本となる 5 種類のフィルタ
 * @enum {number}
 */
Canvas2PNG.BasicFilterType = {
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
Canvas2PNG.InterlaceMethod = {
  NONE: 0,
  ADAM7: 1
};

/**
 * PNG フォーマットのシグネチャ
 * @const
 */
Canvas2PNG.Signature =
  String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);

/**
 * 輝度変換に使用する赤の重み
 * @type {number}
 * @const
 * @private
 */
Canvas2PNG.RedWeight_ = 0.29891;

/**
 * 輝度変換に使用する緑の重み
 * @type {number}
 * @const
 * @private
 */
Canvas2PNG.GreenWeight_ = 0.58661;

/**
 * 輝度変換に使用する青の重み
 * @type {number}
 * @const
 * @private
 */
Canvas2PNG.BlueWeight_ = 0.11448;

/**
 * CRC32 で使用するテーブル
 * @type {Array.<number>}
 * @const
 * @private
 */
Canvas2PNG.Crc32Table_ = [
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
Canvas2PNG.Adam7Table_ = [
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
Canvas2PNG.prototype.convert = function() {
  return this.makePng_();
};

/**
 * パレットの取得
 * @return {Array.<number>} パレットの配列.
 */
Canvas2PNG.prototype.getPalette = function() {
  var palette, imageInfo, imageData;

  if (typeof(this.palette_) === 'array') {
    return this.palette_;
  }

  imageData = this.ctx.getImageData(0, 0, this.width, this.height);
  imageInfo = this.makeImageArray(imageData.data);
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
Canvas2PNG.prototype.validate_ = function() {
  var allowDepth, i, l, isArrow = false;

  switch (this.colourType) {
    case Canvas2PNG.ColourType.GRAYSCALE:
      allowDepth = [1, 2, 4, 8, 16];
      break;
    case Canvas2PNG.ColourType.INDEXED_COLOR:
      allowDepth = [1, 2, 4, 8];
      break;
    case Canvas2PNG.ColourType.TRUECOLOR:
    case Canvas2PNG.ColourType.GRAYSCALE_WITH_ALPHA:
    case Canvas2PNG.ColourType.TRUECOLOR_WITH_ALPHA:
      allowDepth = [8, 16];
      break;
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
}

/**
 * PNG の作成
 * @return {string} PNG バイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.makePng_ = function() {
  var png = [], imageInfo;

  png.push(Canvas2PNG.Signature);
  png.push(this.makeIHDR_());

  imageInfo = this.makeImageArray(
    this.ctx.getImageData(0, 0, this.width, this.height).data
  );
  switch (this.colourType) {
    case Canvas2PNG.ColourType.INDEXED_COLOR:
      png.push(this.makePLTE_(imageInfo.PLTE));
      //XXX if (this.saveAlpha) {
      if (true) {
        png.push(this.maketRNS_(imageInfo.tRNS));
      }
      break;
    case Canvas2PNG.ColourType.GRAYSCALE:
    case Canvas2PNG.ColourType.TRUECOLOR:
    case Canvas2PNG.ColourType.GRAYSCALE_WITH_ALPHA:
    case Canvas2PNG.ColourType.TRUECOLOR_WITH_ALPHA:
      break;
    default:
      throw 'TODO';
  }

  png.push(this.makeIDAT_(imageInfo.IDAT));
  png.push(this.makeIEND_());

  return png.join('');
};

/**
 * Image Header
 * @return {string} IHDR チャンクバイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.makeIHDR_ = function() {
  return this.makeChunk_(Canvas2PNG.ChunkType.IHDR, [
    this.convertNetworkByteOrder_(this.width, 4),
    this.convertNetworkByteOrder_(this.height, 4),
    this.convertNetworkByteOrder_(this.bitDepth, 1),
    this.convertNetworkByteOrder_(this.colourType, 1),
    this.convertNetworkByteOrder_(this.compressionMethod, 1),
    this.convertNetworkByteOrder_(this.filterMethod, 1),
    this.convertNetworkByteOrder_(this.interlaceMethod, 1)
  ].join(''));
};

/**
 * make PLTE and IDAT data
 * @return {Object} PLTE プロパティにパレット、IDAT プロパティにピクセル配列、
 *     tRNS プロパティに透明度パレットを含むオブジェクト.
 * @private
 */
Canvas2PNG.prototype.makeImageArray = function(canvasArray) {
  var imageArray = [], img = canvasArray,
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
    case Canvas2PNG.ColourType.GRAYSCALE_WITH_ALPHA:
    case Canvas2PNG.ColourType.GRAYSCALE:
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

        imageArray.push(color);
      }
      break;
    // Truecolor
    case Canvas2PNG.ColourType.TRUECOLOR:
    case Canvas2PNG.ColourType.TRUECOLOR_WITH_ALPHA:
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        tmp = this.slice_(canvasArray, index, withAlpha ? 4 : 3);

        imageArray.push(tmp);
      }
      break;
    // Indexed-Color
    case Canvas2PNG.ColourType.INDEXED_COLOR:
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
        imageArray.push([revTable[color]]);
      }

      break;
  }

  for (index = 0, length = imageArray.length; index < length; index++) {
    if (imageArray[index][0] !== 0) {
    }
  }

  return {
    PLTE: palette,
    tRNS: alphaPalette,
    IDAT: imageArray
  };
};

/**
 * Palette
 * @return {string} PLTE チャンクバイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.makePLTE_ = function(palette) {
  if (palette.length > 256) {
    throw 'over 256 colors';
  }
  return this.makeChunk_(
    Canvas2PNG.ChunkType.PLTE,
    palette.join('')
  );
};

/**
 * Image Data
 * @param {Array} imageArray イメージのバイナリ配列.
 * @return {string} IDAT チャンクバイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.makeIDAT_ = function(imageArray) {
  var idat = [],
      filterMethod = this.filterMethod,
      filterType = this.filterType,
      interlaceMethod = this.interlaceMethod,
      width, y, lines, line, dataWidth, withAlpha,
      passlist, pass, index, length;

  // α付きかどうか
  withAlpha = (this.colourType & 0x04) > 0;

  // インターレースの決定
  switch (interlaceMethod) {
    case Canvas2PNG.InterlaceMethod.NONE:
      this.interlace_ = this.interlaceNone_;
      break; // XXX
    case Canvas2PNG.InterlaceMethod.ADAM7:
      this.interlace_ = this.interlaceAdam7_;
      break;
    default:
      throw 'TODO';
  }

  // フィルタの決定
  switch (filterMethod) {
    case Canvas2PNG.FilterMethod.BASIC:
      switch (filterType) {
        case Canvas2PNG.BasicFilterType.NONE:
          this.filter_ = this.filterNone_;
          break;
        case Canvas2PNG.BasicFilterType.SUB:
          this.filter_ = this.filterSub_;
          break;
        case Canvas2PNG.BasicFilterType.UP:
          this.filter_ = this.filterUp_;
          break;
        case Canvas2PNG.BasicFilterType.AVERAGE:
          this.filter_ = this.filterAverage_;
          break;
        case Canvas2PNG.BasicFilterType.PAETH:
          this.filter_ = this.filterPaeth_;
          break;
        default:
          throw 'TODO';
      }
      break;
    default:
      throw 'unknown filter method';
  }

  // データ幅を決定する(左のピクセルの Byte との距離)
  switch (this.colourType) {
    case Canvas2PNG.ColourType.INDEXED_COLOR:
      dataWidth = 1;
      break;
    case Canvas2PNG.ColourType.GRAYSCALE:
    case Canvas2PNG.ColourType.GRAYSCALE_WITH_ALPHA:
      dataWidth = 1;
      if (withAlpha) {
        dataWidth += 1;
      }
      if (this.bitDepth === 16) {
        dataWidth *= 2;
      }
      break;
    case Canvas2PNG.ColourType.TRUECOLOR:
    case Canvas2PNG.ColourType.TRUECOLOR_WITH_ALPHA:
      dataWidth = 3;
      if (withAlpha) {
        dataWidth += 1;
      }
      if (this.bitDepth === 16) {
        dataWidth *= 2;
      }
      break;
    default:
      throw 'unknown colour type';
  }

  // インターレース処理 (パスの作成)
  passlist = this.interlace_(imageArray);

  for (index = 0, length = passlist.length; index < length; index++) {
    pass = passlist[index];
    imageArray = pass.pixelArray;

    // 空のパスはスキップする
    if (imageArray.length === 0) {
      continue;
    }

    width = pass.width;

    // データ領域の作成
    this.prevLine_ = null;
    for (y = 0, lines = pass.height; y < lines; y++) {
      line = this.slice_(imageArray, y * width, width);

      // Pixel Array -> Byte Array
      // おそらくスキャンライン単位で行うのが正しい
      line = this.pixelArrayToByteArray_(line);

      switch (filterMethod) {
        case Canvas2PNG.FilterMethod.BASIC:
          idat.push(this.convertNetworkByteOrder_(filterType, 1));
          // TODO:
          // 各フィルタでのjoin('')をやめて
          // idat.push.apply(this, this.filter_(line));
          // にしたときの速度と比較して速いほうを採用する
          idat.push(this.filter_(line, dataWidth));
          break;
        default:
          throw 'unknown filter method';
      }

      this.prevLine_ = line;
    }
  }

  // データの圧縮
  switch (this.compressionMethod) {
    case Canvas2PNG.CompressionMethod.DEFLATE:
      idat = Zlib.deflate(idat.join(''));
      break;
    default:
      throw 'unknown compression method';
  }

  return this.makeChunk_(Canvas2PNG.ChunkType.IDAT, idat);
};

/**
 * Image End
 * @return {string} IEND チャンクバイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.makeIEND_ = function() {
  return this.makeChunk_(Canvas2PNG.ChunkType.IEND, '');
};

/**
 * Transparency
 */
Canvas2PNG.prototype.maketRNS_ = function(palette) {
  var alphaPalette = [];

  switch (this.colourType) {
    case Canvas2PNG.ColourType.GRAYSCALE:
    case Canvas2PNG.ColourType.TRUECOLOR:
      throw 'TODO'; // TODO
      break;
    case Canvas2PNG.ColourType.INDEXED_COLOR:
      alphaPalette = palette;
      break;
    default:
      throw 'invalid colour type';
  }

  return this.makeChunk_(
    Canvas2PNG.ChunkType.TRNS,
    alphaPalette.join('')
  );
}

/**
 * Pass
 * @constructor
 */
Canvas2PNG.Pass_ = function(width, height, pixelArray) {
  this.width = width;
  this.height = height;
  this.pixelArray = pixelArray;
};

/**
 * Interlace None
 */
Canvas2PNG.prototype.interlaceNone_ = function(imageArray) {
  return [new Canvas2PNG.Pass_(this.width, this.height, imageArray)];
};

/**
 * Interlace Adam7
 */
Canvas2PNG.prototype.interlaceAdam7_ = function(imageArray) {
  var height = this.height,
      width = imageArray.length / height,
      x, y, blockx, blocky, passx, passy, linex, liney,
      pixel,
      index, length,
      table = Canvas2PNG.Adam7Table_, config,
      passlist, pass;

  // 7 回分のパスを作成
  passlist = [
    new Canvas2PNG.Pass_(0, 0, []),
    new Canvas2PNG.Pass_(0, 0, []),
    new Canvas2PNG.Pass_(0, 0, []),
    new Canvas2PNG.Pass_(0, 0, []),
    new Canvas2PNG.Pass_(0, 0, []),
    new Canvas2PNG.Pass_(0, 0, []),
    new Canvas2PNG.Pass_(0, 0, [])
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
            pixel = imageArray[(blockx + passx) + (blocky + passy) * width];

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
Canvas2PNG.prototype.pixelArrayToByteArray_ = function(imageArray) {
  var byteArray = [], pixel, color,
      index, length, pIndex, pLength,
      depth = this.bitDepth, colourType = this.colourType, sep, current;

  sep = 8 / depth;
  for (index = 0, length = imageArray.length; index < length; index++) {
    pixel = imageArray[index];
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
 * Filter None
 * @param {Array.<number>} imageLine line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {string} filtered line string.
 * @private
 */
Canvas2PNG.prototype.filterNone_ = function(imageLine, sub) {
  var filteredImageLine = imageLine;

  filteredImageLine = String.fromCharCode.apply(this, imageLine);

  return filteredImageLine;
};

/**
 * Filter Sub
 * @param {Array.<number>} imageLine line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {string} filtered line string.
 * @private
 */
Canvas2PNG.prototype.filterSub_ = function(imageLine, sub) {
  var filteredImageLine = [], left = 0, index, length;

  for (index = 0, length = imageLine.length; index < length; index++) {
    left = imageLine[index - sub] || 0;
    filteredImageLine.push((imageLine[index] - left + 0x0100) & 0xff);
  }

  return String.fromCharCode.apply(this, filteredImageLine);
};

/**
 * Filter Up
 * @param {Array.<number>} imageLine line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {string} filtered line string.
 * @private
 */
Canvas2PNG.prototype.filterUp_ = function(imageLine, sub) {
  var filteredImageLine = [], up, prevLine = this.prevLine_, index, length;

  for (index = 0, length = imageLine.length; index < length; index++) {
    up = (prevLine && prevLine[index]) ? prevLine[index] : 0;
    filteredImageLine.push((imageLine[index] - up + 0x0100) & 0xff);
  }

  return String.fromCharCode.apply(this, filteredImageLine);
};

/**
 * Filter Average
 * @param {Array.<number>} imageLine line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {string} filtered line string.
 * @private
 */
Canvas2PNG.prototype.filterAverage_ = function(imageLine, sub) {
  var filteredImageLine = [],
      left, up, average,
      prevLine = this.prevLine_, index, length;

  for (index = 0, length = imageLine.length; index < length; index++) {
    left = imageLine[index - sub] || 0;
    up = prevLine && prevLine[index] || 0;
    average = (left + up) >>> 1;

    filteredImageLine.push((imageLine[index] + 0x0100 - average) & 0xff);
  }

  return String.fromCharCode.apply(this, filteredImageLine);
};

/**
 * Filter Paeth
 * @param {Array.<number>} imageLine line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {string} filtered line string.
 * @private
 */
Canvas2PNG.prototype.filterPaeth_ = function(imageLine, sub) {
  var filteredImageLine = [],
      left, up, leftup, paeth,
      prevLine = this.prevLine_, index, length;

  for (index = 0, length = imageLine.length; index < length; index++) {
    left = imageLine[index - sub] || 0;
    up = prevLine && prevLine[index] || 0;
    leftup = prevLine && prevLine[index - sub] || 0;
    paeth = this.paethPredictor_(left, up, leftup);

    filteredImageLine.push((imageLine[index] - paeth + 0x0100) & 0xff);
  }

  return String.fromCharCode.apply(this, filteredImageLine);
};

/**
 * Paeth Algorithm
 * @param {number} a 1st byte.
 * @param {number} b 2nd byte.
 * @param {number} c 3rd byte.
 * @return {number} nearest byte.
 * @private
 */
Canvas2PNG.prototype.paethPredictor_ = function(a, b, c) {
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
Canvas2PNG.prototype.slice_ = function(arraylike, start, length) {
  var result;

  if (typeof(arraylike) === 'array') {
    return arraylike.slice(start, length);
  }

  result = [];

  for (var i = 0; i < length; i++) {
    result.push(arraylike[start + i]);
  }

  return result;
};

/**
 * チャンクの作成
 * @param {canvas2png.ChunkType} type Chunk type.
 * @param {string} data Chunk data.
 * @return {string} Chunk string.
 * @private
 */
Canvas2PNG.prototype.makeChunk_ = function(type, data) {
  var length = data.length;

  return [
    /* Length*/ this.convertNetworkByteOrder_(length, 4),
    /* Type  */ type,
    /* Data  */ data,
    /* CRC   */ this.convertNetworkByteOrder_(this.getCRC32_(type + data), 4)
  ].join('');
};

/**
 * network byte order integer
 * @param {number} number source number.
 * @param {number=} size size.
 * @return {string} network byte order string.
 * @private
 */
Canvas2PNG.prototype.convertNetworkByteOrder_ = function(number, size) {
  var tmp = [], octet, nullchar;

  do {
    octet = number & 0xff;
    tmp.unshift(String.fromCharCode(octet));
    number >>>= 8;
  } while (number > 0);

  if (typeof(size) === 'number') {
    nullchar = String.fromCharCode(0);
    while (tmp.length < size) {
      tmp.unshift(nullchar);
    }
  }

  return tmp.join('');
};

/**
 * CRC32ハッシュ値を更新
 * @param {string} data data.
 * @param {number} crc CRC32.
 * @return {number} CRC32.
 * @private
 */
Canvas2PNG.prototype.updateCRC32_ = function(data, crc) {
  var octet = 0;

  for (var i = 0, l = data.length; i < l; i++) {
    octet = (crc ^ data.charCodeAt(i)) & 0xff;
    crc = (crc >>> 8) ^ Canvas2PNG.Crc32Table_[octet];
  }

  return crc;
};

/**
 * CRC32 ハッシュ値を取得
 * @param {string} data data.
 * @param {number} crc CRC32.
 * @return {number} CRC32.
 * @private
 */
Canvas2PNG.prototype.getCRC32_ = function(data) {
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
Canvas2PNG.prototype.rgb2y_ = function(red, green, blue) {
  var y;

  y = red * Canvas2PNG.RedWeight_ +
      green * Canvas2PNG.GreenWeight_ +
      blue * Canvas2PNG.BlueWeight_ +
      0.0001; // 丸め

  return (y > 255 ? 255 : y) | 0;
};

/**
 * [R, G, B(, A)]の形に並んでいる配列からバイナリ文字列に変換する
 * @param {Array.<number>} color [R, G, B(, A)]形式の配列.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.rgb2str_ = function(color) {
  return color.slice(0, 3).map(this.fromCharCode_).join('');
};

/**
 * [R, G, B, A]の形に並んでいる配列からバイナリ文字列に変換する
 * @param {Array.<number>} color [R, G, B, A]形式の配列.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
Canvas2PNG.prototype.rgba2str_ = function(color) {
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
Canvas2PNG.prototype.fromCharCode_ = function(code) {
  return String.fromCharCode(code).charAt(0);
};



})(this);

/* vim: set expandtab ts=2 sw=2 tw=80: */

/**
 * @fileoverview JavaScript による PNG Encoder の実装.
 * @see http://www.w3.org/TR/PNG/
 */

goog.provide('CanvasTool.PngEncoder');

goog.require('Zlib.Deflate');
goog.require('Zlib.CRC32');

/**
 * @typedef {!(Array.<number>|Uint8Array)}
 */
var ByteArray;

goog.scope(function() {

/**
 * Canvas to PNG converter
 * @param {!(Element|ByteArray|CanvasPixelArray)} canvas 対象となる
 *     Canvas エレメント, もしくはその CanvasPixelArray 互換の配列.
 * @param {!Object=} opt_param 変換オプション. canvas が Canvas エレメントの場合
 *     以外では、かならず width と height が必要となる.
 * @constructor
 */
CanvasTool.PngEncoder = function(canvas, opt_param) {
  var ctx, width, height;

  /**
   * @type {!(ByteArray|CanvasPixelArray)}
   */
  this.data;

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
    if (typeof opt_param !== 'object') {
      throw new Error('need opt_param object');
    }
    if (typeof opt_param['width'] !== 'number') {
      throw new Error('width property not found');
    }
    if (typeof opt_param['height'] !== 'number') {
      throw new Error('height property not found');
    }

    width = opt_param['width'];
    height = opt_param['height'];
    this.data = canvas;
  } else {
    throw new Error('invalid arguments');
  }

  this.setParameters(width, height, opt_param);
};

/**
 * PNG パラメータの設定
 * @param {!number} width 横幅.
 * @param {!number} height 縦幅.
 * @param {!Object=} opt_param 変換オプション.
 */
CanvasTool.PngEncoder.prototype.setParameters =
function(width, height, opt_param) {
  if (typeof opt_param !== 'object') {
    opt_param = {};
  }

  /**
   * 横幅
   * @type {!number}
   */
  this.width = width;

  /**
   * 縦幅
   * @type {!number}
   */
  this.height = height;

  /**
   * ビット深度
   * @type {!number}
   */
  this.bitDepth = (typeof opt_param['bitDepth'] === 'number') ?
    opt_param['bitDepth'] : 8;

  /**
   * 色空間
   * @type {!CanvasTool.PngEncoder.ColourType}
   */
  this.colourType = (typeof opt_param['colourType'] === 'number') ?
    opt_param['colourType'] :
    CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA;

  /**
   * 圧縮方法
   * @type {!CanvasTool.PngEncoder.CompressionMethod}
   */
  this.compressionMethod =
    (typeof opt_param['compressionMethod'] === 'number') ?
    opt_param['compressionMethod'] :
    CanvasTool.PngEncoder.CompressionMethod.DEFLATE;

  /**
   * フィルタ方法
   * @type {!CanvasTool.PngEncoder.FilterMethod}
   */
  this.filterMethod = (typeof opt_param['filterMethod'] === 'number') ?
    opt_param['filterMethod'] :
    CanvasTool.PngEncoder.FilterMethod.BASIC;

  /**
   * 基本フィルタのタイプ
   * @type {!CanvasTool.PngEncoder.BasicFilterType}
   */
  this.filterType = (typeof opt_param['filterType'] === 'number') ?
    opt_param['filterType'] :
    CanvasTool.PngEncoder.BasicFilterType.NONE;

  /**
   * インタレース方法
   * @type {!CanvasTool.PngEncoder.InterlaceMethod}
   */
  this.interlaceMethod = (typeof opt_param['interlaceMethod'] === 'number') ?
    opt_param['interlaceMethod'] :
    CanvasTool.PngEncoder.InterlaceMethod.NONE;

  /**
   * ガンマ値 ( undefined の場合 gAMA チャンクは付与されない)
   * @type {!number}
   */
  this.gamma = (typeof opt_param['gamma'] === 'number') ?
    opt_param['gamma'] : void 0;

  /**
   * 基礎色度 ( undefined の場合 cHRM チャンクは付与されない)
   * Primary chromaticities and white point
   * @type {!{
   *   whitePointX: number,
   *   whitePointY: number,
   *   redX: number,
   *   redY: number,
   *   greenX: number,
   *   greenY: number,
   *   blueX: number,
   *   blueY: number}}
   */
  this.chrm =
    (typeof opt_param['chrm'] === 'object' && opt_param['chrm'] !== null) ?
    opt_param['chrm'] : void 0;

  /**
   * 推奨パレット
   * name はパレット名, num は以下の通り.
   * 負数の時は出現する全ての色を推奨パレットに含める
   * 0 は無効 ( sPLT チャンクを付与しない)
   * 1 以上の時は出現頻度上位 n 件まで推奨パレットに含める
   * @type {!{
   *   name: string,
   *   num: number
   * }}
   */
  this.splt =
    (typeof opt_param['splt'] === 'object' && opt_param['splt'] !== null) ?
    opt_param['splt'] : void 0;

  /**
   * Standard RGB colour space ( undefined の場合 sRGB チャンクは付与されない)
   * @type {!CanvasTool.PngEncoder.RenderingIntent}
   */
  this.srgb = (typeof opt_param['srgb'] === 'number') ?
    opt_param['srgb'] : void 0;

  /**
   * Significant bits ( undefined の場合 sBIT チャンクは付与されない)
   * @type {!Array.<number>}
   */
  this.sbit = (opt_param['sbit'] instanceof Array) ?
    opt_param['sbit'] : void 0;

  /**
   * ICC プロファイル ( undefined の場合 iCCP チャンクは付与されない)
   * @type {!{
   *   name: !string,
   *   compressionMethod: !CanvasTool.PngEncoder.CompressionMethod,
   *   profile: !Array
   * }}
   */
  this.iccp =
    (typeof opt_param['iccp'] === 'object' && opt_param['iccp'] !== null) ?
    opt_param['iccp'] : void 0;

  /**
   * Image Histogram を保存するかどうか (true で hIST チャンクを付与する)
   * @type {boolean}
   */
  this.hist = opt_param['hist'] !== void 0;

  /**
   * Physical pixel dimensions
   * @type {!{
   *   x: number,
   *   y: number,
   *   unit: CanvasTool.PngEncoder.UnitSpecifier
   * }}
   */
  this.phys =
    (typeof opt_param['phys'] === 'object' && opt_param['phys'] !== null) ?
    opt_param['phys'] : void 0;

  /**
   * Image last-modification time
   * @type {Date}
   */
  this.time = (opt_param['time'] instanceof Date) ?
    opt_param['time'] : void 0;

  /**
   * Textual data
   * @type {!{
   *   keyword: string,
   *   text: string
   * }}
   */
  this.text =
    (typeof opt_param['text'] === 'object' && opt_param['text'] !== null) ?
    opt_param['text'] : void 0;

  /**
   * Compressed textual data
   * @type {!{
   *   keyword: string,
   *   text: string,
   *   compressionMethod: CanvasTool.PngEncoder.CompressionMethod
   * }}
   */
  this.ztxt =
    (typeof opt_param['ztxt'] === 'object' && opt_param['ztxt'] !== null) ?
    opt_param['ztxt'] : void 0;

  /**
   * International textual data
   * @type {?{
   *   keyword: string,
   *   text: string,
   *   lang: string,
   *   translatedKeyword: string,
   *   compressionMethod: ?CanvasTool.PngEncoder.CompressionMethod
   * }} textData text data.
   */
  this.itxt =
    (typeof opt_param['itxt'] === 'object' && opt_param['itxt'] !== null) ?
      opt_param['itxt'] : void 0;

  /**
   * パレット使用時にαチャンネルを保存するか
   * @type {boolean}
   */
  this.trns = opt_param['trns'];

  /**
   * Deflate 設定
   * @type {!Object}
   */
  this.deflateOption = opt_param['deflateOption'];

  /**
   * フィルタメソッド
   * @type {function(ByteArray, number):ByteArray}
   * @private
   */
  this.filter_;

  /**
   * フィルタ(Up, Average, Paeth)で使用する直前のライン
   * @type {?ByteArray}
   * @private
   */
  this.prevLine_ = null;

  /**
   * インターレースメソッド
   * @type {function(!Array.<Array.<number>>):!Array.<number>}
   * @private
   */
  this.interlace_;

  /**
   * パレット
   * @type {!Array.<number>}
   * @private
   */
  this.palette_;

  /**
   * 色出現回数
   * @type {
   *   !Array.<{
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
   * @type {!Array.<number>}
   * @private
   */
  this.paletteHistogram_ = [];

  // バリデーション
  this.validate_();
};

/**
 * チャンクタイプ
 * @enum {ByteArray}
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
 * 1 ビット目(0x01)が立っていればパレット使用, * 2 ビット目(0x02)が立っていればカラー,
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
CanvasTool.PngEncoder.Signature = (function(signature) {
  return USE_TYPEDARRAY ? new Uint8Array(signature) : signature;
})([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * 輝度変換に使用する赤の重み
 * @type {number}
 * @const
 */
CanvasTool.PngEncoder.RedWeight = 0.29891;

/**
 * 輝度変換に使用する緑の重み
 * @type {number}
 * @const
 */
CanvasTool.PngEncoder.GreenWeight = 0.58661;

/**
 * 輝度変換に使用する青の重み
 * @type {number}
 * @const
 */
CanvasTool.PngEncoder.BlueWeight = 0.11448;

/**
 * Adam7 で使用する、各パスの初期位置とステップ数のテーブル
 * @type {!Array.<Object>}
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
 * @return {!string} PNGバイナリ.
 */
CanvasTool.PngEncoder.prototype.convert = function(opt_canvasArray) {
  return str_(this.convertToArray());
};

/**
 * PNG の作成
 * @return {ByteArray} PNG バイナリ byte array.
 */
CanvasTool.PngEncoder.prototype.convertToArray = function() {
  var png = [], imageInfo;

  imageInfo = this.makeImageArray(this.data);

  // signature
  png.push(CanvasTool.PngEncoder.Signature);

  // IHDR
  png.push(this.makeIHDR_());

  // cHRM
  if (typeof(this.chrm) === 'object' && this.chrm !== null) {
    png.push(this.makecHRM_(this.chrm));
  }

  // gAMA
  if (typeof(this.gamma) === 'number') {
    png.push(this.makegAMA_(this.gamma));
  }

  // iCCP
  if (typeof(this.iccp) === 'object' && this.iccp !== null) {
    png.push(this.makeiCCP_(this.iccp));
  }

  // sBIT
  if (this.sbit instanceof Array) {
    png.push(this.makesBIT_(this.sbit));
  }

  // sRGB
  if (typeof(this.srgb) === 'number') {
    png.push(this.makesRGB_(this.srgb));
  }

  // PLTE
  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      png.push(this.makePLTE_(imageInfo.PLTE));
      this.palette_ = imageInfo.PLTE;

      // bKGD
      if (this.bkgd instanceof Array) {
        png.push(this.makebKGD_(this.bkgd, this.palette_));
      }

      // hIST
      if (this.hist) {
        png.push(this.makehIST_(this.paletteHistogram_));
      }

      // tRNS
      if (this.trns) {
        png.push(this.maketRNS_(imageInfo.tRNS));
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
    png.push(this.makepHYs_(this.phys));
  }

  // sPLT
  if (typeof(this.splt) === 'object' && this.splt !== null) {
    png.push(this.makesPLT_(this.splt, this.colourHistogram_));
  }

  // tIME
  if (this.time instanceof Date) {
    png.push(this.maketIME_(this.time));
  }

  // tEXt
  if (typeof(this.text) === 'object' && this.text !== null) {
    png.push(this.maketEXt_(this.text));
  }

  // zTXt
  if (typeof(this.ztxt) === 'object' && this.ztxt !== null) {
    png.push(this.makezTXt_(this.ztxt));
  }

  // iTXt
  if (typeof(this.itxt) === 'object' && this.itxt !== null) {
    png.push(this.makeiTXt_(this.itxt));
  }

  // IDAT
  png.push(this.makeIDAT_(imageInfo.IDAT));

  // IEND
  png.push(this.makeIEND_());

  return concat_(png);
};

/**
 * パレットの取得
 * @return {!Array.<number>} パレットの配列.
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
 * Image Header
 * @return {ByteArray} IHDR チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeIHDR_ = function() {
  var data = new (USE_TYPEDARRAY ? Uint8Array : Array)(13+12);
  var pos = 8;

  // width
  data[pos++] = (this.width >> 24) & 0xff;
  data[pos++] = (this.width >> 16) & 0xff;
  data[pos++] = (this.width >>  8) & 0xff;
  data[pos++] = (this.width      ) & 0xff;

  // height
  data[pos++] = (this.height >> 24) & 0xff;
  data[pos++] = (this.height >> 16) & 0xff;
  data[pos++] = (this.height >>  8) & 0xff;
  data[pos++] = (this.height      ) & 0xff;

  data[pos++] = this.bitDepth;
  data[pos++] = this.colourType;
  data[pos++] = this.compressionMethod;
  data[pos++] = this.filterMethod;
  data[pos  ] = this.interlaceMethod;

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.IHDR, data);
};

/**
 * make PLTE and IDAT data
 * @return {!Object} PLTE プロパティにパレット、IDAT プロパティにピクセル配列,
 *     tRNS プロパティに透明度パレットを含むオブジェクト.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeImageArray = function(canvasArray) {
  var pixelArray = [],
      saveAlpha = this.trns,
      depth = this.bitDepth,
      palette = [], alphaPalette = [], paletteTemp = {}, revTable = {},
      red = 0, green = 0, blue = 0, alpha = 0,
      histIndex = {}, hi = 0, hl = 0,
      color, index, length, tmp;
  /** @type {number} */
  var pos = 0;
  /** @type {Array.<string>} */
  var paletteKeys;
  /**
   * @type {!Array.<{
   *   red: number,
   *   green: number,
   *   blue: number,
   *   alpha: number,
   *   count: number
   * }>} */
  var histogram = this.colourHistogram_;
  /** @type {boolean} */
  var withAlpha = (this.colourType & 0x04) !== 0;

  /*
   * パレットの作成を ColourType に関わらず行っているのは
   * 減色パレットを作成するときの為
   */
  for (index = 0, length = canvasArray.length; index < length; index += 4) {
    // 色の取得
    red   = canvasArray[index];
    green = canvasArray[index + 1];
    blue  = canvasArray[index + 2];
    alpha = canvasArray[index + 3];

    // パレット
    color = saveAlpha ?
      rgba2str_(red, green, blue, alpha) :
      rgb2str_(red, green, blue);
    paletteTemp[color] = (paletteTemp[color] || 0) + 1;

    // ヒストグラム
    hi = ((red << 8 | green) << 8 | blue) << 8 | alpha;
    if (histIndex[hi] === void 0) {
      hl = histogram.length;
      histogram.push({
        red: red,
        green: green,
        blue: blue,
        alpha: alpha,
        count: 0
      });
      histIndex[hi] = hl;
    }
    histogram[histIndex[hi]].count++;
  }

  /*
   * ColourType 別に IDAT の未圧縮データを作成する
   */
  switch (this.colourType) {
    // Grayscale
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        red   = canvasArray[index];
        green = canvasArray[index + 1];
        blue  = canvasArray[index + 2];
        alpha = canvasArray[index + 3];
        color = rgb2y_(red, green, blue);

        if (depth < 8) {
          color >>>= (8 - depth);
          alpha >>>= (8 - depth);
        }

        pixelArray[pos++] = withAlpha ? [color, alpha] : [color];
      }
      break;
    // Truecolor
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        pixelArray[pos++] = withAlpha ? [
         canvasArray[index    ],
         canvasArray[index + 1],
         canvasArray[index + 2],
         canvasArray[index + 3]
        ] : [
          canvasArray[index    ],
          canvasArray[index + 1],
          canvasArray[index + 2]
        ];
      }
      break;
    // Indexed-Color
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      // XXX: 出現回数でsortした方が良いか？

      // パレットの作成
      if (Object.keys) {
        paletteKeys = Object.keys(paletteTemp);
      } else {
        for (color in paletteTemp) {
          paletteKeys.push(color);
        }
      }

      // tRNS チャンクの仕様では後方がアルファ値 255 ならば省略可能なため
      // アルファ値 255 ならば後方に配置する
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
        if (!(rgb2str_.apply(null, this.bkgd) in paletteTemp)) {
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
        throw new Error(
          'over ' + (1 << this.bitDepth) + ' colors: ' + (palette.length / 3)
        );
      }

      // ヒストグラムの初期化
      for (index = 0, length = palette.length / 3; index < length; index++) {
        this.paletteHistogram_[index] = 0;
      }

      // make image array
      for (index = 0, length = canvasArray.length; index < length; index += 4) {
        red   = canvasArray[index];
        green = canvasArray[index + 1];
        blue  = canvasArray[index + 2];
        alpha = canvasArray[index + 3];

        color = saveAlpha ?
          rgba2str_(red, green, blue, alpha) :
          rgb2str_(red, green, blue);

        this.paletteHistogram_[revTable[color]]++;
        pixelArray[pos++] = [revTable[color]];
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
 * @param {!{
 *   whitePointX: !number,
 *   whitePointY: !number,
 *   redX: !number,
 *   redY: !number,
 *   greenX: !number,
 *   greenY: !number,
 *   blueX: !number,
 *   blueY: !number}} chrm 基礎色度情報.
 * @return {ByteArray} cHRM チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makecHRM_ = function(chrm) {
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(32 + 12);
  /** @type {number} */
  var pos = 8;
  /** @type {number} */
  var whitePointX = chrm['whitePointX'] * 100000;
  /** @type {number} */
  var whitePointY = chrm['whitePointY'] * 100000;
  /** @type {number} */
  var redX = chrm['redX'] * 100000;
  /** @type {number} */
  var redY = chrm['redY'] * 100000;
  /** @type {number} */
  var greenX = chrm['greenX'] * 100000;
  /** @type {number} */
  var greenY = chrm['greenY'] * 100000;
  /** @type {number} */
  var blueX = chrm['blueX'] * 100000;
  /** @type {number} */
  var blueY = chrm['blueY'] * 100000;

  chunk[pos++] = (whitePointX >> 24) & 0xff;
  chunk[pos++] = (whitePointX >> 16) & 0xff;
  chunk[pos++] = (whitePointX >>  8) & 0xff;
  chunk[pos++] = (whitePointX      ) & 0xff;

  chunk[pos++] = (whitePointY >> 24) & 0xff;
  chunk[pos++] = (whitePointY >> 16) & 0xff;
  chunk[pos++] = (whitePointY >>  8) & 0xff;
  chunk[pos++] = (whitePointY      ) & 0xff;

  chunk[pos++] = (redX >> 24) & 0xff;
  chunk[pos++] = (redX >> 16) & 0xff;
  chunk[pos++] = (redX >>  8) & 0xff;
  chunk[pos++] = (redX      ) & 0xff;

  chunk[pos++] = (redY >> 24) & 0xff;
  chunk[pos++] = (redY >> 16) & 0xff;
  chunk[pos++] = (redY >>  8) & 0xff;
  chunk[pos++] = (redY      ) & 0xff;

  chunk[pos++] = (greenX >> 24) & 0xff;
  chunk[pos++] = (greenX >> 16) & 0xff;
  chunk[pos++] = (greenX >>  8) & 0xff;
  chunk[pos++] = (greenX      ) & 0xff;

  chunk[pos++] = (greenY >> 24) & 0xff;
  chunk[pos++] = (greenY >> 16) & 0xff;
  chunk[pos++] = (greenY >>  8) & 0xff;
  chunk[pos++] = (greenY      ) & 0xff;

  chunk[pos++] = (blueX >> 24) & 0xff;
  chunk[pos++] = (blueX >> 16) & 0xff;
  chunk[pos++] = (blueX >>  8) & 0xff;
  chunk[pos++] = (blueX      ) & 0xff;

  chunk[pos++] = (blueY >> 24) & 0xff;
  chunk[pos++] = (blueY >> 16) & 0xff;
  chunk[pos++] = (blueY >>  8) & 0xff;
  chunk[pos  ] = (blueY      ) & 0xff;

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.CHRM, chunk);
};

/**
 * ガンマ値
 * @param {!number} gamma ガンマ値.
 * @return {ByteArray} gAMA チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makegAMA_ = function(gamma) {
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(16);
  /** @type {number} */
  var gama = (100000 / gamma) + 0.5 | 0;
  /** @type {number} */
  var pos = 8;

  chunk[pos++] = (gama >> 24) & 0xff;
  chunk[pos++] = (gama >> 16) & 0xff;
  chunk[pos++] = (gama >>  8) & 0xff;
  chunk[pos  ] = (gama      ) & 0xff;

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.GAMA, chunk);
};

/**
 * Significant bits
 * @param {!Array.<number>} sbit 元データの各色の有効ビット数を格納した配列.
 * @return {ByteArray} sBIT チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makesBIT_ = function(sbit) {
  /** @type {ByteArray} */
  var chunk;
  /** @type {number} */
  var pos = 8;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      // grayscale bits
      if (sbit.length !== 1) {
        throw new Error('wrong sBIT length');
      }
      chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(1+12);
      chunk[pos] = sbit[0];
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
      // red, green, blue bits
      if (sbit.length !== 3) {
        throw new Error('wrong sBIT length');
      }
      chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(3+12);
      chunk[pos++] = sbit[0];
      chunk[pos++] = sbit[1];
      chunk[pos  ] = sbit[2];
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      // red, green, blue bits
      if (sbit.length !== 3) {
        throw new Error('wrong sBIT length');
      }
      chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(3+12);
      chunk[pos++] = sbit[0];
      chunk[pos++] = sbit[1];
      chunk[pos  ] = sbit[2];
      break;
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
      // grayscale, alpha bits
      if (sbit.length !== 2) {
        throw new Error('wrong sBIT length');
      }
      chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(2+12);
      chunk[pos++] = sbit[0];
      chunk[pos  ] = sbit[1];
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      // red, green, blue, alpha bits
      if (sbit.length !== 4) {
        throw new Error('wrong sBIT length');
      }
      chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(4+12);
      chunk[pos++] = sbit[0];
      chunk[pos++] = sbit[1];
      chunk[pos++] = sbit[2];
      chunk[pos  ]= sbit[3];
      break;
    default:
      throw new Error('unknown colour type');
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.SBIT, chunk);
};

/**
 * Standard RGB colour space.
 * @param {!CanvasTool.PngEncoder.RenderingIntent} ri レンダリング時の解釈仕様.
 * @return {ByteArray} sRGB チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makesRGB_ = function(ri) {
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(1+12);

  chunk[8] = ri;

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.SRGB, chunk);
};

/**
 * ICC プロファイル
 * XXX: 未テスト.
 * @param {!{
 *   name: !string,
 *   compressionMethod: !CanvasTool.PngEncoder.CompressionMethod,
 *   profile: !Array
 * }} iccp ICCP プロファイル.
 * @return {ByteArray} iCCP チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeiCCP_ = function(iccp) {
  /** @type {Array.<number>} */
  var data;
  /** @type {ByteArray} */
  var chunk;
  /** @type {ByteArray} */
  var namearray;
  /** @type {number} */
  var i;
  /** @type {number} */
  var length;
  /** @type {ByteArray} */
  var compressed;
  /** @type {number} */
  var pos = 8;

  // profile name
  namearray = bytearray_(iccp['name']);
  length = namearray.length;
  if (length > 79) {
    throw new Error('ICCP Profile name is over 79 characters');
  }
  for (i = 0; i < length; i++) {
    if (!isLatin1Printable_(namearray[i])) {
      throw new Error('wrong iccp profile name.');
    }
  }
  data =
    /** @type {Array.<number>} */
    (USE_TYPEDARRAY ? Array.prototype.slice.call(namearray) : namearray);

  // null separator
  data.push(0);

  // compression method
  data.push(iccp['compressionMethod']);

  // profile
  switch (iccp['compressionMethod']) {
    case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
      compressed =
        new Zlib.Deflate(iccp['profile'], this.deflateOption).compress();
      break;
    default:
      throw new Error('unknown ICC Profile compression method');
      break;
  }

  if (USE_TYPEDARRAY) {
    chunk = new Uint8Array(data.length + compressed.length + 12);
    chunk.set(data, pos); pos += data.length;
    chunk.set(compressed, pos);
  } else {
    chunk = [0, 0, 0, 0, 0, 0, 0, 0].concat(data, compressed);
    chunk.length += 4;
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.ICCP, chunk);
};

/**
 * Background colour
 * @param {!Array.<number>} backgroundColour 背景色を表す配列.
 *     グレースケールの際はグレーレベル(0-65535),
 *     それ以外では Red, Green, Blue (0-65535) の順に格納された配列.
 *     ビット深度が16未満の際は下位ビットのみ使用される.
 * @param {!Array.<number>} palette Indexed-Colour の際に使用するパレット配列.
 * @return {ByteArray} bKGD チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makebKGD_ =
function(backgroundColour, palette) {
  /** @type {ByteArray} */
  var data;
  /** @type {?number} */
  var paletteIndex = null;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il;
  /** @type {number} */
  var pos = 8;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA:
      // grayscale
      if (backgroundColour.length !== 1) {
        throw new Error('wrong background-color length');
      }
      data = new (USE_TYPEDARRAY ? Uint8Array : Array)(2+12);
      data[pos++] = (backgroundColour[0] >> 8) & 0xff;
      data[pos  ] = (backgroundColour[0]     ) & 0xff;
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA:
      // red, green, blue
      if (backgroundColour.length !== 3) {
        throw new Error('wrong background-color length');
      }
      data = new (USE_TYPEDARRAY ? Uint8Array : Array)(6+12);
      data[pos++] = (backgroundColour[0] >> 8) & 0xff;
      data[pos++] = (backgroundColour[0]     ) & 0xff;
      data[pos++] = (backgroundColour[1] >> 8) & 0xff;
      data[pos++] = (backgroundColour[1]     ) & 0xff;
      data[pos++] = (backgroundColour[2] >> 8) & 0xff;
      data[pos  ] = (backgroundColour[2]     ) & 0xff;
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      // red, green, blue
      if (backgroundColour.length !== 3) {
        throw new Error('wrong background-color length');
      }
      // palette index
      for (i = 0, il = palette.length; i < il; i += 3) {
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
      data = new (USE_TYPEDARRAY ? Uint8Array : Array)(1+12);
      data[pos] = paletteIndex;
      break;
    default:
      throw new Error('unknown colour type');
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.BKGD, data);
};

/**
 * Image Histogram
 * @param {!Array.<number>} hist パレットエントリ毎の出現回数配列.
 * @return {ByteArray} hIST チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makehIST_ = function(hist) {
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(hist.length * 2 + 12);
  /** @type {number} */
  var max = max_(hist);
  /** @type {number} */
  var h;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il = hist.length;
  /** @type {number} */
  var pos = 8;

  // make histogram
  for (i = 0; i < il; i++) {
    // 0 は出現していない色のみであるべきなので 1 回でも出現したものは
    // 1-65535 の範囲に分布する必要がある.
    h = hist[i];
    h = (h === 0) ? 0 : (h / max * (0xffff - 1) + 1) + 0.5 | 0;
    chunk[pos++] = (h >> 8) & 0xff;
    chunk[pos++] = (h     ) & 0xff;
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.HIST, chunk);
};

/**
 * Suggested palette
 * @param {?{
 *   name: string,
 *   num: number
 * }} splt sPLT 設定オブジェクト.
 * @param {!Array.<number>} hist パレットエントリ毎の出現回数配列.
 * @return {ByteArray} sPLT チャンク byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makesPLT_ = function(splt, hist) {
  /** @type {Array.<number>} */
  var data;
  /** @type {number} */
  var sortedHist;
  /** @type {ByteArray};
  var name;
  /** @type {number} */
  var max;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il = splt['num'] < 0 ? hist.length : splt['num'];
  /** @type {number} */
  var freq = 0;
  /** @type {number} */
  var pos = 8;

  // チャンクを付与しない
  if (il === 0) {
    return [];
  }

  // name
  data = [0, 0, 0, 0, 0, 0, 0, 0].concat(bytearray_(splt['name']));

  // null separator
  data[pos++] = 0;

  // sample depth, RGBA value
  switch (this.bitDepth) {
    case 16:
      data[pos++] = 16;
      break;
    case 8:
    case 4:
    case 2:
    case 1:
      data[pos++] = 8;
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
  for (i = 0; i < il; ++i) {
    hist = sortedHist[i];

    switch (this.bitDepth) {
      // RGBA
      case 16:
        data[pos++] = hist.red   & 0xff;
        data[pos++] = hist.red   & 0xff;
        data[pos++] = hist.green & 0xff;
        data[pos++] = hist.green & 0xff;
        data[pos++] = hist.blue  & 0xff;
        data[pos++] = hist.blue  & 0xff;
        data[pos++] = hist.alpha & 0xff;
        data[pos++] = hist.alpha & 0xff;
        break;
      case 8:
      case 4:
      case 2:
      case 1:
        data[pos++] = hist.red   & 0xff;
        data[pos++] = hist.green & 0xff;
        data[pos++] = hist.blue  & 0xff;
        data[pos++] = hist.alpha & 0xff;
        break;
      default:
        throw new Error('invalid bit depth');
    }

    // freq: 0-65535 の範囲にする
    freq = hist.count / max * 0xffff + 0.5 | 0;
    data[pos++] = (freq >> 8) & 0xff;
    data[pos++] = (freq     ) & 0xff;
  }

  data.length += 4;


  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.SPLT,
    USE_TYPEDARRAY ? new Uint8Array(data) : data
  );
};

/**
 * Palette
 * @param {!Array} palette パレット配列.
 * @return {ByteArray} PLTE チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makePLTE_ = function(palette) {
  /** @type {ByteArray} */
  var chunk;

  if (palette.length / 3 > 256) {
    throw new Error('over 256 colors: ' + (palette.length / 3));
  }

  if (USE_TYPEDARRAY) {
    chunk = new Uint8Array(palette.length + 12);
    chunk.set(palette, 8);
  } else {
    chunk = palette;
    chunk.unshift(0, 0, 0, 0, 0, 0, 0, 0);
    chunk.length += 8;
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.PLTE, chunk);
};

/**
 * Physical pixel dimensions
 * @param {?{
 *   x: number,
 *   y: number,
 *   unit: CanvasTool.PngEncoder.UnitSpecifier
 * }} phys phisical pixel dimensions settings.
 * @return {ByteArray} pHYs チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makepHYs_ = function(phys) {
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(9+12);
  /** @type {number} */
  var pos = 8;

  chunk[pos++] = (phys['x'] >> 24) & 0xff;
  chunk[pos++] = (phys['x'] >> 16) & 0xff;
  chunk[pos++] = (phys['x'] >>  8) & 0xff;
  chunk[pos++] = (phys['x']      ) & 0xff;

  chunk[pos++] = (phys['y'] >> 24) & 0xff;
  chunk[pos++] = (phys['y'] >> 16) & 0xff;
  chunk[pos++] = (phys['y'] >>  8) & 0xff;
  chunk[pos++] = (phys['y']      ) & 0xff;

  chunk[pos] = phys['unit'];

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.PHYS, chunk);
};

/**
 * Textual data
 * @param {?{
 *   keyword: string,
 *   text: string
 * }} textData text data.
 * @return {ByteArray} tEXt チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.maketEXt_ = function(textData) {
  /** @type {ByteArray} */
  var keyword = bytearray_(textData['keyword']);
  /** @type {ByteArray} */
  var text = bytearray_(textData['text']);
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(
    keyword.length + text.length + 1 + 12
  );
  /** @type {number} */
  var pos = 8;
  /** @type {number} */
  var i;
  /** @type {number} */
  var il;

  // keyword
  for (i = 0, il = keyword.length; i < il; ++i) {
    chunk[pos++] = keyword[i];
  }

  // null separator
  chunk[pos++] = 0;

  // text string
  for (i = 0, il = text.length; i < il; ++i) {
    chunk[pos++] = text[i];
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.TEXT, chunk);
};


/**
 * Compressed textual data
 * @param {?{
 *   keyword: string,
 *   text: string,
 *   compressionMethod: CanvasTool.PngEncoder.CompressionMethod
 * }} textData text data.
 * @return {ByteArray} zTXt チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makezTXt_ = function(textData) {
  /** @type {Array.<number>} */
  var data;
  /** @type {ByteArray} */
  var compressed;
  /** @type {ByteArray} */
  var chunk;
  /** @type {ByteArray} */
  var text = bytearray_(textData['text']);
  /** @type {ByteArray} */
  var keyword = bytearray_(textData['keyword']);

  data = [0, 0, 0, 0, 0, 0, 0, 0].concat(
    // keyword
    USE_TYPEDARRAY ? Array.prototype.slice.call(keyword) : keyword,
    // null separator
    0,
    // compression method
    textData['compressionMethod']
  );

  // data
  switch (textData['compressionMethod']) {
    case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
      compressed = new Zlib.Deflate(text, this.deflateOption).compress();
      break;
    default:
      throw new Error('unknown compression method');
      break;
  }

  if (USE_TYPEDARRAY) {
    chunk = new Uint8Array(data.length + compressed.length + 4);
    chunk.set(data);
    chunk.set(compressed, data.length);
  } else {
    chunk = data.concat(compressed);
    chunk.length += 4;
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.ZTXT, chunk);
};

/**
 * International textual data
 * @param {?{
 *   keyword: string,
 *   text: string,
 *   lang: string,
 *   translatedKeyword: string,
 *   compressionMethod: ?CanvasTool.PngEncoder.CompressionMethod
 * }} textData text data.
 * @return {ByteArray} iTXt チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeiTXt_ = function(textData) {
  /** @type {Array.<number>} */
  var data;
  /** @type {ByteArray} */
  var keyword = bytearray_(textData['keyword']);
  /** @type {ByteArray} */
  var compressedText;
  /** @type {ByteArray} */
  var chunk;
  /** @type {number} */
  var pos = 8;

  // keyword
  data =
    /** @type {Array.<number>} */
    (USE_TYPEDARRAY ? Array.prototype.slice.call(keyword) : keyword);

  // null separator
  data.push(0);

  if (typeof(textData['compressionMethod']) === 'number') {
    // compression flag
    data.push(CanvasTool.PngEncoder.CompressionFlag.COMPRESSED);

    // compression method
    data.push(textData['compressionMethod']);

    // text compression
    switch (textData['compressionMethod']) {
      case CanvasTool.PngEncoder.CompressionMethod.DEFLATE:
        compressedText = new Zlib.Deflate(
          bytearray_(utf8_(textData['text'])),
          this.deflateOption
        ).compress();
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
    compressedText = bytearray_(utf8_(textData['text']));
  }

  // language tag
  data = data.concat(bytearray_(textData['lang']));

  // null separator
  data.push(0);

  // translated keyword
  if (typeof(textData['translatedKeyword']) === 'string') {
    data = data.concat(bytearray_(utf8_(textData['translatedKeyword'])));
  }

  // null separator
  data.push(0);

  // text
  if (USE_TYPEDARRAY) {
    chunk = new Uint8Array(data.length + compressedText.length + 12);
    chunk.set(data, pos); pos += data.length;
    chunk.set(compressedText, pos);
  } else {
    chunk = [0, 0, 0, 0, 0, 0, 0, 0].concat(data, compressedText);
    chunk.length += 4;
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.ITXT, chunk);
};


/**
 * Image last-modification time
 * @param {Date} time last-modification time.
 * @return {ByteArray} tIME チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.maketIME_ = function(time) {
  /** @type {ByteArray} */
  var chunk = new (USE_TYPEDARRAY ? Uint8Array : Array)(7+12);
  /** @type {number} */
  var pos = 8;

  chunk[pos++] = (time.getUTCFullYear() >> 8) & 0xff;
  chunk[pos++] = (time.getUTCFullYear()     ) & 0xff;
  chunk[pos++] = time.getUTCMonth() + 1;
  chunk[pos++] = time.getUTCDate();
  chunk[pos++] = time.getUTCHours();
  chunk[pos++] = time.getUTCMinutes();
  chunk[pos  ] = time.getUTCSeconds();

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.TIME, chunk);
};

/**
 * Image Data
 * @param {!Array} pixelArray イメージのバイナリ配列.
 * @return {ByteArray} IDAT チャンクバイナリ Array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeIDAT_ = function(pixelArray) {
  var idat = [],
      filterMethod = this.filterMethod,
      filterType = this.filterType,
      width, y, lines, line, bpp,
      passlist, pass, index, length;
  var chunk;

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
      idat = new Zlib.Deflate(idat, this.deflateOption).compress();
      break;
    default:
      throw new Error('unknown compression method');
  }

  // chunk
  if (USE_TYPEDARRAY) {
    chunk = new Uint8Array(idat.length + 12);
    chunk.set(idat, 8);
  } else {
    chunk = idat;
    chunk.unshift(0, 0, 0, 0, 0, 0, 0, 0);
    chunk.length += 4;
  }

  return this.makeChunk_(CanvasTool.PngEncoder.ChunkType.IDAT, chunk);
};

/**
 * Image End
 * @return {ByteArray} IEND チャンクバイナリ Array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeIEND_ = function() {
  return this.makeChunk_(
    CanvasTool.PngEncoder.ChunkType.IEND,
    new (USE_TYPEDARRAY ? Uint8Array : Array)(12)
  );
};

/**
 * Transparency
 * @param {!Array.<number>} alpha α値.
 *     Indexed-Color では Palette に対応するα値の配列,
 *     Grayscale では透明として扱うグレーレベルを [Gray],
 *     Truecolor では透明として扱う色を [Red, Green, Blue] で指定.
 * @return {ByteArray} tRNS チャンクバイナリ byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.maketRNS_ = function(alpha) {
  /** @type {ByteArray} */
  var data;
  /** @type {number} */
  var pos = 8;

  switch (this.colourType) {
    case CanvasTool.PngEncoder.ColourType.GRAYSCALE:
      data = new (USE_TYPEDARRAY ? Uint8Array : Array)(2+12);
      data[pos++] = (alpha[0] >> 8) & 0xff;
      data[pos++] = (alpha[0]     ) & 0xff;
      break;
    case CanvasTool.PngEncoder.ColourType.TRUECOLOR:
      data = new (USE_TYPEDARRAY ? Uint8Array : Array)(6+12);
      data[pos++] = (alpha[0] >> 8) & 0xff;
      data[pos++] = (alpha[0]     ) & 0xff;
      data[pos++] = (alpha[1] >> 8) & 0xff;
      data[pos++] = (alpha[1]     ) & 0xff;
      data[pos++] = (alpha[2] >> 8) & 0xff;
      data[pos++] = (alpha[2]     ) & 0xff;
      break;
    case CanvasTool.PngEncoder.ColourType.INDEXED_COLOR:
      data = new (USE_TYPEDARRAY ? Uint8Array : Array)(alpha.length+12);
      if (USE_TYPEDARRAY) {
        data.set(alpha, pos);
      } else {
        data = alpha;
        data.unshift(0, 0, 0, 0, 0, 0, 0, 0);
        data.length += 4;
      }
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
 * @return {function(!Array):!Array.<CanvasTool.PngEncoder.Pass_>} 描画パスのリスト.
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
 * @param {!Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @constructor
 */
CanvasTool.PngEncoder.Pass_ = function(width, height, pixelArray) {
  this.width = width;
  this.height = height;
  this.pixelArray = pixelArray;
};

/**
 * Interlace None
 * @param {!Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @return {!Array.<CanvasTool.PngEncoder.Pass_>} 描画パスのリスト.
 * @private
 */
CanvasTool.PngEncoder.prototype.interlaceNone_ = function(pixelArray) {
  return [new CanvasTool.PngEncoder.Pass_(this.width, this.height, pixelArray)];
};

/**
 * Interlace Adam7
 * @param {!Array.<Array.<number>>} pixelArray ピクセル単位の配列.
 * @return {!Array.<CanvasTool.PngEncoder.Pass_>} 描画パスのリスト.
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
 * @param {ByteArray} pixelArray canvas pixel array like.
 * @return {ByteArray} pixel byte array.
 */
CanvasTool.PngEncoder.prototype.pixelArrayToByteArray_ = function(pixelArray) {
  // TODO: サイズ予測可能
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
 * @return {function(ByteArray.<number>, number):ByteArray} フィルタメソッド.
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
 * @param {ByteArray} lineByteArray line byte array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {ByteArray} filtered line byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.filterNone_ = function(lineByteArray, sub) {
  var filteredImageLine = lineByteArray;

  filteredImageLine = lineByteArray;

  return filteredImageLine;
};

/**
 * Filter Sub
 * @param {ByteArray} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {ByteArray} filtered line byte array.
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
 * @param {ByteArray} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {ByteArray} filtered line byte array.
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
 * @param {ByteArray} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {ByteArray} filtered line byte array.
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
 * @param {ByteArray} lineByteArray line array.
 * @param {number} sub 左のピクセルとの距離.
 * @return {ByteArray} filtered line byte array.
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
 * @param {!(Array|Object)} arraylike slice の対象となる Array 風のオブジェクト.
 * @param {number} start 開始 index.
 * @param {number} length 切り出す長さ.
 * @return {ByteArray} 指定した範囲の新しい配列.
 * @private
 */
CanvasTool.PngEncoder.prototype.slice_ = function(arraylike, start, length) {
  return typeof arraylike.slice === 'function' ?
    arraylike.slice(start, start + length) :
    Array.prototype.slice.call(arraylike, start, start + length);
};

/**
 * チャンクの作成
 * @param {CanvasTool.PngEncoder.ChunkType} type Chunk type.
 * @param {ByteArray} data.
 * @return {ByteArray} Chunk byte array.
 * @private
 */
CanvasTool.PngEncoder.prototype.makeChunk_ = function(type, data) {
  /** @type {number} */
  var length = data.length - 12;
  /** @type {number} */
  var pos = 0;
  /** @type {number} */
  var crc;

  // Length
  data[pos++] = (length >> 24) & 0xff;
  data[pos++] = (length >> 16) & 0xff;
  data[pos++] = (length >>  8) & 0xff;
  data[pos++] = (length      ) & 0xff;
  // Type
  data[pos++] = type[0];
  data[pos++] = type[1];
  data[pos++] = type[2];
  data[pos++] = type[3];
  // CRC
  crc = Zlib.CRC32.calc(data, 4, 4 + length);
  pos = data.length - 4;
  data[pos++] = (crc >> 24) & 0xff;
  data[pos++] = (crc >> 16) & 0xff;
  data[pos++] = (crc >>  8) & 0xff;
  data[pos  ] = (crc      ) & 0xff;

  return data;
};

/**
 * network byte order integer
 * @param {number} number source number.
 * @param {number=} size size.
 * @return {!Array} network byte order byte array.
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
 * RGB -> Y 変換
 * @param {number} red 赤要素の値 (0-255).
 * @param {number} green 緑要素の値 (0-255).
 * @param {number} blue 青要素の値 (0-255).
 * @return {number} 輝度 (0-255).
 * @private
 */
function rgb2y_(red, green, blue) {
  /** @type {number} */
  var y;

  y = red * CanvasTool.PngEncoder.RedWeight +
      green * CanvasTool.PngEncoder.GreenWeight +
      blue * CanvasTool.PngEncoder.BlueWeight +
      0.0001; // 丸め

  return (y > 255 ? 255 : y) | 0;
}

/**
 * RGB からバイナリ文字列に変換する
 * @param {number} red red.
 * @param {number} green green.
 * @param {number} blue blue.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
function rgb2str_(red, green, blue) {
  return String.fromCharCode(red, green, blue);
}

/**
 * RGBA からバイナリ文字列に変換する
 * @param {number} red red.
 * @param {number} green green.
 * @param {number} blue blue.
 * @param {number} alpha alpha.
 * @return {string} 変換されたバイナリ文字列.
 * @private
 */
function rgba2str_(red, green, blue, alpha) {
  return String.fromCharCode(red, green, blue, alpha);
}

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
 * @param {ByteArray} dst 結合先となる配列.
 * @param {ByteArray} src 結合元となる配列.
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
 * ByteArray 配列の結合
 * @param {Array.<ByteArray>} array
 * @return {ByteArray}
 * @private
 */
function concat_(array) {
  /** @type {number} */
  var i;
  /** @type {number} */
  var il;
  /** @type {ByteArray} */
  var result;
  /** @type {number} */
  var resultLength;
  /** @type {number} */
  var pos;

  if (USE_TYPEDARRAY) {
    for (i = 0, il = array.length, resultLength = 0; i < il; ++i) {
      resultLength += array[i].length;
    }

    result = new Uint8Array(resultLength);
    for (i = 0, pos = 0; i < il; ++i) {
      result.set(array[i], pos);
      pos += array[i].length;
    }

    return result;
  } else {
    return Array.prototype.concat.apply([], array);
  }
}

/**
 * 文字列から bytearray への変換
 * @param {string} str byte array に変換する文字列.
 * @return {ByteArray} 変換した byte array.
 * @private
 */
function bytearray_(str) {
  /** @type {Array.<string>} */
  var srcarray = str.split('');
  /** @type {number} */
  var i;
  /** @type {number} */
  var il = srcarray.length;
  /** @type {ByteArray} */
  var bytearray = new (USE_TYPEDARRAY ? Uint8Array : Array)(il);

  for (i = 0; i < il; ++i) {
    bytearray[i] = srcarray[i].charCodeAt(0);
  }

  return bytearray;
}

/**
 * Math.max.apply 代替
 * @param {!Array.<number>} array 対象となる配列.
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
});


//*****************************************************************************
// export
//*****************************************************************************

function exportEnum(path, keyValue) {
  var key;

  for (key in keyValue) {
    goog.exportSymbol([path, key].join('.'), keyValue[key]);
  }
}

/**
 * @define {boolean} no export symbols.
 */
CanvasTool.PngEncoder.NO_EXPORT = true;

if (!CanvasTool.PngEncoder.NO_EXPORT) {
  goog.exportSymbol(
    'CanvasTool.PngEncoder',
    CanvasTool.PngEncoder
  );

  exportEnum(
    'CanvasTool.PngEncoder.CompressionMethod',
    {
      'DEFLATE': CanvasTool.PngEncoder.CompressionMethod.DEFLATE
    }
  );

  exportEnum(
    'CanvasTool.PngEncoder.ColourType',
    {
      'GRAYSCALE': CanvasTool.PngEncoder.ColourType.GRAYSCALE,
      'TRUECOLOR': CanvasTool.PngEncoder.ColourType.TRUECOLOR,
      'INDEXED_COLOR': CanvasTool.PngEncoder.ColourType.INDEXED_COLOR,
      'GRAYSCALE_WITH_ALPHA': CanvasTool.PngEncoder.ColourType.GRAYSCALE_WITH_ALPHA,
      'TRUECOLOR_WITH_ALPHA': CanvasTool.PngEncoder.ColourType.TRUECOLOR_WITH_ALPHA
    }
  );

  exportEnum(
    'CanvasTool.PngEncoder.FilterMethod',
    {
      'BASIC': CanvasTool.PngEncoder.FilterMethod.BASIC
    }
  );

  exportEnum(
    'CanvasTool.PngEncoder.BasicFilterType',
    {
      'NONE': CanvasTool.PngEncoder.BasicFilterType.NONE,
      'SUB': CanvasTool.PngEncoder.BasicFilterType.SUB,
      'UP': CanvasTool.PngEncoder.BasicFilterType.UP,
      'AVERAGE': CanvasTool.PngEncoder.BasicFilterType.AVERAGE,
      'PAETH': CanvasTool.PngEncoder.BasicFilterType.PAETH
    }
  );

  exportEnum(
    'CanvasTool.PngEncoder.InterlaceMethod',
    {
      'NONE': CanvasTool.PngEncoder.InterlaceMethod.NONE,
      'ADAM7': CanvasTool.PngEncoder.InterlaceMethod.ADAM7
    }
  );

  exportEnum(
    'CanvasTool.PngEncoder.CompressionFlag',
    {
      'UNCOMPRESSED': CanvasTool.PngEncoder.CompressionFlag.UNCOMPRESSED,
      'COMPRESSED': CanvasTool.PngEncoder.CompressionFlag.COMPRESSED
    }
  );

  goog.exportSymbol(
    'CanvasTool.PngEncoder.prototype.convert',
    CanvasTool.PngEncoder.prototype.convert
  );

  goog.exportSymbol(
    'CanvasTool.PngEncoder.prototype.convertToArray',
    CanvasTool.PngEncoder.prototype.convertToArray
  );
}

// end of scope

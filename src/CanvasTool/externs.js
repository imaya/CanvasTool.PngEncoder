(function() {
var CanvasTool = {};

/*****************************************************************************
 * copy from canvas2png.js
 *****************************************************************************/
CanvasTool.PngEncoder = function() {
  /**
   * 横幅
   * @type {number}
   */
  this.width;

  /**
   * 縦幅
   * @type {number}
   */
  this.height;

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
};

/**
 * チャンクタイプ
 * @enum {Array.<number>}
 */
CanvasTool.PngEncoder.ChunkType = {
  // 必須チャンク
  IHDR: ['IHDR'],
  PLTE: ['PLTE'],
  IDAT: ['IDAT'],
  IEND: ['IEND'],
  // 補助チャンク
  TRNS: ['tRNS'],
  GAMA: ['gAMA'],
  CHRM: ['cHRM'],
  SBIT: ['sBIT'],
  SRGB: ['sRGB'],
  ICCP: ['iCCP'],
  BKGD: ['bKGD'],
  HIST: ['hIST'],
  PHYS: ['pHYs'],
  SPLT: ['sPLT'],
  TEXT: ['tEXt'],
  ZTXT: ['zTXt'],
  ITXT: ['iTXt'],
  TIME: ['tIME']
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

})();

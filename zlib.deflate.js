/**
 * zlib.deflate.js
 * @author imaya <imaya.devel@gmail.com>
 */
(function(global) {

var Zlib = (typeof global['Zlib'] === 'object') ? global['Zlib'] : {};

/**
 * Namespace
 * @type {Object}
 */
global['Zlib'] = Zlib;

/**
 * Zlib Deflate
 * @param {string} str Data.
 * @param {number=} level Compress level.
 * @return {string} compressed data.
 */
Zlib.deflate = function(str) {
  var cmf, flg, cm, cinfo, fcheck, fdict, flevel,
      clevel, compressedData, adler, error = false, deflate;

  // Compression Method and Flags
  cm = CompressionMethod.DEFLATE;
  if (cm === CompressionMethod.DEFLATE) {
    cinfo = Math.LOG2E * Math.log(32768) - 8;
  } else {
    cinfo = 0;
  }
  cmf = (cinfo << 4) | (cm);

  // Flags
  fdict = 0;
  if (cm === CompressionMethod.DEFLATE) {
    flevel = 0;
  } else {
    flevel = 0;
  }
  flg = (flevel << 6) | (fdict << 5);
  fcheck = 31 - (cmf * 256 + flg) % 31;
  flg |= fcheck;

  // compressed data
  compressedData = zip_deflate(str);

  // Adler-32 checksum
  adler = convertNetworkByteOrder(adler32(str), 4);

  // make zlib string
  deflate = [
    String.fromCharCode(cmf, flg),
    compressedData,
    adler
  ].join('');

  return deflate;
};

/**
 * @enum {number}
 */
var CompressionMethod = {
  DEFLATE: 8,
  RESERVED: 15
};

/**
 * Adler32 ハッシュ値の更新
 * @param {number} adler 現在のハッシュ値.
 * @param {string} str 更新に使用する文字列.
 * @return {number} Adler32 ハッシュ値.
 */
function updateAdler32(adler, str) {
  var s1 = adler & 0xffff;
      s2 = (adler >>> 16) & 0xffff;

  for (var i = 0, l = str.length; i < l; i++) {
    s1 = (s1 + str.charCodeAt(i)) % 65521;
    s2 = (s2 + s1) % 65521;
  }

  return (s2 << 16) + s1;
}

/**
 * Adler32 ハッシュ値の作成
 * @param {string} str 算出に使用する文字列.
 * @return {number} Adler32 ハッシュ値.
 */
function adler32(str) {
  return updateAdler32(1, str);
}

/**
 * copy from canvas2png.js
 *
 * network byte order integer
 * @param {number} number source number.
 * @param {number=} padding padding.
 * @return {string} network byte order string.
 */
function convertNetworkByteOrder(number, padding) {
  var tmp = [], octet, nullchar;

  do {
    octet = number & 0xff;
    tmp.unshift(String.fromCharCode(octet));
    number >>>= 8;
  } while (number > 0);

  if (typeof(padding) === 'number') {
    nullchar = String.fromCharCode(0);
    while (tmp.length < padding) {
      tmp.unshift(nullchar);
    }
  }

  return tmp.join('');
}

/**
 * deflate 圧縮を行う
 * @param {string} str プレーンテキスト.
 * @return {string} 圧縮済みバイナリ文字列.
 */
function zip_deflate(str) {
  var blocks = [], blockString, position, length;

  // ブロックの作成
  for (position = 0, length = str.length; position < length;) {
    blockString = str.slice(position, position + 0xff);

    // update positon
    position += blockString.length;

    // make block
    blocks.push(makeDeflateBlock(blockString, (position === length)));
  }

  // ブロックが一つもない場合は空のブロックを作成して返す
  if (blocks.length === 0) {
    blocks.push(makeDeflateBlock('', true));
  }

  return blocks.join('');
}

/**
 * deflate ブロックの作成 (現在は非圧縮のみ対応)
 * @param {string} blockString ブロックデータ文字列.
 * @param {boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {string} 非圧縮ブロックバイナリ文字列.
 */
function makeDeflateBlock(blockString, isFinalBlock) {
  var block = [], bfinal, btype, len, nlen;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = 0; // 非圧縮

  block.push(
    (bfinal << 0) | (btype << 2)
  );

  // length
  len = blockString.length;
  nlen = (~len + 0x10000) & 0xffff;

  block.push(
             len & 0xff,
     (len >>> 8) & 0xff,
            nlen & 0xff,
    (nlen >>> 8) & 0xff
  );

  // data
  return [String.fromCharCode.apply(this, block), blockString].join('');
}


// end of scope
})(this);

/* vim:set expandtab ts=2 sw=2 tw=80: */

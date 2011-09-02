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
 * @enum {number}
 */
Zlib.CompressionMethod = {
  DEFLATE: 8,
  RESERVED: 15
};

/**
 * Zlib Deflate
 * @param {Array|string} buffer Data.
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate = function(buffer) {
  this.buffer = buffer;
  this.compressionType = Zlib.Deflate.CompressionType.FIXED;
};

/**
 * @enum {number}
 */
Zlib.Deflate.CompressionType = {
  NONE: 0,
  FIXED: 1,
  CUSTOM: 2,
  RESERVED: 3
};

/**
 * 直接圧縮に掛ける
 * @param {Array|string} buffer Data.
 * @param {Object} opt_param parameters.
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate.compress = function(buffer, opt_param) {
  var deflate = new Zlib.Deflate(buffer);

  return deflate.compress(opt_param);
};

/**
 * Deflate Compression
 * @param {Object} opt_param parameters.
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate.prototype.compress = function(opt_param) {
  var cmf, flg, cm, cinfo, fcheck, fdict, flevel,
      clevel, compressedData, adler, error = false, deflate;

  // Compression Method and Flags
  cm = Zlib.CompressionMethod.DEFLATE;
  switch (cm) {
    case Zlib.CompressionMethod.DEFLATE:
      cinfo = Math.LOG2E * Math.log(RawDeflate.WindowSize) - 8;
      break;
    default:
      throw 'invalid compression method';
  }
  cmf = (cinfo << 4) | cm;

  // Flags
  fdict = 0;
  switch (cm) {
    case Zlib.CompressionMethod.DEFLATE:
      switch (this.compressionType) {
        case Zlib.Deflate.CompressionType.NONE: flevel = 0; break;
        case Zlib.Deflate.CompressionType.FIXED: flevel = 1; break;
        case Zlib.Deflate.CompressionType.CUSTOM: throw 'TODO';
        default: throw 'unsupported compression type';
      }
      break;
    default:
      throw 'invalid compression method';
  }
  flg = (flevel << 6) | (fdict << 5);
  fcheck = 31 - (cmf * 256 + flg) % 31;
  flg |= fcheck;

  // compressed data
  compressedData = this.makeBlocks();

  // Adler-32 checksum
  adler = convertNetworkByteOrder(Zlib.adler32(compressedData), 4);

  // make zlib string
  deflate = [];
  deflate.push(cmf, flg);
  Array.prototype.push.apply(deflate, compressedData);
  Array.prototype.push.apply(deflate, adler);

  return deflate;
};

/**
 * deflate 圧縮を行う
 * @return {string} 圧縮済み byte array.
 */
Zlib.Deflate.prototype.makeBlocks = function() {
  var blocks = [], blockArray, position, length;

  if (typeof this.buffer === 'string') {
    this.buffer =
      this.buffer.split('').map(function(c) { return c.charCodeAt(0); });
  }

  switch (this.compressionType) {
    case Zlib.Deflate.CompressionType.NONE:
      // ブロックの作成
      for (position = 0, length = this.buffer.length; position < length;) {
        blockArray = slice_(this.buffer, position, 0xffff);

        // update positon
        position += blockArray.length;

        // make block
        Array.prototype.push.apply(
          blocks,
          makeNocompressBlock(blockArray, (position === length))
        );
      }
      break;
    case Zlib.Deflate.CompressionType.FIXED:
      Array.prototype.push.apply(
          blocks,
          makeFixedHuffmanBlock(this.buffer, true)
      );
      break;
    case Zlib.Deflate.CompressionType.CUSTOM:
      throw 'TODO'; // TODO
      break;
    default:
      throw 'invalid compression type';
  }

  return blocks;
};

/**
 * 非圧縮ブロックの作成
 * @param {string} blockString ブロックデータ文字列.
 * @param {boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {Array} 非圧縮ブロック byte array.
 */
function makeNocompressBlock(blockArray, isFinalBlock) {
  var header = []. bfinal, btype, len, nlen, i, l;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.Deflate.CompressionType.NONE;
  header.push((bfinal) | (btype << 1));

  // length
  len = blockArray.length;
  nlen = (~len + 0x10000) & 0xffff;
  header.push(
             len & 0xff,
     (len >>> 8) & 0xff,
            nlen & 0xff,
    (nlen >>> 8) & 0xff
  );

  Array.prototype.unshift.apply(blockArray, header);

  return blockArray;
}

/**
 * 固定ハフマンブロックの作成
 * @param {Array} blockArray ブロックデータ byte array.
 * @param {boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {string} 非圧縮ブロックバイナリ文字列.
 */
function makeFixedHuffmanBlock(blockArray, isFinalBlock) {
  var stream = new BitStream(), bfinal, btype, data, deflate;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.Deflate.CompressionType.FIXED;

  stream.writeBits(bfinal, 1, true);
  stream.writeBits(btype, 2, true);

  deflate = new RawDeflate();
  data = deflate.lzss(blockArray);
  data = deflate.fixedHuffman(data, stream);

  return data;
}

Zlib.RawDeflate = RawDeflate;

/**
 * ビットストリーム
 */
BitStream = function() {
  this.index = 0;
  this.bitindex = 0;
  this.buffer = [];
};

/**
 * ビットを指定した数だけ書き込む
 * @param {number} number 書き込む数値.
 * @param {number} n 書き込むビット数.
 * @param {boolean=} reverse 逆順に書き込むならば true.
 */
BitStream.prototype.writeBits = function(number, n, reverse) {
  var i, add,
      buffer = this.buffer,
      bufferIndex = this.index;

  for (i = 0; i < n; i++) {
    if (buffer[this.index] === undefined) {
      buffer[this.index] = 0;
    }

    if (reverse) {
      add = number & 1;
      number >>>= 1;
    } else {
      add = ((number >>> n - i - 1) & 1) === 0 ? 0 : 1;
    }
    buffer[this.index] = (buffer[this.index] << 1) | add;

    this.bitindex++;
    if (this.bitindex === 8) {
      this.bitindex = 0;
      this.reverseByte(this.index);
      this.index++;
    }
  }
};

/**
 * ストリームの終端処理を行う
 * @return {Array} 終端処理後のバッファを byte array で返す.
 */
BitStream.prototype.finite = function() {
  if (this.bitindex > 0) {
    this.buffer[this.index] <<= 8 - this.bitindex;
  }

  this.reverseByte(this.index);

  return this.buffer;
};

/**
 * 指定した位置のバイトのビット順序を反転する
 * @param {number} index ビット順序の反転を行う位置.
 * @return {number} 反転した後の値.
 */
BitStream.prototype.reverseByte = function(index) {
  var dst = 0, src = this.buffer[index], i;

  for (i = 0; i < 8; i++) {
    dst = (dst << 1) | (src & 1);
    src >>>= 1;
  }

  this.buffer[index] = dst;

  return this.buffer[index];
};

/**
 * Raw Deflate 実装
 * @constructor
 */
function RawDeflate() {
  this.matchTable = {};
}

/**
 * 固定ハフマン符号化
 * @param {Array} dataArray LZSS 符号化済み byte array.
 * @param {BitStream} stream 書き込み用ビットストリーム.
 * @return {Array} ハフマン符号化済み byte array.
 */
RawDeflate.prototype.fixedHuffman = function(dataArray, stream) {
  var index, length, code, bitlen, extra;

  if (!(stream instanceof BitStream)) {
    stream = new BitStream();
  }

  for (index = 0, length = dataArray.length; index < length; index++) {
    literal = dataArray[index];

    switch (true) {
      case (literal <= 143): bitlen = 8; code = (literal -   0) + 0x030; break;
      case (literal <= 255): bitlen = 9; code = (literal - 144) + 0x190; break;
      case (literal <= 279): bitlen = 7; code = (literal - 256) + 0x000; break;
      case (literal <= 287): bitlen = 8; code = (literal - 280) + 0x0C0; break;
      default:
        throw 'invalid literal';
    }

    stream.writeBits(code, bitlen);

    // 終端
    if (literal === 0x100) {
      break;
    }

    // 長さ・距離符号の先頭を見つけたらその分処理
    if (literal > 0x100) {
      // extra bit
      bitlen = dataArray[++index];
      extra = dataArray[++index];
      stream.writeBits(extra, bitlen, true);

      // distance
      code = dataArray[++index];
      bitlen = 5; // 固定ハフマンは距離は 5bit 固定
      stream.writeBits(code, bitlen);

      // extra bit
      bitlen = dataArray[++index];
      extra = dataArray[++index];
      stream.writeBits(extra, bitlen, true);
    }
  }

  return stream.finite();
};

/**
 * LZSS の最小マッチ長
 * @type {number}
 * @const
 */
RawDeflate.LzssMinLength = 3;

/**
 * LZSS の最大マッチ長
 * @type {number}
 * @const
 */
RawDeflate.LzssMaxLength = 258;

/**
 * LZSS のウィンドウサイズ
 * @type {number}
 * @const
 */
RawDeflate.WindowSize = 0x8000;

/**
 * マッチ情報
 * @param {number} length マッチした長さ.
 * @param {number} backwordDistance マッチ位置との距離.
 * @constructor
 */
function LzssMatch(length, backwordDistance) {
  this.length = length;
  this.backwordDistance = backwordDistance;
}

/**
 * マッチ情報を LZSS 符号化配列で返す.
 * なお、ここでは以下の内部仕様で符号化している
 * [ CODE, EXTRA-BIT-LEN, EXTRA, CODE, EXTRA-BIT-LEN, EXTRA ]
 * @return {Array} LZSS 符号化配列.
 */
LzssMatch.prototype.toLzssArray = function() {
  var length = this.length,
      dist = this.backwordDistance,
      codeArray = [], code, extralen, extra;

  // length
  switch (true) {
    //---------------------------------------------------------------
    //   LENGTH            CODE        EXTRA-BIT-LEN  EXTRA-BIT-BASE
    //---------------------------------------------------------------
    case (length ===   3): code = 257; extralen = 0;  extra =    3; break;
    case (length ===   4): code = 258; extralen = 0;  extra =    4; break;
    case (length ===   5): code = 259; extralen = 0;  extra =    5; break;
    case (length ===   6): code = 260; extralen = 0;  extra =    6; break;
    case (length ===   7): code = 261; extralen = 0;  extra =    7; break;
    case (length ===   8): code = 262; extralen = 0;  extra =    8; break;
    case (length ===   9): code = 263; extralen = 0;  extra =    9; break;
    case (length ===  10): code = 264; extralen = 0;  extra =   10; break;
    case (length <=   12): code = 265; extralen = 1;  extra =   11; break;
    case (length <=   14): code = 266; extralen = 1;  extra =   13; break;
    case (length <=   16): code = 267; extralen = 1;  extra =   15; break;
    case (length <=   18): code = 268; extralen = 1;  extra =   17; break;
    case (length <=   22): code = 269; extralen = 2;  extra =   19; break;
    case (length <=   26): code = 270; extralen = 2;  extra =   23; break;
    case (length <=   30): code = 271; extralen = 2;  extra =   27; break;
    case (length <=   34): code = 272; extralen = 2;  extra =   31; break;
    case (length <=   42): code = 273; extralen = 3;  extra =   35; break;
    case (length <=   50): code = 274; extralen = 3;  extra =   43; break;
    case (length <=   58): code = 275; extralen = 3;  extra =   51; break;
    case (length <=   66): code = 276; extralen = 3;  extra =   59; break;
    case (length <=   82): code = 277; extralen = 4;  extra =   67; break;
    case (length <=   98): code = 278; extralen = 4;  extra =   83; break;
    case (length <=  114): code = 279; extralen = 4;  extra =   99; break;
    case (length <=  130): code = 280; extralen = 4;  extra =  115; break;
    case (length <=  162): code = 281; extralen = 5;  extra =  131; break;
    case (length <=  194): code = 282; extralen = 5;  extra =  163; break;
    case (length <=  226): code = 283; extralen = 5;  extra =  195; break;
    case (length <=  257): code = 284; extralen = 5;  extra =  227; break;
    case (length === 258): code = 285; extralen = 0;  extra =  258; break;
    default:
      throw 'invalid length';
  }
  extra = (length - extra) & ((1 << extralen) - 1);
  codeArray.push(code, extralen, extra);

  // distance
  switch (true) {
    //------------------------------------------------------------------
    //   DISTANCE         CODE       EXTRA-BIT-LEN  EXTRA-BIT-BASE
    //------------------------------------------------------------------
    case (dist ===    1): code =  0; extralen =  0; extra =     1; break;
    case (dist ===    2): code =  1; extralen =  0; extra =     2; break;
    case (dist ===    3): code =  2; extralen =  0; extra =     3; break;
    case (dist ===    4): code =  3; extralen =  0; extra =     4; break;
    case (dist <=     6): code =  4; extralen =  1; extra =     5; break;
    case (dist <=     8): code =  5; extralen =  1; extra =     7; break;
    case (dist <=    12): code =  6; extralen =  2; extra =     9; break;
    case (dist <=    16): code =  7; extralen =  2; extra =    13; break;
    case (dist <=    24): code =  8; extralen =  3; extra =    17; break;
    case (dist <=    32): code =  9; extralen =  3; extra =    25; break;
    case (dist <=    48): code = 10; extralen =  4; extra =    33; break;
    case (dist <=    64): code = 11; extralen =  4; extra =    49; break;
    case (dist <=    96): code = 12; extralen =  5; extra =    65; break;
    case (dist <=   128): code = 13; extralen =  5; extra =    97; break;
    case (dist <=   192): code = 14; extralen =  6; extra =   129; break;
    case (dist <=   256): code = 15; extralen =  6; extra =   193; break;
    case (dist <=   384): code = 16; extralen =  7; extra =   257; break;
    case (dist <=   512): code = 17; extralen =  7; extra =   385; break;
    case (dist <=   768): code = 18; extralen =  8; extra =   513; break;
    case (dist <=  1024): code = 19; extralen =  8; extra =   769; break;
    case (dist <=  1536): code = 20; extralen =  9; extra =  1025; break;
    case (dist <=  2048): code = 21; extralen =  9; extra =  1537; break;
    case (dist <=  3072): code = 22; extralen = 10; extra =  2049; break;
    case (dist <=  4096): code = 23; extralen = 10; extra =  3073; break;
    case (dist <=  6144): code = 24; extralen = 11; extra =  4097; break;
    case (dist <=  8192): code = 25; extralen = 11; extra =  6145; break;
    case (dist <= 12288): code = 26; extralen = 12; extra =  8193; break;
    case (dist <= 16384): code = 27; extralen = 12; extra = 12289; break;
    case (dist <= 24576): code = 28; extralen = 13; extra = 16385; break;
    case (dist <= 32768): code = 29; extralen = 13; extra = 24577; break;
    default:
      throw 'invalid distance';
  }
  extra = (dist - extra) & ((1 << extralen) - 1);
  codeArray.push(code, extralen, extra);

  return codeArray;
};

/**
 * LZSS 実装
 * @param {Object|Array} dataArray LZSS 符号化するバイト配列.
 * @return {Uint16Array} LZSS 符号化した配列.
 */
RawDeflate.prototype.lzss = function(dataArray) {
  var position, length, i, l,
      matchKey, matchKeyArray,
      table = this.matchTable,
      longestMatch,
      matchList, matchIndex, matchLenght, matchPosition,
      lzssbuf = [], skipLength = 0;

  length = dataArray.length;
  for (position = 0; position < length; position++) {
    // 最小マッチ長分のキーを作成する
    matchKeyArray = slice_(dataArray, position, RawDeflate.LzssMinLength);

    // 終わりの方でもうマッチしようがない場合はそのまま流し込む
    if (matchKeyArray.length < RawDeflate.LzssMinLength && skipLength === 0) {
      concat_(lzssbuf, matchKeyArray);
      break;
    }

    // キーの作成
    matchKey = 0;
    for (i = 0, l = matchKeyArray.length; i < l; i++) {
      matchKey = (matchKey << 8) | (matchKeyArray[i] & 0xff);
    }

    // テーブルが未定義だったら作成する
    if (table[matchKey] === undefined) {
      table[matchKey] = [];
    }

     // lzssbuf.push(dataArray[position]);
    // スキップだったら何もしない
    if (skipLength > 0) {
      skipLength--;
    // テーブルが作成済みならば整理とマッチ処理を行う
    } else {
      // マッチテーブルに存在する場合は最長となる候補を探す
      matchList = table[matchKey];
      currentMatchList = [];

      // マッチテーブルの更新
      matchLength = matchList.length;
      for (matchIndex = 0; matchIndex < matchLength; matchIndex++) {
        matchPosition = matchList[matchIndex];

        // 最大戻り距離を超えていた場合は削除する
        if (position - matchPosition > RawDeflate.WindowSize) {
          matchList.shift();
          matchIndex--; matchLength--;
          continue;
        // 超えていなかった場合はそれ以上古いものはないので抜ける
        } else {
          break;
        }
      }

      // マッチ候補が見つかった場合
      if (matchList.length > 0) {
        // 最長マッチの探索
        longestMatch = searchLongestMatch_(dataArray, position, matchList);

        // LZSS 符号化を行い結果に格納
        concat_(lzssbuf, longestMatch.toLzssArray());

        // 最長マッチの長さだけ進む
        skipLength = longestMatch.length - 1;
      } else {
        lzssbuf.push(dataArray[position]);
      }
    }

    // マッチテーブルに現在の位置を保存
    table[matchKey].push(position);
  }

  // 終端コードの追加
  lzssbuf[lzssbuf.length] = 256;

  return lzssbuf;
};

/**
 * 最長一致を探す
 * @param {Object} dataArray 現在のウィンドウ.
 * @param {number} position 現在のウィンドウ位置.
 * @param {Array.<number>} matchList 候補となる位置の配列.
 * @return {LzssMatch} 最長かつ最短距離のマッチオブジェクト.
 */
function searchLongestMatch_(dataArray, position, matchList) {
  var lastMatch,
      matchTarget,
      matchLength, matchLimit,
      match, matchIndex, matchListLength,
      minLength = RawDeflate.LzssMinLength;

  matchLimit = RawDeflate.LzssMaxLength - RawDeflate.LzssMinLength;

  // 候補の中から最長マッチの物を探す
  lastMatch = matchList;
  matchList = [];
  for (matchLength = 0; matchLength < matchLimit; matchLength++) {
    matchTarget = dataArray[position + matchLength + minLength];
    matchListLength = lastMatch.length;

    for (matchIndex = 0; matchIndex < matchListLength; matchIndex++) {
      match = lastMatch[matchIndex];
      // 判定
      if (dataArray[match + matchLength + minLength] === matchTarget) {
        matchList.push(match);
      }
    }

    if (matchList.length === 0) {
      break;
    }

    lastMatch = matchList;
    matchList = [];
  }

  // 最長のマッチ候補の中で最長のものを選ぶ(拡張ビットが短く済む)
  return new LzssMatch(
    matchLength + RawDeflate.LzssMinLength,
    position - Math.max.apply(this, lastMatch)
  );
}

/**
 * Adler32 ハッシュ値の更新
 * @param {number} adler 現在のハッシュ値.
 * @param {Array} array 更新に使用する byte array.
 * @return {number} Adler32 ハッシュ値.
 */
Zlib.updateAdler32 = function(adler, array) {
  var s1 = adler & 0xffff;
      s2 = (adler >>> 16) & 0xffff;

  for (var i = 0, l = array.length; i < l; i++) {
    s1 = (s1 + array[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }

  return (s2 << 16) + s1;
};

/**
 * Adler32 ハッシュ値の作成
 * @param {Array} array 算出に使用する byte array.
 * @return {number} Adler32 ハッシュ値.
 */
Zlib.adler32 = function(array) {
  return Zlib.updateAdler32(1, array);
};

/**
 * make network byte order byte array from integer
 * @param {number} number source number.
 * @param {number=} padding padding.
 * @return {Array} network byte order array.
 * @private
 */
convertNetworkByteOrder = function(number, padding) {
  var tmp = [], octet, nullchar;

  do {
    octet = number & 0xff;
    tmp.unshift(octet);
    number >>>= 8;
  } while (number > 0);

  if (typeof(padding) === 'number') {
    nullchar = 0;
    while (tmp.length < padding) {
      tmp.unshift(nullchar);
    }
  }

  return tmp;
};


/**
 * 配列風のオブジェクトの部分コピー
 * @param {Object} arraylike 配列風オブジェクト.
 * @param {number} start コピー開始インデックス.
 * @param {number} length コピーする長さ.
 * @return {Array} 部分コピーした配列.
 * @private
 */
function slice_(arraylike, start, length) {
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
}

/**
 * 配列風のオブジェクトの結合
 * 結合先の配列に結合元の配列を追加します.
 * @param {Object} arraylike1 結合先配列.
 * @param {Object} arraylike2 結合元配列.
 * @return {Object} 結合後の配列.
 * @private
 */
function concat_(arraylike1, arraylike2) {
  var length1 = arraylike1.length,
      length2 = arraylike2.length,
      index;

  if (arraylike1 instanceof Array && arraylike2 instanceof Array) {
    return Array.prototype.push.apply(arraylike1, arraylike2);
  }

  for (index = 0; index < length2; index++) {
    arraylike1[length1 + index] = arraylike2[index];
  }

  return arraylike1;
}


// end of scope
})(this);

/* vim:set expandtab ts=2 sw=2 tw=80: */

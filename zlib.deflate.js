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
 * @param {Zlib.Deflate.CompressionType=}
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate = function(buffer, opt_compressionType) {
  this.buffer = buffer;
  this.compressionType = Zlib.Deflate.CompressionType.FIXED;
  if (opt_compressionType) {
    this.compressionType = opt_compressionType;
  }
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
 * @param {Object=} opt_param parameters.
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate.compress = function(buffer, opt_param) {
  var deflate = new Zlib.Deflate(buffer);

  return deflate.compress(opt_param);
};

/**
 * Deflate Compression
 * @param {Object=} opt_param parameters.
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate.prototype.compress = function(opt_param) {
  var cmf, flg, cm, cinfo, fcheck, fdict, flevel,
      clevel, compressedData, adler, error = false, deflate;

  // Compression Method and Flags
  cm = Zlib.CompressionMethod.DEFLATE;
  switch (cm) {
    case Zlib.CompressionMethod.DEFLATE:
      cinfo = Math.LOG2E * Math.log(Zlib.RawDeflate.WindowSize) - 8;
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
        case Zlib.Deflate.CompressionType.CUSTOM: flevel = 2; break;
        default: throw 'unsupported compression type';
      }
      break;
    default:
      throw 'invalid compression method';
  }
  flg = (flevel << 6) | (fdict << 5);
  fcheck = 31 - (cmf * 256 + flg) % 31;
  flg |= fcheck;

  // Adler-32 checksum
  adler = convertNetworkByteOrder(Zlib.adler32(this.buffer), 4);

  // compressed data
  compressedData = this.makeBlocks();

  // make zlib string
  deflate = [];
  deflate.push(cmf, flg);
  concat_(deflate, compressedData);
  concat_(deflate, adler);

  return deflate;
};

/**
 * deflate 圧縮を行う
 * @return {Array} 圧縮済み byte array.
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
        concat_(
          blocks,
          this.makeNocompressBlock(blockArray, (position === length))
        );
      }
      break;
    case Zlib.Deflate.CompressionType.FIXED:
      concat_(
        blocks,
        this.makeFixedHuffmanBlock(this.buffer, true)
      );
      break;
    case Zlib.Deflate.CompressionType.CUSTOM:
      concat_(
        blocks,
        this.makeCustomHuffmanBlock(this.buffer, true)
      );
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
Zlib.Deflate.prototype.makeNocompressBlock =
function(blockArray, isFinalBlock) {
  var header = [], bfinal, btype, len, nlen, i, l;

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
};

/**
 * 固定ハフマンブロックの作成
 * @param {Array} blockArray ブロックデータ byte array.
 * @param {boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {Array} 固定ハフマン符号化ブロック byte array.
 */
Zlib.Deflate.prototype.makeFixedHuffmanBlock =
function(blockArray, isFinalBlock) {
  var stream = new BitStream(), bfinal, btype, data, deflate;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.Deflate.CompressionType.FIXED;

  stream.writeBits(bfinal, 1, true);
  stream.writeBits(btype, 2, true);

  deflate = new Zlib.RawDeflate(this.compressionType);
  data = deflate.lzss(blockArray);
  data = deflate.fixedHuffman(data, stream);

  return data;
};

/**
 * カスタムハフマンブロックの作成
 * @param {Array} blockArray ブロックデータ byte array.
 * @param {boolean} isFinalBlock 最後のブロックならばtrue.
 * @return {Array} カスタムハフマン符号ブロック byte array.
 */
Zlib.Deflate.prototype.makeCustomHuffmanBlock =
function(blockArray, isFinalBlock) {
  var stream = new BitStream(), bfinal, btype, data, deflate,
      hlit, hdist, hclen,
      hclenOrder =
        [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
      litLenLengths, litLenCodes, distLengths, distCodes,
      treeSymbols, treeLengths,
      transLengths = new Array(19),
      codeLengths, codeCodes, code,
      i, l;

  // header
  bfinal = isFinalBlock ? 1 : 0;
  btype = Zlib.Deflate.CompressionType.CUSTOM;

  stream.writeBits(bfinal, 1, true);
  stream.writeBits(btype, 2, true);

  deflate = new Zlib.RawDeflate(this.compressionType);
  data = deflate.lzss(blockArray);

  // リテラル・長さ, 距離のハフマン符号と符号長の算出
  litLenLengths = deflate.getLengths_(deflate.freqsLitLen);
  litLenCodes = deflate.getCodesFromLengths_(litLenLengths);
  distLengths = deflate.getLengths_(deflate.freqsDist);
  distCodes = deflate.getCodesFromLengths_(distLengths);

  // HLIT, HDIST の決定
  for (hlit = 286; hlit > 257 && litLenLengths[hlit - 1] === 0; hlit--);
  for (hdist = 30; hdist > 1 && distLengths[hdist - 1] === 0; hdist--);

  // HCLEN
  treeSymbols =
    deflate.getTreeSymbols_(hlit, litLenLengths, hdist, distLengths);
  treeLengths = deflate.getLengths_(treeSymbols.freqs, 7);
  for (i = 0; i < 19; i++) {
    transLengths[i] = treeLengths[hclenOrder[i]];
  }
  for (hclen = 19; hclen > 4 && transLengths[hclen - 1] === 0; hclen--);

  codeLengths = deflate.getLengths_(treeSymbols.freqs);
  codeCodes = deflate.getCodesFromLengths_(codeLengths);

  // 出力
  stream.writeBits(hlit - 257, 5, true);
  stream.writeBits(hdist - 1, 5, true);
  stream.writeBits(hclen - 4, 4, true);
  for (i = 0; i < hclen; i++) {
    stream.writeBits(transLengths[i], 3, true);
  }

  // ツリーの出力
  for (i = 0, l = treeSymbols.codes.length; i < l; i++) {
    code = treeSymbols.codes[i];

    stream.writeBits(codeCodes[code], codeLengths[code], true);

    // extra bits
    if (code >= 16) {
      i++;
      stream.writeBits(
        treeSymbols.codes[i],
        (code === 16) ? 2 :
        (code === 17) ? 3 :
        (code === 18) ? 7 :
        (function() { throw 'invalid code'; })(),
        true
      );
    }
  }

  deflate.customHuffman(
    data,
    [litLenCodes, litLenLengths],
    [distCodes, distLengths],
    stream
  );

  stream.writeBits(litLenCodes[256], litLenLengths[256], true);

  return stream.finite();
};

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
 * @param {Zlib.Deflate.CompressionType} type CompressionType.
 * @constructor
 */
Zlib.RawDeflate = function(type) {
  this.compressionType = type;
  this.matchTable = {};
  this.freqsLitLen;
  this.freqsDist;
}

/**
 * 固定ハフマン符号の符号化テーブル
 * @type {Array.<number, number>}
 * @const
 */
Zlib.RawDeflate.FixedHuffmanTable = (function() {
  var table = [], i;

  for (i = 0; i <= 288; i++) {
    switch (true) {
      case (i <= 143): table.push([i - 0 + 0x030, 8]); break;
      case (i <= 255): table.push([i - 144 + 0x190, 9]); break;
      case (i <= 279): table.push([i - 256 + 0x000, 7]); break;
      case (i <= 287): table.push([i - 280 + 0x0C0, 8]); break;
      default:
        'invalid literal';
    }
  }

  return table;
})();

/**
 * カスタムハフマン符号化
 * @param {Array} dataArray LZSS 符号化済み byte array.
 * @param {BitStream=} stream 書き込み用ビットストリーム.
 * @return {BitStream} ハフマン符号化済みビットストリームオブジェクト.
 */
Zlib.RawDeflate.prototype.customHuffman = function(dataArray, litLen, dist, stream) {
  var index, length, code, bitlen, extra,
      litLenCodes, litLenLengths, distCodes, distLengths;

  if (!(stream instanceof BitStream)) {
    stream = new BitStream();
  }

  litLenCodes = litLen[0];
  litLenLengths = litLen[1];
  distCodes = dist[0];
  distLengths = dist[1];

  // 符号を BitStream に書き込んでいく
  for (index = 0, length = dataArray.length; index < length; index++) {
    literal = dataArray[index];

    // literal or length
    stream.writeBits(litLenCodes[literal], litLenLengths[literal], true);

    // 長さ・距離符号
    if (literal > 0x100) {
      // length extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
      // distance
      stream.writeBits(
        distCodes[dataArray[++index]],
        distLengths[dataArray[index]],
        true
      );
      // distance extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
    // 終端
    } else if (literal === 0x100) {
      break;
    }
  }

  return stream;
};

/**
 * 固定ハフマン符号化
 * @param {Array} dataArray LZSS 符号化済み byte array.
 * @param {BitStream=} stream 書き込み用ビットストリーム.
 * @return {Array} ハフマン符号化済み byte array.
 */
Zlib.RawDeflate.prototype.fixedHuffman = function(dataArray, stream) {
  var index, length, code, bitlen, extra;

  if (!(stream instanceof BitStream)) {
    stream = new BitStream();
  }

  // 符号を BitStream に書き込んでいく
  for (index = 0, length = dataArray.length; index < length; index++) {
    literal = dataArray[index];

    // 符号の書き込み
    BitStream.prototype.writeBits.apply(
      stream,
      Zlib.RawDeflate.FixedHuffmanTable[literal]
    );

    // 長さ・距離符号
    if (literal > 0x100) {
      // length extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
      // distance
      stream.writeBits(dataArray[++index], 5);
      // distance extra
      stream.writeBits(dataArray[++index], dataArray[++index], true);
    // 終端
    } else if (literal === 0x100) {
      break;
    }
  }

  return stream.finite();
};

/**
 * LZSS の最小マッチ長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.LzssMinLength = 3;

/**
 * LZSS の最大マッチ長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.LzssMaxLength = 258;

/**
 * LZSS のウィンドウサイズ
 * @type {number}
 * @const
 */
Zlib.RawDeflate.WindowSize = 0x8000;

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
 * 長さ符号テーブル
 * @param {number} length 長さ.
 * @return {Array.<number>} コード、拡張ビット、拡張ビット長の配列.
 * @private
 */
LzssMatch.prototype.getLengthCode_ = function(length) {
  var r;

    switch (true) {
      case (length === 3): r = [257, length - 3, 0]; break;
      case (length === 4): r = [258, length - 4, 0]; break;
      case (length === 5): r = [259, length - 5, 0]; break;
      case (length === 6): r = [260, length - 6, 0]; break;
      case (length === 7): r = [261, length - 7, 0]; break;
      case (length === 8): r = [262, length - 8, 0]; break;
      case (length === 9): r = [263, length - 9, 0]; break;
      case (length === 10): r = [264, length - 10, 0]; break;
      case (length <= 12): r = [265, length - 11, 1]; break;
      case (length <= 14): r = [266, length - 13, 1]; break;
      case (length <= 16): r = [267, length - 15, 1]; break;
      case (length <= 18): r = [268, length - 17, 1]; break;
      case (length <= 22): r = [269, length - 19, 2]; break;
      case (length <= 26): r = [270, length - 23, 2]; break;
      case (length <= 30): r = [271, length - 27, 2]; break;
      case (length <= 34): r = [272, length - 31, 2]; break;
      case (length <= 42): r = [273, length - 35, 3]; break;
      case (length <= 50): r = [274, length - 43, 3]; break;
      case (length <= 58): r = [275, length - 51, 3]; break;
      case (length <= 66): r = [276, length - 59, 3]; break;
      case (length <= 82): r = [277, length - 67, 4]; break;
      case (length <= 98): r = [278, length - 83, 4]; break;
      case (length <= 114): r = [279, length - 99, 4]; break;
      case (length <= 130): r = [280, length - 115, 4]; break;
      case (length <= 162): r = [281, length - 131, 5]; break;
      case (length <= 194): r = [282, length - 163, 5]; break;
      case (length <= 226): r = [283, length - 195, 5]; break;
      case (length <= 257): r = [284, length - 227, 5]; break;
      case (length === 258): r = [285, length - 258, 0]; break;
      default: throw 'invalid length: ' + length;
    }

  return r;
};

/**
 * 距離符号テーブル
 * @param {number} dist 距離.
 * @return {Array.<number>} コード、拡張ビット、拡張ビット長の配列.
 * @private
 */
LzssMatch.prototype.getDistanceCode_ = function(dist) {
  var r;

  switch (true) {
    case (dist === 1): r = [0, dist - 1, 0]; break;
    case (dist === 2): r = [1, dist - 2, 0]; break;
    case (dist === 3): r = [2, dist - 3, 0]; break;
    case (dist === 4): r = [3, dist - 4, 0]; break;
    case (dist <= 6): r = [4, dist - 5, 1]; break;
    case (dist <= 8): r = [5, dist - 7, 1]; break;
    case (dist <= 12): r = [6, dist - 9, 2]; break;
    case (dist <= 16): r = [7, dist - 13, 2]; break;
    case (dist <= 24): r = [8, dist - 17, 3]; break;
    case (dist <= 32): r = [9, dist - 25, 3]; break;
    case (dist <= 48): r = [10, dist - 33, 4]; break;
    case (dist <= 64): r = [11, dist - 49, 4]; break;
    case (dist <= 96): r = [12, dist - 65, 5]; break;
    case (dist <= 128): r = [13, dist - 97, 5]; break;
    case (dist <= 192): r = [14, dist - 129, 6]; break;
    case (dist <= 256): r = [15, dist - 193, 6]; break;
    case (dist <= 384): r = [16, dist - 257, 7]; break;
    case (dist <= 512): r = [17, dist - 385, 7]; break;
    case (dist <= 768): r = [18, dist - 513, 8]; break;
    case (dist <= 1024): r = [19, dist - 769, 8]; break;
    case (dist <= 1536): r = [20, dist - 1025, 9]; break;
    case (dist <= 2048): r = [21, dist - 1537, 9]; break;
    case (dist <= 3072): r = [22, dist - 2049, 10]; break;
    case (dist <= 4096): r = [23, dist - 3073, 10]; break;
    case (dist <= 6144): r = [24, dist - 4097, 11]; break;
    case (dist <= 8192): r = [25, dist - 6145, 11]; break;
    case (dist <= 12288): r = [26, dist - 8193, 12]; break;
    case (dist <= 16384): r = [27, dist - 12289, 12]; break;
    case (dist <= 24576): r = [28, dist - 16385, 13]; break;
    case (dist <= 32768): r = [29, dist - 24577, 13]; break;
    default: throw 'invalid distance';
  }

  return r;
};

/**
 * マッチ情報を LZSS 符号化配列で返す.
 * なお、ここでは以下の内部仕様で符号化している
 * [ CODE, EXTRA-BIT-LEN, EXTRA, CODE, EXTRA-BIT-LEN, EXTRA ]
 * @return {Array} LZSS 符号化 byte array.
 */
LzssMatch.prototype.toLzssArray = function() {
  var length = this.length,
      dist = this.backwordDistance,
      codeArray = [];

  // length
  concat_(codeArray, this.getLengthCode_(length));

  // distance
  concat_(codeArray, this.getDistanceCode_(dist));


  return codeArray;
};

/**
 * LZSS 実装
 * @param {Object|Array} dataArray LZSS 符号化するバイト配列.
 * @return {Uint16Array} LZSS 符号化した配列.
 */
Zlib.RawDeflate.prototype.lzss = function(dataArray) {
  var position, length, i, l,
      matchKey, matchKeyArray,
      table = this.matchTable,
      longestMatch,
      matchList, matchIndex, matchLenght, matchPosition,
      lzssbuf = [], skipLength = 0, lzssArray,
      isCustom, freqsLitLen = [], freqsDist = [];

  isCustom = (this.compressionType === Zlib.Deflate.CompressionType.CUSTOM);

  if (isCustom) {
    // XXX: magic number
    for (i = 0; i <= 285; i++) {
      freqsLitLen[i] = 0;
    }
    // XXX: magic number
    for (i = 0; i <= 29; i++) {
      freqsDist[i] = 0;
    }
  }

  length = dataArray.length;
  for (position = 0; position < length; position++) {
    // 最小マッチ長分のキーを作成する
    matchKeyArray = slice_(dataArray, position, Zlib.RawDeflate.LzssMinLength);

    // 終わりの方でもうマッチしようがない場合はそのまま流し込む
    if (matchKeyArray.length < Zlib.RawDeflate.LzssMinLength &&
        skipLength === 0) {
      concat_(lzssbuf, matchKeyArray);

      if (isCustom) {
        for (i = 0, l = matchKeyArray.length; i < l; i++) {
          freqsLitLen[matchKeyArray[i]]++;
        }
      }

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
        if (position - matchPosition > Zlib.RawDeflate.WindowSize) {
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
        longestMatch = this.searchLongestMatch_(dataArray, position, matchList);
        lzssArray = longestMatch.toLzssArray();

        // LZSS 符号化を行い結果に格納
        concat_(lzssbuf, lzssArray);
        if (isCustom) {
          freqsLitLen[lzssArray[0]]++;
          freqsDist[lzssArray[3]]++;
        }

        // 最長マッチの長さだけ進む
        skipLength = longestMatch.length - 1;
      } else {
        if (isCustom) {
          freqsLitLen[dataArray[position]]++;
        }
        lzssbuf.push(dataArray[position]);
      }
    }

    // マッチテーブルに現在の位置を保存
    table[matchKey].push(position);
  }

  // 終端コードの追加
  if (isCustom) {
    freqsLitLen[256]++;
    this.freqsLitLen = freqsLitLen;
    this.freqsDist = freqsDist;
  }
  lzssbuf[lzssbuf.length] = 256;

  return lzssbuf;
};

/**
 * マッチした候補の中から最長一致を探す
 * @param {Object} dataArray 現在のウィンドウ.
 * @param {number} position 現在のウィンドウ位置.
 * @param {Array.<number>} matchList 候補となる位置の配列.
 * @return {LzssMatch} 最長かつ最短距離のマッチオブジェクト.
 * @private
 */
Zlib.RawDeflate.prototype.searchLongestMatch_ =
function(dataArray, position, matchList) {
  var lastMatch,
      matchTarget,
      matchLength, matchLimit,
      match, matchIndex, matchListLength,
      minLength = Zlib.RawDeflate.LzssMinLength,
      matchStep = 8, i, matchEqual;

  matchLimit = Zlib.RawDeflate.LzssMaxLength;

  // 候補の中から最長マッチの物を探す
  lastMatch = matchList;
  matchList = [];
  matchLength = minLength;
  for (; matchLength < matchLimit; matchLength += matchStep) {
    matchListLength = lastMatch.length;

    for (matchIndex = 0; matchIndex < matchListLength; matchIndex++) {
      match = lastMatch[matchIndex];

      // 後ろから判定
      matchEqual = true;
      for (i = matchStep - 1; i >= 0; i--) {
        if (dataArray[lastMatch[matchIndex] + matchLength + i] !==
            dataArray[position + matchLength + i]) {
          matchEqual = false;
          break;
        }
      }
      if (matchEqual) {
        matchList.push(match);
      }
    }

    // マッチ候補がなくなったら抜ける
    if (matchList.length === 0) {
      break;
    }

    // マッチリストの更新
    lastMatch = matchList;
    matchList = [];
  }
 if (matchLength > minLength) {
    matchLength--;
  }

  // ふるいに掛けた候補を精査する
  matchList = [];
  for (i = 0; i < matchStep && matchLength < matchLimit; i++) {
    matchListLength = lastMatch.length;

    for (matchIndex = 0; matchIndex < matchListLength; matchIndex++) {
      if (dataArray[lastMatch[matchIndex] + matchLength] ===
          dataArray[position + matchLength]) {
        matchList.push(lastMatch[matchIndex]);
      }
    }

    if (matchList.length === 0) {
      break;
    }

    matchLength++;
    lastMatch = matchList;
    matchList = [];
  }

  // 最長のマッチ候補の中で距離が最短のものを選ぶ(拡張ビットが短く済む)
  return new LzssMatch(
    matchLength,
    position - Math.max.apply(this, lastMatch)
  );
}

/**
 * Tree-Transmit Symbols の算出
 * reference: PuTTY Deflate implementation
 * @param {number} hlit HLIT.
 * @param {Array|Uint8Array} litlenLengths リテラルと長さ符号の符号長配列.
 * @param {number} hdist HDIST.
 * @param {Array|Uint8Array} distLengths 距離符号の符号長配列.
 * @return {{codes: Array|Uint8Array, freqs: Array|Uint8Array}} Tree-Transmit
 *     Symbols.
 */
Zlib.RawDeflate.prototype.getTreeSymbols_ =
function(hlit, litlenLengths, hdist, distLengths) {
  var src = new Array(hlit + hdist),
      i, j, runLength, l, length,
      result = new Array(286 + 30), rpt, freqs = new Array(19);

  j = 0;
  for (i = 0; i < hlit; i++) {
    src[j++] = litlenLengths[i];
  }
  for (i = 0; i < hdist; i++) {
    src[j++] = distLengths[i];
  }

  // 初期化
  // XXX: Uint8Array の場合はここの初期化処理が要らない
  for (i = 0, l = freqs.length; i < l; i++) {
    freqs[i] = 0;
  }

  // 符号化
  nResult = 0;
  for (i = 0, l = src.length; i < l; i += j) {
    // Run Length Encoding
    for (j = 1; i + j < l && src[i + j] === src[i]; j++);

    runLength = j;

    if (src[i] === 0) {
      // 0 の繰り返しが 3 回未満ならばそのまま
      if (runLength < 3) {
        while (runLength-- > 0) {
          result[nResult++] = 0;
          freqs[0]++;
        }
      } else {
        while (runLength > 0) {
          // 繰り返しは最大 138 までなので切り詰める
          rpt = (runLength < 138 ? runLength : 138);

          if (rpt > runLength - 3 && rpt < runLength) {
            rpt = runLength - 3;
          }

          // 3-10 回 -> 17
          if (rpt <= 10) {
            result[nResult++] = 17;
            result[nResult++] = rpt - 3;
            freqs[17]++;
          // 11-138 回 -> 18
          } else {
            result[nResult++] = 18;
            result[nResult++] = rpt - 11;
            freqs[18]++;
          }

          runLength -= rpt;
        }
      }
    } else {
      result[nResult++] = src[i];
      freqs[src[i]]++;
      runLength--;

      // 繰り返し回数が3回未満ならばランレングス符号は要らない
      if (runLength < 3) {
        while (runLength-- > 0) {
          result[nResult++] = src[i];
          freqs[src[i]]++;
        }
      // 3 回以上ならばランレングス符号化
      } else {
        while (runLength > 0) {
          // runLengthを 3-6 で分割
          rpt = (runLength < 6 ? runLength : 6);

          if (rpt > runLength - 3 && rpt < runLength) {
            rpt = runLength - 3;
          }

          result[nResult++] = 16;
          result[nResult++] = rpt - 3;
          freqs[16]++;

          runLength -= rpt;
        }
      }
    }
  }

  return {codes: result.slice(0, nResult), freqs: freqs};
};

/**
 * ハフマン符号の長さを取得する
 * @private
 */
Zlib.RawDeflate.prototype.getLengths_ = function(freqs, limit) {
  var nSymbols = freqs.length,
      max = 2 * nSymbols,
      heap = new Zlib.Heap(max),
      parent = new Array(max),
      length = new Array(max),
      i, node1, node2,
      freqsZero = [],
      maxProb, smallestFreq = 0xffffffff, totalFreq,
      num, denom, adjust;

  // 0 の要素を調べる, 最小出現数を調べる, 合計出現数を調べる
  for (i = 0; i < nSymbols; i++) {
    if (freqs[i] === 0) {
      freqsZero.push(i);
    } else {
      if (smallestFreq > freqs[i]) {
        smallestFreq = freqs[i];
      }
      totalFreq += freqs[i];
    }
  }

  // 非 0 の要素が 2 より小さかったら 2 になるまで 1 で埋める
  for (i = 0; nSymbols - freqsZero.length < 2; i++) {
    freqs[freqsZero.shift()] = 1;
  }

  // limit が決まっている場合は調整する
  if ((limit | 0) > 0) {
    totalFreq = 0;

    // 引数チェック
    if (limit !== 7 && limit !== 15) {
      throw 'invalid limit number';
    }

/*
    // 0 の要素を調べる, 最小出現数を調べる, 合計出現数を調べる
    for (i = 0; i < nSymbols; i++) {
      if (freqs[i] === 0) {
        freqsZero.push(i);
      } else {
        if (smallestFreq > freqs[i]) {
          smallestFreq = freqs[i];
        }
        totalFreq += freqs[i];
      }
    }

    // 非 0 の要素が 2 より小さかったら 2 になるまで 1 で埋める
    for (i = 0; nSymbols - freqsZero.length < 2; i++) {
      freqs[freqsZero.shift()] = 1;
    }
*/

    // 調整用パラメータの算出
    maxProb = (limit === 15) ? 2584 : 55;
    nActiveSymbols = nSymbols - freqsZero.length;
    num = totalFreq - smallestFreq * maxProb;
    denom = maxProb - (nSymbols - freqsZero.length);
    adjust = ((num + denom - 1) / denom) | 0;

    // 非 0 要素の値を調整する
    for (i = 0; i < nSymbols; i++) {
      if (freqs[i] !== 0) {
        freqs[i] += adjust;
      }
    }
  }

  // 配列の初期化
  for (i = 0; i < max; i++) {
    parent[i] = 0;
    length[i] = 0;
  }

  // ヒープの構築
  for (i = 0; i < max; i++) {
    if (freqs[i] > 0) {
      heap.push(i, freqs[i]);
    }
  }

  // ハフマン木の構築
  // ノードを2つ取り、その値の合計をヒープを戻していくことでハフマン木になる
  for (i = nSymbols; heap.length > 2; i++) {
    node1 = heap.pop();
    node2 = heap.pop();
    parent[node1.index] = parent[node2.index] = i;
    heap.push(i, node1.value + node2.value);
  }

  // ハフマン木から符号長に変換する
  for (; i >= 0; i--) {
    if (typeof(parent[i]) !== 'undefined' && parent[i] > 0) {
      length[i] = 1 + length[parent[i]];
    }
  }

  return length.slice(0, nSymbols);
};

/**
 * @type {number}
 * @const
 */
Zlib.RawDeflate.MaxCodeLength = 16;

/**
 * 符号長配列からハフマン符号を取得する
 * reference: PuTTY Deflate implementation
 * @param {Array|Uint8Array} lengths 符号長配列.
 * @return {Array|Uint8Array} ハフマン符号配列.
 */
Zlib.RawDeflate.prototype.getCodesFromLengths_ = function(lengths) {
  var codes = new Array(lengths.length),
      count = [],
      startCode = [],
      code = 0, i, l, j, m;

  // Count the codes of each length.
  for (i = 0, l = lengths.length; i < l; i++) {
    count[lengths[i]] = (count[lengths[i]] | 0) + 1;
  }

  // Determine the starting code for each length block.
  for (i = 1, l = Zlib.RawDeflate.MaxCodeLength; i <= l; i++) {
    startCode[i] = code;
    code += count[i] | 0;

    // overcommited
    if (code > (1 << i)) {
      throw 'overcommitted';
    }

    code <<= 1;
  }

  // undercommitted
  if (code < (1 << Zlib.RawDeflate.MaxCodeLength)) {
    throw 'undercommitted';
  }

  // Determine the code for each symbol. Mirrored, of course.
  for (i = 0, l = lengths.length; i < l; i++) {
    code = startCode[lengths[i]];
    startCode[lengths[i]] += 1;
    codes[i] = 0;
    for (j = 0, m = lengths[i]; j < m; j++) {
      codes[i] = (codes[i] << 1) | (code & 1);
      code >>>= 1;
    }
  }

  return codes;
};

/**
 * カスタムハフマン符号で使用するヒープ実装
 * @param {number} length ヒープサイズ.
 * @constructor
 */
Zlib.Heap = function(length) {
  this.buffer = new Array(length * 2);
  this.length = 0;
}

/**
 * 親ノードの index 取得
 * @param {number} index 子ノードの index.
 * @return {number} 親ノードの index.
 *
 */
Zlib.Heap.prototype.getParent = function(index) {
  return ((index - 2) / 4 | 0) * 2;
};

/**
 * 子ノードの index 取得
 * @param {number} index 親ノードの index.
 * @return {number} 子ノードの index.
 */
Zlib.Heap.prototype.getChild = function(index) {
  return 2 * index + 2;
};

/**
 * Heap に値を追加する
 * @param {number} index キー index.
 * @param {number} value 値.
 * @return {number} 現在のヒープ長.
 */
Zlib.Heap.prototype.push = function(index, value) {
  var current, parent,
      heap = this.buffer,
      swap;

  current = this.length;
  heap[this.length] = index;
  heap[this.length + 1] = value;
  this.length += 2;

  // ルートノードにたどり着くまで入れ替えを試みる
  while (current > 0) {
    parent = this.getParent(current);

    // 親ノードと値を比較して親の方が大きければ値と index を入れ替える
    if (heap[current + 1] < heap[parent + 1]) {
      swap = heap[current];
      heap[current] = heap[parent];
      heap[parent] = swap;

      swap = heap[current + 1];
      heap[current + 1] = heap[parent + 1];
      heap[parent + 1] = swap;

      current = parent;
    // 入れ替えが必要なくなったらそこで抜ける
    } else {
      break;
    }
  }

  return this.length;
};

/**
 * Heapから一番小さい値を返す
 * @return {Object} {index: キーindex, value: 値, length: ヒープ長} の Object.
 */
Zlib.Heap.prototype.pop = function() {
  var index, value,
      heap = this.buffer,
      current, parent;

  index = heap[0];
  value = heap[1];

  // 後ろから値を取る
  heap[0] = heap[this.length - 2];
  heap[1] = heap[this.length - 1];
  this.length -= 2;

  parent = 0;
  // ルートノードから下がっていく
  while (true) {
    current = this.getChild(parent);

    // 範囲チェック
    if (current >= this.length) {
      break;
    }

    // 隣のノードと比較して、隣の方が値が小さければ隣を現在ノードとして選択
    if (current + 2 < this.length && heap[current + 3] < heap[current + 1]) {
      current += 2;
    }

    // 親ノードと比較して親の方が大きい場合は入れ替える
    if (heap[parent + 1] > heap[current + 1]) {
      swap = heap[current];
      heap[current] = heap[parent];
      heap[parent] = swap;

      swap = heap[current + 1];
      heap[current + 1] = heap[parent + 1];
      heap[parent + 1] = swap;
    } else {
      break;
    }

    parent = current;
  }

  return {index: index, value: value, length: this.length};
};


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

  return (s2 << 16) | s1;
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
      index,
      BufSize = 0xffff;

  if (arraylike1 instanceof Array && arraylike2 instanceof Array) {
    if (arraylike2.length > BufSize) {
      for (index = 0; index < length2; index += BufSize) {
        Array.prototype.push.apply(
            arraylike1,
            arraylike2.slice(index, index + BufSize)
        );
      }
      return arraylike1;
    } else {
      return Array.prototype.push.apply(arraylike1, arraylike2);
    }
  }

  for (index = 0; index < length2; index++) {
    arraylike1[length1 + index] = arraylike2[index];
  }

  return arraylike1;
}


// end of scope
})(this);

/* vim:set expandtab ts=2 sw=2 tw=80: */

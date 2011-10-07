/**
 * zlib.rawdeflate.js
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
 * @fileoverview Deflate (RFC1951) 符号化アルゴリズム実装.
 */

goog.provide('Zlib.RawDeflate');

goog.require('Zlib.BitStream');
goog.require('Zlib.Heap');
goog.require('Zlib.Util');

goog.scope(function() {

/**
 * Raw Deflate 実装
 * @param {Zlib.Deflate.CompressionType} type CompressionType.
 * @constructor
 */
Zlib.RawDeflate = function(type) {
  this.compressionType = type;
  this.matchTable = {};
  this.freqsLitLen = null;
  this.freqsDist = null;
};

// Zlib.Util のエイリアス
var concat = Zlib.Util.concat;
var slice = Zlib.Util.slice;

/**
 * LZ77 の最小マッチ長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.Lz77MinLength = 3;

/**
 * LZ77 の最大マッチ長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.Lz77MaxLength = 258;

/**
 * LZ77 のウィンドウサイズ
 * @type {number}
 * @const
 */
Zlib.RawDeflate.WindowSize = 0x8000;

/**
 * 最長の符号長
 * @type {number}
 * @const
 */
Zlib.RawDeflate.MaxCodeLength = 16;


/**
 * 固定ハフマン符号の符号化テーブル
 * @type {Array.<Array.<number, number>>}
 * @const
 */
Zlib.RawDeflate.FixedHuffmanTable = (function() {
  var table = [], i;

  for (i = 0; i < 288; i++) {
    switch (true) {
      case (i <= 143): table.push([i - 0 + 0x030, 8]); break;
      case (i <= 255): table.push([i - 144 + 0x190, 9]); break;
      case (i <= 279): table.push([i - 256 + 0x000, 7]); break;
      case (i <= 287): table.push([i - 280 + 0x0C0, 8]); break;
      default:
        throw 'invalid literal: ' + i;
    }
  }

  return table;
})();

/**
 * 動的ハフマン符号化(カスタムハフマンテーブル)
 * @param {Array} dataArray LZ77 符号化済み byte array.
 * @param {Zlib.BitStream=} stream 書き込み用ビットストリーム.
 * @return {Zlib.BitStream} ハフマン符号化済みビットストリームオブジェクト.
 */
Zlib.RawDeflate.prototype.dynamicHuffman =
function(dataArray, litLen, dist, stream) {
  var index, length, literal, code, bitlen, extra,
      litLenCodes, litLenLengths, distCodes, distLengths;

  if (!(stream instanceof Zlib.BitStream)) {
    stream = new Zlib.BitStream();
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
 * @param {Array} dataArray LZ77 符号化済み byte array.
 * @param {Zlib.BitStream=} stream 書き込み用ビットストリーム.
 * @return {Array} ハフマン符号化済み byte array.
 */
Zlib.RawDeflate.prototype.fixedHuffman = function(dataArray, stream) {
  var index, length, literal, code, bitlen, extra;

  if (!(stream instanceof Zlib.BitStream)) {
    stream = new Zlib.BitStream();
  }

  // 符号を BitStream に書き込んでいく
  for (index = 0, length = dataArray.length; index < length; index++) {
    literal = dataArray[index];

    // 符号の書き込み
    Zlib.BitStream.prototype.writeBits.apply(
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

  return stream.finish();
};

/**
 * マッチ情報
 * @param {number} length マッチした長さ.
 * @param {number} backwordDistance マッチ位置との距離.
 * @constructor
 */
function Lz77Match(length, backwordDistance) {
  this.length = length;
  this.backwordDistance = backwordDistance;
}

/**
 * 長さ符号テーブル
 * @param {number} length 長さ.
 * @return {Array.<number>} コード、拡張ビット、拡張ビット長の配列.
 * @private
 */
Lz77Match.prototype.getLengthCode_ = function(length) {
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
Lz77Match.prototype.getDistanceCode_ = function(dist) {
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
 * マッチ情報を LZ77 符号化配列で返す.
 * なお、ここでは以下の内部仕様で符号化している
 * [ CODE, EXTRA-BIT-LEN, EXTRA, CODE, EXTRA-BIT-LEN, EXTRA ]
 * @return {Array} LZ77 符号化 byte array.
 */
Lz77Match.prototype.toLz77Array = function() {
  var length = this.length,
      dist = this.backwordDistance,
      codeArray = [];

  // length
  concat(codeArray, this.getLengthCode_(length));

  // distance
  concat(codeArray, this.getDistanceCode_(dist));


  return codeArray;
};

/**
 * LZ77 実装
 * @param {Array|Uint8Array} dataArray LZ77 符号化するバイト配列.
 * @return {Array} LZ77 符号化した配列.
 */
Zlib.RawDeflate.prototype.lz77 = function(dataArray) {
  var position, length, i, l,
      matchKey, matchKeyArray,
      table = this.matchTable,
      longestMatch,
      currentMatchList, matchList, matchIndex, matchLength, matchPosition,
      lz77buf = [], skipLength = 0, lz77Array,
      isDynamic, freqsLitLen = [], freqsDist = [];

  isDynamic = (this.compressionType === Zlib.Deflate.CompressionType.DYNAMIC);

  if (isDynamic) {
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
    matchKeyArray =
      slice(dataArray, position, Zlib.RawDeflate.Lz77MinLength);

    // 終わりの方でもうマッチしようがない場合はそのまま流し込む
    if (matchKeyArray.length < Zlib.RawDeflate.Lz77MinLength &&
        skipLength === 0) {
      concat(lz77buf, matchKeyArray);

      if (isDynamic) {
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
        lz77Array = longestMatch.toLz77Array();

        // LZ77 符号化を行い結果に格納
        concat(lz77buf, lz77Array);
        if (isDynamic) {
          freqsLitLen[lz77Array[0]]++;
          freqsDist[lz77Array[3]]++;
        }

        // 最長マッチの長さだけ進む
        skipLength = longestMatch.length - 1;
      } else {
        if (isDynamic) {
          freqsLitLen[dataArray[position]]++;
        }
        lz77buf.push(dataArray[position]);
      }
    }

    // マッチテーブルに現在の位置を保存
    table[matchKey].push(position);
  }

  // 終端コードの追加
  if (isDynamic) {
    freqsLitLen[256]++;
    this.freqsLitLen = freqsLitLen;
    this.freqsDist = freqsDist;
  }
  lz77buf[lz77buf.length] = 256;

  return lz77buf;
};

/**
 * マッチした候補の中から最長一致を探す
 * @param {Object} dataArray 現在のウィンドウ.
 * @param {number} position 現在のウィンドウ位置.
 * @param {Array.<number>} matchList 候補となる位置の配列.
 * @return {Lz77Match} 最長かつ最短距離のマッチオブジェクト.
 * @private
 */
Zlib.RawDeflate.prototype.searchLongestMatch_ =
function(dataArray, position, matchList) {
  var lastMatch,
      matchTarget,
      matchLength, matchLimit,
      match, matchIndex, matchListLength,
      minLength = Zlib.RawDeflate.Lz77MinLength,
      matchStep = 8, i, matchEqual;

  matchLimit = Zlib.RawDeflate.Lz77MaxLength;

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
  return new Lz77Match(
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
 * @return {{codes: (Array|Uint8Array), freqs: (Array|Uint8Array)}} Tree-Transmit
 *     Symbols.
 */
Zlib.RawDeflate.prototype.getTreeSymbols_ =
function(hlit, litlenLengths, hdist, distLengths) {
  var src = new Array(hlit + hdist),
      i, j, runLength, l, length,
      result = new Array(286 + 30), nResult,
      rpt, freqs = new Array(19);

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
    for (j = 1; i + j < l && src[i + j] === src[i]; j++) {}

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
 * @param {!Array|Uint8Array} freqs 出現カウント.
 * @param {number=} opt_limit 符号長の制限.
 * @private
 */
Zlib.RawDeflate.prototype.getLengths_ = function(freqs, opt_limit) {
  var nSymbols = freqs.length,
      nActiveSymbols,
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
  if ((opt_limit | 0) > 0) {
    totalFreq = 0;

    // 引数チェック
    if (opt_limit !== 7 && opt_limit !== 15) {
      throw 'invalid limit number';
    }

    // 調整用パラメータの算出
    maxProb = (opt_limit === 15) ? 2584 : 55;
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
 * 符号長配列からハフマン符号を取得する
 * reference: PuTTY Deflate implementation
 * @param {Array|Uint8Array} lengths 符号長配列.
 * @return {Array|Uint8Array} ハフマン符号配列.
 * @private
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


// end of scope
});

/* vim:set expandtab ts=2 sw=2 tw=80: */

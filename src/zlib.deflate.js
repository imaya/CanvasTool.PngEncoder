/**
 * zlib.deflate.js
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
 * @fileoverview Deflate (RFC1951) 実装.
 * Deflateアルゴリズム本体は Zlib.RawDeflate で実装されている.
 */

goog.provide('Zlib.Deflate');

goog.require('Zlib.Adler32');
goog.require('Zlib.BitStream');
goog.require('Zlib.RawDeflate');
goog.require('Zlib.Util');


goog.scope(function() {

/**
 * Zlib Deflate
 * @param {!Array|Uint8Array} buffer Data.
 * @param {Zlib.Deflate.CompressionType=} opt_compressionType Compression Type
 *     (Default: Fixed Huffman).
 * @constructor
 */
Zlib.Deflate = function(buffer, opt_compressionType) {
  /**
   * Deflate 符号化対象のバッファ
   * @type {Array|Uint8Array}
   */
  this.buffer = buffer;

  /**
   * 圧縮タイプ(非圧縮, 固定ハフマン符号, カスタムハフマン符号)
   * デフォルトでは固定ハフマン符号が使用される.
   * @type {Zlib.Deflate.CompressionType}
   */
  this.compressionType = Zlib.Deflate.CompressionType.FIXED;

  if (opt_compressionType) {
    this.compressionType = opt_compressionType;
  }
};
goog.exportSymbol('Zlib.Deflate', Zlib.Deflate);

// Zlib.Util のエイリアス
var concat = Zlib.Util.concat;
var slice = Zlib.Util.slice;
var convertNetworkByteOrder = Zlib.Util.convertNetworkByteOrder;

/**
 * @enum {number}
 */
Zlib.Deflate.CompressionType = {
  NONE: 0,
  FIXED: 1,
  CUSTOM: 2,
  RESERVED: 3
};
goog.exportSymbol(
  'Zlib.Deflate.CompressionType',
  Zlib.Deflate.CompressionType
);

/**
 * 直接圧縮に掛ける
 * @param {!Array|Uint8Array} buffer Data.
 * @param {Object=} opt_param parameters.
 * @return {Array} compressed data byte array.
 */
Zlib.Deflate.compress = function(buffer, opt_param) {
  var deflate = new Zlib.Deflate(buffer);

  return deflate.compress(opt_param);
};
goog.exportSymbol(
  'Zlib.Deflate.compress',
  Zlib.Deflate.compress
);

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
  adler = convertNetworkByteOrder(Zlib.Adler32(this.buffer), 4);

  // compressed data
  compressedData = this.makeBlocks();

  // make zlib string
  deflate = [];
  deflate.push(cmf, flg);
  concat(deflate, compressedData);
  concat(deflate, adler);

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
        blockArray = slice(this.buffer, position, 0xffff);

        // update positon
        position += blockArray.length;

        // make block
        concat(
          blocks,
          this.makeNocompressBlock(blockArray, (position === length))
        );
      }
      break;
    case Zlib.Deflate.CompressionType.FIXED:
      concat(
        blocks,
        this.makeFixedHuffmanBlock(this.buffer, true)
      );
      break;
    case Zlib.Deflate.CompressionType.CUSTOM:
      concat(
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
 * @param {Array} blockArray ブロックデータ byte array.
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
  var stream = new Zlib.BitStream(), bfinal, btype, data, deflate;

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
  var stream = new Zlib.BitStream(), bfinal, btype, data, deflate,
      hlit, hdist, hclen,
      hclenOrder =
        [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
      litLenLengths, litLenCodes, distLengths, distCodes,
      treeSymbols, treeLengths,
      transLengths = new Array(19),
      codeLengths, codeCodes, code, bitlen,
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
  for (hlit = 286; hlit > 257 && litLenLengths[hlit - 1] === 0; hlit--) {}
  for (hdist = 30; hdist > 1 && distLengths[hdist - 1] === 0; hdist--) {}

  // HCLEN
  treeSymbols =
    deflate.getTreeSymbols_(hlit, litLenLengths, hdist, distLengths);
  treeLengths = deflate.getLengths_(treeSymbols.freqs, 7);
  for (i = 0; i < 19; i++) {
    transLengths[i] = treeLengths[hclenOrder[i]];
  }
  for (hclen = 19; hclen > 4 && transLengths[hclen - 1] === 0; hclen--) {}

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
      switch (code) {
        case 16: bitlen = 2; break;
        case 17: bitlen = 3; break;
        case 18: bitlen = 7; break;
        default:
          throw 'invalid code: ' + code;
      }

      stream.writeBits(
        treeSymbols.codes[i],
        bitlen,
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


// end of scope
});

/* vim:set expandtab ts=2 sw=2 tw=80: */

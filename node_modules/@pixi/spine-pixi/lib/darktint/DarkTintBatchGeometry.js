'use strict';

var pixi_js = require('pixi.js');

const placeHolderBufferData = new Float32Array(1);
const placeHolderIndexData = new Uint32Array(1);
class DarkTintBatchGeometry extends pixi_js.Geometry {
  constructor() {
    const vertexSize = 7;
    const attributeBuffer = new pixi_js.Buffer({
      data: placeHolderBufferData,
      label: "attribute-batch-buffer",
      usage: pixi_js.BufferUsage.VERTEX | pixi_js.BufferUsage.COPY_DST,
      shrinkToFit: false
    });
    const indexBuffer = new pixi_js.Buffer({
      data: placeHolderIndexData,
      label: "index-batch-buffer",
      usage: pixi_js.BufferUsage.INDEX | pixi_js.BufferUsage.COPY_DST,
      // | BufferUsage.STATIC,
      shrinkToFit: false
    });
    const stride = vertexSize * 4;
    super({
      attributes: {
        aPosition: {
          buffer: attributeBuffer,
          format: "float32x2",
          stride,
          offset: 0
        },
        aUV: {
          buffer: attributeBuffer,
          format: "float32x2",
          stride,
          offset: 2 * 4
        },
        aColor: {
          buffer: attributeBuffer,
          format: "unorm8x4",
          stride,
          offset: 4 * 4
        },
        aDarkColor: {
          buffer: attributeBuffer,
          format: "unorm8x4",
          stride,
          offset: 5 * 4
        },
        aTextureIdAndRound: {
          buffer: attributeBuffer,
          format: "uint16x2",
          stride,
          offset: 6 * 4
        }
      },
      indexBuffer
    });
  }
}

exports.DarkTintBatchGeometry = DarkTintBatchGeometry;
//# sourceMappingURL=DarkTintBatchGeometry.js.map

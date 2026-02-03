'use strict';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class BatchableSpineSlot {
  constructor() {
    __publicField(this, "indexOffset", 0);
    __publicField(this, "attributeOffset", 0);
    __publicField(this, "indexSize");
    __publicField(this, "attributeSize");
    __publicField(this, "batcherName", "darkTint");
    __publicField(this, "packAsQuad", false);
    __publicField(this, "renderable");
    __publicField(this, "positions");
    __publicField(this, "indices");
    __publicField(this, "uvs");
    __publicField(this, "roundPixels");
    __publicField(this, "data");
    __publicField(this, "blendMode");
    __publicField(this, "darkTint");
    __publicField(this, "texture");
    __publicField(this, "transform");
    // used internally by batcher specific..
    // stored for efficient updating..
    __publicField(this, "_textureId");
    __publicField(this, "_attributeStart");
    __publicField(this, "_indexStart");
    __publicField(this, "_batcher");
    __publicField(this, "_batch");
  }
  get color() {
    const slotColor = this.data.color;
    const parentColor = this.renderable.groupColor;
    const parentAlpha = this.renderable.groupAlpha;
    let abgr;
    const mixedA = slotColor.a * parentAlpha * 255;
    if (parentColor !== 16777215) {
      const parentB = parentColor >> 16 & 255;
      const parentG = parentColor >> 8 & 255;
      const parentR = parentColor & 255;
      const mixedR = slotColor.r * parentR;
      const mixedG = slotColor.g * parentG;
      const mixedB = slotColor.b * parentB;
      abgr = mixedA << 24 | mixedB << 16 | mixedG << 8 | mixedR;
    } else {
      abgr = mixedA << 24 | slotColor.b * 255 << 16 | slotColor.g * 255 << 8 | slotColor.r * 255;
    }
    return abgr;
  }
  get darkColor() {
    const darkColor = this.data.darkColor;
    return darkColor.b * 255 << 16 | darkColor.g * 255 << 8 | darkColor.r * 255;
  }
  get groupTransform() {
    return this.renderable.groupTransform;
  }
  setData(renderable, data, blendMode, roundPixels) {
    this.renderable = renderable;
    this.transform = renderable.groupTransform;
    this.data = data;
    if (data.clipped) {
      const clippedData = data.clippedData;
      this.indexSize = clippedData.indicesCount;
      this.attributeSize = clippedData.vertexCount;
      this.positions = clippedData.vertices;
      this.indices = clippedData.indices;
      this.uvs = clippedData.uvs;
    } else {
      this.indexSize = data.indices.length;
      this.attributeSize = data.vertices.length / 2;
      this.positions = data.vertices;
      this.indices = data.indices;
      this.uvs = data.uvs;
    }
    this.texture = data.texture;
    this.roundPixels = roundPixels;
    this.blendMode = blendMode;
    this.batcherName = data.darkTint ? "darkTint" : "default";
  }
}

exports.BatchableSpineSlot = BatchableSpineSlot;
//# sourceMappingURL=BatchableSpineSlot.js.map

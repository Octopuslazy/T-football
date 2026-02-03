import { ExtensionType, extensions, Batcher, Color } from 'pixi.js';
import { DarkTintBatchGeometry } from './DarkTintBatchGeometry.mjs';
import { DarkTintShader } from './DarkTintShader.mjs';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
let defaultShader = null;
const _DarkTintBatcher = class _DarkTintBatcher extends Batcher {
  constructor() {
    super(...arguments);
    __publicField(this, "geometry", new DarkTintBatchGeometry());
    __publicField(this, "shader", defaultShader || (defaultShader = new DarkTintShader(this.maxTextures)));
    __publicField(this, "name", _DarkTintBatcher.extension.name);
    /** The size of one attribute. 1 = 32 bit. x, y, u, v, color, darkColor, textureIdAndRound -> total = 7 */
    __publicField(this, "vertexSize", 7);
  }
  packAttributes(element, float32View, uint32View, index, textureId) {
    const textureIdAndRound = textureId << 16 | element.roundPixels & 65535;
    const wt = element.transform;
    const a = wt.a;
    const b = wt.b;
    const c = wt.c;
    const d = wt.d;
    const tx = wt.tx;
    const ty = wt.ty;
    const { positions, uvs } = element;
    const argb = element.color;
    const worldAlpha = (argb >> 24 & 255) / 255;
    const darkColor = Color.shared.setValue(element.darkColor).premultiply(worldAlpha, true).toPremultiplied(1, false);
    const offset = element.attributeOffset;
    const end = offset + element.attributeSize;
    for (let i = offset; i < end; i++) {
      const i2 = i * 2;
      const x = positions[i2];
      const y = positions[i2 + 1];
      float32View[index++] = a * x + c * y + tx;
      float32View[index++] = d * y + b * x + ty;
      float32View[index++] = uvs[i2];
      float32View[index++] = uvs[i2 + 1];
      uint32View[index++] = argb;
      uint32View[index++] = darkColor;
      uint32View[index++] = textureIdAndRound;
    }
  }
  packQuadAttributes(element, float32View, uint32View, index, textureId) {
    const texture = element.texture;
    const wt = element.transform;
    const a = wt.a;
    const b = wt.b;
    const c = wt.c;
    const d = wt.d;
    const tx = wt.tx;
    const ty = wt.ty;
    const bounds = element.bounds;
    const w0 = bounds.maxX;
    const w1 = bounds.minX;
    const h0 = bounds.maxY;
    const h1 = bounds.minY;
    const uvs = texture.uvs;
    const argb = element.color;
    const darkColor = element.darkColor;
    const textureIdAndRound = textureId << 16 | element.roundPixels & 65535;
    float32View[index + 0] = a * w1 + c * h1 + tx;
    float32View[index + 1] = d * h1 + b * w1 + ty;
    float32View[index + 2] = uvs.x0;
    float32View[index + 3] = uvs.y0;
    uint32View[index + 4] = argb;
    uint32View[index + 5] = darkColor;
    uint32View[index + 6] = textureIdAndRound;
    float32View[index + 7] = a * w0 + c * h1 + tx;
    float32View[index + 8] = d * h1 + b * w0 + ty;
    float32View[index + 9] = uvs.x1;
    float32View[index + 10] = uvs.y1;
    uint32View[index + 11] = argb;
    uint32View[index + 12] = darkColor;
    uint32View[index + 13] = textureIdAndRound;
    float32View[index + 14] = a * w0 + c * h0 + tx;
    float32View[index + 15] = d * h0 + b * w0 + ty;
    float32View[index + 16] = uvs.x2;
    float32View[index + 17] = uvs.y2;
    uint32View[index + 18] = argb;
    uint32View[index + 19] = darkColor;
    uint32View[index + 20] = textureIdAndRound;
    float32View[index + 21] = a * w1 + c * h0 + tx;
    float32View[index + 22] = d * h0 + b * w1 + ty;
    float32View[index + 23] = uvs.x3;
    float32View[index + 24] = uvs.y3;
    uint32View[index + 25] = argb;
    uint32View[index + 26] = darkColor;
    uint32View[index + 27] = textureIdAndRound;
  }
};
/** @ignore */
__publicField(_DarkTintBatcher, "extension", {
  type: [
    ExtensionType.Batcher
  ],
  name: "darkTint"
});
let DarkTintBatcher = _DarkTintBatcher;
extensions.add(DarkTintBatcher);

export { DarkTintBatcher };
//# sourceMappingURL=DarkTintBatcher.mjs.map

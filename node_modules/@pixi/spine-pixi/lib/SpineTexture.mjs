import { Texture as Texture$1 } from 'pixi.js';
import { Texture, TextureFilter, TextureWrap, BlendMode } from '@esotericsoftware/spine-core';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
const _SpineTexture = class _SpineTexture extends Texture {
  constructor(image) {
    super(image.resource);
    __publicField(this, "texture");
    this.texture = Texture$1.from(image);
  }
  static from(texture) {
    if (_SpineTexture.textureMap.has(texture)) {
      return _SpineTexture.textureMap.get(texture);
    }
    return new _SpineTexture(texture);
  }
  setFilters(minFilter, magFilter) {
    const style = this.texture.source.style;
    style.minFilter = _SpineTexture.toPixiTextureFilter(minFilter);
    style.magFilter = _SpineTexture.toPixiTextureFilter(magFilter);
    this.texture.source.autoGenerateMipmaps = _SpineTexture.toPixiMipMap(minFilter);
    this.texture.source.updateMipmaps();
  }
  setWraps(uWrap, vWrap) {
    const style = this.texture.source.style;
    style.addressModeU = _SpineTexture.toPixiTextureWrap(uWrap);
    style.addressModeV = _SpineTexture.toPixiTextureWrap(vWrap);
  }
  dispose() {
    this.texture.destroy();
  }
  static toPixiMipMap(filter) {
    switch (filter) {
      case TextureFilter.Nearest:
      case TextureFilter.Linear:
        return false;
      case TextureFilter.MipMapNearestLinear:
      case TextureFilter.MipMapNearestNearest:
      case TextureFilter.MipMapLinearLinear:
      case TextureFilter.MipMapLinearNearest:
        return true;
      default:
        throw new Error(`Unknown texture filter: ${String(filter)}`);
    }
  }
  static toPixiTextureFilter(filter) {
    switch (filter) {
      case TextureFilter.Nearest:
      case TextureFilter.MipMapNearestLinear:
      case TextureFilter.MipMapNearestNearest:
        return "nearest";
      case TextureFilter.Linear:
      case TextureFilter.MipMapLinearLinear:
      case TextureFilter.MipMapLinearNearest:
        return "linear";
      default:
        throw new Error(`Unknown texture filter: ${String(filter)}`);
    }
  }
  static toPixiTextureWrap(wrap) {
    switch (wrap) {
      case TextureWrap.ClampToEdge:
        return "clamp-to-edge";
      case TextureWrap.MirroredRepeat:
        return "mirror-repeat";
      case TextureWrap.Repeat:
        return "repeat";
      default:
        throw new Error(`Unknown texture wrap: ${String(wrap)}`);
    }
  }
  static toPixiBlending(blend) {
    switch (blend) {
      case BlendMode.Normal:
        return "normal";
      case BlendMode.Additive:
        return "add";
      case BlendMode.Multiply:
        return "multiply";
      case BlendMode.Screen:
        return "screen";
      default:
        throw new Error(`Unknown blendMode: ${String(blend)}`);
    }
  }
};
__publicField(_SpineTexture, "textureMap", /* @__PURE__ */ new Map());
let SpineTexture = _SpineTexture;

export { SpineTexture };
//# sourceMappingURL=SpineTexture.mjs.map

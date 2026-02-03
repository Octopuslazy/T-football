'use strict';

var pixi_js = require('pixi.js');
var spineCore = require('@esotericsoftware/spine-core');

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
const _SpineTexture = class _SpineTexture extends spineCore.Texture {
  constructor(image) {
    super(image.resource);
    __publicField(this, "texture");
    this.texture = pixi_js.Texture.from(image);
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
      case spineCore.TextureFilter.Nearest:
      case spineCore.TextureFilter.Linear:
        return false;
      case spineCore.TextureFilter.MipMapNearestLinear:
      case spineCore.TextureFilter.MipMapNearestNearest:
      case spineCore.TextureFilter.MipMapLinearLinear:
      case spineCore.TextureFilter.MipMapLinearNearest:
        return true;
      default:
        throw new Error(`Unknown texture filter: ${String(filter)}`);
    }
  }
  static toPixiTextureFilter(filter) {
    switch (filter) {
      case spineCore.TextureFilter.Nearest:
      case spineCore.TextureFilter.MipMapNearestLinear:
      case spineCore.TextureFilter.MipMapNearestNearest:
        return "nearest";
      case spineCore.TextureFilter.Linear:
      case spineCore.TextureFilter.MipMapLinearLinear:
      case spineCore.TextureFilter.MipMapLinearNearest:
        return "linear";
      default:
        throw new Error(`Unknown texture filter: ${String(filter)}`);
    }
  }
  static toPixiTextureWrap(wrap) {
    switch (wrap) {
      case spineCore.TextureWrap.ClampToEdge:
        return "clamp-to-edge";
      case spineCore.TextureWrap.MirroredRepeat:
        return "mirror-repeat";
      case spineCore.TextureWrap.Repeat:
        return "repeat";
      default:
        throw new Error(`Unknown texture wrap: ${String(wrap)}`);
    }
  }
  static toPixiBlending(blend) {
    switch (blend) {
      case spineCore.BlendMode.Normal:
        return "normal";
      case spineCore.BlendMode.Additive:
        return "add";
      case spineCore.BlendMode.Multiply:
        return "multiply";
      case spineCore.BlendMode.Screen:
        return "screen";
      default:
        throw new Error(`Unknown blendMode: ${String(blend)}`);
    }
  }
};
__publicField(_SpineTexture, "textureMap", /* @__PURE__ */ new Map());
let SpineTexture = _SpineTexture;

exports.SpineTexture = SpineTexture;
//# sourceMappingURL=SpineTexture.js.map

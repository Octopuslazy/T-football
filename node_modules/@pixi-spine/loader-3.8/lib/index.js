'use strict';

var loaderBase = require('@pixi-spine/loader-base');
var runtime3_8 = require('@pixi-spine/runtime-3.8');

class SpineParser extends loaderBase.SpineLoaderAbstract {
  createBinaryParser() {
    return new runtime3_8.SkeletonBinary(null);
  }
  createJsonParser() {
    return new runtime3_8.SkeletonJson(null);
  }
  parseData(parser, atlas, dataToParse) {
    const parserCast = parser;
    parserCast.attachmentLoader = new runtime3_8.AtlasAttachmentLoader(atlas);
    return {
      spineData: parserCast.readSkeletonData(dataToParse),
      spineAtlas: atlas
    };
  }
}
new SpineParser().installLoader();
//# sourceMappingURL=index.js.map

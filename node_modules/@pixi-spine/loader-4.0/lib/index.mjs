import { SpineLoaderAbstract } from '@pixi-spine/loader-base';
import { SkeletonBinary, SkeletonJson, AtlasAttachmentLoader } from '@pixi-spine/runtime-4.0';

class SpineParser extends SpineLoaderAbstract {
  createBinaryParser() {
    return new SkeletonBinary(null);
  }
  createJsonParser() {
    return new SkeletonJson(null);
  }
  parseData(parser, atlas, dataToParse) {
    const parserCast = parser;
    parserCast.attachmentLoader = new AtlasAttachmentLoader(atlas);
    return {
      spineData: parserCast.readSkeletonData(dataToParse),
      spineAtlas: atlas
    };
  }
}
new SpineParser().installLoader();
//# sourceMappingURL=index.mjs.map

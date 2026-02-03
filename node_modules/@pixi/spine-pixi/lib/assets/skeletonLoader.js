'use strict';

var pixi_js = require('pixi.js');

function isJson(resource) {
  return Object.prototype.hasOwnProperty.call(resource, "bones");
}
function isBuffer(resource) {
  return resource instanceof Uint8Array;
}
const spineLoaderExtension = {
  extension: pixi_js.ExtensionType.Asset,
  loader: {
    extension: {
      type: pixi_js.ExtensionType.LoadParser,
      priority: pixi_js.LoaderParserPriority.Normal,
      name: "spineSkeletonLoader"
    },
    test(url) {
      return pixi_js.checkExtension(url, ".skel");
    },
    async load(url) {
      const response = await pixi_js.DOMAdapter.get().fetch(url);
      const buffer = new Uint8Array(await response.arrayBuffer());
      return buffer;
    },
    testParse(asset, options) {
      const isJsonSpineModel = pixi_js.checkExtension(options.src, ".json") && isJson(asset);
      const isBinarySpineModel = pixi_js.checkExtension(options.src, ".skel") && isBuffer(asset);
      return Promise.resolve(isJsonSpineModel || isBinarySpineModel);
    }
  }
};
pixi_js.extensions.add(spineLoaderExtension);
//# sourceMappingURL=skeletonLoader.js.map

import { ExtensionType, LoaderParserPriority, checkExtension, DOMAdapter, extensions } from 'pixi.js';

function isJson(resource) {
  return Object.prototype.hasOwnProperty.call(resource, "bones");
}
function isBuffer(resource) {
  return resource instanceof Uint8Array;
}
const spineLoaderExtension = {
  extension: ExtensionType.Asset,
  loader: {
    extension: {
      type: ExtensionType.LoadParser,
      priority: LoaderParserPriority.Normal,
      name: "spineSkeletonLoader"
    },
    test(url) {
      return checkExtension(url, ".skel");
    },
    async load(url) {
      const response = await DOMAdapter.get().fetch(url);
      const buffer = new Uint8Array(await response.arrayBuffer());
      return buffer;
    },
    testParse(asset, options) {
      const isJsonSpineModel = checkExtension(options.src, ".json") && isJson(asset);
      const isBinarySpineModel = checkExtension(options.src, ".skel") && isBuffer(asset);
      return Promise.resolve(isJsonSpineModel || isBinarySpineModel);
    }
  }
};
extensions.add(spineLoaderExtension);
//# sourceMappingURL=skeletonLoader.mjs.map

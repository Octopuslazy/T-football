'use strict';

var pixi_js = require('pixi.js');
var SpineTexture = require('../SpineTexture.js');
var spineCore = require('@esotericsoftware/spine-core');

const spineTextureAtlasLoader = {
  extension: pixi_js.ExtensionType.Asset,
  loader: {
    extension: {
      type: pixi_js.ExtensionType.LoadParser,
      priority: pixi_js.LoaderParserPriority.Normal,
      name: "spineTextureAtlasLoader"
    },
    test(url) {
      return pixi_js.checkExtension(url, ".atlas");
    },
    async load(url) {
      const response = await pixi_js.DOMAdapter.get().fetch(url);
      const txt = await response.text();
      return txt;
    },
    testParse(asset, options) {
      const isExtensionRight = pixi_js.checkExtension(options.src, ".atlas");
      const isString = typeof asset === "string";
      return Promise.resolve(isExtensionRight && isString);
    },
    unload(atlas) {
      atlas.dispose();
    },
    async parse(asset, options, loader) {
      const metadata = options.data || {};
      let basePath = pixi_js.path.dirname(options.src);
      if (basePath && basePath.lastIndexOf("/") !== basePath.length - 1) {
        basePath += "/";
      }
      const retval = new spineCore.TextureAtlas(asset);
      if (metadata.images instanceof pixi_js.TextureSource || typeof metadata.images === "string") {
        const pixiTexture = metadata.images;
        metadata.images = {};
        metadata.images[retval.pages[0].name] = pixiTexture;
      }
      const textureLoadingPromises = [];
      for (const page of retval.pages) {
        const pageName = page.name;
        const providedPage = metadata?.images ? metadata.images[pageName] : void 0;
        if (providedPage instanceof pixi_js.TextureSource) {
          page.setTexture(SpineTexture.SpineTexture.from(providedPage));
        } else {
          const url = providedPage ?? pixi_js.path.normalize([...basePath.split(pixi_js.path.sep), pageName].join(pixi_js.path.sep));
          const assetsToLoadIn = {
            src: url,
            data: {
              ...metadata.imageMetadata,
              alphaMode: page.pma ? "premultiplied-alpha" : "premultiply-alpha-on-upload"
            }
          };
          const pixiPromise = loader.load(assetsToLoadIn).then((texture) => {
            page.setTexture(SpineTexture.SpineTexture.from(texture.source));
          });
          textureLoadingPromises.push(pixiPromise);
        }
      }
      await Promise.all(textureLoadingPromises);
      return retval;
    }
  }
};
pixi_js.extensions.add(spineTextureAtlasLoader);
//# sourceMappingURL=atlasLoader.js.map

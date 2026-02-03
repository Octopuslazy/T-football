import { ExtensionType, LoaderParserPriority, checkExtension, DOMAdapter, path, TextureSource, extensions } from 'pixi.js';
import { SpineTexture } from '../SpineTexture.mjs';
import { TextureAtlas } from '@esotericsoftware/spine-core';

const spineTextureAtlasLoader = {
  extension: ExtensionType.Asset,
  loader: {
    extension: {
      type: ExtensionType.LoadParser,
      priority: LoaderParserPriority.Normal,
      name: "spineTextureAtlasLoader"
    },
    test(url) {
      return checkExtension(url, ".atlas");
    },
    async load(url) {
      const response = await DOMAdapter.get().fetch(url);
      const txt = await response.text();
      return txt;
    },
    testParse(asset, options) {
      const isExtensionRight = checkExtension(options.src, ".atlas");
      const isString = typeof asset === "string";
      return Promise.resolve(isExtensionRight && isString);
    },
    unload(atlas) {
      atlas.dispose();
    },
    async parse(asset, options, loader) {
      const metadata = options.data || {};
      let basePath = path.dirname(options.src);
      if (basePath && basePath.lastIndexOf("/") !== basePath.length - 1) {
        basePath += "/";
      }
      const retval = new TextureAtlas(asset);
      if (metadata.images instanceof TextureSource || typeof metadata.images === "string") {
        const pixiTexture = metadata.images;
        metadata.images = {};
        metadata.images[retval.pages[0].name] = pixiTexture;
      }
      const textureLoadingPromises = [];
      for (const page of retval.pages) {
        const pageName = page.name;
        const providedPage = metadata?.images ? metadata.images[pageName] : void 0;
        if (providedPage instanceof TextureSource) {
          page.setTexture(SpineTexture.from(providedPage));
        } else {
          const url = providedPage ?? path.normalize([...basePath.split(path.sep), pageName].join(path.sep));
          const assetsToLoadIn = {
            src: url,
            data: {
              ...metadata.imageMetadata,
              alphaMode: page.pma ? "premultiplied-alpha" : "premultiply-alpha-on-upload"
            }
          };
          const pixiPromise = loader.load(assetsToLoadIn).then((texture) => {
            page.setTexture(SpineTexture.from(texture.source));
          });
          textureLoadingPromises.push(pixiPromise);
        }
      }
      await Promise.all(textureLoadingPromises);
      return retval;
    }
  }
};
extensions.add(spineTextureAtlasLoader);
//# sourceMappingURL=atlasLoader.mjs.map

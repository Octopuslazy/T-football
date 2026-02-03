'use strict';

if (typeof window !== "undefined" && window.PIXI) {
  const prevRequire = window.require;
  window.require = (x) => {
    if (prevRequire)
      return prevRequire(x);
    else if (x.startsWith("@pixi/") || x.startsWith("pixi.js"))
      return window.PIXI;
  };
}
//# sourceMappingURL=require-shim.js.map

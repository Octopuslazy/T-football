'use strict';

require('./require-shim.js');
require('./assets/atlasLoader.js');
require('./assets/skeletonLoader.js');
require('./darktint/DarkTintBatcher.js');
var SpinePipe = require('./SpinePipe.js');
var Spine = require('./Spine.js');
var SpineDebugRenderer = require('./SpineDebugRenderer.js');
var SpineTexture = require('./SpineTexture.js');
var spineCore = require('@esotericsoftware/spine-core');



exports.SpinePipe = SpinePipe.SpinePipe;
exports.Spine = Spine.Spine;
exports.SpineDebugRenderer = SpineDebugRenderer.SpineDebugRenderer;
exports.SpineTexture = SpineTexture.SpineTexture;
Object.keys(spineCore).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return spineCore[k]; }
	});
});
//# sourceMappingURL=index.js.map

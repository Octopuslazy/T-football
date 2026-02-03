'use strict';

require('@pixi-spine/loader-3.8');
var runtime3_8 = require('@pixi-spine/runtime-3.8');
var base = require('@pixi-spine/base');



Object.keys(runtime3_8).forEach(function (k) {
	if (k !== 'default' && !exports.hasOwnProperty(k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return runtime3_8[k]; }
	});
});
Object.keys(base).forEach(function (k) {
	if (k !== 'default' && !exports.hasOwnProperty(k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return base[k]; }
	});
});
//# sourceMappingURL=index.js.map

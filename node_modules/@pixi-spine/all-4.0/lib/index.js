'use strict';

require('@pixi-spine/loader-4.0');
var runtime4_0 = require('@pixi-spine/runtime-4.0');
var base = require('@pixi-spine/base');



Object.keys(runtime4_0).forEach(function (k) {
	if (k !== 'default' && !exports.hasOwnProperty(k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return runtime4_0[k]; }
	});
});
Object.keys(base).forEach(function (k) {
	if (k !== 'default' && !exports.hasOwnProperty(k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return base[k]; }
	});
});
//# sourceMappingURL=index.js.map

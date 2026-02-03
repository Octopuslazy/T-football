'use strict';

var pixi_js = require('pixi.js');
var darkTintBit = require('./darkTintBit.js');

class DarkTintShader extends pixi_js.Shader {
  constructor(maxTextures) {
    const glProgram = pixi_js.compileHighShaderGlProgram({
      name: "dark-tint-batch",
      bits: [
        pixi_js.colorBitGl,
        darkTintBit.darkTintBitGl,
        pixi_js.generateTextureBatchBitGl(maxTextures),
        pixi_js.roundPixelsBitGl
      ]
    });
    const gpuProgram = pixi_js.compileHighShaderGpuProgram({
      name: "dark-tint-batch",
      bits: [
        pixi_js.colorBit,
        darkTintBit.darkTintBit,
        pixi_js.generateTextureBatchBit(maxTextures),
        pixi_js.roundPixelsBit
      ]
    });
    super({
      glProgram,
      gpuProgram,
      resources: {
        batchSamplers: pixi_js.getBatchSamplersUniformGroup(maxTextures)
      }
    });
  }
}

exports.DarkTintShader = DarkTintShader;
//# sourceMappingURL=DarkTintShader.js.map

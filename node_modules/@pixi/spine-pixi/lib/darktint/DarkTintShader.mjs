import { Shader, compileHighShaderGlProgram, colorBitGl, generateTextureBatchBitGl, roundPixelsBitGl, compileHighShaderGpuProgram, colorBit, generateTextureBatchBit, roundPixelsBit, getBatchSamplersUniformGroup } from 'pixi.js';
import { darkTintBitGl, darkTintBit } from './darkTintBit.mjs';

class DarkTintShader extends Shader {
  constructor(maxTextures) {
    const glProgram = compileHighShaderGlProgram({
      name: "dark-tint-batch",
      bits: [
        colorBitGl,
        darkTintBitGl,
        generateTextureBatchBitGl(maxTextures),
        roundPixelsBitGl
      ]
    });
    const gpuProgram = compileHighShaderGpuProgram({
      name: "dark-tint-batch",
      bits: [
        colorBit,
        darkTintBit,
        generateTextureBatchBit(maxTextures),
        roundPixelsBit
      ]
    });
    super({
      glProgram,
      gpuProgram,
      resources: {
        batchSamplers: getBatchSamplersUniformGroup(maxTextures)
      }
    });
  }
}

export { DarkTintShader };
//# sourceMappingURL=DarkTintShader.mjs.map

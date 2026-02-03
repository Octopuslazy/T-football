import { Batcher, DefaultBatchableMeshElement, DefaultBatchableQuadElement, ExtensionType, Shader } from 'pixi.js';
import { DarkTintBatchGeometry } from './DarkTintBatchGeometry';
/** The default batcher is used to batch quads and meshes. */
export declare class DarkTintBatcher extends Batcher {
    /** @ignore */
    static extension: {
        readonly type: readonly [ExtensionType.Batcher];
        readonly name: "darkTint";
    };
    geometry: DarkTintBatchGeometry;
    shader: Shader;
    name: "darkTint";
    /** The size of one attribute. 1 = 32 bit. x, y, u, v, color, darkColor, textureIdAndRound -> total = 7 */
    vertexSize: number;
    packAttributes(element: DefaultBatchableMeshElement & {
        darkColor: number;
    }, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;
    packQuadAttributes(element: DefaultBatchableQuadElement & {
        darkColor: number;
    }, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;
}

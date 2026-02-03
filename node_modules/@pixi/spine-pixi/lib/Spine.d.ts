/** ****************************************************************************
 * Spine Runtimes License Agreement
 * Last updated July 28, 2023. Replaces all prior versions.
 *
 * Copyright (c) 2013-2023, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software or
 * otherwise create derivative works of the Spine Runtimes (collectively,
 * "Products"), provided that each user of the Products must obtain their own
 * Spine Editor license and redistribution of the Products in any form must
 * include this license and copyright notice.
 *
 * THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES,
 * BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THE
 * SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/
import { Bounds, Container, ContainerOptions, DestroyOptions, PointData, Texture, ViewContainer } from 'pixi.js';
import { ISpineDebugRenderer } from './SpineDebugRenderer';
import { AnimationState, Bone, Color, MeshAttachment, RegionAttachment, Skeleton, SkeletonBounds, SkeletonData, Slot, TrackEntry } from '@esotericsoftware/spine-core';
export type SpineFromOptions = {
    skeleton: string;
    atlas: string;
    scale?: number;
};
export interface SpineOptions extends ContainerOptions {
    skeletonData: SkeletonData;
    autoUpdate?: boolean;
}
export interface SpineEvents {
    complete: [trackEntry: TrackEntry];
    dispose: [trackEntry: TrackEntry];
    end: [trackEntry: TrackEntry];
    event: [trackEntry: TrackEntry, event: Event];
    interrupt: [trackEntry: TrackEntry];
    start: [trackEntry: TrackEntry];
}
export interface AttachmentCacheData {
    id: string;
    clipped: boolean;
    vertices: Float32Array;
    uvs: Float32Array;
    indices: number[];
    color: Color;
    darkColor: Color | null;
    darkTint: boolean;
    skipRender: boolean;
    texture: Texture;
    clippedData?: {
        vertices: Float32Array;
        uvs: Float32Array;
        indices: Uint16Array;
        vertexCount: number;
        indicesCount: number;
    };
}
export declare class Spine extends ViewContainer {
    batched: boolean;
    buildId: number;
    readonly renderPipeId = "spine";
    _didSpineUpdate: boolean;
    beforeUpdateWorldTransforms: (object: Spine) => void;
    afterUpdateWorldTransforms: (object: Spine) => void;
    skeleton: Skeleton;
    state: AnimationState;
    skeletonBounds: SkeletonBounds;
    private _debug?;
    readonly _slotsObject: Record<string, {
        slot: Slot;
        container: Container;
    }>;
    private getSlotFromRef;
    spineAttachmentsDirty: boolean;
    spineTexturesDirty: boolean;
    private _lastAttachments;
    private _stateChanged;
    private attachmentCacheData;
    get debug(): ISpineDebugRenderer | undefined;
    set debug(value: ISpineDebugRenderer | undefined);
    private autoUpdateWarned;
    private _autoUpdate;
    get autoUpdate(): boolean;
    set autoUpdate(value: boolean);
    constructor(options: SpineOptions | SkeletonData);
    update(dt: number): void;
    protected internalUpdate(_deltaFrame: any, deltaSeconds?: number): void;
    get bounds(): Bounds;
    setBonePosition(bone: string | Bone, position: PointData): void;
    getBonePosition(bone: string | Bone, outPos?: PointData): PointData | undefined;
    /**
     * Will update the state based on the specified time, this will not apply the state to the skeleton
     * as this is differed until the `applyState` method is called.
     *
     * @param time the time at which to set the state
     * @internal
     */
    _updateState(time: number): void;
    /**
     * Applies the state to this spine instance.
     * - updates the state to the skeleton
     * - updates its world transform (spine world transform)
     * - validates the attachments - to flag if the attachments have changed this state
     * - transforms the attachments - to update the vertices of the attachments based on the new positions
     * - update the slot attachments - to update the position, rotation, scale, and visibility of the attached containers
     * @internal
     */
    _applyState(): void;
    private validateAttachments;
    private transformAttachments;
    private updateClippingData;
    /**
     * ensure that attached containers map correctly to their slots
     * along with their position, rotation, scale, and visibility.
     */
    private updateSlotObjects;
    private updateSlotObject;
    /** @internal */
    _getCachedData(slot: Slot, attachment: RegionAttachment | MeshAttachment): AttachmentCacheData;
    private initCachedData;
    protected onViewUpdate(): void;
    /**
     * Attaches a PixiJS container to a specified slot. This will map the world transform of the slots bone
     * to the attached container. A container can only be attached to one slot at a time.
     *
     * @param container - The container to attach to the slot
     * @param slotRef - The slot id or  slot to attach to
     */
    addSlotObject(slot: number | string | Slot, container: Container): void;
    /**
     * Removes a PixiJS container from the slot it is attached to.
     *
     * @param container - The container to detach from the slot
     * @param slotOrContainer - The container, slot id or slot to detach from
     */
    removeSlotObject(slotOrContainer: number | string | Slot | Container): void;
    /**
     * Returns a container attached to a slot, or undefined if no container is attached.
     *
     * @param slotRef - The slot id or slot to get the attachment from
     * @returns - The container attached to the slot
     */
    getSlotObject(slot: number | string | Slot): Container<import("pixi.js").ContainerChild>;
    private updateBounds;
    /** @internal */
    addBounds(bounds: Bounds): void;
    /**
     * Destroys this sprite renderable and optionally its texture.
     * @param options - Options parameter. A boolean will act as if all options
     *  have been set to that value
     * @param {boolean} [options.texture=false] - Should it destroy the current texture of the renderable as well
     * @param {boolean} [options.textureSource=false] - Should it destroy the textureSource of the renderable as well
     */
    destroy(options?: DestroyOptions): void;
    /** Converts a point from the skeleton coordinate system to the Pixi world coordinate system. */
    skeletonToPixiWorldCoordinates(point: {
        x: number;
        y: number;
    }): void;
    /** Converts a point from the Pixi world coordinate system to the skeleton coordinate system. */
    pixiWorldCoordinatesToSkeleton(point: {
        x: number;
        y: number;
    }): void;
    /** Converts a point from the Pixi world coordinate system to the bone's local coordinate system. */
    pixiWorldCoordinatesToBone(point: {
        x: number;
        y: number;
    }, bone: Bone): void;
    static from({ skeleton, atlas, scale }: SpineFromOptions): Spine;
}

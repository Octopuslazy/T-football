'use strict';

var pixi_js = require('pixi.js');
var spineCore = require('@esotericsoftware/spine-core');

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
const vectorAux = new spineCore.Vector2();
const lightColor = new spineCore.Color();
const darkColor = new spineCore.Color();
spineCore.Skeleton.yDown = true;
const clipper = new spineCore.SkeletonClipping();
class Spine extends pixi_js.ViewContainer {
  constructor(options) {
    if (options instanceof spineCore.SkeletonData) {
      options = {
        skeletonData: options
      };
    }
    super();
    // Pixi properties
    __publicField(this, "batched", true);
    __publicField(this, "buildId", 0);
    __publicField(this, "renderPipeId", "spine");
    __publicField(this, "_didSpineUpdate", false);
    __publicField(this, "beforeUpdateWorldTransforms", () => {
    });
    __publicField(this, "afterUpdateWorldTransforms", () => {
    });
    // Spine properties
    __publicField(this, "skeleton");
    __publicField(this, "state");
    __publicField(this, "skeletonBounds");
    __publicField(this, "_debug");
    __publicField(this, "_slotsObject", /* @__PURE__ */ Object.create(null));
    __publicField(this, "spineAttachmentsDirty", true);
    __publicField(this, "spineTexturesDirty", true);
    __publicField(this, "_lastAttachments");
    __publicField(this, "_stateChanged", true);
    __publicField(this, "attachmentCacheData", []);
    __publicField(this, "autoUpdateWarned", false);
    __publicField(this, "_autoUpdate", true);
    const skeletonData = options instanceof spineCore.SkeletonData ? options : options.skeletonData;
    this.skeleton = new spineCore.Skeleton(skeletonData);
    this.state = new spineCore.AnimationState(new spineCore.AnimationStateData(skeletonData));
    this.autoUpdate = options?.autoUpdate ?? true;
    const slots = this.skeleton.slots;
    for (let i = 0; i < slots.length; i++) {
      this.attachmentCacheData[i] = /* @__PURE__ */ Object.create(null);
    }
    this._updateState(0);
  }
  getSlotFromRef(slotRef) {
    let slot;
    if (typeof slotRef === "number")
      slot = this.skeleton.slots[slotRef];
    else if (typeof slotRef === "string")
      slot = this.skeleton.findSlot(slotRef);
    else
      slot = slotRef;
    if (!slot)
      throw new Error(`No slot found with the given slot reference: ${slotRef}`);
    return slot;
  }
  get debug() {
    return this._debug;
  }
  set debug(value) {
    if (this._debug) {
      this._debug.unregisterSpine(this);
    }
    if (value) {
      value.registerSpine(this);
    }
    this._debug = value;
  }
  get autoUpdate() {
    return this._autoUpdate;
  }
  set autoUpdate(value) {
    if (value) {
      pixi_js.Ticker.shared.add(this.internalUpdate, this);
      this.autoUpdateWarned = false;
    } else {
      pixi_js.Ticker.shared.remove(this.internalUpdate, this);
    }
    this._autoUpdate = value;
  }
  update(dt) {
    if (this.autoUpdate && !this.autoUpdateWarned) {
      console.warn(
        // eslint-disable-next-line max-len
        "You are calling update on a Spine instance that has autoUpdate set to true. This is probably not what you want."
      );
      this.autoUpdateWarned = true;
    }
    this.internalUpdate(0, dt);
  }
  internalUpdate(_deltaFrame, deltaSeconds) {
    this._updateState(deltaSeconds ?? pixi_js.Ticker.shared.deltaMS / 1e3);
  }
  get bounds() {
    if (this._boundsDirty) {
      this.updateBounds();
    }
    return this._bounds;
  }
  setBonePosition(bone, position) {
    const boneAux = bone;
    if (typeof bone === "string") {
      bone = this.skeleton.findBone(bone);
    }
    if (!bone)
      throw Error(`Cant set bone position, bone ${String(boneAux)} not found`);
    vectorAux.set(position.x, position.y);
    if (bone.parent) {
      const aux = bone.parent.worldToLocal(vectorAux);
      bone.x = aux.x;
      bone.y = -aux.y;
    } else {
      bone.x = vectorAux.x;
      bone.y = vectorAux.y;
    }
  }
  getBonePosition(bone, outPos) {
    const boneAux = bone;
    if (typeof bone === "string") {
      bone = this.skeleton.findBone(bone);
    }
    if (!bone) {
      console.error(`Cant set bone position! Bone ${String(boneAux)} not found`);
      return outPos;
    }
    if (!outPos) {
      outPos = { x: 0, y: 0 };
    }
    outPos.x = bone.worldX;
    outPos.y = bone.worldY;
    return outPos;
  }
  /**
   * Will update the state based on the specified time, this will not apply the state to the skeleton
   * as this is differed until the `applyState` method is called.
   *
   * @param time the time at which to set the state
   * @internal
   */
  _updateState(time) {
    this.state.update(time);
    this.skeleton.update(time);
    this._stateChanged = true;
    this._boundsDirty = true;
    this.onViewUpdate();
  }
  /**
   * Applies the state to this spine instance.
   * - updates the state to the skeleton
   * - updates its world transform (spine world transform)
   * - validates the attachments - to flag if the attachments have changed this state
   * - transforms the attachments - to update the vertices of the attachments based on the new positions
   * - update the slot attachments - to update the position, rotation, scale, and visibility of the attached containers
   * @internal
   */
  _applyState() {
    if (!this._stateChanged)
      return;
    this._stateChanged = false;
    const { skeleton } = this;
    this.state.apply(skeleton);
    this.beforeUpdateWorldTransforms(this);
    skeleton.updateWorldTransform(spineCore.Physics.update);
    this.afterUpdateWorldTransforms(this);
    this.validateAttachments();
    this.transformAttachments();
    this.updateSlotObjects();
  }
  validateAttachments() {
    const currentDrawOrder = this.skeleton.drawOrder;
    const lastAttachments = this._lastAttachments || (this._lastAttachments = []);
    let index = 0;
    let spineAttachmentsDirty = false;
    for (let i = 0; i < currentDrawOrder.length; i++) {
      const slot = currentDrawOrder[i];
      const attachment = slot.getAttachment();
      if (attachment) {
        if (attachment !== lastAttachments[index]) {
          spineAttachmentsDirty = true;
          lastAttachments[index] = attachment;
        }
        index++;
      }
    }
    if (index !== lastAttachments.length) {
      spineAttachmentsDirty = true;
      lastAttachments.length = index;
    }
    this.spineAttachmentsDirty = spineAttachmentsDirty;
  }
  transformAttachments() {
    const currentDrawOrder = this.skeleton.drawOrder;
    for (let i = 0; i < currentDrawOrder.length; i++) {
      const slot = currentDrawOrder[i];
      const attachment = slot.getAttachment();
      if (attachment) {
        if (attachment instanceof spineCore.MeshAttachment || attachment instanceof spineCore.RegionAttachment) {
          const cacheData = this._getCachedData(slot, attachment);
          if (attachment instanceof spineCore.RegionAttachment) {
            attachment.computeWorldVertices(slot, cacheData.vertices, 0, 2);
          } else {
            attachment.computeWorldVertices(
              slot,
              0,
              attachment.worldVerticesLength,
              cacheData.vertices,
              0,
              2
            );
          }
          cacheData.uvs = attachment.uvs;
          const skeleton = slot.bone.skeleton;
          const skeletonColor = skeleton.color;
          const slotColor = slot.color;
          const attachmentColor = attachment.color;
          cacheData.color.set(
            skeletonColor.r * slotColor.r * attachmentColor.r,
            skeletonColor.g * slotColor.g * attachmentColor.g,
            skeletonColor.b * slotColor.b * attachmentColor.b,
            skeletonColor.a * slotColor.a * attachmentColor.a
          );
          cacheData.darkTint = !!slot.darkColor;
          if (slot.darkColor) {
            cacheData.darkColor.setFromColor(slot.darkColor);
          }
          cacheData.skipRender = cacheData.clipped = false;
          const texture = attachment.region?.texture.texture || pixi_js.Texture.EMPTY;
          if (cacheData.texture !== texture) {
            cacheData.texture = texture;
            this.spineTexturesDirty = true;
          }
          if (clipper.isClipping()) {
            this.updateClippingData(cacheData);
          }
        } else if (attachment instanceof spineCore.ClippingAttachment) {
          clipper.clipStart(slot, attachment);
          continue;
        }
      }
      clipper.clipEndWithSlot(slot);
    }
    clipper.clipEnd();
  }
  updateClippingData(cacheData) {
    cacheData.clipped = true;
    clipper.clipTriangles(
      cacheData.vertices,
      cacheData.vertices.length,
      cacheData.indices,
      cacheData.indices.length,
      cacheData.uvs,
      lightColor,
      darkColor,
      false
    );
    const { clippedVertices, clippedTriangles } = clipper;
    const verticesCount = clippedVertices.length / 8;
    const indicesCount = clippedTriangles.length;
    if (!cacheData.clippedData) {
      cacheData.clippedData = {
        vertices: new Float32Array(verticesCount * 2),
        uvs: new Float32Array(verticesCount * 2),
        vertexCount: verticesCount,
        indices: new Uint16Array(indicesCount),
        indicesCount
      };
      this.spineAttachmentsDirty = true;
    }
    const clippedData = cacheData.clippedData;
    const sizeChange = clippedData.vertexCount !== verticesCount || indicesCount !== clippedData.indicesCount;
    cacheData.skipRender = verticesCount === 0;
    if (sizeChange) {
      this.spineAttachmentsDirty = true;
      if (clippedData.vertexCount < verticesCount) {
        clippedData.vertices = new Float32Array(verticesCount * 2);
        clippedData.uvs = new Float32Array(verticesCount * 2);
      }
      if (clippedData.indices.length < indicesCount) {
        clippedData.indices = new Uint16Array(indicesCount);
      }
    }
    const { vertices, uvs, indices } = clippedData;
    for (let i = 0; i < verticesCount; i++) {
      vertices[i * 2] = clippedVertices[i * 8];
      vertices[i * 2 + 1] = clippedVertices[i * 8 + 1];
      uvs[i * 2] = clippedVertices[i * 8 + 6];
      uvs[i * 2 + 1] = clippedVertices[i * 8 + 7];
    }
    clippedData.vertexCount = verticesCount;
    for (let i = 0; i < indices.length; i++) {
      indices[i] = clippedTriangles[i];
    }
    clippedData.indicesCount = indicesCount;
  }
  /**
   * ensure that attached containers map correctly to their slots
   * along with their position, rotation, scale, and visibility.
   */
  updateSlotObjects() {
    for (const i in this._slotsObject) {
      const slotAttachment = this._slotsObject[i];
      if (!slotAttachment)
        continue;
      this.updateSlotObject(slotAttachment);
    }
  }
  updateSlotObject(slotAttachment) {
    const { slot, container } = slotAttachment;
    container.visible = this.skeleton.drawOrder.includes(slot);
    if (container.visible) {
      const bone = slot.bone;
      container.position.set(bone.worldX, bone.worldY);
      container.scale.x = bone.getWorldScaleX();
      container.scale.y = bone.getWorldScaleY();
      container.rotation = bone.getWorldRotationX() * pixi_js.DEG_TO_RAD;
    }
  }
  /** @internal */
  _getCachedData(slot, attachment) {
    return this.attachmentCacheData[slot.data.index][attachment.name] || this.initCachedData(slot, attachment);
  }
  initCachedData(slot, attachment) {
    let vertices;
    if (attachment instanceof spineCore.RegionAttachment) {
      vertices = new Float32Array(8);
      this.attachmentCacheData[slot.data.index][attachment.name] = {
        id: `${slot.data.index}-${attachment.name}`,
        vertices,
        clipped: false,
        indices: [0, 1, 2, 0, 2, 3],
        uvs: attachment.uvs,
        color: new spineCore.Color(1, 1, 1, 1),
        darkColor: new spineCore.Color(0, 0, 0, 0),
        darkTint: false,
        skipRender: false,
        texture: attachment.region?.texture.texture
      };
    } else {
      vertices = new Float32Array(attachment.worldVerticesLength);
      this.attachmentCacheData[slot.data.index][attachment.name] = {
        id: `${slot.data.index}-${attachment.name}`,
        vertices,
        clipped: false,
        indices: attachment.triangles,
        uvs: attachment.uvs,
        color: new spineCore.Color(1, 1, 1, 1),
        darkColor: new spineCore.Color(0, 0, 0, 0),
        darkTint: false,
        skipRender: false,
        texture: attachment.region?.texture.texture
      };
    }
    return this.attachmentCacheData[slot.data.index][attachment.name];
  }
  onViewUpdate() {
    this._didChangeId += 1 << 12;
    this._boundsDirty = true;
    if (this.didViewUpdate)
      return;
    this.didViewUpdate = true;
    const renderGroup = this.renderGroup || this.parentRenderGroup;
    if (renderGroup) {
      renderGroup.onChildViewUpdate(this);
    }
    this.debug?.renderDebug(this);
  }
  /**
   * Attaches a PixiJS container to a specified slot. This will map the world transform of the slots bone
   * to the attached container. A container can only be attached to one slot at a time.
   *
   * @param container - The container to attach to the slot
   * @param slotRef - The slot id or  slot to attach to
   */
  addSlotObject(slot, container) {
    slot = this.getSlotFromRef(slot);
    for (const i in this._slotsObject) {
      if (this._slotsObject[i]?.container === container) {
        this.removeSlotObject(this._slotsObject[i].slot);
      }
    }
    this.removeSlotObject(slot);
    container.includeInBuild = false;
    this.addChild(container);
    this._slotsObject[slot.data.name] = {
      container,
      slot
    };
    this.updateSlotObject(this._slotsObject[slot.data.name]);
  }
  /**
   * Removes a PixiJS container from the slot it is attached to.
   *
   * @param container - The container to detach from the slot
   * @param slotOrContainer - The container, slot id or slot to detach from
   */
  removeSlotObject(slotOrContainer) {
    let containerToRemove;
    if (slotOrContainer instanceof pixi_js.Container) {
      for (const i in this._slotsObject) {
        if (this._slotsObject[i]?.container === slotOrContainer) {
          this._slotsObject[i] = null;
          containerToRemove = slotOrContainer;
          break;
        }
      }
    } else {
      const slot = this.getSlotFromRef(slotOrContainer);
      containerToRemove = this._slotsObject[slot.data.name]?.container;
      this._slotsObject[slot.data.name] = null;
    }
    if (containerToRemove) {
      this.removeChild(containerToRemove);
      containerToRemove.includeInBuild = true;
    }
  }
  /**
   * Returns a container attached to a slot, or undefined if no container is attached.
   *
   * @param slotRef - The slot id or slot to get the attachment from
   * @returns - The container attached to the slot
   */
  getSlotObject(slot) {
    slot = this.getSlotFromRef(slot);
    return this._slotsObject[slot.data.name].container;
  }
  updateBounds() {
    this._boundsDirty = false;
    this.skeletonBounds || (this.skeletonBounds = new spineCore.SkeletonBounds());
    const skeletonBounds = this.skeletonBounds;
    skeletonBounds.update(this.skeleton, true);
    if (skeletonBounds.minX === Infinity) {
      this._applyState();
      const drawOrder = this.skeleton.drawOrder;
      const bounds = this._bounds;
      bounds.clear();
      for (let i = 0; i < drawOrder.length; i++) {
        const slot = drawOrder[i];
        const attachment = slot.getAttachment();
        if (attachment && (attachment instanceof spineCore.RegionAttachment || attachment instanceof spineCore.MeshAttachment)) {
          const cacheData = this._getCachedData(slot, attachment);
          bounds.addVertexData(cacheData.vertices, 0, cacheData.vertices.length);
        }
      }
    } else {
      this._bounds.minX = skeletonBounds.minX;
      this._bounds.minY = skeletonBounds.minY;
      this._bounds.maxX = skeletonBounds.maxX;
      this._bounds.maxY = skeletonBounds.maxY;
    }
  }
  /** @internal */
  addBounds(bounds) {
    bounds.addBounds(this.bounds);
  }
  /**
   * Destroys this sprite renderable and optionally its texture.
   * @param options - Options parameter. A boolean will act as if all options
   *  have been set to that value
   * @param {boolean} [options.texture=false] - Should it destroy the current texture of the renderable as well
   * @param {boolean} [options.textureSource=false] - Should it destroy the textureSource of the renderable as well
   */
  destroy(options = false) {
    super.destroy(options);
    pixi_js.Ticker.shared.remove(this.internalUpdate, this);
    this.state.clearListeners();
    this.debug = void 0;
    this.skeleton = null;
    this.state = null;
    this._slotsObject = null;
    this._lastAttachments = null;
    this.attachmentCacheData = null;
  }
  /** Converts a point from the skeleton coordinate system to the Pixi world coordinate system. */
  skeletonToPixiWorldCoordinates(point) {
    this.worldTransform.apply(point, point);
  }
  /** Converts a point from the Pixi world coordinate system to the skeleton coordinate system. */
  pixiWorldCoordinatesToSkeleton(point) {
    this.worldTransform.applyInverse(point, point);
  }
  /** Converts a point from the Pixi world coordinate system to the bone's local coordinate system. */
  pixiWorldCoordinatesToBone(point, bone) {
    this.pixiWorldCoordinatesToSkeleton(point);
    if (bone.parent) {
      bone.parent.worldToLocal(point);
    } else {
      bone.worldToLocal(point);
    }
  }
  static from({ skeleton, atlas, scale = 1 }) {
    const cacheKey = `${skeleton}-${atlas}-${scale}`;
    if (pixi_js.Cache.has(cacheKey)) {
      return new Spine(pixi_js.Cache.get(cacheKey));
    }
    const skeletonAsset = pixi_js.Assets.get(skeleton);
    const atlasAsset = pixi_js.Assets.get(atlas);
    const attachmentLoader = new spineCore.AtlasAttachmentLoader(atlasAsset);
    const parser = skeletonAsset instanceof Uint8Array ? new spineCore.SkeletonBinary(attachmentLoader) : new spineCore.SkeletonJson(attachmentLoader);
    parser.scale = scale;
    const skeletonData = parser.readSkeletonData(skeletonAsset);
    pixi_js.Cache.set(cacheKey, skeletonData);
    return new Spine({
      skeletonData
    });
  }
}

exports.Spine = Spine;
//# sourceMappingURL=Spine.js.map

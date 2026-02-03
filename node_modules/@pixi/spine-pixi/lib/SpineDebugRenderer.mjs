import { Container, Graphics, Text } from 'pixi.js';
import { RegionAttachment, MeshAttachment, ClippingAttachment, SkeletonBounds, PathAttachment } from '@esotericsoftware/spine-core';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class SpineDebugRenderer {
  constructor() {
    __publicField(this, "registeredSpines", /* @__PURE__ */ new Map());
    __publicField(this, "drawMeshHull", true);
    __publicField(this, "drawMeshTriangles", true);
    __publicField(this, "drawBones", true);
    __publicField(this, "drawPaths", true);
    __publicField(this, "drawBoundingBoxes", true);
    __publicField(this, "drawClipping", true);
    __publicField(this, "drawRegionAttachments", true);
    __publicField(this, "drawEvents", true);
    __publicField(this, "lineWidth", 1);
    __publicField(this, "regionAttachmentsColor", 30975);
    __publicField(this, "meshHullColor", 30975);
    __publicField(this, "meshTrianglesColor", 16763904);
    __publicField(this, "clippingPolygonColor", 16711935);
    __publicField(this, "boundingBoxesRectColor", 65280);
    __publicField(this, "boundingBoxesPolygonColor", 65280);
    __publicField(this, "boundingBoxesCircleColor", 65280);
    __publicField(this, "pathsCurveColor", 16711680);
    __publicField(this, "pathsLineColor", 16711935);
    __publicField(this, "skeletonXYColor", 16711680);
    __publicField(this, "bonesColor", 61132);
    __publicField(this, "eventFontSize", 24);
    __publicField(this, "eventFontColor", 0);
  }
  /**
   * The debug is attached by force to each spine object.
   * So we need to create it inside the spine when we get the first update
   */
  registerSpine(spine) {
    if (this.registeredSpines.has(spine)) {
      console.warn("SpineDebugRenderer.registerSpine() - this spine is already registered!", spine);
      return;
    }
    const debugDisplayObjects = {
      parentDebugContainer: new Container(),
      bones: new Container(),
      skeletonXY: new Graphics(),
      regionAttachmentsShape: new Graphics(),
      meshTrianglesLine: new Graphics(),
      meshHullLine: new Graphics(),
      clippingPolygon: new Graphics(),
      boundingBoxesRect: new Graphics(),
      boundingBoxesCircle: new Graphics(),
      boundingBoxesPolygon: new Graphics(),
      pathsCurve: new Graphics(),
      pathsLine: new Graphics(),
      eventText: new Container(),
      eventCallback: {
        event: (_, event) => {
          if (this.drawEvents) {
            const scale = Math.abs(spine.scale.x || spine.scale.y || 1);
            const text = new Text({
              text: event.data.name,
              style: {
                fontSize: this.eventFontSize / scale,
                fill: this.eventFontColor,
                fontFamily: "monospace"
              }
            });
            text.scale.x = Math.sign(spine.scale.x);
            text.anchor.set(0.5);
            debugDisplayObjects.eventText.addChild(text);
            setTimeout(() => {
              if (!text.destroyed) {
                text.destroy();
              }
            }, 250);
          }
        }
      }
    };
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.bones);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.skeletonXY);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.regionAttachmentsShape);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.meshTrianglesLine);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.meshHullLine);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.clippingPolygon);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.boundingBoxesRect);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.boundingBoxesCircle);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.boundingBoxesPolygon);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.pathsCurve);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.pathsLine);
    debugDisplayObjects.parentDebugContainer.addChild(debugDisplayObjects.eventText);
    debugDisplayObjects.parentDebugContainer.zIndex = 9999999;
    debugDisplayObjects.parentDebugContainer.accessibleChildren = false;
    debugDisplayObjects.parentDebugContainer.eventMode = "none";
    debugDisplayObjects.parentDebugContainer.interactiveChildren = false;
    spine.addChild(debugDisplayObjects.parentDebugContainer);
    spine.state.addListener(debugDisplayObjects.eventCallback);
    this.registeredSpines.set(spine, debugDisplayObjects);
  }
  renderDebug(spine) {
    if (!this.registeredSpines.has(spine)) {
      this.registerSpine(spine);
    }
    const debugDisplayObjects = this.registeredSpines.get(spine);
    if (!debugDisplayObjects) {
      return;
    }
    spine.addChild(debugDisplayObjects.parentDebugContainer);
    debugDisplayObjects.skeletonXY.clear();
    debugDisplayObjects.regionAttachmentsShape.clear();
    debugDisplayObjects.meshTrianglesLine.clear();
    debugDisplayObjects.meshHullLine.clear();
    debugDisplayObjects.clippingPolygon.clear();
    debugDisplayObjects.boundingBoxesRect.clear();
    debugDisplayObjects.boundingBoxesCircle.clear();
    debugDisplayObjects.boundingBoxesPolygon.clear();
    debugDisplayObjects.pathsCurve.clear();
    debugDisplayObjects.pathsLine.clear();
    for (let len = debugDisplayObjects.bones.children.length; len > 0; len--) {
      debugDisplayObjects.bones.children[len - 1].destroy({ children: true, texture: true, textureSource: true });
    }
    const scale = Math.abs(spine.scale.x || spine.scale.y || 1);
    const lineWidth = this.lineWidth / scale;
    if (this.drawBones) {
      this.drawBonesFunc(spine, debugDisplayObjects, lineWidth, scale);
    }
    if (this.drawPaths) {
      this.drawPathsFunc(spine, debugDisplayObjects, lineWidth);
    }
    if (this.drawBoundingBoxes) {
      this.drawBoundingBoxesFunc(spine, debugDisplayObjects, lineWidth);
    }
    if (this.drawClipping) {
      this.drawClippingFunc(spine, debugDisplayObjects, lineWidth);
    }
    if (this.drawMeshHull || this.drawMeshTriangles) {
      this.drawMeshHullAndMeshTriangles(spine, debugDisplayObjects, lineWidth);
    }
    if (this.drawRegionAttachments) {
      this.drawRegionAttachmentsFunc(spine, debugDisplayObjects, lineWidth);
    }
    if (this.drawEvents) {
      for (const child of debugDisplayObjects.eventText.children) {
        child.alpha -= 0.05;
        child.y -= 2;
      }
    }
  }
  drawBonesFunc(spine, debugDisplayObjects, lineWidth, scale) {
    const skeleton = spine.skeleton;
    const skeletonX = skeleton.x;
    const skeletonY = skeleton.y;
    const bones = skeleton.bones;
    debugDisplayObjects.skeletonXY.strokeStyle = { width: lineWidth, color: this.skeletonXYColor };
    for (let i = 0, len = bones.length; i < len; i++) {
      const bone = bones[i];
      const boneLen = bone.data.length;
      const starX = skeletonX + bone.worldX;
      const starY = skeletonY + bone.worldY;
      const endX = skeletonX + boneLen * bone.a + bone.worldX;
      const endY = skeletonY + boneLen * bone.b + bone.worldY;
      if (bone.data.name === "root" || bone.data.parent === null) {
        continue;
      }
      const w = Math.abs(starX - endX);
      const h = Math.abs(starY - endY);
      const a2 = Math.pow(w, 2);
      const b = h;
      const b2 = Math.pow(h, 2);
      const c = Math.sqrt(a2 + b2);
      const c2 = Math.pow(c, 2);
      const rad = Math.PI / 180;
      const B = Math.acos((c2 + b2 - a2) / (2 * b * c)) || 0;
      if (c === 0) {
        continue;
      }
      const gp = new Graphics();
      debugDisplayObjects.bones.addChild(gp);
      const refRation = c / 50 / scale;
      gp.context.poly([0, 0, 0 - refRation, c - refRation * 3, 0, c - refRation, 0 + refRation, c - refRation * 3]).fill(this.bonesColor);
      gp.x = starX;
      gp.y = starY;
      gp.pivot.y = c;
      let rotation = 0;
      if (starX < endX && starY < endY) {
        rotation = -B + 180 * rad;
      } else if (starX > endX && starY < endY) {
        rotation = 180 * (rad + B);
      } else if (starX > endX && starY > endY) {
        rotation = -B;
      } else if (starX < endX && starY > endY) {
        rotation = B;
      } else if (starY === endY && starX < endX) {
        rotation = 90 * rad;
      } else if (starY === endY && starX > endX) {
        rotation = -90 * rad;
      } else if (starX === endX && starY < endY) {
        rotation = 180 * rad;
      } else if (starX === endX && starY > endY) {
        rotation = 0;
      }
      gp.rotation = rotation;
      gp.circle(0, c, refRation * 1.2).fill({ color: 0, alpha: 0.6 }).stroke({ width: lineWidth, color: this.skeletonXYColor });
    }
    const startDotSize = lineWidth * 3;
    debugDisplayObjects.skeletonXY.context.moveTo(skeletonX - startDotSize, skeletonY - startDotSize).lineTo(skeletonX + startDotSize, skeletonY + startDotSize).moveTo(skeletonX + startDotSize, skeletonY - startDotSize).lineTo(skeletonX - startDotSize, skeletonY + startDotSize).stroke();
  }
  drawRegionAttachmentsFunc(spine, debugDisplayObjects, lineWidth) {
    const skeleton = spine.skeleton;
    const slots = skeleton.slots;
    for (let i = 0, len = slots.length; i < len; i++) {
      const slot = slots[i];
      const attachment = slot.getAttachment();
      if (attachment === null || !(attachment instanceof RegionAttachment)) {
        continue;
      }
      const regionAttachment = attachment;
      const vertices = new Float32Array(8);
      regionAttachment.computeWorldVertices(slot, vertices, 0, 2);
      debugDisplayObjects.regionAttachmentsShape.poly(Array.from(vertices.slice(0, 8)));
    }
    debugDisplayObjects.regionAttachmentsShape.stroke({
      color: this.regionAttachmentsColor,
      width: lineWidth
    });
  }
  drawMeshHullAndMeshTriangles(spine, debugDisplayObjects, lineWidth) {
    const skeleton = spine.skeleton;
    const slots = skeleton.slots;
    for (let i = 0, len = slots.length; i < len; i++) {
      const slot = slots[i];
      if (!slot.bone.active) {
        continue;
      }
      const attachment = slot.getAttachment();
      if (attachment === null || !(attachment instanceof MeshAttachment)) {
        continue;
      }
      const meshAttachment = attachment;
      const vertices = new Float32Array(meshAttachment.worldVerticesLength);
      const triangles = meshAttachment.triangles;
      let hullLength = meshAttachment.hullLength;
      meshAttachment.computeWorldVertices(slot, 0, meshAttachment.worldVerticesLength, vertices, 0, 2);
      if (this.drawMeshTriangles) {
        for (let i2 = 0, len2 = triangles.length; i2 < len2; i2 += 3) {
          const v1 = triangles[i2] * 2;
          const v2 = triangles[i2 + 1] * 2;
          const v3 = triangles[i2 + 2] * 2;
          debugDisplayObjects.meshTrianglesLine.context.moveTo(vertices[v1], vertices[v1 + 1]).lineTo(vertices[v2], vertices[v2 + 1]).lineTo(vertices[v3], vertices[v3 + 1]);
        }
      }
      if (this.drawMeshHull && hullLength > 0) {
        hullLength = (hullLength >> 1) * 2;
        let lastX = vertices[hullLength - 2];
        let lastY = vertices[hullLength - 1];
        for (let i2 = 0, len2 = hullLength; i2 < len2; i2 += 2) {
          const x = vertices[i2];
          const y = vertices[i2 + 1];
          debugDisplayObjects.meshHullLine.context.moveTo(x, y).lineTo(lastX, lastY);
          lastX = x;
          lastY = y;
        }
      }
    }
    debugDisplayObjects.meshHullLine.stroke({ width: lineWidth, color: this.meshHullColor });
    debugDisplayObjects.meshTrianglesLine.stroke({ width: lineWidth, color: this.meshTrianglesColor });
  }
  drawClippingFunc(spine, debugDisplayObjects, lineWidth) {
    const skeleton = spine.skeleton;
    const slots = skeleton.slots;
    for (let i = 0, len = slots.length; i < len; i++) {
      const slot = slots[i];
      if (!slot.bone.active) {
        continue;
      }
      const attachment = slot.getAttachment();
      if (attachment === null || !(attachment instanceof ClippingAttachment)) {
        continue;
      }
      const clippingAttachment = attachment;
      const nn = clippingAttachment.worldVerticesLength;
      const world = new Float32Array(nn);
      clippingAttachment.computeWorldVertices(slot, 0, nn, world, 0, 2);
      debugDisplayObjects.clippingPolygon.poly(Array.from(world));
    }
    debugDisplayObjects.clippingPolygon.stroke({
      width: lineWidth,
      color: this.clippingPolygonColor,
      alpha: 1
    });
  }
  drawBoundingBoxesFunc(spine, debugDisplayObjects, lineWidth) {
    debugDisplayObjects.boundingBoxesRect.lineStyle(lineWidth, this.boundingBoxesRectColor, 5);
    const bounds = new SkeletonBounds();
    bounds.update(spine.skeleton, true);
    debugDisplayObjects.boundingBoxesRect.rect(bounds.minX, bounds.minY, bounds.getWidth(), bounds.getHeight()).stroke({ width: lineWidth, color: this.boundingBoxesRectColor });
    const polygons = bounds.polygons;
    const drawPolygon = (polygonVertices, _offset, count) => {
      if (count < 3) {
        throw new Error("Polygon must contain at least 3 vertices");
      }
      const paths = [];
      const dotSize = lineWidth * 2;
      for (let i = 0, len = polygonVertices.length; i < len; i += 2) {
        const x1 = polygonVertices[i];
        const y1 = polygonVertices[i + 1];
        debugDisplayObjects.boundingBoxesCircle.beginFill(this.boundingBoxesCircleColor);
        debugDisplayObjects.boundingBoxesCircle.drawCircle(x1, y1, dotSize);
        debugDisplayObjects.boundingBoxesCircle.fill(0);
        paths.push(x1, y1);
      }
      debugDisplayObjects.boundingBoxesPolygon.poly(paths).fill({
        color: this.boundingBoxesPolygonColor,
        alpha: 0.1
      }).stroke({
        width: lineWidth,
        color: this.boundingBoxesPolygonColor
      });
    };
    for (let i = 0, len = polygons.length; i < len; i++) {
      const polygon = polygons[i];
      drawPolygon(polygon, 0, polygon.length);
    }
  }
  drawPathsFunc(spine, debugDisplayObjects, lineWidth) {
    const skeleton = spine.skeleton;
    const slots = skeleton.slots;
    for (let i = 0, len = slots.length; i < len; i++) {
      const slot = slots[i];
      if (!slot.bone.active) {
        continue;
      }
      const attachment = slot.getAttachment();
      if (attachment === null || !(attachment instanceof PathAttachment)) {
        continue;
      }
      const pathAttachment = attachment;
      let nn = pathAttachment.worldVerticesLength;
      const world = new Float32Array(nn);
      pathAttachment.computeWorldVertices(slot, 0, nn, world, 0, 2);
      let x1 = world[2];
      let y1 = world[3];
      let x2 = 0;
      let y2 = 0;
      if (pathAttachment.closed) {
        const cx1 = world[0];
        const cy1 = world[1];
        const cx2 = world[nn - 2];
        const cy2 = world[nn - 1];
        x2 = world[nn - 4];
        y2 = world[nn - 3];
        debugDisplayObjects.pathsCurve.moveTo(x1, y1);
        debugDisplayObjects.pathsCurve.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
        debugDisplayObjects.pathsLine.moveTo(x1, y1);
        debugDisplayObjects.pathsLine.lineTo(cx1, cy1);
        debugDisplayObjects.pathsLine.moveTo(x2, y2);
        debugDisplayObjects.pathsLine.lineTo(cx2, cy2);
      }
      nn -= 4;
      for (let ii = 4; ii < nn; ii += 6) {
        const cx1 = world[ii];
        const cy1 = world[ii + 1];
        const cx2 = world[ii + 2];
        const cy2 = world[ii + 3];
        x2 = world[ii + 4];
        y2 = world[ii + 5];
        debugDisplayObjects.pathsCurve.moveTo(x1, y1);
        debugDisplayObjects.pathsCurve.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
        debugDisplayObjects.pathsLine.moveTo(x1, y1);
        debugDisplayObjects.pathsLine.lineTo(cx1, cy1);
        debugDisplayObjects.pathsLine.moveTo(x2, y2);
        debugDisplayObjects.pathsLine.lineTo(cx2, cy2);
        x1 = x2;
        y1 = y2;
      }
    }
    debugDisplayObjects.pathsCurve.stroke({ width: lineWidth, color: this.pathsCurveColor });
    debugDisplayObjects.pathsLine.stroke({ width: lineWidth, color: this.pathsLineColor });
  }
  unregisterSpine(spine) {
    if (!this.registeredSpines.has(spine)) {
      console.warn("SpineDebugRenderer.unregisterSpine() - spine is not registered, can't unregister!", spine);
    }
    const debugDisplayObjects = this.registeredSpines.get(spine);
    if (!debugDisplayObjects) {
      return;
    }
    spine.state.removeListener(debugDisplayObjects.eventCallback);
    debugDisplayObjects.parentDebugContainer.destroy({ textureSource: true, children: true, texture: true });
    this.registeredSpines.delete(spine);
  }
}

export { SpineDebugRenderer };
//# sourceMappingURL=SpineDebugRenderer.mjs.map

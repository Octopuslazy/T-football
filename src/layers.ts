import { Container} from 'pixi.js';
import { DisplayObject } from '@pixi/display';

export const Layer = {
  GROUND: 0,
  NET: 1,
  BALL: 3,
  GOAL_FRONT: 2,
};

export function setLayer(obj: DisplayObject, layer: number) {
  (obj as any).__layer = layer;
}

export function addToLayer(container: Container, child: DisplayObject, layer: number) {
  setLayer(child, layer);
  // Container.addChild's typing may expect a different concrete DisplayObject type
  // so cast to any to avoid type incompatibilities across @pixi packages.
  container.addChild(child as any);
  applyLayerOrder(container);
}

export function applyLayerOrder(container: Container) {
  const sorted = [...container.children].sort((a, b) => {
    const la = (a as any).__layer ?? 0;
    const lb = (b as any).__layer ?? 0;
    return la - lb;
  });
  for (let i = 0; i < sorted.length; i++) {
    container.setChildIndex(sorted[i] as any, i);
  }
}

export default {
  Layer,
  setLayer,
  addToLayer,
  applyLayerOrder,
};

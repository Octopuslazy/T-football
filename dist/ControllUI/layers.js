export const Layer = {
    GROUND: 0,
    NET: 1,
    BALL: 3,
    GOAL_FRONT: 2,
    OVERLAY: 4,
};
export function setLayer(obj, layer) {
    obj.__layer = layer;
}
export function addToLayer(container, child, layer) {
    setLayer(child, layer);
    container.addChild(child);
    applyLayerOrder(container);
}
export function applyLayerOrder(container) {
    const sorted = [...container.children].sort((a, b) => {
        const la = a.__layer ?? 0;
        const lb = b.__layer ?? 0;
        return la - lb;
    });
    for (let i = 0; i < sorted.length; i++) {
        container.setChildIndex(sorted[i], i);
    }
}
export default {
    Layer,
    setLayer,
    addToLayer,
    applyLayerOrder,
};

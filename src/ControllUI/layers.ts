import { Container } from 'pixi.js';
import * as PIXI from 'pixi.js';

export const Layer = {
  GROUND: 0,
  NET: 1,           // Lưới (Thấp nhất)
  BALL_IN_GOAL: 2,  // Bóng (Khi đã chui vào gôn)
  KEEPER: 3,        // Thủ môn
  GOAL_FRONT: 4,    // Cột dọc, Xà ngang (Cao nhất để che tất cả)
  BALL_FLYING: 5,   // Bóng (Khi đang bay ở ngoài)
  OVERLAY: 6,
};

export function setLayer(obj: PIXI.Container, layer: number) {
  (obj as any).__layer = layer;
  obj.zIndex = layer; // PixiJS v8 hỗ trợ zIndex trực tiếp, dùng luôn cho mượt
}

export function addToLayer(container: Container, child: PIXI.Container, layer: number) {
  setLayer(child, layer);
  container.addChild(child);
  container.sortableChildren = true; // Bật tính năng tự sắp xếp của Pixi
}

// Hàm này có thể không cần gọi thủ công nữa nếu dùng sortableChildren = true
export function applyLayerOrder(container: Container) {
  container.sortChildren();
}

export default { Layer, setLayer, addToLayer, applyLayerOrder };
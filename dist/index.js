// src/index.ts
import App from './app'; // Import class App từ file app.ts
// Hàm khởi chạy game
async function main() {
    // 1. Tạo một instance mới của App
    const game = new App();
    try {
        // 2. Gọi hàm init để PixiJS khởi tạo (load assets, tạo canvas...)
        await game.init();
        // 3. (Tuỳ chọn) Gắn vào div #app nếu muốn, hoặc mặc định app.ts đang gắn vào body
        // Nếu app.ts của bạn dùng document.body.appendChild(this.canvas) thì không cần dòng dưới
        // document.getElementById('app')?.appendChild(game.canvas);
        console.log("Game started successfully!");
    }
    catch (error) {
        console.error("Lỗi khởi chạy game:", error);
    }
}
// Chạy hàm main
main();

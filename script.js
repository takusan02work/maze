/**
 * Maze Game Script
 * 穴掘り法による迷路生成、物理演算、DeviceOrientation統合
 */

// --- Constants ---
const COLORS = {
    bg: '#050510',
    wall: '#1a1a2e',
    wallBorder: '#4a4e69',
    path: '#0b0b1a',
    ball: '#00ffcc',
    ballGlow: 'rgba(0, 255, 204, 0.6)',
    goal: '#ff00de',
    goalGlow: 'rgba(255, 0, 222, 0.6)'
};

const CFG = {
    cellSize: 40, // 迷路の1マスの基本サイズ (リサイズ時に調整)
    ballRadiusRatio: 0.35, // セルサイズに対するボール半径の比率
    wallThickness: 2,
    friction: 0.96, // 摩擦係数 (1に近いほど滑る)
    acceleration: 0.5, // 加速度係数
    tiltSensitivity: 0.05 // 傾きの感度
};

// --- Maze Class ---
class Maze {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.grid = [];
        this.start = { x: 1, y: 1 };
        this.goal = { x: cols - 2, y: rows - 2 };
        this.generate();
    }

    generate() {
        // 全て壁(1)で初期化
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.grid[r][c] = 1;
            }
        }

        // 穴掘り法
        // 奇数座標を開始点にする
        const stack = [];
        const startR = 1;
        const startC = 1;
        this.grid[startR][startC] = 0;
        stack.push({ r: startR, c: startC });

        const directions = [
            { r: -2, c: 0 }, // Up
            { r: 2, c: 0 },  // Down
            { r: 0, c: -2 }, // Left
            { r: 0, c: 2 }   // Right
        ];

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            
            // 掘り進める方向の候補を探す
            const validDirs = directions.filter(dir => {
                const nextR = current.r + dir.r;
                const nextC = current.c + dir.c;
                return (
                    nextR > 0 && nextR < this.rows - 1 &&
                    nextC > 0 && nextC < this.cols - 1 &&
                    this.grid[nextR][nextC] === 1
                );
            });

            if (validDirs.length > 0) {
                // ランダムに方向を選択
                const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
                const nextR = current.r + dir.r;
                const nextC = current.c + dir.c;
                const wallR = current.r + dir.r / 2;
                const wallC = current.c + dir.c / 2;

                // 道にする
                this.grid[wallR][wallC] = 0;
                this.grid[nextR][nextC] = 0;
                stack.push({ r: nextR, c: nextC });
            } else {
                stack.pop();
            }
        }

        // ゴール地点が壁でないことを保証（基本的には穴掘りで到達可能だが念のため）
        // 穴掘り法はすべての奇数マスを訪問するので、サイズ調整が適切なら必ず空く
        if (this.grid[this.goal.y][this.goal.x] === 1) {
             // 周囲を探してゴールにする
             if (this.grid[this.goal.y][this.goal.x - 1] === 0) this.goal.x--;
             else if (this.grid[this.goal.y - 1][this.goal.x] === 0) this.goal.y--;
        }
    }

    draw(ctx, cellSize) {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const x = c * cellSize;
                const y = r * cellSize;

                if (this.grid[r][c] === 1) {
                    // Wall
                    ctx.fillStyle = COLORS.wall;
                    ctx.fillRect(x, y, cellSize, cellSize);
                    ctx.strokeStyle = COLORS.wallBorder;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, cellSize, cellSize);
                } else {
                    // Path
                    // 床のグリッド感を出してもよいがシンプルに
                    // ctx.fillStyle = COLORS.path;
                    // ctx.fillRect(x, y, cellSize, cellSize);
                }
            }
        }

        // Draw Goal
        const gx = this.goal.x * cellSize + cellSize / 2;
        const gy = this.goal.y * cellSize + cellSize / 2;
        ctx.beginPath();
        ctx.arc(gx, gy, cellSize * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.goal;
        ctx.shadowColor = COLORS.goal;
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0; // Reset
        ctx.closePath();
    }

    isWall(x, y, cellSize) {
        const c = Math.floor(x / cellSize);
        const r = Math.floor(y / cellSize);

        // 範囲外は壁とみなす
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
        return this.grid[r][c] === 1;
    }
    
    // 矩形と円の衝突判定（簡易版：壁のセル矩形とボール円）
    checkCollision(ball, cellSize) {
        // ボールの現在位置の周辺セルのみチェック
        const minC = Math.floor((ball.x - ball.radius) / cellSize);
        const maxC = Math.floor((ball.x + ball.radius) / cellSize);
        const minR = Math.floor((ball.y - ball.radius) / cellSize);
        const maxR = Math.floor((ball.y + ball.radius) / cellSize);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (r < 0 || r >= this.rows || c < 0 || c >= this.cols || this.grid[r][c] === 1) {
                    this.resolveCollision(ball, c * cellSize, r * cellSize, cellSize);
                }
            }
        }
    }

    resolveCollision(ball, rectX, rectY, rectSize) {
        // AABB vs Circle collision resolution
        // 最も近い矩形上の点を見つける
        let closestX = Math.max(rectX, Math.min(ball.x, rectX + rectSize));
        let closestY = Math.max(rectY, Math.min(ball.y, rectY + rectSize));

        let dx = ball.x - closestX;
        let dy = ball.y - closestY;
        let distanceSq = dx * dx + dy * dy;

        if (distanceSq < ball.radius * ball.radius && distanceSq > 0) {
            let distance = Math.sqrt(distanceSq);
            let overlap = ball.radius - distance;

            // 法線ベクトル
            let nx = dx / distance;
            let ny = dy / distance;

            // 位置修正
            ball.x += nx * overlap;
            ball.y += ny * overlap;

            // 速度の反射（簡易的）
            // 壁に対する速度成分を反転・減衰
            // 本来はドット積で法線方向成分のみ反転だが、ここではシンプルに反発
            // ただし、めり込み解消で押し出しているので、速度を少し殺すだけで安定することもある
            // 一旦、速度ベクトルを少し減速させるだけに止めるか、壁法線方向の反転を入れるか。
            // 簡易実装では「押し出すだけ」で摩擦で止まるのが自然に見えることが多い。
            
            /* まじめな反射計算
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx;
            ball.vy -= 2 * dot * ny;
            */
            
            // 壁に当たったら少し跳ね返る
            // しかし過剰なバウンドを防ぐため、速度を減衰
             const dot = ball.vx * nx + ball.vy * ny;
             if (dot < 0) { // 壁に向かっている時のみ
                 ball.vx -= (1 + 0.5) * dot * nx; // 0.5 is restitution (bounciness)
                 ball.vy -= (1 + 0.5) * dot * ny;
             }
        }
    }
}


// --- Ball Class ---
class Ball {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = radius;
    }

    update(ax, ay) {
        // 加速度の適用
        this.vx += ax;
        this.vy += ay;

        // 摩擦
        this.vx *= CFG.friction;
        this.vy *= CFG.friction;

        // 位置更新
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ball;
        ctx.shadowColor = COLORS.ball;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
    }
}


// --- Game Class ---
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ui = {
            startScreen: document.getElementById('start-screen'),
            resultScreen: document.getElementById('result-screen'),
            gameOverlay: document.getElementById('game-overlay'),
            timer: document.getElementById('timer'),
            finalTime: document.getElementById('final-time'),
            startBtn: document.getElementById('start-btn'),
            retryBtn: document.getElementById('retry-btn')
        };
        
        this.state = 'IDLE'; // IDLE, PLAYING, GAMEOVER
        this.startTime = 0;
        this.animationId = null;
        
        this.input = { x: 0, y: 0 }; // 加速度入力 (-1.0 ~ 1.0)
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.setupEvents();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // グリッドサイズの再計算（画面サイズに合わせて調整）
        // 少なくとも横15マス、縦はアスペクト比なり
        // 奇数である必要があるので調整
        const minCols = 15;
        this.cellSize = Math.floor(this.canvas.width / minCols);
        // 偶数サイズだと描画のにじみが出る場合があるが、Canvasならあまり気にしなくていい
        // 奇数行・奇数列にする
        
        this.cols = Math.floor(this.canvas.width / this.cellSize);
        this.rows = Math.floor(this.canvas.height / this.cellSize);
        
        if (this.cols % 2 === 0) this.cols--;
        if (this.rows % 2 === 0) this.rows--;

        // リサイズ時にゲーム中なら再生成は厳しいが、今回はリセットする仕様にするか、
        // そもそもスマホ前提なのでローテーション以外でサイズ変わらない前提
    }

    setupEvents() {
        // Start Button
        this.ui.startBtn.addEventListener('click', () => {
            this.requestPermissionAndStart();
        });

        // Retry Button
        this.ui.retryBtn.addEventListener('click', () => {
             this.ui.resultScreen.classList.add('hidden');
             this.startGame();
        });

        // Keyboard Debug
        window.addEventListener('keydown', (e) => {
            if (this.state !== 'PLAYING') return;
            const speed = 1.0;
            switch(e.key) {
                case 'ArrowUp': this.input.y = -speed; break;
                case 'ArrowDown': this.input.y = speed; break;
                case 'ArrowLeft': this.input.x = -speed; break;
                case 'ArrowRight': this.input.x = speed; break;
            }
        });
        
        window.addEventListener('keyup', (e) => {
            if (['ArrowUp', 'ArrowDown'].includes(e.key)) this.input.y = 0;
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) this.input.x = 0;
        });

        // Device Orientation
        window.addEventListener('deviceorientation', (e) => {
            if (this.state !== 'PLAYING') return;
            
            // beta: 前後傾き (-180 ~ 180) -> y軸
            // gamma: 左右傾き (-90 ~ 90) -> x軸
            
            // 調整: スマホを少し立てて持っている状態(beta=45度くらい)をニュートラルにするか、水平をニュートラルにするか。
            // 迷路ゲームなら水平置き(机に置く)か、手持ち(水平に近い)が一般的。
            // ここでは水平(beta=0, gamma=0)を基準にする。
            
            let x = e.gamma; // -90 to 90
            let y = e.beta;  // -180 to 180

            // 制限
            if (x > 90) x = 90;
            if (x < -90) x = -90;
            
            // 感度調整と正規化 (-1.0 ~ 1.0程度に)
            // 30度程度で最大加速になるようにする
            const maxTilt = 30;
            
            this.input.x = (x / maxTilt);
            this.input.y = (y / maxTilt);
            
            // クランプ
            this.input.x = Math.max(-1, Math.min(1, this.input.x));
            this.input.y = Math.max(-1, Math.min(1, this.input.y));
        });
    }

    async requestPermissionAndStart() {
        if (
            typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function'
        ) {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    this.startGame();
                } else {
                    alert('加速度センサーの許可が必要です');
                }
            } catch (error) {
                console.error(error);
                // エラーが出てもPCデバッグなどで動かせるようにスタートはさせる
                this.startGame();
            }
        } else {
            // Non-iOS 13+ devices
            this.startGame();
        }
    }

    startGame() {
        this.ui.startScreen.classList.add('hidden');
        this.ui.gameOverlay.classList.remove('hidden');
               
        this.maze = new Maze(this.cols, this.rows);
        
        // ボール位置初期化
        const startX = this.maze.start.x * this.cellSize + this.cellSize / 2;
        const startY = this.maze.start.y * this.cellSize + this.cellSize / 2;
        const radius = this.cellSize * CFG.ballRadiusRatio;
        
        this.ball = new Ball(startX, startY, radius);
        
        this.state = 'PLAYING';
        this.startTime = Date.now();
        this.input = { x: 0, y: 0 };
        
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.loop();
    }
    
    endGame() {
        this.state = 'GAMEOVER';
        const elapsed = Date.now() - this.startTime;
        const seconds = (elapsed / 1000).toFixed(2);
        
        this.ui.finalTime.textContent = `Time: ${seconds}s`;
        this.ui.gameOverlay.classList.add('hidden');
        this.ui.resultScreen.classList.remove('hidden');
    }

    update() {
        // Timer update
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.ui.timer.textContent = elapsed;

        // Ball Physics
        const ax = this.input.x * CFG.acceleration;
        const ay = this.input.y * CFG.acceleration;
        
        this.ball.update(ax, ay);
        
        // Collision
        this.maze.checkCollision(this.ball, this.cellSize);
        
        // Check Goal
        const gx = this.maze.goal.x * this.cellSize + this.cellSize / 2;
        const gy = this.maze.goal.y * this.cellSize + this.cellSize / 2;
        const dx = this.ball.x - gx;
        const dy = this.ball.y - gy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < this.cellSize * 0.5) { // ゴール判定甘め
            this.endGame();
        }
    }

    draw() {
        // Clear
        this.ctx.fillStyle = COLORS.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Maze
        this.maze.draw(this.ctx, this.cellSize);
        
        // Ball
        this.ball.draw(this.ctx);
    }

    loop() {
        if (this.state !== 'PLAYING') return;
        
        this.update();
        this.draw();
        
        this.animationId = requestAnimationFrame(() => this.loop());
    }
}

// Start
window.onload = () => {
    const game = new Game();
};

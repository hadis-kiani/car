/* ===================================================================
   بازی ماشین — منوی «انتخاب محیط» و موتور بازی ساده
   محیط‌ها: آفتابی، روز، شب، بارونی، برفی، غروب
=================================================================== */

(() => {
    'use strict';

    // ---------- سهمیه‌دهی اسکرين‌ها ----------
    const screens = {
        menu: document.getElementById('menu-screen'),
        env: document.getElementById('env-screen'),
        help: document.getElementById('help-screen'),
        game: document.getElementById('game-screen'),
    };

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    // ---------- توصیف محیط‌ها ----------
    const ENVIRONMENTS = {
        sunny: {
            label: 'آفتابی',
            skyTop: '#4aa3ff',
            skyBottom: '#cfeaff',
            sun: true,
            stars: false,
            rain: false,
            snow: false,
            ground: '#5a7a4a',
            road: '#3a3a44',
        },
        day: {
            label: 'روز',
            skyTop: '#2f7fd8',
            skyBottom: '#bfe0ff',
            sun: true,
            stars: false,
            rain: false,
            snow: false,
            ground: '#6a8f55',
            road: '#4a4a55',
        },
        night: {
            label: 'شب',
            skyTop: '#0a1030',
            skyBottom: '#232c58',
            sun: false,
            stars: true,
            rain: false,
            snow: false,
            ground: '#22304f',
            road: '#2c2c3a',
        },
        rainy: {
            label: 'بارونی',
            skyTop: '#55606e',
            skyBottom: '#8b98a8',
            sun: false,
            stars: false,
            rain: true,
            snow: false,
            ground: '#46535a',
            road: '#3a3f48',
        },
        snowy: {
            label: 'برفی',
            skyTop: '#9fb4cc',
            skyBottom: '#e8f1f8',
            sun: false,
            stars: false,
            rain: false,
            snow: true,
            ground: '#dfe9f2',
            road: '#6f7a86',
        },
        sunset: {
            label: 'غروب',
            skyTop: '#3b2a6b',
            skyBottom: '#ff9d5c',
            sun: true,
            stars: false,
            rain: false,
            snow: false,
            ground: '#4a3a52',
            road: '#433a45',
        },
    };

    let currentEnv = null;

    // ---------- پردازش منوها ----------
    document.getElementById('btn-go-env').addEventListener('click', () => showScreen('env'));
    document.getElementById('btn-about').addEventListener('click', () => showScreen('help'));
    document.getElementById('btn-back-menu').addEventListener('click', () => showScreen('menu'));
    document.getElementById('btn-back-help').addEventListener('click', () => showScreen('menu'));

    document.querySelectorAll('.env-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.env;
            currentEnv = ENVIRONMENTS[key];
            startGame();
        });
    });

    // ---------- موتور بازی (Canvas ساده) ----------
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    const hudEnv = document.getElementById('hud-env');
    const hudSpeed = document.getElementById('hud-speed');
    const btnPause = document.getElementById('btn-pause');

    let W = 0, H = 0, DPR = window.devicePixelRatio || 1;

    function resize() {
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    window.addEventListener('resize', resize);

    // ماشین و وضعیت رانندگی
    const car = {
        x: 0,
        y: 0,
        angle: -Math.PI / 2, // رو به بالا
        speed: 0,
        maxSpeed: 7,
    };

    const keys = {};
    window.addEventListener('keydown', e => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === 'Escape') showScreen('env'); // بازگشت به منوی محیط
    });
    window.addEventListener('keyup', e => {
        keys[e.key.toLowerCase()] = false;
    });

    // ذرات باران / برف
    let particles = [];

    function initParticles() {
        particles = [];
        const count = currentEnv.rain ? 220 : currentEnv.snow ? 140 : 0;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * W,
                y: Math.random() * H,
                len: currentEnv.rain ? 14 + Math.random() * 14 : 3 + Math.random() * 4,
                vy: currentEnv.rain ? 14 + Math.random() * 6 : 1.5 + Math.random() * 2,
                vx: currentEnv.rain ? -2.5 : 0.8 + Math.random() * 1.2,
                r: currentEnv.snow ? 1.5 + Math.random() * 2.5 : 1.5,
            });
        }
    }

    let stars = [];
    function initStars() {
        stars = [];
        for (let i = 0; i < 90; i++) {
            stars.push({
                x: Math.random() * W,
                y: Math.random() * H * 0.6,
                r: Math.random() * 1.6 + 0.3,
                tw: Math.random() * Math.PI * 2,
            });
        }
    }

    let roadOffset = 0;
    let running = false;
    let lastTime = 0;

    function startGame() {
        resize();
        initParticles();
        initStars();
        car.x = W / 2;
        car.y = H * 0.78;
        car.speed = 3;
        roadOffset = 0;
        hudEnv.textContent = 'محیط: ' + currentEnv.label;
        running = true;
        showScreen('game');
        requestAnimationFrame(loop);
    }

    btnPause.addEventListener('click', () => {
        running = !running;
        btnPause.textContent = running ? 'متوقف کردن' : 'ادامه';
        if (running) {
            lastTime = performance.now();
            requestAnimationFrame(loop);
        }
    });

    function update(dt) {
        // کنترل ماشین
        if (keys['arrowup'] || keys['w']) car.speed = Math.min(car.maxSpeed, car.speed + 0.05);
        if (keys['arrowdown'] || keys['s']) car.speed = Math.max(0, car.speed - 0.08);
        if (keys['arrowleft'] || keys['a']) car.x -= 4.5 * dt;
        if (keys['arrowright'] || keys['d']) car.x += 4.5 * dt;

        car.x = Math.max(40, Math.min(W - 40, car.x));
        roadOffset += car.speed * dt * 60;

        // ذرات
        for (const p of particles) {
            p.y += p.vy;
            p.x += p.vx;
            if (p.y > H) {
                p.y = -10;
                p.x = Math.random() * W;
            }
            if (p.x < -20) p.x = W + 20;
            if (p.x > W + 20) p.x = -20;
        }
        for (const s of stars) s.tw += dt * 2;

        // HUD
        hudSpeed.textContent = 'سرعت: ' + Math.round(car.speed * 10);
    }

    function draw() {
        const e = currentEnv;

        // آسمان
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, e.skyTop);
        sky.addColorStop(1, e.skyBottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // ستارگان (شب)
        if (e.stars) {
            for (const s of stars) {
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(s.tw);
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // خورشید / غروب
        if (e.sun) {
            const sunX = e.label === 'غروب' ? W * 0.72 : W * 0.8;
            const sunY = e.label === 'غروب' ? H * 0.62 : H * 0.18;
            const grad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
            grad.addColorStop(0, e.label === 'غروب' ? '#ffd28a' : '#fff3b0');
            grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = e.label === 'غروب' ? '#ffb066' : '#ffe066';
            ctx.beginPath();
            ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
            ctx.fill();
        }

        // زمین و جاده
        const horizon = H * 0.45;
        ctx.fillStyle = e.ground;
        ctx.fillRect(0, horizon, W, H - horizon);

        ctx.fillStyle = e.road;
        ctx.fillRect(W * 0.25, horizon, W * 0.5, H - horizon);

        // خطوط میانه جاده
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        const dashH = 34, dashGap = 30;
        for (let y = ((roadOffset % (dashH + dashGap)) + (dashH + dashGap)) % (dashH + dashGap) + horizon; y < H; y += dashH + dashGap) {
            ctx.fillRect(W / 2 - 6, y, 12, dashH);
        }

        // ماشین
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        ctx.fillStyle = '#e64545';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.fillRect(-18, -9, 36, 18);
        ctx.strokeRect(-18, -9, 36, 18);
        ctx.fillStyle = '#9fd8ff';
        ctx.fillRect(-6, -7, 14, 14);
        ctx.restore();

        // باران
        if (e.rain) {
            ctx.strokeStyle = 'rgba(200, 220, 255, 0.55)';
            ctx.lineWidth = 1.5;
            for (const p of particles) {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + p.vx, p.y + p.len);
                ctx.stroke();
            }
        }

        // برف
        if (e.snow) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            for (const p of particles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function loop(t) {
        if (!running) return;
        const dt = Math.min((t - lastTime) / 1000, 0.05);
        lastTime = t;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    resize();
})();

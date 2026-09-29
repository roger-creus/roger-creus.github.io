/* ============================================================================
 * cosmos.js: a faint, fixed starfield behind the page content.
 *
 * A few hundred tiny stars (warm gold and cream) drift very slowly, a handful
 * twinkle, and every so often a thin shooting star crosses the sky. Colours
 * and brightness follow the light/dark theme. Everything stays static when the
 * visitor prefers reduced motion, and the loop pauses while the tab is hidden.
 *
 * Self-initialising: creates <canvas class="cosmos"> as the first child of body.
 * ========================================================================== */

(function () {
    "use strict";

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var canvas = document.createElement("canvas");
    canvas.className = "cosmos";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var W = 0, H = 0, dpr = 1;
    var stars = [];
    var shooting = null;
    var nextShot = 0;
    var last = 0;

    // palette: [r, g, b] for gold, cream and a cool white for a little depth
    var TINTS = [[242, 164, 64], [244, 236, 216], [214, 222, 240]];

    function isDark() {
        return document.documentElement.getAttribute("data-theme") === "dark";
    }

    function rand(a, b) { return a + Math.random() * (b - a); }

    function build() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // density scales with area, capped so large screens stay calm
        var n = Math.min(320, Math.round((W * H) / 5200));
        stars = [];
        for (var i = 0; i < n; i++) {
            var big = Math.random() < 0.09;
            stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: big ? rand(1.1, 1.7) : rand(0.45, 1.0),
                tint: TINTS[Math.random() < 0.45 ? 0 : (Math.random() < 0.8 ? 1 : 2)],
                base: rand(0.25, 0.9),
                tw: Math.random() < 0.3 ? rand(0.4, 1.4) : 0,   // twinkle speed
                ph: Math.random() * Math.PI * 2,
                vx: rand(-0.004, 0.004),                         // px per frame-ish
                sparkle: big
            });
        }
    }

    function drawStar(s, a, dark) {
        var c = s.tint;
        // light theme: stars read as warm dust, much fainter and a touch darker
        var alpha = a * (dark ? 1 : 0.7);
        var col = dark ? c : [Math.round(c[0] * 0.8), Math.round(c[1] * 0.66), Math.round(c[2] * 0.42)];
        ctx.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + alpha + ")";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.sparkle) {
            // four-point glint on the brightest stars
            var L = s.r * 5.5 * a;
            ctx.strokeStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + alpha * 0.55 + ")";
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y);
            ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L);
            ctx.stroke();
        }
    }

    function spawnShot(t) {
        var fromLeft = Math.random() < 0.5;
        var angle = rand(0.25, 0.55) * (fromLeft ? 1 : -1);
        shooting = {
            x: fromLeft ? rand(-0.1, 0.5) * W : rand(0.5, 1.1) * W,
            y: rand(-0.05, 0.35) * H,
            dir: fromLeft ? 1 : -1,
            ang: angle,
            speed: rand(0.55, 0.85),   // px per ms
            len: rand(90, 150),
            born: t,
            life: rand(700, 1000)
        };
        nextShot = t + rand(6000, 12000);
    }

    function drawShot(t, dark) {
        var s = shooting;
        var age = t - s.born;
        if (age > s.life) { shooting = null; return; }
        var p = age / s.life;
        var d = age * s.speed;
        var dx = Math.cos(s.ang) * s.dir, dy = Math.abs(Math.sin(s.ang));
        var hx = s.x + dx * d, hy = s.y + dy * d;
        var tx = hx - dx * s.len, ty = hy - dy * s.len;
        var fade = Math.sin(Math.PI * p);          // ease in and out
        var a = fade * (dark ? 0.9 : 0.65);
        var g = ctx.createLinearGradient(tx, ty, hx, hy);
        var head = dark ? "244,236,216" : "140,94,16";
        g.addColorStop(0, "rgba(242,164,64,0)");
        g.addColorStop(1, "rgba(" + head + "," + a + ")");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
    }

    function frame(t) {
        var dark = isDark();
        ctx.clearRect(0, 0, W, H);
        var dt = last ? Math.min(t - last, 50) : 16;
        last = t;
        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            if (!reduced) {
                s.x += s.vx * dt;
                if (s.x < -2) s.x = W + 2; else if (s.x > W + 2) s.x = -2;
            }
            var a = s.base;
            if (s.tw && !reduced) a *= 0.55 + 0.45 * Math.sin(s.ph + t * 0.001 * s.tw);
            drawStar(s, a, dark);
        }
        if (!reduced) {
            if (!shooting && t > nextShot) spawnShot(t);
            if (shooting) drawShot(t, dark);
        }
    }

    var raf = 0;
    function loop(t) {
        frame(t);
        raf = requestAnimationFrame(loop);
    }

    function start() {
        if (reduced) { frame(0); return; }
        if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    }
    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    build();
    nextShot = performance.now() + rand(1500, 4000);
    start();

    var resizeT = 0;
    window.addEventListener("resize", function () {
        clearTimeout(resizeT);
        resizeT = setTimeout(function () { build(); if (reduced) frame(0); }, 150);
    });
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop(); else start();
    });
    // static mode still needs a redraw when the theme flips
    new MutationObserver(function () { if (reduced) frame(0); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();

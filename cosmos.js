/* ============================================================================
 * cosmos.js: a faint, fixed starfield behind the page content.
 *
 * A few hundred tiny stars (warm gold and cream) drift very slowly, many
 * twinkle, random stars bloom into brief glints, shooting stars streak past
 * every few seconds and a slow comet with a glowing head drifts by. Colours
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
    var shots = [];          // quick shooting stars
    var comets = [];         // slow comets with a glowing head and long tail
    var flares = [];         // a star briefly blooming into a big glint
    var nextShot = 0, nextComet = 0, nextFlare = 0;
    var last = 0;

    // palette: [r, g, b] for gold, cream and a cool white for a little depth
    var TINTS = [[242, 164, 64], [244, 236, 216], [214, 222, 240]];

    function isDark() {
        return document.documentElement.getAttribute("data-theme") === "dark";
    }

    function rand(a, b) { return a + Math.random() * (b - a); }

    // light theme: stars read as warm dust, a touch darker than on the night sky
    function ink(c, dark) {
        return dark ? c : [Math.round(c[0] * 0.8), Math.round(c[1] * 0.66), Math.round(c[2] * 0.42)];
    }
    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

    function build() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // density scales with area, capped so large screens stay calm
        var n = Math.min(440, Math.round((W * H) / 3800));
        stars = [];
        for (var i = 0; i < n; i++) {
            var big = Math.random() < 0.14;
            stars.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: big ? rand(1.1, 1.8) : rand(0.4, 1.0),
                tint: TINTS[Math.random() < 0.45 ? 0 : (Math.random() < 0.8 ? 1 : 2)],
                base: rand(0.25, 0.9),
                tw: Math.random() < 0.35 ? rand(0.4, 1.6) : 0,  // twinkle speed
                ph: Math.random() * Math.PI * 2,
                vx: rand(-0.004, 0.004),                        // px per ms
                sparkle: big
            });
        }
        flares = [];
    }

    function glint(x, y, L, col, alpha, width) {
        ctx.strokeStyle = rgba(col, alpha);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.stroke();
    }

    function drawStar(s, a, dark) {
        var col = ink(s.tint, dark);
        var alpha = a * (dark ? 1 : 0.7);
        ctx.fillStyle = rgba(col, alpha);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        // four-point glint on the brightest stars
        if (s.sparkle) glint(s.x, s.y, s.r * 5.5 * a, col, alpha * 0.55, 0.75);
    }

    function spawnFlare(t) {
        var s = stars[Math.floor(Math.random() * stars.length)];
        if (s) flares.push({ s: s, born: t, life: rand(1400, 2400), size: rand(9, 16) });
        nextFlare = t + rand(1200, 3200);
    }

    function drawFlare(f, t, dark) {
        var p = (t - f.born) / f.life;
        if (p >= 1) return false;
        var e = Math.sin(Math.PI * p);
        var col = ink(f.s.tint[0] === 242 ? f.s.tint : TINTS[1], dark);
        var a = e * (dark ? 0.9 : 0.6);
        var L = f.size * e;
        var g = ctx.createRadialGradient(f.s.x, f.s.y, 0, f.s.x, f.s.y, L * 0.6);
        g.addColorStop(0, rgba(col, a * 0.6));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.s.x, f.s.y, L * 0.6, 0, Math.PI * 2);
        ctx.fill();
        glint(f.s.x, f.s.y, L, col, a * 0.8, 0.8);
        // a smaller diagonal cross makes it read as a true sparkle
        ctx.save();
        ctx.translate(f.s.x, f.s.y);
        ctx.rotate(Math.PI / 4);
        glint(0, 0, L * 0.45, col, a * 0.5, 0.6);
        ctx.restore();
        return true;
    }

    function spawnShot(t) {
        var fromLeft = Math.random() < 0.5;
        shots.push({
            x: fromLeft ? rand(-0.1, 0.6) * W : rand(0.4, 1.1) * W,
            y: rand(-0.05, 0.45) * H,
            dir: fromLeft ? 1 : -1,
            ang: rand(0.2, 0.6),
            speed: rand(0.55, 0.95),   // px per ms
            len: rand(80, 170),
            born: t,
            life: rand(600, 1100)
        });
        nextShot = t + rand(3000, 7000);
    }

    function drawShot(s, t, dark) {
        var age = t - s.born;
        if (age > s.life) return false;
        var p = age / s.life;
        var d = age * s.speed;
        var dx = Math.cos(s.ang) * s.dir, dy = Math.sin(s.ang);
        var hx = s.x + dx * d, hy = s.y + dy * d;
        var tx = hx - dx * s.len, ty = hy - dy * s.len;
        var a = Math.sin(Math.PI * p) * (dark ? 0.9 : 0.65);   // ease in and out
        var head = dark ? [244, 236, 216] : [140, 94, 16];
        var g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, "rgba(242,164,64,0)");
        g.addColorStop(1, rgba(head, a));
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        return true;
    }

    function spawnComet(t) {
        var fromLeft = Math.random() < 0.5;
        comets.push({
            x: fromLeft ? rand(-0.05, 0.3) * W : rand(0.7, 1.05) * W,
            y: rand(0.02, 0.5) * H,
            dir: fromLeft ? 1 : -1,
            ang: rand(0.08, 0.3),
            speed: rand(0.07, 0.12),   // slow and stately
            len: rand(200, 340),
            born: t,
            life: rand(6000, 9000)
        });
        nextComet = t + rand(14000, 26000);
    }

    function drawComet(c, t, dark) {
        var age = t - c.born;
        if (age > c.life) return false;
        var p = age / c.life;
        var d = age * c.speed;
        var dx = Math.cos(c.ang) * c.dir, dy = Math.sin(c.ang);
        var hx = c.x + dx * d, hy = c.y + dy * d;
        var e = Math.min(1, Math.sin(Math.PI * p) * 1.6);
        var gold = ink([242, 164, 64], dark), cream = ink([244, 236, 216], dark), ion = ink([170, 190, 235], dark);
        var A = e * (dark ? 1 : 0.75);
        ctx.lineCap = "round";
        // dust tail: wide, warm, curving slightly away from the direction of travel
        var tx = hx - dx * c.len, ty = hy - dy * c.len - c.len * 0.08;
        var g = ctx.createLinearGradient(hx, hy, tx, ty);
        g.addColorStop(0, rgba(gold, 0.45 * A));
        g.addColorStop(1, rgba(gold, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx - dx * c.len * 0.5, hy - dy * c.len * 0.5 - c.len * 0.015, tx, ty);
        ctx.stroke();
        // ion tail: thin, straight, cooler
        var ix = hx - dx * c.len * 0.8, iy = hy - dy * c.len * 0.8;
        var gi = ctx.createLinearGradient(hx, hy, ix, iy);
        gi.addColorStop(0, rgba(ion, 0.4 * A));
        gi.addColorStop(1, rgba(ion, 0));
        ctx.strokeStyle = gi;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(ix, iy);
        ctx.stroke();
        // glowing head
        var gh = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
        gh.addColorStop(0, rgba(cream, 0.95 * A));
        gh.addColorStop(0.35, rgba(gold, 0.45 * A));
        gh.addColorStop(1, rgba(gold, 0));
        ctx.fillStyle = gh;
        ctx.beginPath();
        ctx.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx.fill();
        glint(hx, hy, 7 * e, cream, 0.5 * A, 0.6);
        return true;
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
        if (reduced) return;
        if (t > nextFlare) spawnFlare(t);
        if (t > nextShot && shots.length < 2) spawnShot(t);
        if (t > nextComet && comets.length < 1) spawnComet(t);
        flares = flares.filter(function (f) { return drawFlare(f, t, dark); });
        comets = comets.filter(function (c) { return drawComet(c, t, dark); });
        shots = shots.filter(function (s) { return drawShot(s, t, dark); });
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
    var now = performance.now();
    nextShot = now + rand(1200, 3000);
    nextFlare = now + rand(400, 1200);
    nextComet = now + rand(4000, 8000);
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

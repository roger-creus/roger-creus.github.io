/* ============================================================================
 * blackhole.js: a Schwarzschild geodesic ray-traced black hole, rendered as a
 * compact hero band at the top of the page.
 *
 * Dependency-free vanilla WebGL (WebGL1 / ESSL 1.00). The fragment shader is a
 * physically-based ray tracer: it integrates photon geodesics around the black
 * hole, samples a relativistic disk of infalling gas (Doppler beaming +
 * gravitational redshift + blackbody colour), and renders a procedural
 * starfield behind it.
 *
 * Self-initialising: looks for <canvas id="bh">. Degrades gracefully: if the
 * browser has no WebGL or the visitor prefers reduced motion, it does nothing
 * and the CSS fallback gradient (.hero-band__fallback) shows instead.
 * ========================================================================== */

(function () {
  "use strict";

  function init() {
    var canvas = document.getElementById("bh");
    if (!canvas) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // CSS fallback gradient shows through

    var gl =
      canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      }) || canvas.getContext("experimental-webgl");
    if (!gl) return; // no WebGL → CSS fallback shows through

    var mobile =
      /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
      window.matchMedia("(max-width: 640px)").matches;

    // ── shaders ──────────────────────────────────────────────────────────
    var VERT = [
      "attribute vec2 position;",
      "attribute vec2 uv;",
      "varying vec2 vUv;",
      "void main() {",
      "  vUv = uv;",
      "  gl_Position = vec4(position, 0.0, 1.0);",
      "}",
    ].join("\n");

    var FRAG = `
      precision highp float;
      varying vec2 vUv;

      uniform vec2  uResolution;
      uniform float uTime;
      uniform vec3  uCameraPos;
      uniform mat3  uCameraBasis;     // columns: right, up, -forward
      uniform float uFovTan;
      uniform float uAspect;
      uniform float uDiskRotation;
      uniform float uPulse;
      uniform float uIntegrationSteps;
      uniform float uExposure;
      uniform float uIntroProgress;   // 0 → 1, gates the disk-reveal sweep

      const float M       = 1.0;
      const float R_S     = 2.0;
      const float R_ISCO  = 6.0;
      const float R_OUTER = 22.0;
      const float R_ESCAPE = 110.0;
      const float PI      = 3.141592653589793;
      const int   MAX_STEPS = 220;

      // ───── hashes / noise ─────
      float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float vnoise2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm2(vec2 p) {
        float v = 0.0, a = 0.55;
        for (int i = 0; i < 5; i++) {
          v += a * vnoise2(p);
          p *= 2.07;
          a *= 0.55;
        }
        return v;
      }

      // ───── blackbody T → linear RGB (Tanner Helland fit) ─────
      vec3 blackbodyRGB(float T) {
        float t = clamp(T, 1000.0, 30000.0) / 100.0;
        float r, g, b;
        if (t <= 66.0) { r = 1.0; }
        else { r = 329.6987 * pow(t - 60.0, -0.13320) / 255.0; }
        if (t <= 66.0) { g = (99.4708 * log(t) - 161.1196) / 255.0; }
        else { g = 288.1222 * pow(t - 60.0, -0.07551) / 255.0; }
        if (t >= 66.0) { b = 1.0; }
        else if (t <= 19.0) { b = 0.0; }
        else { b = (138.5177 * log(t - 10.0) - 305.0448) / 255.0; }
        return clamp(vec3(r, g, b), 0.0, 1.0);
      }

      // ───── procedural starfield in a 3D direction ─────
      vec3 starfield(vec3 dir) {
        vec3 col = vec3(0.0);
        float bg = 0.5 + 0.5 * dir.y;
        col += vec3(0.008, 0.007, 0.015) * (0.6 + 0.5 * bg);
        for (int s = 0; s < 3; s++) {
          float scale = 90.0 * pow(2.1, float(s));
          vec3 cell = floor(dir * scale + 0.5);
          float h1 = hash31(cell);
          if (h1 > 0.9965) {
            float h2 = hash31(cell + 17.0);
            float h3 = hash31(cell + 53.0);
            vec3 jitter = (vec3(h2, h3, hash31(cell + 91.0)) - 0.5) * 0.55;
            vec3 starDir = normalize((cell - 0.5 + jitter) / scale);
            float ang = acos(clamp(dot(dir, starDir), -1.0, 1.0));
            float bright = smoothstep(0.012, 0.0, ang) * pow(h1 - 0.9965, 2.0) * 1500.0;
            vec3 starCol = mix(vec3(1.0, 0.94, 0.78), vec3(0.78, 0.86, 1.05), h2);
            col += starCol * bright;
          }
        }
        return col;
      }

      // ───── disk sampling at a hit point ─────
      vec3 sampleDisk(vec3 hitPos, float r, vec3 photonDirAtHit, vec3 cameraPos) {
        vec3 t1 = vec3(1.0, 0.0, 0.0);
        vec3 t2 = vec3(0.0, 0.0, 1.0);

        float diskX = dot(hitPos, t1);
        float diskY = dot(hitPos, t2);
        float diskPhi = atan(diskY, diskX);

        // temperature (softened Shakura-Sunyaev), tuned warm/cinematic
        float tempInner = 8200.0;
        float Trel = pow(R_ISCO / max(r, R_S * 1.05), 0.55);
        float Temit = tempInner * Trel;

        // intensity profile
        float rNorm = (r - R_ISCO) / (R_OUTER - R_ISCO);
        float intensity = 1.0;
        intensity *= smoothstep(-0.02, 0.08, rNorm);
        intensity *= 1.0 - smoothstep(0.60, 1.05, rNorm);
        intensity *= 0.85 + 0.95 / (rNorm * 6.0 + 1.0);

        // filament noise in the disk's rotated cartesian frame (no atan seam)
        float ca = cos(uDiskRotation);
        float sa = sin(uDiskRotation);
        vec2 rotXY = vec2(diskX * ca + diskY * sa, -diskX * sa + diskY * ca);
        float fila = fbm2(rotXY * 0.42);
        float fineFila = fbm2(rotXY * 2.6 + vec2(uTime * 0.18, 0.0));
        intensity *= 0.55 + 0.55 * fila;
        intensity *= 0.85 + 0.30 * fineFila;

        // gravitational redshift
        float g = sqrt(max(1.0 - R_S / r, 0.0));

        // relativistic Doppler (Keplerian thin disk, v ≈ sqrt(M/r))
        float v = clamp(sqrt(M / r), 0.0, 0.96);
        float gamma = 1.0 / sqrt(1.0 - v * v);
        vec3 vDirWorld = -sin(diskPhi) * t1 + cos(diskPhi) * t2;
        vec3 vWorld = v * vDirWorld;
        vec3 emitDir = -normalize(photonDirAtHit);
        float vDotEmit = dot(vWorld, emitDir);
        float doppler = 1.0 / (gamma * (1.0 - vDotEmit));

        float gFour = g * g * g * g;
        float dFour = pow(doppler, 3.2);

        float Tobs = clamp(Temit * g * doppler, 2400.0, 4100.0);
        vec3 baseCol = blackbodyRGB(Tobs);
        // enforce a brand-aligned gold even at peak brightness
        vec3 goldTint = vec3(1.0, 0.83, 0.45);
        float goldMix = smoothstep(3000.0, 4100.0, Tobs) * 0.45;
        baseCol = mix(baseCol, goldTint * (baseCol.r * 0.5 + 0.6), goldMix);

        return baseCol * intensity * gFour * dFour * uPulse;
      }

      // ───── tangent direction at current geodesic state ─────
      vec3 geodesicTangent(float u, float w, float phi, vec3 e1, vec3 e2) {
        float r = 1.0 / u;
        float drDphi = -w / (u * u);
        vec3 t = (drDphi * cos(phi) - r * sin(phi)) * e1
               + (drDphi * sin(phi) + r * cos(phi)) * e2;
        return normalize(t);
      }

      void main() {
        vec2 ndc = vUv * 2.0 - 1.0;
        ndc.x *= uAspect;
        // Fit-to-frame: on narrow (portrait / mobile) bands the horizontal field
        // of view gets tight and the disk would crop at the sides, so zoom out
        // there. The same factor scales both axes, so pixels stay square and the
        // image never distorts. Wide desktop bands are unaffected.
        float fov = uFovTan;
        if (fov * uAspect < 0.78) fov = 0.78 / uAspect;
        vec3 rayLocal = vec3(ndc.x * fov, ndc.y * fov, -1.0);
        vec3 rayDir = normalize(uCameraBasis * rayLocal);
        vec3 rayOrigin = uCameraPos;

        // intro reveal mask: symmetric wave from image-top
        float imgAngleRaw = atan(ndc.x, ndc.y);
        float distFromSeed = abs(imgAngleRaw);
        float distFromBH = length(ndc);
        float effDist = distFromSeed + clamp(distFromBH * 0.30, 0.0, 0.35);
        float revealRadius = uIntroProgress * (PI + 3.0) - 0.5;
        const float WAVE_FADE = 1.5;
        float introMask = 1.0 - smoothstep(revealRadius - WAVE_FADE, revealRadius, effDist);

        float r0 = length(rayOrigin);
        vec3 e1 = rayOrigin / r0;
        vec3 perp = rayDir - dot(rayDir, e1) * e1;
        float perpLen = length(perp);

        if (perpLen < 1e-6) {
          vec3 col = (r0 > R_S) ? starfield(rayDir) : vec3(0.0);
          gl_FragColor = vec4(col * uExposure, 1.0);
          return;
        }

        vec3 e2 = perp / perpLen;
        float u = 1.0 / r0;
        float w = -dot(rayDir, e1) / (r0 * perpLen);
        float phi = 0.0;

        vec3 prevPos = rayOrigin;
        vec3 diskNormal = vec3(0.0, 1.0, 0.0);
        float prevZ = dot(prevPos, diskNormal);

        vec3 accum = vec3(0.0);
        bool didHit = false;
        bool hitHorizon = false;
        bool escaped = false;
        vec3 escapeTangent = rayDir;

        int budget = int(uIntegrationSteps);

        for (int i = 0; i < MAX_STEPS; i++) {
          if (i >= budget) break;

          float r = 1.0 / u;
          float h = 0.04;
          if (r < 8.0) h = 0.025;
          if (r < 4.0) h = 0.012;
          if (r < 2.4) h = 0.006;

          // RK4 on (u, w):  du/dφ = w, dw/dφ = 3 M u² − u
          float k1u = w;
          float k1w = 3.0 * M * u * u - u;
          float u2 = u + 0.5 * h * k1u;
          float w2 = w + 0.5 * h * k1w;
          float k2u = w2;
          float k2w = 3.0 * M * u2 * u2 - u2;
          float u3 = u + 0.5 * h * k2u;
          float w3 = w + 0.5 * h * k2w;
          float k3u = w3;
          float k3w = 3.0 * M * u3 * u3 - u3;
          float u4 = u + h * k3u;
          float w4 = w + h * k3w;
          float k4u = w4;
          float k4w = 3.0 * M * u4 * u4 - u4;

          float uNew = u + (h / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
          float wNew = w + (h / 6.0) * (k1w + 2.0 * k2w + 2.0 * k3w + k4w);
          float phiNew = phi + h;

          if (uNew > 1.0 / (R_S * 0.99) || uNew < 0.0) {
            hitHorizon = true;
            break;
          }

          float rNew = 1.0 / uNew;
          vec3 newPos = (cos(phiNew) * rNew) * e1 + (sin(phiNew) * rNew) * e2;
          float newZ = dot(newPos, diskNormal);

          if (prevZ * newZ < 0.0) {
            float t = abs(prevZ) / (abs(prevZ) + abs(newZ));
            vec3 hit = mix(prevPos, newPos, t);
            vec3 hitFlat = hit - dot(hit, diskNormal) * diskNormal;
            float hitR = length(hitFlat);
            if (hitR > R_ISCO && hitR < R_OUTER) {
              vec3 photonDir = normalize(newPos - prevPos);
              accum += sampleDisk(hitFlat, hitR, photonDir, rayOrigin) * introMask;
              didHit = true;
              break;
            }
          }

          if (rNew > R_ESCAPE) {
            escaped = true;
            escapeTangent = geodesicTangent(uNew, wNew, phiNew, e1, e2);
            break;
          }

          u = uNew; w = wNew; phi = phiNew;
          prevPos = newPos;
          prevZ = newZ;
        }

        if (!didHit && !hitHorizon) {
          vec3 dir = escaped ? escapeTangent : geodesicTangent(u, w, phi, e1, e2);
          accum += starfield(dir);
        }

        // luminance-preserving tone map (keep chromaticity, compress brightness)
        accum *= uExposure;
        float lum = dot(accum, vec3(0.2126, 0.7152, 0.0722));
        if (lum > 1e-4) {
          float lumMapped = lum / (1.0 + lum);
          accum *= lumMapped / lum;
        }
        // warm-region saturation lift
        float warmth = clamp((accum.r - accum.b) * 2.4, 0.0, 1.0);
        accum.g = mix(accum.g, accum.g * 0.86, warmth * 0.55);
        accum.b = mix(accum.b, accum.b * 0.62, warmth * 0.85);
        accum = pow(accum, vec3(0.88));

        gl_FragColor = vec4(accum, 1.0);
      }
    `;

    // ── compile + link ────────────────────────────────────────────────────
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("blackhole shader:", gl.getShaderInfoLog(s));
      }
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("blackhole link:", gl.getProgramInfoLog(prog));
      return; // CSS fallback shows through
    }
    gl.useProgram(prog);

    // ── fullscreen quad (interleaved position.xy, uv.xy) ────────────────────
    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    var posLoc = gl.getAttribLocation(prog, "position");
    var uvLoc = gl.getAttribLocation(prog, "uv");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    // ── uniforms ────────────────────────────────────────────────────────────
    var U = function (n) { return gl.getUniformLocation(prog, n); };
    var uTime = U("uTime"), uRes = U("uResolution"), uCamPos = U("uCameraPos"),
        uCamBasis = U("uCameraBasis"), uFovTan = U("uFovTan"), uAspect = U("uAspect"),
        uDiskRot = U("uDiskRotation"), uPulse = U("uPulse"), uSteps = U("uIntegrationSteps"),
        uExp = U("uExposure"), uIntro = U("uIntroProgress");

    // ── fixed camera (units of M), basis computed once ──────────────────────
    var CAM = [44, 6.5, 0], FOV = 38;
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
    function cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    var fwd = norm([-CAM[0], -CAM[1], -CAM[2]]);
    var right = cross(fwd, [0, 1, 0]);
    right = right[0] || right[1] || right[2] ? norm(right) : [1, 0, 0];
    var up = norm(cross(right, fwd));
    var fneg = [-fwd[0], -fwd[1], -fwd[2]];

    gl.uniform3f(uCamPos, CAM[0], CAM[1], CAM[2]);
    gl.uniformMatrix3fv(uCamBasis, false, new Float32Array([
      right[0], right[1], right[2],
      up[0], up[1], up[2],
      fneg[0], fneg[1], fneg[2],
    ]));
    gl.uniform1f(uFovTan, Math.tan((FOV * Math.PI) / 360));
    gl.uniform1f(uExp, 0.95);

    // ── sizing ────────────────────────────────────────────────────────────
    // Integration steps must stay high on every device: the strongly-lensed
    // top arc of the disk needs ~110 steps to trace. Mobile recovers
    // performance via a lower pixel ratio, never by cutting steps.
    var quality = 110;
    var dprCap = mobile ? 1.0 : 1.5;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uAspect, w / h);
    }
    window.addEventListener("resize", resize);
    resize();

    // ── render loop ─────────────────────────────────────────────────────────
    var INTRO = 3.6, introStart = null, diskRot = 0, lastT = performance.now() / 1000;
    var running = true, raf = 0;
    var frames = 0, samples = [], lastFrameMs = performance.now();

    function frame(now) {
      if (!running) return;
      var t = now / 1000;
      var dt = Math.min(0.05, t - lastT);
      lastT = t;
      if (introStart === null) introStart = t;

      var introT = Math.min(1, Math.max(0, (t - introStart) / INTRO));
      var introEased = 0.5 - 0.5 * Math.cos(Math.PI * introT);
      diskRot += dt * 0.18;

      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntro, introEased);
      gl.uniform1f(uDiskRot, diskRot);
      gl.uniform1f(uPulse, 1 + 0.05 * Math.sin(t * 0.32));
      gl.uniform1f(uSteps, quality);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // one-shot adaptive quality over the first ~90 frames
      if (frames < 90) {
        samples.push(now - lastFrameMs);
        lastFrameMs = now;
        frames++;
        if (frames === 90) {
          var s = samples.slice(40).sort(function (a, b) { return a - b; });
          var med = s[s.length >> 1] || 16;
          if (med > 22) {
            // recover performance by lowering resolution, not integration steps
            dprCap = Math.max(0.6, dprCap * 0.7);
            resize();
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running) return;
      running = true;
      lastT = performance.now() / 1000;
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    // pause when the tab is hidden
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
    // pause when the band scrolls out of view
    if (typeof IntersectionObserver !== "undefined") {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) start(); else stop();
      }, { rootMargin: "120px" }).observe(canvas);
    }

    // fade the canvas in over the static backdrop
    setTimeout(function () { canvas.style.opacity = "1"; }, 60);
    raf = requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

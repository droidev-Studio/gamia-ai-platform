(function () {
  "use strict";

  var DEFAULTS = {
    meteorSrc: "",
    logoHTML: 'Droi <span class="ai">AI</span>',
    titleLine1: "Your Ideas Fall Like Stars.",
    titleLine2: "We Catch Them.",
    inspireSelector: ".inspire-btn",
    inspireIconSelector: ".inspire-btn svg",
    swapSelectors: [".beta-tag", ".hero-title", ".hero-sub"],
    inspireRowSelector: ".inspire-row",
    restSelectors: [".site-nav", ".prompt-box", ".hero-meta"],
    staggerMs: 110,
    oncePerSession: false,
    respectReducedMotion: true,
    skippable: true
  };

  var cfg = Object.assign({}, DEFAULTS, window.DROI_INTRO_CONFIG || {});
  var skipUntil = 0;
  var skipStorageKey = cfg.skipStorageKey || "gamia_skip_intro_once_until";
  try {
    skipUntil = Number(localStorage.getItem(skipStorageKey) || 0);
    if (skipUntil) localStorage.removeItem(skipStorageKey);
  } catch (error) {
    skipUntil = 0;
  }
  var forceMotion = cfg.respectReducedMotion === false;
  if (forceMotion) document.documentElement.classList.add("droi-force-intro-motion");
  var reduced = !forceMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var played = cfg.oncePerSession && sessionStorage.getItem("droiIntroPlayed");
  var skippedByAuthReturn = skipUntil && Date.now() < skipUntil;
  var ALL_SELECTORS = cfg.swapSelectors
    .concat([cfg.inspireRowSelector])
    .concat(cfg.restSelectors);

  function callSkipHook() {
    if (typeof cfg.shouldSkipIntro !== "function") return false;
    try {
      return cfg.shouldSkipIntro() === true;
    } catch (error) {
      return false;
    }
  }

  function callAsyncSkipHook() {
    if (typeof cfg.shouldSkipIntroAsync !== "function") return Promise.resolve(false);
    try {
      return Promise.resolve(cfg.shouldSkipIntroAsync()).then(function (value) {
        return value === true;
      }, function () {
        return false;
      });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function introTimeout(ms) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(false); }, ms);
    });
  }

  var skippedByAppState = callSkipHook();
  var shouldSkipImmediately = reduced || played || skippedByAuthReturn || skippedByAppState;

  var hideStyle = document.createElement("style");
  hideStyle.textContent = shouldSkipImmediately
    ? ""
    : ALL_SELECTORS.join(",") + "{opacity:0 !important}";
  document.head.appendChild(hideStyle);

  if (shouldSkipImmediately) {
    hideStyle.remove();
    return;
  }

  var timers = [];
  var scrollLock = {
    active: false,
    historyRestoration: null,
    htmlOverflow: "",
    htmlOverscroll: "",
    bodyOverflow: "",
    bodyOverscroll: "",
    bodyPosition: "",
    bodyTop: "",
    bodyLeft: "",
    bodyRight: "",
    bodyWidth: ""
  };

  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function collect(sels) {
    var els = [];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { els.push(el); });
    });
    return els;
  }

  function preventIntroScroll(event) {
    if (scrollLock.active) event.preventDefault();
  }

  function keepIntroAtTop() {
    if (scrollLock.active && (window.scrollX || window.scrollY)) {
      window.scrollTo(0, 0);
    }
  }

  function lockIntroScroll() {
    if (scrollLock.active) return;
    var html = document.documentElement;
    var body = document.body;
    scrollLock.active = true;
    scrollLock.htmlOverflow = html.style.overflow;
    scrollLock.htmlOverscroll = html.style.overscrollBehavior;
    scrollLock.bodyOverflow = body.style.overflow;
    scrollLock.bodyOverscroll = body.style.overscrollBehavior;
    scrollLock.bodyPosition = body.style.position;
    scrollLock.bodyTop = body.style.top;
    scrollLock.bodyLeft = body.style.left;
    scrollLock.bodyRight = body.style.right;
    scrollLock.bodyWidth = body.style.width;
    if ("scrollRestoration" in history) {
      scrollLock.historyRestoration = history.scrollRestoration;
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    addEventListener("wheel", preventIntroScroll, { capture: true, passive: false });
    addEventListener("touchmove", preventIntroScroll, { capture: true, passive: false });
    addEventListener("scroll", keepIntroAtTop, true);
  }

  function unlockIntroScroll() {
    if (!scrollLock.active) return;
    var html = document.documentElement;
    var body = document.body;
    scrollLock.active = false;
    html.style.overflow = scrollLock.htmlOverflow;
    html.style.overscrollBehavior = scrollLock.htmlOverscroll;
    body.style.overflow = scrollLock.bodyOverflow;
    body.style.overscrollBehavior = scrollLock.bodyOverscroll;
    body.style.position = scrollLock.bodyPosition;
    body.style.top = scrollLock.bodyTop;
    body.style.left = scrollLock.bodyLeft;
    body.style.right = scrollLock.bodyRight;
    body.style.width = scrollLock.bodyWidth;
    if ("scrollRestoration" in history && scrollLock.historyRestoration !== null) {
      history.scrollRestoration = scrollLock.historyRestoration;
    }
    removeEventListener("wheel", preventIntroScroll, true);
    removeEventListener("touchmove", preventIntroScroll, true);
    removeEventListener("scroll", keepIntroAtTop, true);
    window.scrollTo(0, 0);
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderTitleHTML() {
    var line1 = escapeHTML(cfg.titleLine1);
    var line2 = escapeHTML(cfg.titleLine2);
    var defaultLine = "Your Ideas Fall Like Stars.";
    if (cfg.titleLine1 === defaultLine) {
      line1 = 'Your Ideas Fall Like <em class="droi-intro__word--stars">Stars.</em>';
    }
    return (
      '<div class="droi-intro__title">' +
        '<span class="droi-intro__line droi-intro__line--one">' + line1 + "</span>" +
        '<span class="droi-intro__line droi-intro__line--two">' + line2 + "</span>" +
      "</div>"
    );
  }

  function boot() {
    lockIntroScroll();
    var root = document.createElement("div");
    root.id = "droi-intro";
    root.innerHTML =
      '<div class="droi-intro__base"></div>' +
      '<div class="droi-intro__dim"></div>' +
      '<div class="droi-intro__focus"></div>' +
      '<div class="droi-intro__logo">' + cfg.logoHTML + "</div>" +
      renderTitleHTML() +
      '<canvas class="droi-intro__fx"></canvas>' +
      (cfg.meteorSrc ? '<img class="droi-intro__texture" alt="" src="' + cfg.meteorSrc + '">' : "") +
      '<div class="droi-intro__catch-glow"></div>' +
      '<div class="droi-intro__catch-ring"></div>';
    document.body.appendChild(root);

    function measureLanding() {
      var t =
        document.querySelector(cfg.inspireIconSelector) ||
        document.querySelector(cfg.inspireSelector);
      if (t) {
        var r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return { x: innerWidth * 0.5, y: innerHeight * 0.58 };
    }

    function syncPageAnchors() {
      var title = document.querySelector(cfg.swapSelectors[1] || ".title");
      if (title) {
        var titleRect = title.getBoundingClientRect();
        var titleStyle = getComputedStyle(title);
        var compactTitleFont = "";
        if (innerWidth <= 560) {
          compactTitleFont = clamp(innerWidth * 0.09, 34, 38).toFixed(2) + "px";
        } else if (innerWidth <= 820) {
          compactTitleFont = clamp(innerWidth * 0.063, 38, 52).toFixed(2) + "px";
        }
        root.style.setProperty("--di-title-x", (titleRect.left + titleRect.width / 2) + "px");
        root.style.setProperty("--di-title-top", titleRect.top + "px");
        root.style.setProperty("--di-title-w", compactTitleFont
          ? Math.max(0, innerWidth - (innerWidth <= 560 ? 20 : 56)) + "px"
          : Math.min(innerWidth - 72, Math.max(titleRect.width, innerWidth * 0.72)) + "px");
        root.style.setProperty("--di-title-font", compactTitleFont || titleStyle.fontSize);
        root.style.setProperty("--di-title-family", titleStyle.fontFamily);
        root.style.setProperty("--di-title-weight", titleStyle.fontWeight);
        root.style.setProperty("--di-title-line", compactTitleFont ? "1.04" : (titleStyle.lineHeight === "normal" ? "0.94" : titleStyle.lineHeight));
        root.style.setProperty("--di-title-letter", compactTitleFont ? "0" : (titleStyle.letterSpacing === "normal" ? "-0.04em" : titleStyle.letterSpacing));
      }
    }

    var target = measureLanding();
    var swapEls = collect(cfg.swapSelectors);
    var inspireEls = collect([cfg.inspireRowSelector]);
    var restEls = collect(cfg.restSelectors);
    var allEls = swapEls.concat(inspireEls).concat(restEls);
    allEls.forEach(function (el) { el.classList.add("droi-reveal"); });
    hideStyle.remove();

    var canvas = root.querySelector(".droi-intro__fx");
    var ctx = canvas.getContext("2d");
    var texture = root.querySelector(".droi-intro__texture");
    var vw = innerWidth;
    var vh = innerHeight;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    ctx.scale(dpr, dpr);

    var isMobile = vw < 640;
    var HOLD_START = 2450;
    var MOVE_START = 2900;
    var MOVE_END = 4700;
    var MOVE_DURATION = MOVE_END - MOVE_START;
    var RAIN_START = 2220;
    var RAIN_END = 2450;
    var RESONANCE_END = MOVE_START + 920;

    var p0 = {
      x: clamp(target.x - vw * (isMobile ? 0.30 : 0.38), isMobile ? 42 : 72, vw - (isMobile ? 42 : 72)),
      y: Math.max(isMobile ? 48 : 42, vh * (isMobile ? 0.10 : 0.075))
    };
    var p1 = {
      x: clamp(target.x - vw * (isMobile ? 0.35 : 0.42), 36, vw - 36),
      y: vh * (isMobile ? 0.24 : 0.24)
    };
    var p2 = {
      x: clamp(target.x - vw * (isMobile ? 0.18 : 0.24), 32, vw - 32),
      y: target.y - vh * (isMobile ? 0.13 : 0.12)
    };
    var p3 = { x: target.x, y: target.y };

    function recalcPath() {
      target = measureLanding();
      p0.x = clamp(target.x - vw * (isMobile ? 0.30 : 0.38), isMobile ? 42 : 72, vw - (isMobile ? 42 : 72));
      p0.y = Math.max(isMobile ? 48 : 42, vh * (isMobile ? 0.10 : 0.075));
      p1.x = clamp(target.x - vw * (isMobile ? 0.35 : 0.42), 36, vw - 36);
      p1.y = vh * (isMobile ? 0.24 : 0.24);
      p2.x = clamp(target.x - vw * (isMobile ? 0.18 : 0.24), 32, vw - 32);
      p2.y = target.y - vh * (isMobile ? 0.13 : 0.12);
      p3.x = target.x;
      p3.y = target.y;
      root.style.setProperty("--mx", p0.x + "px");
      root.style.setProperty("--my", p0.y + "px");
      root.style.setProperty("--mr", "54px");
    }

    var sprites = [
      makeSprite(255, 255, 255),
      makeSprite(122, 220, 255),
      makeSprite(168, 138, 255),
      makeSprite(210, 242, 255)
    ];
    var stars = makeStars(p0);
    var rain = makeRain();
    var particles = [];
    var rafId = null;
    var startTime = null;
    var lastPos = null;
    var emitCarry = 0;
    var impactDone = false;
    var primaryRevealed = false;
    var finished = false;
    var copyVisible = false;
    var fxStopAt = Infinity;

    function syncIntroLayout() {
      syncPageAnchors();
      recalcPath();
    }

    syncIntroLayout();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        requestAnimationFrame(function () {
          if (!copyVisible) syncIntroLayout();
        });
      });
    }

    function makeSprite(r, g, b) {
      var c = document.createElement("canvas");
      c.width = c.height = 36;
      var g2 = c.getContext("2d");
      var grad = g2.createRadialGradient(18, 18, 0, 18, 18, 18);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.18, "rgba(" + r + "," + g + "," + b + ",0.92)");
      grad.addColorStop(0.58, "rgba(" + r + "," + g + "," + b + ",0.23)");
      grad.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 36, 36);
      return c;
    }

    function makeStars(selected) {
      var list = [];
      var count = isMobile ? 62 : 88;
      var cycles = [900, 1400, 2200];
      for (var i = 0; i < count; i++) {
        list.push({
          x: Math.random() * vw,
          y: Math.random() * vh * 0.62,
          size: 0.75 + Math.random() * 1.35,
          alpha: 0.18 + Math.random() * 0.37,
          cycle: cycles[i % cycles.length],
          phase: Math.random() * Math.PI * 2
        });
      }
      list.push({
        x: selected.x,
        y: selected.y,
        size: 1.15,
        alpha: 0.42,
        cycle: 1400,
        phase: 0,
        selected: true
      });
      return list;
    }

    function makeRain() {
      var list = [];
      var count = isMobile ? 6 : 9;
      for (var i = 0; i < count; i++) {
        list.push({
          delay: RAIN_START + Math.random() * 80,
          dur: 260 + Math.random() * 180,
          x: -80 + Math.random() * (vw + 160),
          y: -40 + Math.random() * vh * 0.46,
          len: 58 + Math.random() * 118,
          speed: 300 + Math.random() * 220,
          alpha: 0.12 + Math.random() * 0.18,
          width: 0.55 + Math.random() * 0.8,
          hue: Math.random()
        });
      }
      return list;
    }

    function bezier(t) {
      var u = 1 - t;
      return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
      };
    }

    function drawStarfield(elapsed) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var fieldFade = clamp(elapsed / 450, 0, 1);
      var fieldRecede = 1 - clamp((elapsed - MOVE_START) / 900, 0, 0.62);
      var resonance = getStarResonance(elapsed);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (s.selected && elapsed >= MOVE_START && elapsed < MOVE_START + 420) {
          drawStarVoid(s, (elapsed - MOVE_START) / 420);
          continue;
        }
        if (s.selected && elapsed >= MOVE_START + 420) {
          s.alpha = lerp(s.alpha, 0.22, 0.025);
        }
        if (s.selected && elapsed >= HOLD_START && elapsed < MOVE_START) continue;
        var tw = 0.72 + 0.28 * Math.sin((elapsed / s.cycle) * Math.PI * 2 + s.phase);
        var a = s.alpha * tw * fieldFade * fieldRecede;
        var r = s.size * (0.9 + tw * 0.25);
        var x = s.x;
        var y = s.y;
        var tint = "238,247,255";
        if (resonance) {
          var influence = getStarResonanceInfluence(s, resonance, elapsed);
          if (influence.wave > 0.005) {
            x += influence.dx;
            y += influence.dy;
            a *= 1 + influence.wave * 1.35;
            r *= 1 + influence.wave * 0.48;
            tint = influence.wave > 0.18 ? "218,246,255" : "238,247,255";
          }
          if (influence.glow > 0.01) {
            a *= 1 + influence.glow * 0.42;
          }
        }
        ctx.fillStyle = "rgba(" + tint + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function getStarResonance(elapsed) {
      if (elapsed < HOLD_START || elapsed > RESONANCE_END) return null;
      var local = elapsed - HOLD_START;
      var t = clamp(local / (RESONANCE_END - HOLD_START), 0, 1);
      var travel = easeOut(t);
      var fadeOut = 1 - clamp((local - 1180) / 520, 0, 1);
      var bloom = Math.sin(Math.PI * clamp(local / 980, 0, 1));
      var maxRadius = Math.min(isMobile ? 280 : 520, Math.max(vw, vh) * (isMobile ? 0.50 : 0.46));
      return {
        t: t,
        local: local,
        radius: lerp(34, maxRadius, travel),
        softness: lerp(isMobile ? 92 : 140, isMobile ? 150 : 235, travel),
        strength: clamp((0.22 + bloom * 0.58) * fadeOut, 0, 1),
        bloom: clamp(bloom * fadeOut, 0, 1),
        field: clamp(Math.sin(Math.PI * t) * fadeOut, 0, 1)
      };
    }

    function getStarResonanceInfluence(star, resonance, elapsed) {
      var dx = star.x - p0.x;
      var dy = star.y - p0.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var waveFalloff = Math.exp(-Math.abs(dist - resonance.radius) / resonance.softness);
      var fieldFalloff = Math.exp(-dist / (resonance.radius + resonance.softness * 1.45));
      var sparkle = 0.72 + 0.28 * Math.sin(elapsed * 0.012 + star.phase * 1.7);
      var wave = waveFalloff * resonance.strength * sparkle;
      var glow = fieldFalloff * resonance.field;
      var drift = wave * (isMobile ? 1.1 : 1.7);
      return {
        wave: wave,
        glow: glow,
        dx: dx / dist * drift,
        dy: dy / dist * drift
      };
    }

    function drawSelectionAtmosphere(elapsed) {
      var resonance = getStarResonance(elapsed);
      if (!resonance || resonance.strength <= 0.01) return;
      var strength = resonance.strength;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      drawResonanceField(resonance, 0, 1.42, 0.72, 0.03, "134,224,255");
      drawResonanceField(resonance, -0.42, 1.12, 0.52, 0.024, "170,132,255", 28, -10);
      drawResonanceField(resonance, 0.28, 0.86, 0.42, 0.018, "235,248,255", -20, 14);
      drawResonanceArc(resonance, -0.62, Math.PI * 0.82, "198,238,255", 0.085);
      drawResonanceArc(resonance, 0.58, Math.PI * 0.56, "160,132,255", 0.055);

      ctx.restore();
    }

    function drawResonanceField(resonance, rotation, sx, sy, alpha, color, offsetX, offsetY) {
      var radius = resonance.radius + resonance.softness * 1.35;
      ctx.save();
      ctx.translate(p0.x + (offsetX || 0) * resonance.field, p0.y + (offsetY || 0) * resonance.field);
      ctx.rotate(rotation);
      ctx.scale(sx, sy);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      g.addColorStop(0, "rgba(245,252,255," + (alpha * 1.8 * resonance.bloom).toFixed(3) + ")");
      g.addColorStop(0.24, "rgba(" + color + "," + (alpha * resonance.strength).toFixed(3) + ")");
      g.addColorStop(0.58, "rgba(" + color + "," + (alpha * 0.42 * resonance.field).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + color + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawResonanceArc(resonance, angle, span, color, alpha) {
      var radius = resonance.radius + resonance.softness * 0.28;
      var a = alpha * resonance.strength;
      if (a <= 0.004) return;
      ctx.save();
      ctx.translate(p0.x, p0.y);
      ctx.rotate(angle);
      ctx.scale(1.22, 0.76);
      ctx.lineWidth = isMobile ? 0.75 : 0.95;
      ctx.strokeStyle = "rgba(" + color + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(0, 0, radius, -span * 0.5, span * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    function drawStarVoid(star, t) {
      var a = 0.18 * Math.sin(Math.PI * clamp(t, 0, 1));
      if (a <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(star.x, star.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSelectedStar(elapsed) {
      if (elapsed < HOLD_START || elapsed > MOVE_START) return;
      var t = (elapsed - HOLD_START) / (MOVE_START - HOLD_START);
      var pulse = 1 + Math.sin(t * Math.PI * 4) * 0.10;
      var alpha = lerp(0.72, 0.96, easeInOut(t));
      var radius = lerp(10, 18, t) * pulse;
      updateFocusVars(p0, lerp(48, 76, t));

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      drawSelectedStarLumen(elapsed - HOLD_START);
      var g = ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, radius);
      g.addColorStop(0, "rgba(255,255,255," + alpha.toFixed(3) + ")");
      g.addColorStop(0.32, "rgba(137,226,255," + (alpha * 0.56).toFixed(3) + ")");
      g.addColorStop(1, "rgba(137,226,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSelectedStarLumen(localTime) {
      var t = clamp(localTime / 940, 0, 1);
      var bloom = Math.sin(Math.PI * t);
      if (bloom <= 0.01) return;
      var radius = lerp(isMobile ? 58 : 74, isMobile ? 138 : 188, easeOut(t));
      var g = ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, radius);
      g.addColorStop(0, "rgba(255,255,255," + (0.16 * bloom).toFixed(3) + ")");
      g.addColorStop(0.34, "rgba(136,226,255," + (0.085 * bloom).toFixed(3) + ")");
      g.addColorStop(1, "rgba(136,226,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawRain(elapsed) {
      if (elapsed < RAIN_START || elapsed > RAIN_END) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < rain.length; i++) {
        var s = rain[i];
        var t = (elapsed - s.delay) / s.dur;
        if (t < 0 || t > 1) continue;
        var f = Math.sin(Math.PI * t) * (1 - clamp((elapsed - 1660) / 140, 0, 1));
        if (f <= 0.01) continue;
        var dist = s.speed * t;
        var dx = Math.cos(Math.PI * 0.20);
        var dy = Math.sin(Math.PI * 0.20);
        var headX = s.x + dx * dist;
        var headY = s.y + dy * dist;
        var tailX = headX - dx * s.len;
        var tailY = headY - dy * s.len;
        var g = ctx.createLinearGradient(tailX, tailY, headX, headY);
        var color = s.hue > 0.55 ? "160,145,255" : "126,226,255";
        g.addColorStop(0, "rgba(" + color + ",0)");
        g.addColorStop(0.78, "rgba(" + color + "," + (s.alpha * f).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,255,255," + (0.45 * f).toFixed(3) + ")");
        ctx.strokeStyle = g;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawMain(elapsed) {
      if (elapsed < MOVE_START || elapsed > MOVE_END + 180) return;

      var u = clamp((elapsed - MOVE_START) / MOVE_DURATION, 0, 1);
      var pathT = easeInOut(u);
      if (u > 0.74) pathT = lerp(pathT, easeOut(u), (u - 0.74) / 0.26);
      var pos = bezier(pathT);
      var prev = lastPos || bezier(Math.max(0, pathT - 0.006));
      var vx = pos.x - prev.x;
      var vy = pos.y - prev.y;
      var speed = Math.sqrt(vx * vx + vy * vy) || 1;
      var dx = vx / speed;
      var dy = vy / speed;
      var nx = -dy;
      var ny = dx;
      lastPos = pos;

      var scale = 0.032 + Math.pow(pathT, 1.55) * 0.64;
      var opacity = clamp(u / 0.10, 0, 1);
      var focusRadius = lerp(78, 168, pathT);
      if (pathT > 0.90) {
        var sink = (pathT - 0.90) / 0.10;
        scale *= lerp(1, 0.30, sink);
        focusRadius = lerp(focusRadius, 86, sink);
        opacity *= 1 - clamp((pathT - 0.975) / 0.025, 0, 1);
      }
      updateFocusVars(pos, focusRadius);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (pathT < 0.35) ctx.filter = "blur(1.2px)";
      drawMeteorSilk(pos, dx, dy, nx, ny, scale, pathT, opacity, elapsed);
      drawMeteorCore(pos, nx, ny, scale, pathT, opacity, elapsed);
      ctx.filter = "none";

      if (texture && texture.complete && texture.naturalWidth && pathT > 0.42 && pathT < 0.88) {
        drawSoftTexture(texture, pos, dx, dy, scale, pathT, opacity);
      }
      ctx.restore();

      spawnTrail(pos, dx, dy, nx, ny, scale, pathT, opacity);

      if (!impactDone && pathT >= 0.988) {
        impactDone = true;
        triggerImpact();
      }
    }

    function drawMeteorCore(pos, nx, ny, scale, pathT, opacity, elapsed) {
      var pulse = 1 + Math.sin(elapsed * 0.012) * 0.08;
      var halo = lerp(6, 60, pathT) * pulse;
      var core = lerp(1.15, 8.2, pathT) * pulse;
      var g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, halo);
      g.addColorStop(0, "rgba(255,255,255," + (0.92 * opacity).toFixed(3) + ")");
      g.addColorStop(0.26, "rgba(134,228,255," + (0.62 * opacity).toFixed(3) + ")");
      g.addColorStop(0.58, "rgba(142,112,255," + (0.22 * opacity).toFixed(3) + ")");
      g.addColorStop(1, "rgba(142,112,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, halo, 0, Math.PI * 2);
      ctx.fill();

      if (pathT > 0.08) {
        ctx.strokeStyle = "rgba(235,250,255," + (0.58 * opacity).toFixed(3) + ")";
        ctx.lineWidth = Math.max(0.65, scale * 2.0);
        ctx.beginPath();
        ctx.moveTo(pos.x - nx * core * 1.9, pos.y - ny * core * 1.9);
        ctx.lineTo(pos.x + nx * core * 1.9, pos.y + ny * core * 1.9);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255," + opacity.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, core * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawMeteorSilk(pos, dx, dy, nx, ny, scale, pathT, opacity, elapsed) {
      if (pathT < 0.10) return;
      var tailLen = lerp(14, 250, pathT);
      var spread = lerp(2, 28, pathT);
      var offsets = [-1.18, -0.42, 0.36, 1.02];
      var colors = [
        [240, 252, 255],
        [117, 226, 255],
        [152, 143, 255],
        [209, 126, 255]
      ];

      for (var i = 0; i < offsets.length; i++) {
        var wobble = Math.sin(elapsed * 0.004 + i * 1.7) * spread * 0.18;
        var o = offsets[i] * spread + wobble;
        var tailX = pos.x - dx * tailLen + nx * o * 2.1;
        var tailY = pos.y - dy * tailLen + ny * o * 2.1;
        var c1x = pos.x - dx * tailLen * 0.25 + nx * o * 0.70;
        var c1y = pos.y - dy * tailLen * 0.25 + ny * o * 0.70;
        var c2x = pos.x - dx * tailLen * 0.72 + nx * o * 1.55;
        var c2y = pos.y - dy * tailLen * 0.72 + ny * o * 1.55;
        var g = ctx.createLinearGradient(tailX, tailY, pos.x, pos.y);
        var rgb = colors[i];
        var a = opacity * (i === 0 ? 0.68 : 0.34) * clamp(pathT * 1.35, 0, 1);
        g.addColorStop(0, "rgba(" + rgb.join(",") + ",0)");
        g.addColorStop(0.55, "rgba(" + rgb.join(",") + "," + (a * 0.34).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,255,255," + a.toFixed(3) + ")");
        ctx.strokeStyle = g;
        ctx.lineCap = "round";
        ctx.lineWidth = (i === 0 ? 1.8 : 1.0) + pathT * (i === 0 ? 1.1 : 0.6);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.bezierCurveTo(c2x, c2y, c1x, c1y, pos.x - dx * 3, pos.y - dy * 3);
        ctx.stroke();
      }
    }

    function drawSoftTexture(img, pos, dx, dy, scale, pathT, opacity) {
      var angle = Math.atan2(dy, dx) - Math.PI * 0.24;
      var w = lerp(120, 240, pathT) * scale;
      var h = w * 0.78;
      ctx.save();
      ctx.translate(pos.x - dx * w * 0.23, pos.y - dy * w * 0.23);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.022 * opacity * clamp((pathT - 0.42) / 0.18, 0, 1);
      ctx.drawImage(img, -w * 0.74, -h * 0.52, w, h);
      ctx.restore();
    }

    function spawnTrail(pos, dx, dy, nx, ny, scale, pathT, opacity) {
      if (opacity < 0.08 || pathT < 0.14 || pathT > 0.965) return;
      var rate = lerp(10, 48, pathT);
      emitCarry += rate / 60;
      var n = Math.floor(emitCarry);
      emitCarry -= n;
      for (var i = 0; i < n && particles.length < 220; i++) {
        var back = Math.random() * lerp(12, 108, pathT);
        var spread = (Math.random() - 0.5) * lerp(6, 48, pathT);
        particles.push({
          x: pos.x - dx * back + nx * spread,
          y: pos.y - dy * back + ny * spread,
          vx: -dx * (8 + Math.random() * 30) + nx * (Math.random() - 0.5) * 14,
          vy: -dy * (8 + Math.random() * 30) + ny * (Math.random() - 0.5) * 14,
          life: 0,
          ttl: 0.44 + Math.random() * 0.64,
          size: (0.52 + Math.random() * 1.35) * (0.82 + pathT * 0.72),
          sprite: sprites[(Math.random() * sprites.length) | 0],
          mode: 0,
          tw: 5 + Math.random() * 8,
          drag: 1.5
        });
      }
    }

    function updateFocusVars(pos, radius) {
      root.style.setProperty("--mx", pos.x.toFixed(1) + "px");
      root.style.setProperty("--my", pos.y.toFixed(1) + "px");
      root.style.setProperty("--mr", radius.toFixed(1) + "px");
    }

    function triggerImpact() {
      var glow = root.querySelector(".droi-intro__catch-glow");
      var ring = root.querySelector(".droi-intro__catch-ring");
      glow.style.left = ring.style.left = target.x + "px";
      glow.style.top = ring.style.top = target.y + "px";
      root.classList.add("di-impact-soft");
      spawnImpactParticles();
      fxStopAt = performance.now() - startTime + 1550;
      revealRest(false);

      var btn = document.querySelector(cfg.inspireSelector);
      if (btn) {
        addButtonRipples(btn);
        btn.classList.add("droi-impact-pulse");
        setTimeout(function () { btn.classList.remove("droi-impact-pulse"); }, 1500);
      }
    }

    function addButtonRipples(btn) {
      btn.querySelectorAll(".droi-impact-ripple").forEach(function (node) {
        node.remove();
      });
      var first = document.createElement("span");
      var second = document.createElement("span");
      first.className = "droi-impact-ripple droi-impact-ripple--one";
      second.className = "droi-impact-ripple droi-impact-ripple--two";
      first.setAttribute("aria-hidden", "true");
      second.setAttribute("aria-hidden", "true");
      btn.classList.add("droi-rippling");
      btn.appendChild(first);
      btn.appendChild(second);
      setTimeout(function () {
        first.remove();
        second.remove();
        btn.classList.remove("droi-rippling");
      }, 1700);
    }

    function spawnImpactParticles() {
      for (var i = 0; i < 34; i++) {
        var a = Math.random() * Math.PI * 2;
        var r = 34 + Math.random() * 92;
        particles.push({
          x: target.x + Math.cos(a) * r,
          y: target.y + Math.sin(a) * r,
          fromX: target.x + Math.cos(a) * r,
          fromY: target.y + Math.sin(a) * r,
          life: 0,
          ttl: 0.58 + Math.random() * 0.42,
          size: 0.9 + Math.random() * 1.8,
          sprite: sprites[(Math.random() * sprites.length) | 0],
          mode: 2,
          tw: 7 + Math.random() * 8
        });
      }
      for (var j = 0; j < 14; j++) {
        var a2 = Math.random() * Math.PI * 2;
        var sp = 18 + Math.random() * 54;
        particles.push({
          x: target.x,
          y: target.y,
          vx: Math.cos(a2) * sp,
          vy: Math.sin(a2) * sp - 8,
          life: 0,
          ttl: 0.34 + Math.random() * 0.24,
          size: 0.7 + Math.random() * 1.2,
          sprite: sprites[(Math.random() * sprites.length) | 0],
          mode: 0,
          tw: 6 + Math.random() * 8,
          drag: 4.6
        });
      }
    }

    function drawParticles(dt) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var i = particles.length - 1; i >= 0; i--) {
        var q = particles[i];
        q.life += dt;
        if (q.life >= q.ttl) {
          particles.splice(i, 1);
          continue;
        }
        if (q.mode === 2) {
          var k = easeInOut(q.life / q.ttl);
          drawParticle(q, lerp(q.fromX, target.x, k), lerp(q.fromY, target.y, k));
          continue;
        }
        q.vx -= q.vx * q.drag * dt;
        q.vy -= q.vy * q.drag * dt;
        q.vy += 8 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        drawParticle(q, q.x, q.y);
      }
      ctx.restore();
    }

    function drawParticle(q, x, y) {
      var f = 1 - q.life / q.ttl;
      var twinkle = 0.58 + 0.42 * Math.sin(q.life * q.tw * Math.PI);
      var s = q.size * (0.9 + f * 0.7) * 2.2;
      ctx.globalAlpha = clamp(f * twinkle, 0, 1);
      ctx.drawImage(q.sprite, x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!startTime) startTime = now;
      var elapsed = now - startTime;
      ctx.clearRect(0, 0, vw, vh);

      drawSelectionAtmosphere(elapsed);
      drawStarfield(elapsed);
      drawRain(elapsed);
      drawSelectedStar(elapsed);
      drawMain(elapsed);
      drawParticles(1 / 60);

      if (!finished || elapsed < fxStopAt || particles.length) {
        rafId = requestAnimationFrame(frame);
      }
    }

    function revealPrimary() {
      if (primaryRevealed) return;
      primaryRevealed = true;
      syncIntroLayout();
      root.classList.add("di-page-peek");
      swapEls.forEach(function (el, i) {
        setTimeout(function () { el.classList.add("droi-reveal--soft"); }, i * 95);
      });
      inspireEls.forEach(function (el, i) {
        setTimeout(function () { el.classList.add("droi-reveal--soft"); }, 360 + i * 80);
      });
      restEls.forEach(function (el) {
        if (el.classList && el.classList.contains("header")) {
          setTimeout(function () { el.classList.add("droi-reveal--soft"); }, 220);
        }
      });
    }

    function wakeCatcher() {
      root.classList.add("di-catcher-awake");
      syncIntroLayout();
      inspireEls.forEach(function (el) { el.classList.add("droi-reveal--soft"); });
      var btn = document.querySelector(cfg.inspireSelector);
      if (btn) btn.classList.add("droi-catcher-awake");
    }

    function revealRest(fast) {
      if (finished) return;
      finished = true;
      revealPrimary();
      root.classList.add("di-fadeout");
      swapEls.concat(inspireEls).forEach(function (el) {
        el.classList.remove("droi-reveal--soft");
        el.classList.add("droi-reveal--in");
      });
      var restDelay = fast ? 0 : 200;
      restEls.forEach(function (el, i) {
        setTimeout(function () { el.classList.add("droi-reveal--in"); }, restDelay + i * (fast ? 36 : 85));
      });
      at(fast ? 240 : 600, function () { root.classList.add("di-done"); });
      at(fast ? 720 : 1000, teardown);
      if (cfg.oncePerSession) sessionStorage.setItem("droiIntroPlayed", "1");
    }

    function teardown() {
      if (rafId) cancelAnimationFrame(rafId);
      root.remove();
      unlockIntroScroll();
      allEls.forEach(function (el) {
        el.classList.remove("droi-reveal", "droi-reveal--soft", "droi-reveal--in");
      });
      var btn = document.querySelector(cfg.inspireSelector);
      if (btn) btn.classList.remove("droi-catcher-awake", "droi-impact-pulse");
      removeEventListener("pointerdown", skip, true);
      removeEventListener("keydown", skip, true);
    }

    function skip() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      allEls.forEach(function (el) {
        el.classList.remove("droi-reveal--soft");
        el.classList.add("droi-reveal--in");
      });
      revealRest(true);
    }

    if (cfg.skippable) {
      addEventListener("pointerdown", skip, true);
      addEventListener("keydown", skip, true);
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add("di-p0"); });
    });
    at(120, syncIntroLayout);
    at(420, syncIntroLayout);
    at(550, function () {
      copyVisible = true;
      root.classList.add("di-p1");
    });
    at(1550, function () { root.classList.add("di-copy-read"); });
    at(2200, function () { root.classList.add("di-word-glow"); });
    at(RAIN_START, function () { root.classList.add("di-rain"); });
    at(HOLD_START, function () { root.classList.add("di-star-selected", "di-focus-soft"); });
    at(2550, function () { root.classList.add("di-copy-handoff"); });
    at(2850, function () { root.classList.add("di-focus-strong"); });
    at(MOVE_START, function () {
      syncIntroLayout();
      lastPos = null;
      root.classList.add("di-meteor-active");
    });
    at(3050, revealPrimary);
    at(3850, wakeCatcher);
    at(MOVE_END + 720, function () { revealRest(false); });
    rafId = requestAnimationFrame(frame);
  }

  function startBoot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  Promise.race([
    callAsyncSkipHook(),
    introTimeout(Number(cfg.skipIntroAsyncTimeoutMs || 220))
  ]).then(function (shouldSkip) {
    if (shouldSkip) {
      hideStyle.remove();
      return;
    }
    startBoot();
  });
})();

/* 약사 인플루언서 육성 조직 — 스크롤 모션과 조직도 연결선 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 1. 스크롤 리빌 ── */
  function observe(selector, cb, opts) {
    var els = Array.prototype.slice.call(document.querySelectorAll(selector));
    if (!("IntersectionObserver" in window)) {
      els.forEach(cb);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          cb(e.target);
          io.unobserve(e.target);
        });
      },
      opts || { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach(function (el) { io.observe(el); });
  }

  observe(".reveal", function (el) { el.classList.add("on"); });

  /* ── 2. 숫자 카운트업 ── */
  function format(n) {
    return n >= 1000 ? n.toLocaleString("ko-KR") : String(n);
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target)) return;
    if (reduced) { el.textContent = format(target); return; }

    var dur = 1350;
    var start = null;

    function frame(t) {
      if (start === null) start = t;
      var p = Math.min((t - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = format(target);
    }
    requestAnimationFrame(frame);
  }

  observe("[data-count]", countUp, { threshold: 0.6 });

  /* ── 3. 조직도 연결선 ── */
  var SVG_NS = "http://www.w3.org/2000/svg";

  function elbow(f, t) {
    var dx = t.x - f.x;
    var my = f.y + (t.y - f.y) / 2;

    if (Math.abs(dx) < 1.5) {
      return "M" + f.x + " " + f.y + "L" + t.x + " " + t.y;
    }

    var dir = dx > 0 ? 1 : -1;
    var r = Math.min(14, Math.abs(dx) / 2, Math.abs(my - f.y), Math.abs(t.y - my));

    return (
      "M" + f.x + " " + f.y +
      "L" + f.x + " " + (my - r) +
      "Q" + f.x + " " + my + " " + (f.x + dir * r) + " " + my +
      "L" + (t.x - dir * r) + " " + my +
      "Q" + t.x + " " + my + " " + t.x + " " + (my + r) +
      "L" + t.x + " " + t.y
    );
  }

  function Tree(rootSel, svgClass, links) {
    var root = document.querySelector(rootSel);
    if (!root) return;

    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", svgClass);
    svg.setAttribute("aria-hidden", "true");
    root.insertBefore(svg, root.firstChild);

    var drawn = false;

    function pick(name) {
      return root.querySelector('[data-node="' + name + '"]');
    }

    function draw() {
      var box = root.getBoundingClientRect();
      svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
      svg.setAttribute("width", box.width);
      svg.setAttribute("height", box.height);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      links.forEach(function (link) {
        var a = pick(link.from);
        var b = pick(link.to);
        if (!a || !b) return;

        var ra = a.getBoundingClientRect();
        var rb = b.getBoundingClientRect();
        var from = { x: ra.left - box.left + ra.width / 2, y: ra.bottom - box.top };
        var to = { x: rb.left - box.left + rb.width / 2, y: rb.top - box.top };
        if (to.y <= from.y + 2) return;

        var p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", elbow(from, to));
        var cls = [];
        if (link.late) cls.push("late");
        if (link.dash) cls.push("dash");
        if (cls.length) p.setAttribute("class", cls.join(" "));
        svg.appendChild(p);

        var len = p.getTotalLength();
        p.style.setProperty("--len", len);

        if (drawn && !link.dash) {
          p.style.transition = "none";
          p.style.strokeDashoffset = "0";
          requestAnimationFrame(function () { p.style.transition = ""; });
        }
      });
    }

    draw();

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            draw();
            requestAnimationFrame(function () {
              root.classList.add("on");
              drawn = true;
            });
            io.unobserve(e.target);
          });
        },
        { threshold: 0.14 }
      );
      io.observe(root);
    } else {
      root.classList.add("on");
      drawn = true;
    }

    var timer;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(draw, 140);
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(draw, 60); });
    }
  }

  Tree("#orgChart", "org-svg", [
    { from: "ceo", to: "t1", late: true },
    { from: "ceo", to: "t2", late: true },
    { from: "ceo", to: "t3", late: true },
    { from: "ceo", to: "tn", late: true }
  ]);

  // 상담은 팀장이 주담당이고 기획자는 제품 질문만 받쳐 준다(점선)
  Tree("#teamChart", "team-svg", [
    { from: "team", to: "leader" },
    { from: "team", to: "planner" },
    { from: "leader", to: "editor" },
    { from: "leader", to: "counsel" },
    { from: "planner", to: "counsel", dash: true }
  ]);

  /* ── 4. 순번 지연 ── */
  function stagger(selector) {
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) els[i].style.setProperty("--i", i);
  }
  stagger(".node-team");
  stagger(".node-ph");

  /* ── 5. 손익 막대 ── */
  observe(".pl", function (el) { el.classList.add("on"); }, { threshold: 0.3 });

  /* ── 6. 40팀 방사형 시각화 ──
     본사에서 팀이 고리를 그리며 뻗어 나가고, 팀 끝마다 약사 5명이 붙는다.
     스크롤 위치가 그대로 진행률이 되어 위아래로 되감긴다. */
  (function bloom() {
    var root = document.getElementById("bloom");
    var svg = document.getElementById("bloomSvg");
    var outPh = document.getElementById("bloomPh");
    var outTeam = document.getElementById("bloomTeam");
    if (!root || !svg || !outPh || !outTeam) return;

    var TEAMS = 40;
    var PER_TEAM = 5;
    var C = 500;

    // [팀 수, 반지름] 고리 세 겹으로 40팀
    function shape(compact) {
      return compact
        ? { rings: [[7, 180], [13, 302], [20, 424]], hub: 66, node: 30, dot: 7, fan: 48, spread: 42, sw: 2.6, inner: 100 }
        : { rings: [[7, 190], [13, 310], [20, 430]], hub: 132, node: 24, dot: 5.6, fan: 34, spread: 48, sw: 1.7, inner: 146 };
    }

    var NS = "http://www.w3.org/2000/svg";
    var clusters = [];
    var compactNow = null;

    function el(name, attrs) {
      var n = document.createElementNS(NS, name);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    }

    function build() {
      var compact = root.clientWidth < 640;
      if (compact === compactNow) return;
      compactNow = compact;

      var g = shape(compact);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      clusters = [];

      // 고리 안내선
      g.rings.forEach(function (r) {
        svg.appendChild(el("circle", { class: "guide", cx: C, cy: C, r: r[1] }));
      });

      // 본사
      svg.appendChild(el("circle", { class: "hub", cx: C, cy: C, r: g.hub }));
      svg.appendChild(el("circle", { class: "hub-ring", cx: C, cy: C, r: g.hub + 9 }));

      var offsets = [-90, -76, -83];

      g.rings.forEach(function (ring, ri) {
        var count = ring[0];
        var radius = ring[1];
        var prev = ri === 0 ? g.inner : g.rings[ri - 1][1] + g.fan + g.dot + 10;
        var spokeEnd = radius - g.node / 2 - 4;

        for (var i = 0; i < count; i++) {
          var deg = offsets[ri] + (360 / count) * i;
          var a = (deg * Math.PI) / 180;
          var ca = Math.cos(a);
          var sa = Math.sin(a);

          var grp = el("g", { class: "cluster" });

          var spoke = el("line", {
            class: "spoke",
            x1: C + ca * prev, y1: C + sa * prev,
            x2: C + ca * spokeEnd, y2: C + sa * spokeEnd,
            "stroke-width": g.sw
          });
          var len = spokeEnd - prev;
          spoke.style.setProperty("--len", len);
          grp.appendChild(spoke);

          grp.appendChild(el("rect", {
            class: "tnode",
            x: C + ca * radius - g.node / 2,
            y: C + sa * radius - g.node / 2,
            width: g.node, height: g.node, rx: g.node * 0.28
          }));

          for (var k = 0; k < PER_TEAM; k++) {
            var t = a + ((-g.spread + (2 * g.spread * k) / (PER_TEAM - 1)) * Math.PI) / 180;
            grp.appendChild(el("circle", {
              class: "pdot",
              cx: C + ca * radius + Math.cos(t) * g.fan,
              cy: C + sa * radius + Math.sin(t) * g.fan,
              r: g.dot
            }));
          }

          svg.appendChild(grp);
          clusters.push(grp);
        }
      });
    }

    var shownTeams = -1;

    function paint(p) {
      root.style.setProperty("--sp", p.toFixed(3));

      // 마지막 10%는 여운으로 두고 앞 90% 안에서 40팀이 다 핀다
      var teams = Math.round(Math.min(p / 0.9, 1) * TEAMS);
      if (teams === shownTeams) return;
      shownTeams = teams;

      for (var i = 0; i < clusters.length; i++) {
        clusters[i].classList.toggle("on", i < teams);
      }
      outTeam.textContent = teams;
      outPh.textContent = (teams * PER_TEAM).toLocaleString("ko-KR");
    }

    // 원 한가운데가 화면 아래(1.28vh)에서 살짝 위(0.45vh)로 올라오는 동안 다 핀다
    function progress() {
      var stage = root.querySelector(".bloom-stage");
      if (!stage) return 1;
      var r = stage.getBoundingClientRect();
      var vh = window.innerHeight;
      var mid = r.top + r.height / 2;
      var p = (vh * 1.28 - mid) / (vh * 0.83);
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }

    build();

    if (reduced) {
      paint(1);
      return;
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        paint(progress());
        queued = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        build();
        shownTeams = -1;
        paint(progress());
      }, 160);
    });

    paint(progress());
  })();

  /* ── 7. 맨 위로 ── */
  (function toTop() {
    var btn = document.getElementById("toTop");
    if (!btn) return;

    var ticking = false;
    function check() {
      btn.classList.toggle("on", window.scrollY > window.innerHeight * 0.9);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(check);
    }, { passive: true });
    check();

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  })();
})();

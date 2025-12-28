

(() => {
    const slider = document.getElementById("yearSlider");
    const yearLabel = document.getElementById("yearLabel");
    const yearLabel2 = document.getElementById("yearLabel2");
    const ticks = document.getElementById("yearTicks");
    const activePlane = document.getElementById("activePlane");
    const allPlane = document.getElementById("allPlane");
    const dataSourceEl = document.getElementById("dataSource");

    if (!slider || !activePlane || !allPlane) return;

    // Server-first (and only) data source for the Tech Map
    const TECH_USAGE_URL = "https://raw.githubusercontent.com/coderdoniv/resume.vbverse.com/main/assets/data/tech-usage.json";

    function setDataSourceStatus(text) {
        if (dataSourceEl) dataSourceEl.textContent = text;
    }

    async function loadTechUsage() {
        //setDataSourceStatus("Loading data…");
        const res = await fetch(TECH_USAGE_URL, { cache: "no-store", mode: "cors" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        //setDataSourceStatus("Data source: Server ✓");
        return data;
    }

    async function init() {
        let data;
        try {
            data = await loadTechUsage();
        } catch (e) {
            console.error("Failed to load tech usage JSON from server:", TECH_USAGE_URL, e);
            //setDataSourceStatus("Data source: Server unavailable ✕");
            return;
        }

        const years = (data.years || []).slice().sort((a, b) => a - b);
        const techList = data.tech || [];

        // Slider setup
        slider.min = years[0];
        slider.max = years[years.length - 1];
        slider.step = 1;
        slider.value = slider.max;

        // Render year ticks
        // Render year ticks (responsive: labels + dots)
        function renderYearTicks() {
            const track = slider.closest(".year-track") || ticks.parentElement;
            if (!track) return;

            const w = track.getBoundingClientRect().width;

            // Light theme needs a bit more spacing (labels look "wider")
            const isLight = document.documentElement.dataset.theme === "light"
                || document.body.dataset.theme === "light"
                || document.documentElement.classList.contains("theme-light")
                || document.body.classList.contains("theme-light");

            // Pixel budget per label:
            // - dark theme can tolerate denser labels
            // - light theme: switch to dots earlier
            const pxPerLabel = isLight ? 78 : 68;

            // How many labels can fit?
            const targetLabels = Math.max(4, Math.min(12, Math.floor(w / pxPerLabel)));

            // If we can show most labels, just show all as labels
            if (targetLabels >= years.length) {
                ticks.innerHTML = years.map(y => `<span class="tick tick--label">${y}</span>`).join("");
                return;
            }

            // Compute step so that first/last always show
            const step = Math.max(1, Math.ceil((years.length - 1) / (targetLabels - 1)));

            ticks.innerHTML = years.map((y, i) => {
                const isFirst = i === 0;
                const isLast = i === years.length - 1;
                const isLabel = isFirst || isLast || (i % step === 0);

                return isLabel
                    ? `<span class="tick tick--label">${y}</span>`
                    : `<span class="tick tick--dot" aria-hidden="true"></span>`;
            }).join("");
        }


        // initial render
        renderYearTicks();

        // rerender on resize (panel width changes / orientation changes)
        let _tickRAF = 0;
        function scheduleRenderYearTicks() {
            cancelAnimationFrame(_tickRAF);
            _tickRAF = requestAnimationFrame(renderYearTicks);
        }

        window.addEventListener("resize", scheduleRenderYearTicks);

        // even better: watch the track itself
        const trackEl = slider.closest(".year-track");
        if (trackEl && "ResizeObserver" in window) {
            const ro = new ResizeObserver(scheduleRenderYearTicks);
            ro.observe(trackEl);
        }


        // Helpers
        function usageFor(tech, year) {
            const v = tech.series?.[String(year)];
            return typeof v === "number" ? v : 0;
        }

        function scaleFromPoints(p) {
            // p = 0..10
            // maps to ~0.75 .. 2.1 (very visible)
            return 0.75 + (p / 10) * 1.35;
        }


        // Responsive scale for ALL technologies panel (not based on usage points)
        function allPlaneScaleFor(container) {
            const w = container.getBoundingClientRect().width;
            // Tune these if needed
            if (w <= 420) return 0.72;
            if (w <= 600) return 0.80;
            if (w <= 900) return 0.90;
            return 1.00;
        }


        // Responsive scale for ACTIVE technologies panel (keeps chips within panel on small screens)
        function activePlaneScaleFor(container) {
            const w = container.getBoundingClientRect().width;
            // Active chips already vary by points; this is a gentle overall multiplier.
            if (w <= 420) return 0.82;
            if (w <= 600) return 0.88;
            if (w <= 900) return 0.94;
            return 1.00;
        }



        // Build chip elements (one per tech) – we’ll move them between planes
        const chips = new Map(); // name -> element
        function makeChip(name) {
            const el = document.createElement("div");
            el.className = "tech-chip2 is-inactive";
            el.innerHTML = `<span class="tech-chip2__name">${name}</span>`;
            return el;
        }


        // Create once and put all in allPlane initially
        techList.forEach(t => {
            const el = makeChip(t.name);
            chips.set(t.name, el);
            allPlane.appendChild(el);
        });

        // Non-overlap packer (greedy + jitter). Works well for chips.
        function pack(container, elements) {
            const GAP = 10;   // space between bubbles
            const SAFE = 18;  // margin from container edge

            if (!elements.length) return;

            const rect = container.getBoundingClientRect();
            const style = getComputedStyle(container);

            const padL = parseFloat(style.paddingLeft) || 0;
            const padR = parseFloat(style.paddingRight) || 0;
            const padT = parseFloat(style.paddingTop) || 0;
            const padB = parseFloat(style.paddingBottom) || 0;

            const W = Math.max(320, rect.width) - padL - padR - SAFE * 2;
            const H = Math.max(220, rect.height) - padT - padB - SAFE * 2;

            // 🔑 Pack BIG bubbles first
            const sorted = elements.slice().sort((a, b) => {
                const sa = parseFloat(getComputedStyle(a).getPropertyValue("--s")) || 1;
                const sb = parseFloat(getComputedStyle(b).getPropertyValue("--s")) || 1;
                const aa = (a.offsetWidth * sa) * (a.offsetHeight * sa);
                const ab = (b.offsetWidth * sb) * (b.offsetHeight * sb);
                return ab - aa;
            });

            const placed = [];

            // 🔑 Scattered layout: random anchors + spiral search around each anchor
            const ANCHORS = 20;   // number of anchor regions (more = more scatter)
            const RINGS = 70;     // spiral steps per anchor
            const STEP = 8;       // spiral radius step (px) - increase for more scatter

            let k = 0;

            for (const el of sorted) {
                const baseW = el.offsetWidth;
                const baseH = el.offsetHeight;

                const s = parseFloat(getComputedStyle(el).getPropertyValue("--s")) || 1;
                const w = baseW * s;
                const h = baseH * s;

                let placedOK = false;

                // Create a few random anchors for this element (spread across panel)
                const anchors = Array.from({ length: ANCHORS }, () => ({
                    ax: Math.random() * Math.max(0, (W - w)),
                    ay: Math.random() * Math.max(0, (H - h))
                }));

                for (let a = 0; a < anchors.length && !placedOK; a++) {
                    const { ax, ay } = anchors[a];

                    for (let r = 0; r < RINGS; r++) {
                        // Spiral outward from the anchor
                        const angle = r * 0.85 + Math.random() * 0.6;
                        const radius = r * STEP;

                        let x = ax + Math.cos(angle) * radius;
                        let y = ay + Math.sin(angle) * radius;

                        // Extra vertical scatter to avoid "single band" look
                        y += (Math.random() - 0.5) * 18;

                        // Clamp inside bounds
                        x = Math.max(0, Math.min(W - w, x));
                        y = Math.max(0, Math.min(H - h, y));

                        const cand = { x, y, w, h };
                        let overlap = false;

                        for (const p of placed) {
                            if (
                                cand.x < p.x + p.w + GAP &&
                                cand.x + cand.w + GAP > p.x &&
                                cand.y < p.y + p.h + GAP &&
                                cand.y + cand.h + GAP > p.y
                            ) {
                                overlap = true;
                                break;
                            }
                        }

                        if (!overlap) {
                            placed.push(cand);
                            el.style.setProperty("--x", `${padL + SAFE + cand.x}px`);
                            el.style.setProperty("--y", `${padT + SAFE + cand.y}px`);
                            placedOK = true;
                            break;
                        }
                    }
                }

                // Fallback (rare): still non-clipping
                if (!placedOK) {
                    const x = padL + SAFE + 8 + (k * 17) % Math.max(20, W - w - 16);
                    const y = padT + SAFE + 8 + (k * 23) % Math.max(20, H - h - 16);
                    el.style.setProperty("--x", `${x}px`);
                    el.style.setProperty("--y", `${y}px`);
                }

                k++;
            }
        }






        // d3-force layout (no overlap) for absolutely-positioned chips.
        // Writes CSS vars --x/--y (top-left) just like your current engine.
        //
        // Options:
        //   animate: true  -> you will SEE the physics settle (positions update each tick)
        //   deterministic: true -> same seed => same layout (good for year scrub)
        //   stepsMax: hard cap on ticks in non-animated mode
        function forceLayout(container, elements, seedKey, opts = {}) {
            const {
                animate = false,
                deterministic = true,
                stepsMax = 1200,
                GAP = 6 // small visual breathing room only (chip-to-chip)
            } = opts;

            if (!elements.length) return;

            const d3ref = (window.d3 || globalThis.d3);
            if (!d3ref || !d3ref.forceSimulation) {
                console.warn("d3-force not found. Ensure d3 is loaded before techmap.js.");
                return;
            }

            const rect = container.getBoundingClientRect();
            const style = getComputedStyle(container);

            const padL = parseFloat(style.paddingLeft) || 0;
            const padR = parseFloat(style.paddingRight) || 0;
            const padT = parseFloat(style.paddingTop) || 0;
            const padB = parseFloat(style.paddingBottom) || 0;

            // Use REAL available size (no artificial minimums)
            const W = Math.max(0, rect.width - padL - padR);
            const H = Math.max(0, rect.height - padT - padB);

            // --- RNG (stable when deterministic) ---
            let seed = (deterministic ? (seedKey || 1) : (Date.now() & 0xffffffff)) >>> 0;
            function rand() {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            }

            const nodes = elements.map(el => {
                const s = parseFloat(getComputedStyle(el).getPropertyValue("--s")) || 1;
                const w = el.offsetWidth * s;
                const h = el.offsetHeight * s;

                // Collision radius (diagonal) + GAP for visual breathing room
                const r = (Math.hypot(w, h) * 0.5) + GAP;

                // Start anywhere inside the panel; bounds force will fix it
                const x = rand() * W;
                const y = rand() * H;

                return { el, w, h, r, x, y };
            });

            // Bounds force MUST clamp by half-width/half-height, not by collision radius.
            // Otherwise you create an "invisible margin" = r near edges.
            function forceBounds(width, height) {
                let nodesRef;
                function force() {
                    for (const n of nodesRef) {
                        const hw = n.w * 0.5;
                        const hh = n.h * 0.5;

                        n.x = Math.max(hw, Math.min(width - hw, n.x));
                        n.y = Math.max(hh, Math.min(height - hh, n.y));
                    }
                }
                force.initialize = _ => { nodesRef = _; };
                return force;
            }

            // Center the whole cluster within the panel after simulation
            function computeClusterShiftCentered() {
                let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;

                for (const n of nodes) {
                    const l = n.x - n.w * 0.5;
                    const t = n.y - n.h * 0.5;
                    minL = Math.min(minL, l);
                    minT = Math.min(minT, t);
                    maxR = Math.max(maxR, l + n.w);
                    maxB = Math.max(maxB, t + n.h);
                }

                const clusterW = maxR - minL;
                const clusterH = maxB - minT;

                // If the cluster is bigger than the panel, don't try to "center" it.
                const dx = (clusterW <= W) ? ((W - clusterW) / 2 - minL) : -minL;
                const dy = (clusterH <= H) ? ((H - clusterH) / 2 - minT) : -minT;

                return { dx, dy };
            }

            function applyPositions() {
                const { dx, dy } = computeClusterShiftCentered();

                for (const n of nodes) {
                    let left = (n.x - n.w * 0.5) + dx;
                    let top = (n.y - n.h * 0.5) + dy;

                    // Final clamp so entire pill stays inside panel
                    left = Math.max(0, Math.min(W - n.w, left));
                    top = Math.max(0, Math.min(H - n.h, top));

                    n.el.style.setProperty("--x", `${padL + left}px`);
                    n.el.style.setProperty("--y", `${padT + top}px`);
                }
            }

            const sim = d3ref.forceSimulation(nodes)
                .velocityDecay(0.28)
                .alpha(1)
                .alphaMin(0.001)
                .alphaDecay(0.08)
                .force("charge", d3ref.forceManyBody().strength(-22))
                .force("center", d3ref.forceCenter(W / 2, H / 2))
                .force("x", d3ref.forceX(W / 2).strength(0.05))
                .force("y", d3ref.forceY(H / 2).strength(0.05))
                .force("collide", d3ref.forceCollide()
                    .radius(d => d.r)
                    .strength(1)
                    .iterations(8)
                )
                .force("bounds", forceBounds(W, H));

            if (animate) {
                sim.on("tick", applyPositions);
                sim.on("end", () => { applyPositions(); sim.stop(); });
                return;
            }

            let steps = 0;
            while (sim.alpha() > sim.alphaMin() && steps < stepsMax) {
                sim.tick();
                steps++;
            }
            sim.stop();
            applyPositions();
        }



        function update(year) {
            yearLabel.textContent = year;
            yearLabel2.textContent = year;

            const active = [];
            const inactive = [];

            // First pass: classify and compute active list
            for (const t of techList) {
                const points = usageFor(t, year);
                const el = chips.get(t.name);
                if (!el) continue;

                el.style.setProperty("--p", Math.min(100, points * 10));


                if (points > 0) {
                    el.classList.add("is-active");
                    el.classList.remove("is-inactive");
                    active.push(el);
                } else {
                    el.classList.remove("is-active");
                    el.classList.add("is-inactive");
                    inactive.push(el);
                }
            }

            // Density factor based on how many are active this year
            const activeCount = active.length;
            const density =
                activeCount > 14 ? 0.70 :
                    activeCount > 10 ? 0.78 :
                        activeCount > 7 ? 0.86 :
                            1.00;

            // Second pass: set scale with density and caps
            const allScale = allPlaneScaleFor(allPlane);
            const activeScale = activePlaneScaleFor(activePlane);

            for (const t of techList) {
                const points = usageFor(t, year);
                const el = chips.get(t.name);
                if (!el) continue;

                const base = scaleFromPoints(points);              // 0..10 -> scale
                const scaled = Math.min(base * density, 1.55);     // cap for big bubbles

                if (points > 0) {
                    // Active plane: usage-driven sizing
                    el.style.setProperty("--s", (scaled * activeScale).toFixed(3));
                } else {
                    // All Technologies plane: responsive-only sizing (not usage-driven)
                    el.style.setProperty("--s", allScale.toFixed(3));
                }
            }

            // Move elements to correct plane
            active.forEach(el => { if (el.parentElement !== activePlane) activePlane.appendChild(el); });
            inactive.forEach(el => { if (el.parentElement !== allPlane) allPlane.appendChild(el); });

            requestAnimationFrame(() => {
                // forceLayout(activePlane, active, year);
                forceLayout(activePlane, active, year, { deterministic: false, animate: false });

                forceLayout(allPlane, inactive, year + 999);
            });
        }


        // Re-pack on resize
        window.addEventListener("resize", () => update(+slider.value));

        slider.addEventListener("input", () => update(+slider.value));
        update(+slider.value);
    }

    init();
})();
const btnBack = document.getElementById("btnBack");
if (btnBack) {
    btnBack.addEventListener("click", (e) => {
        // If there is history, behave like browser back
        // (covers "came from another page" cases)
        if (window.history.length > 1) {
            e.preventDefault();
            window.history.back();
            return;
        }

        // No history (opened directly/new tab) -> use the normal link href
        // (do not preventDefault)
    });
}

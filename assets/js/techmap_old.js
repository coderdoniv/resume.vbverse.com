
(() => {
    const dataEl = document.getElementById("tech-usage-data");
    const slider = document.getElementById("yearSlider");
    const yearLabel = document.getElementById("yearLabel");
    const yearLabel2 = document.getElementById("yearLabel2");
    const ticks = document.getElementById("yearTicks");
    const activePlane = document.getElementById("activePlane");
    const allPlane = document.getElementById("allPlane");

    if (!dataEl || !slider || !activePlane || !allPlane) return;

    const data = JSON.parse(dataEl.textContent);
    const years = (data.years || []).slice().sort((a, b) => a - b);
    const techList = data.tech || [];

    // Slider setup
    slider.min = years[0];
    slider.max = years[years.length - 1];
    slider.step = 1;
    slider.value = slider.max;

    // Render year ticks
    ticks.innerHTML = years.map(y => `<span>${y}</span>`).join("");

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
            SAFE = 34,
            GAP = 12
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

        const W = Math.max(260, rect.width - padL - padR - SAFE * 2);
        const H = Math.max(180, rect.height - padT - padB - SAFE * 2);

        // --- RNG (stable when deterministic) ---
        let seed = (deterministic ? (seedKey || 1) : (Date.now() & 0xffffffff)) >>> 0;
        function rand() {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        }

        // Build nodes using intended rendered size (offset * scale)
        const nodes = elements.map(el => {
            const s = parseFloat(getComputedStyle(el).getPropertyValue("--s")) || 1;
            const w = el.offsetWidth * s;
            const h = el.offsetHeight * s;

            // IMPORTANT: pill-safe collision radius = half-diagonal, not half-max
            // This is what eliminates your remaining overlaps.
            const r = (Math.hypot(w, h) * 0.5) + GAP;

            // Start within bounds; center coords are in [r, W-r], [r, H-r]
            const x = r + rand() * (W - 2 * r);
            const y = r + rand() * (H - 2 * r);

            return { el, w, h, r, x, y };
        });

        // Keep nodes inside the plane (center coords).
        // Use radius clamp so even big pills never clip.
        function forceBounds(width, height) {
            let nodesRef;
            function force() {
                for (const n of nodesRef) {
                    n.x = Math.max(n.r, Math.min(width - n.r, n.x));
                    n.y = Math.max(n.r, Math.min(height - n.r, n.y));
                }
            }
            force.initialize = _ => { nodesRef = _; };
            return force;
        }

        // Position writer (center -> top-left)
        const applyPositions = () => {
            for (const n of nodes) {
                const left = (n.x - n.w * 0.5);
                const top = (n.y - n.h * 0.5);
                n.el.style.setProperty("--x", `${padL + SAFE + left}px`);
                n.el.style.setProperty("--y", `${padT + SAFE + top}px`);
            }
        };

        // Slightly stronger collision + a bit more repulsion.
        // These defaults are tuned for your chip counts.
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
            // You will SEE it move.
            sim.on("tick", applyPositions);

            // Stop once settled (also ensures final clamp applied)
            sim.on("end", () => {
                applyPositions();
                sim.stop();
            });

            return; // let it run async
        }

        // Non-animated: run until it cools (deterministic final layout)
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

            el.style.setProperty("--p", points);

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
        for (const t of techList) {
            const points = usageFor(t, year);
            const el = chips.get(t.name);
            if (!el) continue;

            const base = scaleFromPoints(points);        // your 0..10 -> scale fn
            const scaled = Math.min(base * density, 1.55); // hard cap for big bubbles

            // Inactive bubbles should never be large (keeps bottom plane tidy)
            const finalScale = points > 0 ? scaled : Math.min(scaled, 0.92);

            el.style.setProperty("--s", finalScale.toFixed(3));
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
})();

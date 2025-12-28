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





    
// Physics-style layout (self-contained "mini physics engine" for static pages)
// Uses circle-based collision + gentle repulsion to keep an organic scattered look.
function forceLayout(container, elements, seedKey) {
    if (!elements.length) return;

    const rect = container.getBoundingClientRect();
    const style = getComputedStyle(container);

    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const padT = parseFloat(style.paddingTop) || 0;
    const padB = parseFloat(style.paddingBottom) || 0;

    const SAFE = 34;     // protects glow / rounded corners
    const GAP = 12;      // minimum spacing between bubbles

    const W = Math.max(260, rect.width  - padL - padR - SAFE * 2);
    const H = Math.max(180, rect.height - padT - padB - SAFE * 2);

    // seeded RNG for stable layouts per year (no jitter between refreshes)
    let seed = (seedKey || 1) >>> 0;
    function rand() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    }

    // Build nodes using *intended rendered size* (base size * scale)
    const nodes = elements.map(el => {
        const s = parseFloat(getComputedStyle(el).getPropertyValue("--s")) || 1;
        const w = el.offsetWidth  * s;
        const h = el.offsetHeight * s;
        const r = Math.max(w, h) * 0.5 + GAP;

        // init with stratified randomness so we use the whole area
        const x = rand() * Math.max(0, W) ;
        const y = rand() * Math.max(0, H) ;

        return { el, w, h, r, x, y, vx: 0, vy: 0 };
    });

    // Place large nodes first improves stability
    nodes.sort((a, b) => (b.r - a.r));

    const ITER = 220;
    const DAMP = 0.86;
    const CENTER = 0.0012;     // pull toward center (prevents edge stacking)
    const CHARGE = 0.0025;     // gentle global repulsion
    const SOLVER = 5;          // collision passes per iteration

    for (let it = 0; it < ITER; it++) {

        // global charge + centering (cheap)
        for (const n of nodes) {
            const cx = (W * 0.5) - n.x;
            const cy = (H * 0.5) - n.y;
            n.vx += cx * CENTER;
            n.vy += cy * CENTER;
        }

        // pairwise forces + collisions (n is small; O(n^2) fine)
        for (let pass = 0; pass < SOLVER; pass++) {
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i], b = nodes[j];

                    let dx = a.x - b.x;
                    let dy = a.y - b.y;
                    let d2 = dx * dx + dy * dy;

                    // avoid zero division
                    if (d2 < 0.0001) {
                        dx = (rand() - 0.5) * 0.01;
                        dy = (rand() - 0.5) * 0.01;
                        d2 = dx * dx + dy * dy;
                    }

                    const d = Math.sqrt(d2);
                    const minD = a.r + b.r;

                    // always apply a tiny repulsion so things stay "cloudy"
                    const f = CHARGE / d2;
                    a.vx += dx * f;
                    a.vy += dy * f;
                    b.vx -= dx * f;
                    b.vy -= dy * f;

                    // hard collision separation (guarantees no overlap)
                    if (d < minD) {
                        const push = (minD - d) / 2;
                        const nx = dx / d;
                        const ny = dy / d;

                        a.x += nx * push;
                        a.y += ny * push;
                        b.x -= nx * push;
                        b.y -= ny * push;
                    }
                }
            }

            // keep within bounds after collision pass
            for (const n of nodes) {
                n.x = Math.max(n.r, Math.min(W - n.r, n.x));
                n.y = Math.max(n.r, Math.min(H - n.r, n.y));
            }
        }

        // integrate velocities
        for (const n of nodes) {
            n.vx *= DAMP;
            n.vy *= DAMP;
            n.x += n.vx;
            n.y += n.vy;

            n.x = Math.max(n.r, Math.min(W - n.r, n.x));
            n.y = Math.max(n.r, Math.min(H - n.r, n.y));
        }
    }

    // Apply positions (convert center -> top-left)
    for (const n of nodes) {
        const left = (n.x - n.w * 0.5);
        const top  = (n.y - n.h * 0.5);
        n.el.style.setProperty("--x", `${padL + SAFE + left}px`);
        n.el.style.setProperty("--y", `${padT + SAFE + top}px`);
    }
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
            forceLayout(activePlane, active, year);
            forceLayout(allPlane, inactive, year + 999);
        });
    }


    // Re-pack on resize
    window.addEventListener("resize", () => update(+slider.value));

    slider.addEventListener("input", () => update(+slider.value));
    update(+slider.value);
})();

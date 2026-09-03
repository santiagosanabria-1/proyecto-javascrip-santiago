/**

const AnimUtils = (() => {
    const hasGSAP = typeof gsap !== "undefined";
    if (hasGSAP && typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

    // Breakpoints reales para gsap.matchMedia(): desktop conserva pin/
    // parallax/tilt 3D; mobile recibe una versión ligera (fade + stagger),
    // no la misma animación "reducida a la fuerza".
    const BP = {
        desktop: "(min-width: 900px)",
        mobile: "(max-width: 899px)",
        reduced: "(prefers-reduced-motion: reduce)"
    };
    const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
    const prefersReduced = () => matchMedia(BP.reduced).matches;

    function showAll(nodeList) {
        nodeList.forEach((el) => {
            el.style.opacity = 1;
            el.style.transform = "none";
        });
    }

    /**
     * Red de seguridad: si el navegador deja de servir frames (pestaña en
     * segundo plano, ticker de GSAP estancado), setTimeout no depende de
     * rAF y garantiza que el contenido no quede invisible para siempre.
     */
    function safetyReveal(nodeList, delay = 1800) {
        if (!nodeList || !nodeList.length) return;
        setTimeout(() => {
            nodeList.forEach((el) => {
                if (parseFloat(getComputedStyle(el).opacity) < 0.05) {
                    el.style.opacity = 1;
                    el.style.transform = "none";
                }
            });
        }, delay);
    }

    /** Envuelve cada letra en <span> para un reveal tipográfico real, sin
     *  depender del plugin de pago SplitText. Idempotente. */
    function splitWords(el) {
        if (!el || el.dataset.split === "done") return el.querySelectorAll(".word > .char");
        const text = el.textContent;
        el.dataset.split = "done";
        el.innerHTML = text
            .split(" ")
            .map(
                (word) =>
                    `<span class="word">${word
                        .split("")
                        .map((ch) => `<span class="char">${ch}</span>`)
                        .join("")}</span>`
            )
            .join(" ");
        return el.querySelectorAll(".word > .char");
    }

    /**
     * Reveal en stagger para grids que se regeneran muchas veces en la vida
     * de la página (cartelera al buscar/filtrar/paginar, showtimes al
     * cambiar de fecha, ratings al enviar). A propósito NO usa
     * gsap.matchMedia(): esa API registra un contexto permanente por
     * llamada y aquí se llama repetidamente, lo que acumularía contextos
     * húérfanos para siempre (bug real detectado en la auditoría). En su
     * lugar usa `ScrollTrigger.batch`, la técnica que GSAP documenta para
     * listas dinámicas: cada elemento revela al entrar por sí solo, no todo
     * el contenedor de una vez -- imprescindible para que el infinite
     * scroll no anime 60 cards de golpe.
     */
    function batchReveal(container, itemSelector = ":scope > *") {
        const root = typeof container === "string" ? document.querySelector(container) : container;
        if (!root) return;
        batchRevealItems(root.querySelectorAll(itemSelector));
    }

    /**
     * Igual que `batchReveal`, pero recibe directamente los elementos a
     * revelar (NodeList/array) en vez de un selector. La usa la cartelera
     * paginada para animar SOLO las cards recién agregadas en cada
     * "página" de infinite scroll, sin volver a tocar las que ya se
     * revelaron (evitaría recrear ScrollTriggers innecesarios sobre todo
     * el grid completo cada vez que crece).
     */
    function batchRevealItems(items) {
        if (!items || !items.length) return;
        if (!hasGSAP || prefersReduced()) {
            showAll(items);
            return;
        }
        ScrollTrigger.batch(items, {
            start: "top 90%",
            once: true,
            onEnter: (batch) =>
                gsap.fromTo(
                    batch,
                    { opacity: 0, y: 46, rotateX: -12, scale: 0.94, transformPerspective: 800 },
                    { opacity: 1, y: 0, rotateX: 0, scale: 1, duration: 0.75, stagger: 0.07, ease: "power3.out", overwrite: true }
                )
        });
        safetyReveal(items);
    }

    return { hasGSAP, BP, isTouch, prefersReduced, showAll, safetyReveal, splitWords, batchReveal, batchRevealItems };
})();

const Animations = (() => {
    const { hasGSAP } = AnimUtils;

    // -----------------------------------------------------------------
    // Navbar: condensación + blur progresivo con el scroll.
    // -----------------------------------------------------------------
    function initNavbar() {
        const nav = document.querySelector("[data-navbar]");
        if (!nav || !hasGSAP) return;
        ScrollTrigger.create({
            start: 24,
            onUpdate: (self) => nav.classList.toggle("is-condensed", self.scroll() > 24),
            onRefresh: (self) => nav.classList.toggle("is-condensed", self.scroll() > 24)
        });
    }

    // -----------------------------------------------------------------
    // Reveal compartido por cartelera / reparto / funciones / valoraciones.
    // -----------------------------------------------------------------
    function initRevealGrid(container, itemSelector) {
        AnimUtils.batchReveal(container, itemSelector);
    }

    /** Variante que recibe directamente los elementos nuevos a revelar
     *  (infinite scroll: solo la página recién agregada, no todo el grid). */
    function initRevealItems(items) {
        AnimUtils.batchRevealItems(items);
    }

    // -----------------------------------------------------------------
    // Modal de trailer: reveal con mask/scale.
    // -----------------------------------------------------------------
    function playModalReveal(modal) {
        const panel = modal.querySelector(".trailer-modal__panel");
        if (!hasGSAP || !panel) return;
        gsap.fromTo(
            panel,
            { scale: 0.86, opacity: 0, clipPath: "inset(10% 10% 10% 10% round 24px)" },
            { scale: 1, opacity: 1, clipPath: "inset(0% 0% 0% 0% round 18px)", duration: 0.55, ease: "power3.out" }
        );
    }

    // -----------------------------------------------------------------
    // Transición "cinematográfica" entre pasos (checkout -> ticket).
    // -----------------------------------------------------------------
    function viewTransition(fromEl, toEl) {
        // El cambio de vista es un requisito FUNCIONAL (el ticket debe
        // mostrarse siempre que la compra se guardó) — nunca debe depender
        // de que una animación llegue a completarse. Se aplica de inmediato
        // y GSAP solo aporta la coreografía visual por encima, si está listo.
        fromEl.classList.add("hidden");
        toEl.classList.remove("hidden");
        toEl.classList.add("flex");

        if (!hasGSAP) return;
        gsap.fromTo(toEl, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });

        // El ticket es el momento de mayor impacto de toda la compra: un
        // flip 3D real (como girar una entrada física hacia el usuario),
        // no un fade genérico más.
        const ticket = toEl.querySelector(".ticket");
        const reveals = Array.from(toEl.querySelectorAll("[data-ticket-reveal]")).filter((el) => el !== ticket);

        if (ticket && !AnimUtils.prefersReduced()) {
            gsap.fromTo(
                ticket,
                { rotateY: -110, opacity: 0, transformPerspective: 1400, transformOrigin: "left center" },
                { rotateY: 0, opacity: 1, duration: 0.9, ease: "power3.out", delay: 0.1 }
            );
            AnimUtils.safetyReveal([ticket]);
        } else if (ticket) {
            gsap.set(ticket, { opacity: 1, rotateY: 0 });
        }

        gsap.fromTo(reveals, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, delay: ticket ? 0.55 : 0.15 });
        AnimUtils.safetyReveal(reveals);
    }

    return { initNavbar, initRevealGrid, initRevealItems, playModalReveal, viewTransition };
})();

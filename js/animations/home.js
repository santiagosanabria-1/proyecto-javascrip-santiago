/**
 * js/animations/home.js
 * Animaciones exclusivas de index.html: hero cinematográfico con pin real
 * y galería 3D con carrusel pineado + snap. Requiere que
 * js/animations/global.js se haya cargado antes (usa `AnimUtils` y
 * completa el namespace `Animations`).
 */
Object.assign(
    Animations,
    (() => {
        const { hasGSAP, BP, showAll, safetyReveal, splitWords } = AnimUtils;

        // ---------------------------------------------------------------
        // Hero: entrada tipográfica + pin real en desktop (el backdrop
        // escala/difumina y el contenido se retira mientras el scroll
        // queda "anclado" un tramo, antes de liberar la cartelera).
        // ---------------------------------------------------------------
        function initHero(heroSelector = "[data-hero]") {
            const hero = document.querySelector(heroSelector);
            if (!hero) return;

            const backdrop = hero.querySelector("[data-hero-backdrop]");
            const titleEl = hero.querySelector("[data-hero-title]");
            const meta = hero.querySelectorAll("[data-hero-reveal]");
            const content = hero.querySelector(".hero__content");
            const farLayer = hero.querySelector("[data-hero-parallax-far]");
            const nearLayer = hero.querySelector("[data-hero-parallax-near]");

            if (!hasGSAP) {
                showAll(meta);
                return;
            }

            const mm = gsap.matchMedia();
            mm.add(BP, (ctx) => {
                const { desktop, reduced } = ctx.conditions;
                const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

                if (backdrop) {
                    tl.fromTo(
                        backdrop,
                        { scale: reduced ? 1 : 1.18, opacity: 0, filter: "blur(18px)" },
                        { scale: 1, opacity: 1, filter: "blur(0px)", duration: 1.3 }
                    );
                }

                let chars = null;
                if (titleEl && !reduced) {
                    chars = splitWords(titleEl);
                    tl.fromTo(
                        chars,
                        { yPercent: 120, opacity: 0, rotateX: -60 },
                        { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.9, stagger: 0.018, ease: "back.out(1.6)" },
                        "-=0.7"
                    );
                } else if (titleEl) {
                    gsap.set(titleEl, { opacity: 1 });
                }

                if (meta.length) tl.fromTo(meta, { opacity: 0, y: reduced ? 0 : 24 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, "-=0.5");
                safetyReveal(meta);
                if (chars) safetyReveal(chars);

                if (reduced) return () => tl.kill();

                if (desktop) {
                    // Pin real: la sección queda anclada un tramo de scroll
                    // mientras backdrop/contenido se transforman -- la
                    // "narrativa de scroll cinematográfico" pedida.
                    const pinTl = gsap.timeline({
                        scrollTrigger: { trigger: hero, start: "top top", end: "+=70%", scrub: 0.6, pin: true }
                    });
                    if (backdrop) pinTl.to(backdrop, { scale: 1.12, filter: "blur(6px)", ease: "none" }, 0);
                    if (content) pinTl.to(content, { yPercent: -16, opacity: 0.15, ease: "none" }, 0);
                    if (farLayer) pinTl.to(farLayer, { yPercent: 30, ease: "none" }, 0);
                    if (nearLayer) pinTl.to(nearLayer, { yPercent: -18, ease: "none" }, 0);
                } else if (backdrop) {
                    // Mobile: parallax simple, sin pin (evita jank táctil y
                    // el salto de layout que el pin provoca en pantallas chicas).
                    gsap.to(backdrop, {
                        yPercent: 8,
                        ease: "none",
                        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 }
                    });
                }

                return () => tl.kill();
            });
        }

        // ---------------------------------------------------------------
        // Galería 3D: arco de pósters. Reveal en stagger al entrar +
        // una rotación MUY sutil del arco ligada al scroll (scrub, sin
        // pin). Sin pin a propósito: un `pin` sobre este elemento lo pasa
        // a `position:fixed`, y por las reglas de pintado de CSS eso lo
        // dibuja SIEMPRE por encima del contenido no posicionado que lo
        // rodea (la grilla de "En cartelera"), sin importar el orden del
        // DOM -- eso era el "glitch" reportado: el arco flotando encima de
        // las cards. Sin pin no hay stacking-context nuevo, así que nunca
        // puede taparlas.
        // ---------------------------------------------------------------
        function initGallery3D(sectionSelector = "[data-gallery]") {
            const section = document.querySelector(sectionSelector);
            if (!section) return;
            const track = section.querySelector("[data-gallery-track]");
            const cards = section.querySelectorAll("[data-gallery-card]");
            if (!track || !cards.length) return;

            const total = cards.length;
            const spread = 58;
            cards.forEach((card, i) => {
                const t = total > 1 ? i / (total - 1) : 0.5;
                const angle = (t - 0.5) * spread;
                const depth = Math.cos((angle * Math.PI) / 180);
                card.style.setProperty("--angle", `${angle}deg`);
                card.style.setProperty("--depth", depth.toFixed(3));
            });

            if (!hasGSAP) {
                showAll(cards);
                return;
            }

            const mm = gsap.matchMedia();
            mm.add(BP, (ctx) => {
                const { desktop, reduced } = ctx.conditions;

                gsap.set(cards, { opacity: 0, y: 60 });
                gsap.to(cards, {
                    opacity: 1,
                    y: 0,
                    stagger: 0.045,
                    duration: 0.8,
                    ease: "power3.out",
                    scrollTrigger: { trigger: section, start: "top 85%", once: true }
                });
                safetyReveal(cards);

                if (reduced || !desktop) return () => {};

                const rotTween = gsap.fromTo(
                    track,
                    { rotateY: -6 },
                    { rotateY: 6, ease: "none", scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 1 } }
                );
                return () => rotTween.kill();
            });
        }

        return { initHero, initGallery3D };
    })()
);

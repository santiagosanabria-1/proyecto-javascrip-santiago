/**
 * js/animations/movie.js
 * Animaciones exclusivas de pelicula.html: tilt-in 3D del póster + parallax
 * del backdrop + tilt interactivo con el cursor (solo desktop/no-touch).
 * Requiere js/animations/global.js cargado antes.
 */
Object.assign(
    Animations,
    (() => {
        const { hasGSAP, BP, isTouch, showAll, safetyReveal } = AnimUtils;

        function initDetailReveal() {
            const poster = document.querySelector("[data-detail-poster-wrap]");
            const backdrop = document.querySelector("[data-detail-backdrop]");
            const meta = document.querySelectorAll("[data-detail-reveal]");

            if (!hasGSAP) {
                showAll(meta);
                return;
            }

            const mm = gsap.matchMedia();
            mm.add(BP, (ctx) => {
                const { reduced } = ctx.conditions;
                const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

                if (backdrop) tl.fromTo(backdrop, { scale: reduced ? 1 : 1.15, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1 }, 0);
                if (poster) {
                    tl.fromTo(
                        poster,
                        { opacity: 0, rotateY: reduced ? 0 : -26, rotateX: reduced ? 0 : 6, y: reduced ? 0 : 30, transformPerspective: 1000 },
                        { opacity: 1, rotateY: 0, rotateX: 0, y: 0, duration: 1 },
                        0.15
                    );
                }
                if (meta.length) tl.fromTo(meta, { opacity: 0, y: reduced ? 0 : 22 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.09 }, "-=0.6");
                safetyReveal(meta);
                if (poster) safetyReveal([poster]);

                // Tilt interactivo con el cursor: solo tiene sentido con
                // mouse real (en touch no hay "hover" que seguir).
                if (poster && !reduced && !isTouch) {
                    const onMove = (e) => {
                        const rect = poster.getBoundingClientRect();
                        const rx = ((e.clientY - rect.top) / rect.height - 0.5) * -14;
                        const ry = ((e.clientX - rect.left) / rect.width - 0.5) * 14;
                        gsap.to(poster, { rotateX: rx, rotateY: ry, duration: 0.4, ease: "power2.out" });
                    };
                    const onLeave = () => gsap.to(poster, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power3.out" });
                    poster.addEventListener("mousemove", onMove);
                    poster.addEventListener("mouseleave", onLeave);
                    return () => {
                        poster.removeEventListener("mousemove", onMove);
                        poster.removeEventListener("mouseleave", onLeave);
                        tl.kill();
                    };
                }

                return () => tl.kill();
            });
        }

        return { initDetailReveal };
    })()
);

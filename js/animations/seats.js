/**
 * js/animations/seats.js
 * Animación exclusiva de funcion.html: el mapa de asientos "arma" en 3D
 * al pintarse -- cada fila entra rotando desde el fondo de la sala
 * (rotateX + translateZ, como si se acomodara hacia el espectador), en
 * stagger fila por fila. Sin `pin` (aprendizaje del bug de la galería: un
 * elemento pineado pasa a position:fixed y se pinta siempre por encima del
 * contenido no posicionado que lo rodea) -- acá no hace falta pin porque
 * el mapa ya está a la vista al cargar la página, el 3D es solo de entrada.
 * Requiere js/animations/global.js cargado antes.
 */
Object.assign(Animations, {
    initSeatMapReveal(containerSelector = "[data-seat-map]") {
        const { hasGSAP, prefersReduced, showAll, safetyReveal } = AnimUtils;
        const container = document.querySelector(containerSelector);
        if (!container) return;
        const rows = container.querySelectorAll(".seat-row");
        if (!rows.length) return;

        if (!hasGSAP || prefersReduced()) {
            showAll(rows);
            return;
        }

        gsap.set(rows, { transformOrigin: "50% 50% -40px" });
        ScrollTrigger.batch(rows, {
            start: "top 95%",
            once: true,
            onEnter: (batch) =>
                gsap.fromTo(
                    batch,
                    { opacity: 0, rotateX: -50, z: -220, y: 26 },
                    { opacity: 1, rotateX: 0, z: 0, y: 0, duration: 0.75, stagger: 0.07, ease: "power3.out", overwrite: true }
                )
        });
        safetyReveal(rows);
    }
});

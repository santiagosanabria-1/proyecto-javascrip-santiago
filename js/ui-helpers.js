/**
 * js/ui-helpers.js
 * Helpers de UI reutilizables entre páginas: estados (loading/error/empty),
 * formato de datos y el modal de trailer. Sin lógica de negocio.
 */

function showLoading(container, message = "Cargando...") {
    container.innerHTML = `
        <div class="state-block">
            <span class="spinner" aria-hidden="true"></span>
            <p class="state-block__text">${message}</p>
        </div>`;
}

function showError(container, message = "Ocurrió un error inesperado. Intenta nuevamente.") {
    container.innerHTML = `
        <div class="state-block state-block--error">
            <span class="state-block__icon">✕</span>
            <p class="state-block__text">${message}</p>
        </div>`;
}

function showEmpty(container, message = "No se encontraron resultados.") {
    container.innerHTML = `
        <div class="state-block">
            <span class="state-block__icon">—</span>
            <p class="state-block__text">${message}</p>
        </div>`;
}

function formatCurrency(amount) {
    return `$${Number(amount).toLocaleString("es-CL")}`;
}

function formatRuntime(minutes) {
    if (!minutes && minutes !== 0) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const [year, month, day] = dateStr.split("-");
    const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    return `${day} ${months[parseInt(month, 10) - 1]}`;
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function debounce(fn, delay = 400) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Hashea texto con SHA-256 usando Web Crypto (nativa del navegador, sin
 * librerías externas). Se usa para nunca guardar/transmitir la contraseña
 * en texto plano hacia JSON Server. Nivel demo: sin salt ni servidor real
 * que verifique — suficiente para este proyecto, no para producción.
 */
async function hashPassword(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Pinta el estado de sesión en el `<span data-auth-slot>` del navbar (las
 * 4 páginas comparten el mismo marcado). Logueado: nombre + "Cerrar
 * sesión". Sin sesión: enlace a login.html. Centralizado acá para no
 * repetir el mismo HTML/lógica en cada página.
 */
function renderAuthState() {
    const slot = document.querySelector("[data-auth-slot]");
    if (!slot) return;
    const user = AuthStore.get();

    if (!user) {
        slot.innerHTML = `<a href="login.html" class="btn btn-gold">👤 Iniciar sesión</a>`;
        return;
    }

    const firstName = user.name.split(" ")[0];
    const initial = firstName[0].toUpperCase();
    slot.innerHTML = `
        <span class="auth-chip">
            <span class="auth-chip__avatar">${initial}</span>
            <span class="auth-chip__name">${firstName}</span>
            <a href="mis-tickets.html" class="btn btn-outline">🎟️ Mis tickets</a>
            <button class="btn btn-ghost" data-logout type="button">Cerrar sesión</button>
        </span>`;
    slot.querySelector("[data-logout]").addEventListener("click", () => {
        AuthStore.clear();
        showToast("Sesión cerrada.");
        renderAuthState();
    });
}

/** Placeholder de retrato cuando TMDB no entrega profile_path. */
function actorAvatarMarkup(name) {
    const initials = (name || "?")
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    return `<div class="actor-card__avatar actor-card__avatar--placeholder">${initials}</div>`;
}

// ---------------------------------------------------------------------------
// Modal de trailer (YouTube embebido, sin audio automático)
// ---------------------------------------------------------------------------
function ensureTrailerModal() {
    let modal = document.getElementById("trailer-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "trailer-modal";
    modal.className = "trailer-modal";
    modal.innerHTML = `
        <div class="trailer-modal__backdrop" data-trailer-close></div>
        <div class="trailer-modal__panel">
            <button class="trailer-modal__close" data-trailer-close aria-label="Cerrar trailer">✕</button>
            <div class="trailer-modal__frame" data-trailer-frame></div>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-trailer-close]").forEach((el) => el.addEventListener("click", closeTrailerModal));
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeTrailerModal();
    });
    return modal;
}

function openTrailerModal(youtubeKey) {
    if (!youtubeKey) {
        showToast("Esta película no tiene trailer disponible en TMDB.");
        return;
    }
    const modal = ensureTrailerModal();
    const frame = modal.querySelector("[data-trailer-frame]");
    // mute=1: TMDB/YouTube exige mute para permitir autoplay; el usuario
    // controla el sonido desde los controles del propio player.
    frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${youtubeKey}?autoplay=1&mute=1&rel=0"
        title="Trailer" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    modal.classList.add("is-open");
    document.body.classList.add("no-scroll");
    if (typeof Animations !== "undefined") Animations.playModalReveal(modal);
}

function closeTrailerModal() {
    const modal = document.getElementById("trailer-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    const frame = modal.querySelector("[data-trailer-frame]");
    if (frame) frame.innerHTML = "";
}

// ---------------------------------------------------------------------------
// Toast simple (reemplaza alert() para mensajes no bloqueantes)
// ---------------------------------------------------------------------------
function showToast(message, variant = "info") {
    let host = document.getElementById("toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "toast-host";
        host.className = "toast-host";
        document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast--${variant}`;
    toast.textContent = message;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
        toast.classList.remove("is-visible");
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}

// La navbar, el estado de sesión y el scroll-to son comunes a las 4 páginas.
document.addEventListener("DOMContentLoaded", () => {
    if (typeof Animations !== "undefined") Animations.initNavbar();
    renderAuthState();
    document.querySelectorAll("[data-scroll-to]").forEach((link) => {
        link.addEventListener("click", (e) => {
            const target = document.querySelector(link.dataset.scrollTo);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
});

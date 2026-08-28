/**
 * js/login.js
 * Lógica de login.html: registro/inicio de sesión reales contra JSON
 * Server (colección `users`). La contraseña nunca se guarda ni se
 * compara en texto plano -- se hashea con `hashPassword()` (Web Crypto,
 * ver js/ui-helpers.js) antes de tocar la red.
 */
document.addEventListener("DOMContentLoaded", () => {
    // Ya hay sesión activa: no tiene sentido mostrar el login de nuevo.
    if (AuthStore.get()) {
        window.location.href = "index.html";
        return;
    }

    loadBackground();
    initTabs();
    initSignIn();
    initSignUp();
});

/** Fondo "vivo" tipo video: crossfade Ken Burns entre 3 backdrops reales
 *  de la programación del cine (billboard) -- sin video ni librería externa. */
async function loadBackground() {
    const layers = document.querySelectorAll("[data-bg-layer]");
    if (!layers.length) return;
    try {
        const billboard = await CINE.getBillboard();
        const tmdbIds = billboard.slice(0, 3).map((b) => b.tmdbId);
        const movies = await TMDB.getMoviesByIds(tmdbIds);
        movies.forEach((movie, i) => {
            if (layers[i]) layers[i].style.backgroundImage = `url('${TMDB.imageUrl(movie.backdrop_path, "w1280")}')`;
        });
    } catch (err) {
        console.error("No se pudo cargar el fondo de la pantalla de login:", err);
        // La animación de fondo es decorativa: si TMDB falla, el degradado
        // sólido de .login-bg__scrim ya deja la pantalla utilizable.
    }
}

function initTabs() {
    const tabs = document.querySelectorAll("[data-tab]");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("is-active"));
            tab.classList.add("is-active");
            document.querySelectorAll("[data-form]").forEach((form) => {
                form.classList.toggle("hidden", form.dataset.form !== tab.dataset.tab);
            });
        });
    });
}

function showFieldError(el, message) {
    if (!el) return;
    el.querySelector("span").textContent = message;
    el.classList.remove("hidden");
}

function hideFieldError(el) {
    if (el) el.classList.add("hidden");
}

function initSignIn() {
    const form = document.querySelector('[data-form="signin"]');
    if (!form) return;
    const errorEl = document.querySelector("[data-signin-error]");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideFieldError(errorEl);

        const email = document.querySelector("[data-signin-email]").value.trim();
        const password = document.querySelector("[data-signin-password]").value;
        if (!email || !password) {
            showFieldError(errorEl, "Completa correo y contraseña.");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            const user = await CINE.getUserByEmail(email);
            if (!user) {
                showFieldError(errorEl, "No existe ninguna cuenta con ese correo. Prueba crear una.");
                return;
            }
            const passwordHash = await hashPassword(password);
            if (passwordHash !== user.passwordHash) {
                showFieldError(errorEl, "La contraseña es incorrecta.");
                return;
            }
            AuthStore.set(user);
            showToast(`¡Bienvenido de nuevo, ${user.name.split(" ")[0]}!`);
            window.location.href = "index.html";
        } catch (err) {
            showFieldError(errorEl, err.message || "No se pudo iniciar sesión. Intenta nuevamente.");
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function initSignUp() {
    const form = document.querySelector('[data-form="signup"]');
    if (!form) return;
    const errorEl = document.querySelector("[data-signup-error]");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideFieldError(errorEl);

        const name = document.querySelector("[data-signup-name]").value.trim();
        const email = document.querySelector("[data-signup-email]").value.trim();
        const password = document.querySelector("[data-signup-password]").value;

        if (!name) return showFieldError(errorEl, "Ingresa tu nombre completo.");
        if (!/.+@.+\..+/.test(email)) return showFieldError(errorEl, "Ingresa un correo electrónico válido.");
        if (password.length < 6) return showFieldError(errorEl, "La contraseña debe tener al menos 6 caracteres.");

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            const existing = await CINE.getUserByEmail(email);
            if (existing) {
                showFieldError(errorEl, "Ya existe una cuenta con ese correo. Prueba iniciar sesión.");
                return;
            }
            const passwordHash = await hashPassword(password);
            const user = await CINE.createUser({ name, email, passwordHash });
            AuthStore.set(user);
            showToast(`¡Cuenta creada! Bienvenido, ${name.split(" ")[0]}.`);
            window.location.href = "index.html";
        } catch (err) {
            showFieldError(errorEl, err.message || "No se pudo crear la cuenta. Intenta nuevamente.");
        } finally {
            submitBtn.disabled = false;
        }
    });
}

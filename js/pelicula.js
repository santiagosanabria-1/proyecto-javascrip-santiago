/**
 * js/pelicula.js
 * Lógica de pelicula.html: detalle real de TMDB (ficha, reparto, trailer)
 * + funciones propias del cine (JSON Server) + valoraciones.
 */
let pelicula_tmdbId = null;
let pelicula_functionsByDate = {};
let pelicula_activeDate = null;

document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector("[data-detail-title]");
    if (!root) return;

    pelicula_tmdbId = getQueryParam("id");
    if (!pelicula_tmdbId) {
        showFatalError("No se indicó ninguna película. Vuelve a la cartelera e intenta de nuevo.");
        return;
    }

    loadMovieDetails();
    loadFunctions();
    loadRatings();
    initRatingForm();
});

function showFatalError(message) {
    const title = document.querySelector("[data-detail-title]");
    const overview = document.querySelector("[data-detail-overview]");
    if (title) title.textContent = "No se pudo cargar la película";
    if (overview) overview.textContent = message;
}

async function loadMovieDetails() {
    try {
        const [movie, credits, videos] = await Promise.all([
            TMDB.getMovieDetails(pelicula_tmdbId),
            TMDB.getMovieCredits(pelicula_tmdbId),
            TMDB.getMovieVideos(pelicula_tmdbId)
        ]);
        renderMovie(movie, credits, videos);
        renderCast(credits);
    } catch (err) {
        console.error(err);
        showFatalError(err.message || "No se pudo obtener la información desde TMDB.");
    }
}

function renderMovie(movie, credits, videos) {
    document.title = `CINEVERSE - ${movie.title}`;

    const backdrop = document.querySelector("[data-detail-backdrop]");
    const poster = document.querySelector("[data-detail-poster]");
    const title = document.querySelector("[data-detail-title]");
    const genresEl = document.querySelector("[data-detail-genres]");
    const overview = document.querySelector("[data-detail-overview]");
    const directorEl = document.querySelector("[data-detail-director]");
    const releaseEl = document.querySelector("[data-detail-release]");
    const trailerBtn = document.querySelector("[data-detail-trailer]");

    if (backdrop) backdrop.style.backgroundImage = `url('${TMDB.imageUrl(movie.backdrop_path, "w1280")}')`;
    if (poster) poster.src = TMDB.imageUrl(movie.poster_path) || "";
    if (title) title.textContent = movie.title;
    if (overview) overview.textContent = movie.overview || "Sinopsis no disponible.";

    if (genresEl) {
        const rating = Math.round((movie.vote_average || 0) * 10);
        const genreBadges = (movie.genres || [])
            .slice(0, 3)
            .map((g, i) => `<span class="badge ${i === 0 ? "badge-gold" : "badge-neutral"}">${g.name}</span>`)
            .join("");
        genresEl.innerHTML = `
            ${genreBadges}
            <span class="badge badge-blue">★ ${rating}%</span>
            <span class="badge badge-neutral">${formatRuntime(movie.runtime)}</span>
            <span class="badge badge-neutral">${(movie.release_date || "").slice(0, 4) || "—"}</span>`;
    }

    const director = TMDB.getDirector(credits);
    if (directorEl) directorEl.textContent = director ? director.name : "No disponible";
    if (releaseEl) releaseEl.textContent = formatReleaseDate(movie.release_date);

    const trailerKey = TMDB.pickTrailer(videos);
    if (trailerBtn) {
        if (trailerKey) trailerBtn.onclick = () => openTrailerModal(trailerKey);
        else {
            trailerBtn.disabled = true;
            trailerBtn.title = "Trailer no disponible";
        }
    }

    if (typeof Animations !== "undefined") Animations.initDetailReveal();
}

/** Fecha de estreno completa ("7 de noviembre de 2014"), a diferencia del
 *  formatDate corto (día+mes) que usan las funciones del cine. */
function formatReleaseDate(dateStr) {
    if (!dateStr) return "No disponible";
    const [year, month, day] = dateStr.split("-");
    const months = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ];
    return `${parseInt(day, 10)} de ${months[parseInt(month, 10) - 1]} de ${year}`;
}

// ---------------------------------------------------------------------------
// Reparto (obligatorio) — foto real de TMDB o placeholder con iniciales.
// ---------------------------------------------------------------------------
function renderCast(credits) {
    const grid = document.querySelector("[data-cast-grid]");
    if (!grid) return;
    const cast = TMDB.topCast(credits, 8);
    if (!cast.length) {
        showEmpty(grid, "TMDB no reporta reparto para esta película.");
        return;
    }
    grid.innerHTML = cast
        .map(
            (actor) => `
        <div class="actor-card">
            ${
                actor.profilePath
                    ? `<div class="actor-card__avatar"><img loading="lazy" src="${TMDB.imageUrl(actor.profilePath, "w185")}" alt="${actor.name}"/></div>`
                    : actorAvatarMarkup(actor.name)
            }
            <div class="actor-card__name">${actor.name}</div>
            <div class="actor-card__role">${actor.character || "—"}</div>
        </div>`
        )
        .join("");

    if (typeof Animations !== "undefined") Animations.initRevealGrid(grid, ".actor-card");
}

// ---------------------------------------------------------------------------
// Funciones (JSON Server) -> llevan a funcion.html?functionId=ID
// ---------------------------------------------------------------------------
async function loadFunctions() {
    const dateList = document.querySelector("[data-date-list]");
    const showtimeGrid = document.querySelector("[data-showtime-grid]");
    if (!showtimeGrid) return;

    showLoading(showtimeGrid, "Cargando funciones...");
    try {
        const functions = await CINE.getFunctionsByMovie(pelicula_tmdbId);
        if (!functions.length) {
            if (dateList) dateList.innerHTML = "";
            showEmpty(showtimeGrid, "Esta película no tiene funciones programadas por ahora.");
            return;
        }

        pelicula_functionsByDate = functions.reduce((acc, fn) => {
            (acc[fn.date] = acc[fn.date] || []).push(fn);
            return acc;
        }, {});

        const dates = Object.keys(pelicula_functionsByDate).sort();
        pelicula_activeDate = dates[0];
        renderDateList(dateList, dates);
        await renderShowtimes(showtimeGrid, pelicula_functionsByDate[pelicula_activeDate]);
    } catch (err) {
        console.error(err);
        if (dateList) dateList.innerHTML = "";
        showError(showtimeGrid, err.message || "No se pudieron cargar las funciones del cine.");
    }
}

function renderDateList(container, dates) {
    if (!container) return;
    container.innerHTML = dates
        .map((date) => `<button class="pill${date === pelicula_activeDate ? " is-active" : ""}" data-date-option="${date}">${formatDate(date)}</button>`)
        .join("");

    container.querySelectorAll("[data-date-option]").forEach((btn) => {
        btn.addEventListener("click", () => {
            pelicula_activeDate = btn.dataset.dateOption;
            renderDateList(container, dates);
            renderShowtimes(document.querySelector("[data-showtime-grid]"), pelicula_functionsByDate[pelicula_activeDate]);
        });
    });
}

async function renderShowtimes(container, functionsOfDay) {
    if (!container) return;
    if (!functionsOfDay || !functionsOfDay.length) {
        showEmpty(container, "No hay funciones para esta fecha.");
        return;
    }

    const sorted = functionsOfDay.slice().sort((a, b) => a.time.localeCompare(b.time));

    // Disponibilidad real (para no prometer asientos que ya no existen).
    const seatCounts = await Promise.all(
        sorted.map(async (fn) => {
            try {
                const seats = await CINE.getFunctionSeats(fn.id);
                return seats.filter((s) => s.status === "available").length;
            } catch {
                return null;
            }
        })
    );
    const rooms = await Promise.all(sorted.map((fn) => CINE.getRoom(fn.roomId).catch(() => null)));

    container.innerHTML = sorted
        .map(
            (fn, i) => `
        <div class="showtime-card" data-function-card="${fn.id}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div>
                    <div class="showtime-card__time">${fn.time}</div>
                    <div class="showtime-card__room">${rooms[i] ? rooms[i].name.toUpperCase() : "SALA"}</div>
                    <div class="showtime-card__seats">${seatCounts[i] !== null ? `${seatCounts[i]} asientos disponibles` : ""}</div>
                </div>
                <div class="showtime-card__price">${formatCurrency(fn.price)}</div>
            </div>
            <button class="btn btn-blue btn-block" data-showtime="${fn.id}">
                Seleccionar función →
            </button>
        </div>`
        )
        .join("");

    container.querySelectorAll("[data-showtime]").forEach((btn) => {
        btn.addEventListener("click", () => {
            window.location.href = `funcion.html?functionId=${btn.dataset.showtime}`;
        });
    });

    if (typeof Animations !== "undefined") Animations.initRevealGrid(container, ".showtime-card");
}

// ---------------------------------------------------------------------------
// Valoraciones (JSON Server)
// ---------------------------------------------------------------------------
async function loadRatings() {
    const list = document.querySelector("[data-ratings-list]");
    if (!list) return;
    showLoading(list, "Cargando valoraciones...");
    try {
        const ratings = await CINE.getRatingsByMovie(pelicula_tmdbId);
        if (!ratings.length) {
            showEmpty(list, "Todavía no hay valoraciones. ¡Sé el primero en opinar!");
            return;
        }
        list.innerHTML = ratings
            .slice()
            .reverse()
            .map((r) => {
                const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
                const author = r.userName ? r.userName : "Anónimo";
                return `<div class="rating-item">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="rating-item__stars">${stars}</span>
                        <span style="font-family:var(--font-label);font-size:11.5px;color:var(--text-muted);">${author}</span>
                    </div>
                    ${r.comment ? `<p class="rating-item__comment">${r.comment}</p>` : ""}
                </div>`;
            })
            .join("");
        if (typeof Animations !== "undefined") Animations.initRevealGrid(list, ".rating-item");
    } catch {
        showError(list, "No se pudieron cargar las valoraciones.");
    }
}

function initRatingForm() {
    const form = document.querySelector("[data-rating-form]");
    if (!form) return;

    // Si hay sesión activa, el nombre viene fijo del login (no simulado ni
    // editable) -- sin sesión, cualquiera puede opinar escribiendo su nombre.
    const nameInput = form.querySelector("[data-rating-name]");
    const sessionUser = AuthStore.get();
    if (nameInput && sessionUser) {
        nameInput.value = sessionUser.name;
        nameInput.readOnly = true;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const stars = form.querySelector("[data-rating-value]");
        const comment = form.querySelector("[data-rating-comment]");
        const rating = parseInt(stars?.value || "0", 10);
        const userName = (nameInput?.value || "").trim();

        if (!userName) {
            nameInput?.focus();
            showToast("Escribe tu nombre para poder publicar la valoración.");
            return;
        }
        if (!rating) {
            showToast("Selecciona una valoración de 1 a 5 estrellas.");
            return;
        }
        try {
            // tmdbId se guarda como número (igual que en "functions"/"billboard")
            // -- JSON Server filtra por tipo, así que un tmdbId guardado como
            // string nunca haría match con "?tmdbId=..." y la valoración
            // quedaría invisible para siempre aunque sí se hubiera guardado.
            await CINE.createRating({
                tmdbId: Number(pelicula_tmdbId),
                userId: sessionUser ? sessionUser.id : null,
                userName,
                rating,
                comment: comment?.value?.trim() || ""
            });
            if (comment) comment.value = "";
            if (stars) stars.value = "0";
            if (nameInput && !sessionUser) nameInput.value = "";
            showToast("¡Gracias por tu valoración!");
            loadRatings();
        } catch {
            showToast("No se pudo guardar tu valoración. Intenta nuevamente.");
        }
    });
}

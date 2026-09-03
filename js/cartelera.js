
const GENRE_FILTER_IDS = { accion: 28, scifi: 878, drama: 18, comedia: 35, terror: 27 };

// `billboard` (la programación real) se hidrata una sola vez y se reutiliza
// para hero + galería + grid + filtro por género (sin peticiones de más).
let billboardMovies = [];

// Estado de la búsqueda paginada sobre el catálogo COMPLETO de TMDB.
// `controller` cancela una búsqueda en vuelo si el usuario sigue escribiendo.
const search = {
    active: false,
    term: "",
    genreId: null,
    page: 0,
    totalPages: 1,
    maxPages: 25, // tope defensivo: nunca más de ~500 resultados por sesión
    loading: false,
    controller: null
};
let searchGeneration = 0; // ignora respuestas obsoletas tras cancelar/cambiar de búsqueda
let seenMovieIds = new Set();

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.querySelector("[data-movies-grid]");
    if (!grid) return;

    initFilterBar();
    initSearchInput();
    initLoadMoreButton();
    setupInfiniteScroll();
    loadBillboard();
});

// ---------------------------------------------------------------------------
// Programación real del cine: hero + galería + grid, una sola carga.
// ---------------------------------------------------------------------------
async function loadBillboard() {
    const grid = document.querySelector("[data-movies-grid]");
    if (grid) showLoading(grid, "Cargando cartelera...");

    try {
        const billboard = await CINE.getBillboard();
        if (!billboard.length) {
            if (grid) showEmpty(grid, "El cine todavía no tiene películas cargadas en cartelera.");
            return;
        }
        const tmdbIds = billboard.map((b) => b.tmdbId);
        const movies = await TMDB.getMoviesByIds(tmdbIds);
        if (!movies.length) {
            if (grid) showError(grid, "No se pudo obtener la información de las películas desde TMDB.");
            return;
        }

        billboardMovies = movies;
        renderHero(movies[0]);
        renderGallery(movies);
        renderBillboardGrid();
    } catch (err) {
        console.error(err);
        if (grid) showError(grid, err.message || "No se pudo cargar la cartelera.");
    }
}

function renderHero(movie) {
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;

    const backdrop = hero.querySelector("[data-hero-backdrop]");
    const titleEl = hero.querySelector("[data-hero-title]");
    const badgesEl = hero.querySelector("[data-hero-genres]");
    const durationEl = hero.querySelector("[data-hero-duration]");
    const ratingEl = hero.querySelector("[data-hero-rating]");
    const overviewEl = hero.querySelector("[data-hero-overview]");
    const detailsBtn = hero.querySelector("[data-hero-details]");
    const trailerBtn = hero.querySelector("[data-hero-trailer]");

    // w1280 alcanza de sobra para un fondo de hero (era "original": varios MB).
    if (backdrop) backdrop.style.backgroundImage = `url('${TMDB.imageUrl(movie.backdrop_path, "w1280")}')`;
    if (titleEl) titleEl.textContent = movie.title;
    if (overviewEl) overviewEl.textContent = movie.overview || "Sinopsis no disponible.";
    if (durationEl) durationEl.textContent = formatRuntime(movie.runtime);
    if (ratingEl) ratingEl.textContent = `${Math.round((movie.vote_average || 0) * 10)}%`;
    if (badgesEl) {
        badgesEl.innerHTML = (movie.genres || [])
            .slice(0, 3)
            .map((g, i) => `<span class="badge ${i === 0 ? "badge-gold" : "badge-neutral"}">${g.name}</span>`)
            .join("");
    }
    if (detailsBtn) detailsBtn.onclick = () => (window.location.href = `pelicula.html?id=${movie.id}`);
    if (trailerBtn) {
        trailerBtn.onclick = async () => {
            try {
                const videos = await TMDB.getMovieVideos(movie.id);
                openTrailerModal(TMDB.pickTrailer(videos));
            } catch {
                showToast("No se pudo cargar el trailer.");
            }
        };
    }

    if (typeof Animations !== "undefined") Animations.initHero("[data-hero]");
}

function renderGallery(movies) {
    const track = document.querySelector("[data-gallery-track]");
    if (!track || !movies.length) return;

    track.innerHTML = movies
        .map(
            (m) => `
        <button class="gallery-card" data-gallery-card title="${m.title}">
            <img loading="lazy" src="${TMDB.imageUrl(m.poster_path, "w342") || ""}" alt="${m.title}"/>
            <span class="gallery-card__label">${m.title}</span>
        </button>`
        )
        .join("");

    Array.from(track.children).forEach((btn, i) => {
        btn.addEventListener("click", () => (window.location.href = `pelicula.html?id=${movies[i].id}`));
    });

    if (typeof Animations !== "undefined") Animations.initGallery3D("[data-gallery]");
}

// ---------------------------------------------------------------------------
// Grid "En cartelera"
// ---------------------------------------------------------------------------
function movieCardTemplate(movie) {
    const genreIds = (movie.genre_ids || (movie.genres || []).map((g) => g.id)).join(",");
    const year = movie.release_date ? movie.release_date.slice(0, 4) : "—";
    const rating = Math.round((movie.vote_average || 0) * 10);
    return `
        <div class="movie-card" data-movie-id="${movie.id}" data-genre-ids="${genreIds}" tabindex="0">
            <div class="movie-card__poster">
                <img loading="lazy" src="${TMDB.imageUrl(movie.poster_path, "w342") || ""}" alt="${movie.title}"/>
                <span class="badge badge-gold movie-card__rating">★ ${rating}%</span>
            </div>
            <div class="movie-card__body">
                <h3 class="movie-card__title">${movie.title}</h3>
                <div class="movie-card__meta"><span>${(movie.genres && movie.genres[0]?.name) || "Película"}</span><span>·</span><span>${year}</span></div>
                <button class="movie-card__cta">VER DETALLES</button>
            </div>
        </div>`;
}

/** Crea las cards como nodos reales (no innerHTML += ) para poder revelar
 *  solo las nuevas sin re-tocar las que ya existían. */
function buildCards(movies) {
    const frag = document.createDocumentFragment();
    const cards = [];
    movies.forEach((movie) => {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = movieCardTemplate(movie);
        const card = wrapper.firstElementChild;
        card.addEventListener("click", () => (window.location.href = `pelicula.html?id=${movie.id}`));
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter") window.location.href = `pelicula.html?id=${movie.id}`;
        });
        frag.appendChild(card);
        cards.push(card);
    });
    return { frag, cards };
}

function applyGenreFilter(movies, genreId) {
    if (!genreId) return movies;
    return movies.filter((m) => (m.genres || []).some((g) => g.id === genreId));
}

/** Vista por defecto: la programación real del cine, filtrada por género en
 *  memoria (ya está toda hidratada, no hace falta pedir nada a TMDB). */
function renderBillboardGrid() {
    const grid = document.querySelector("[data-movies-grid]");
    if (!grid) return;

    const genreId = activeGenreId();
    const movies = applyGenreFilter(billboardMovies, genreId);

    updateCatalogStatus("");
    toggleLoadMore(false);

    if (!movies.length) {
        showEmpty(grid, "El cine no tiene películas de este género en cartelera por ahora.");
        return;
    }

    grid.innerHTML = "";
    const { frag, cards } = buildCards(movies);
    grid.appendChild(frag);
    if (typeof Animations !== "undefined") Animations.initRevealGrid(grid, ".movie-card");
}

// ---------------------------------------------------------------------------
// Búsqueda: catálogo COMPLETO de TMDB, paginado. Acá SÍ es normal que una
// película no tenga funciones (el usuario está explorando, no viendo "lo
// que el cine tiene hoy") -- pelicula.html ya maneja ese caso con un
// empty-state claro.
// ---------------------------------------------------------------------------
function activeGenreId() {
    const activeBtn = document.querySelector("[data-filter-bar] .pill.is-active");
    const key = activeBtn ? activeBtn.dataset.filter : "todos";
    return key === "todos" ? null : GENRE_FILTER_IDS[key];
}

function updateCatalogStatus(text) {
    const el = document.querySelector("[data-catalog-status]");
    if (el) el.textContent = text || "";
}

function toggleLoadMore(show) {
    const btn = document.querySelector("[data-load-more]");
    if (btn) btn.hidden = !show;
}

async function loadMoreSearchResults() {
    if (search.loading) return;
    if (search.page > 0 && (search.page >= search.totalPages || search.page >= search.maxPages)) return;

    const grid = document.querySelector("[data-movies-grid]");
    if (!grid) return;

    search.loading = true;
    toggleLoadMore(false);
    const myGeneration = searchGeneration;
    const nextPage = search.page + 1;
    const isFirst = nextPage === 1;
    if (isFirst) showLoading(grid, `Buscando "${search.term}"...`);
    else updateCatalogStatus("Cargando más resultados...");

    try {
        search.controller = new AbortController();
        const { results, totalPages } = await TMDB.searchMovies(search.term, nextPage, search.controller.signal);
        if (myGeneration !== searchGeneration) return;

        const filtered = search.genreId ? results.filter((m) => (m.genre_ids || []).includes(search.genreId)) : results;

        search.page = nextPage;
        search.totalPages = totalPages;
        if (isFirst) grid.innerHTML = "";

        const newMovies = filtered.filter((m) => !seenMovieIds.has(m.id));
        newMovies.forEach((m) => seenMovieIds.add(m.id));

        if (!newMovies.length && isFirst) {
            showEmpty(grid, "No se encontraron películas con ese criterio.");
            return;
        }

        const { frag, cards } = buildCards(newMovies);
        grid.appendChild(frag);
        if (typeof Animations !== "undefined") Animations.initRevealItems(cards);

        const hasMore = search.page < search.totalPages && search.page < search.maxPages;
        updateCatalogStatus(hasMore ? "" : "No hay más resultados.");
        toggleLoadMore(hasMore);
    } catch (err) {
        if (err.name === "AbortError") return; // cancelado a propósito (nueva búsqueda)
        if (myGeneration !== searchGeneration) return;
        console.error(err);
        if (isFirst) showError(grid, err.message || "No se pudo completar la búsqueda.");
        else updateCatalogStatus("No se pudieron cargar más resultados.");
    } finally {
        if (myGeneration === searchGeneration) search.loading = false;
    }
}

function startSearch(term, genreId) {
    searchGeneration++;
    if (search.controller) search.controller.abort();
    Object.assign(search, { active: true, term, genreId, page: 0, totalPages: 1, controller: null });
    seenMovieIds = new Set();
    loadMoreSearchResults();
}

function exitSearch() {
    searchGeneration++;
    if (search.controller) search.controller.abort();
    search.active = false;
    renderBillboardGrid();
}

function initFilterBar() {
    const filterBar = document.querySelector("[data-filter-bar]");
    if (!filterBar) return;
    const buttons = filterBar.querySelectorAll("[data-filter]");

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");

            const genreId = btn.dataset.filter === "todos" ? null : GENRE_FILTER_IDS[btn.dataset.filter];
            const term = document.querySelector("[data-search-input]")?.value.trim() || "";
            if (term) startSearch(term, genreId);
            else renderBillboardGrid();
        });
    });
}

function initSearchInput() {
    const input = document.querySelector("[data-search-input]");
    if (!input) return;
    const debouncedSearch = debounce((term) => {
        if (!term) exitSearch();
        else startSearch(term, activeGenreId());
    }, 450);
    input.addEventListener("input", () => debouncedSearch(input.value.trim()));
}

function initLoadMoreButton() {
    const btn = document.querySelector("[data-load-more]");
    if (btn) btn.addEventListener("click", () => search.active && loadMoreSearchResults());
}

/** Infinite scroll real (solo aplica mientras se está buscando -- la
 *  cartelera del cine es una lista corta y ya está completa de entrada). */
function setupInfiniteScroll() {
    const sentinel = document.querySelector("[data-catalog-sentinel]");
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
        (entries) => entries.forEach((entry) => entry.isIntersecting && search.active && loadMoreSearchResults()),
        { rootMargin: "400px" }
    );
    io.observe(sentinel);
}

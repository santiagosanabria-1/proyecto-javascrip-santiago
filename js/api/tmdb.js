
const TMDB = (() => {
    // Caché en memoria de solo-sesión: evita repetir /movie/:id y
    // /movie/:id/credits cuando el usuario vuelve a pasar por la misma
    // película (cards visitadas, back/forward, cambio de fecha, etc.).
    const detailsCache = new Map();
    const creditsCache = new Map();

    function assertApiKey() {
        if (!CONFIG.TMDB_API_KEY) {
            throw new Error("Falta configurar CONFIG.TMDB_API_KEY en js/config.js.");
        }
    }

    // Acepta tanto una API Key v3 (32 chars hex) como un Read Access Token v4
    // (JWT con puntos) — cada uno se autentica de forma distinta.
    function isV4Token(key) {
        return key.split(".").length === 3;
    }

    async function request(endpoint, params = {}, signal) {
        assertApiKey();
        const url = new URL(`${CONFIG.TMDB_BASE_URL}${endpoint}`);
        url.searchParams.set("language", CONFIG.TMDB_LANGUAGE);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, value);
            }
        });

        const useBearer = isV4Token(CONFIG.TMDB_API_KEY);
        if (!useBearer) url.searchParams.set("api_key", CONFIG.TMDB_API_KEY);

        let response;
        try {
            response = await fetch(url.toString(), {
                signal,
                headers: useBearer
                    ? { Authorization: `Bearer ${CONFIG.TMDB_API_KEY}`, accept: "application/json" }
                    : { accept: "application/json" }
            });
        } catch (err) {
            if (err.name === "AbortError") throw err; // cancelación intencional: no es un error real
            throw new Error("No se pudo conectar con TMDB. Revisa tu conexión a internet.");
        }

        if (!response.ok) {
            if (response.status === 401) throw new Error("API Key de TMDB inválida o vencida.");
            if (response.status === 404) throw new Error("El recurso solicitado no existe en TMDB.");
            throw new Error(`Error de TMDB (código ${response.status}).`);
        }
        return response.json();
    }

    function imageUrl(path, size = "w500") {
        return path ? `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}` : null;
    }

    /**
     * Búsqueda paginada. Acepta un AbortSignal para que el llamador pueda
     * cancelar una búsqueda en vuelo si el usuario sigue escribiendo
     * (evita que una respuesta vieja "pise" a una más reciente).
     */
    async function searchMovies(query, page = 1, signal) {
        if (!query || !query.trim()) return { results: [], totalPages: 0 };
        const data = await request("/search/movie", { query: query.trim(), page }, signal);
        return { results: data.results || [], totalPages: data.total_pages || 1 };
    }

    async function getMovieDetails(movieId) {
        // Normaliza la key: index.html trae ids numéricos de TMDB, pelicula.html
        // trae el id como string desde la query string — sin esto cachearían
        // por separado la misma película y se perdería la mitad del ahorro.
        const key = String(movieId);
        if (detailsCache.has(key)) return detailsCache.get(key);
        const data = await request(`/movie/${movieId}`);
        detailsCache.set(key, data);
        return data;
    }

    async function getMovieCredits(movieId) {
        const key = String(movieId);
        if (creditsCache.has(key)) return creditsCache.get(key);
        const data = await request(`/movie/${movieId}/credits`);
        creditsCache.set(key, data);
        return data;
    }

    async function getMovieVideos(movieId) {
        const data = await request(`/movie/${movieId}/videos`);
        return data.results || [];
    }

    /** Primer trailer oficial de YouTube disponible, o null. */
    function pickTrailer(videos) {
        if (!videos || !videos.length) return null;
        const trailer =
            videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
            videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
            videos.find((v) => v.site === "YouTube");
        return trailer ? trailer.key : null;
    }

    /** Trae varias películas por tmdbId en paralelo (cartelera propia del cine). */
    async function getMoviesByIds(tmdbIds) {
        const results = await Promise.allSettled(tmdbIds.map((id) => getMovieDetails(id)));
        return results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    }

    /** Reparto principal (hasta `limit`) con foto, nombre y personaje. */
    function topCast(credits, limit = 8) {
        return (credits.cast || [])
            .slice(0, limit)
            .map((c) => ({ id: c.id, name: c.name, character: c.character, profilePath: c.profile_path }));
    }

    function getDirector(credits) {
        return (credits.crew || []).find((c) => c.job === "Director") || null;
    }

    return {
        imageUrl,
        searchMovies,
        getMovieDetails,
        getMovieCredits,
        getMovieVideos,
        pickTrailer,
        getMoviesByIds,
        topCast,
        getDirector
    };
})();

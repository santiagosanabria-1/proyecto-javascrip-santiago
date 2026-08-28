/**
 * js/config.js
 * Configuración global de CINEVERSE. Todo lo que apunte a TMDB o a JSON
 * Server pasa por aquí — ningún otro módulo debe hardcodear URLs o claves.
 */
const CONFIG = {
    // API Key de TMDB (v4 read access token). Se obtiene gratis en
    // https://www.themoviedb.org/settings/api
    TMDB_API_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2ZWVkZGY4ODEyMmIyYTgwYmIzODFiNjQ2NmJlYTBjOSIsIm5iZiI6MTc4NzU5MjIzMy42MzEsInN1YiI6IjZhOGM3ZTI5ZWViYmZjYTJkN2E4NGIwMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.qxKgDY526MyTOJfbWMGrTU9bn7RaGpWDlOhfTGCWd0o",

    TMDB_BASE_URL: "https://api.themoviedb.org/3",
    TMDB_IMAGE_BASE: "https://image.tmdb.org/t/p",
    TMDB_LANGUAGE: "es-ES",

    // JSON Server local (ver package.json -> npm run server).
    JSON_SERVER_URL: "http://localhost:4000"
};

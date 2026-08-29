/**
 * js/api/cine.js
 * Única puerta de entrada a JSON Server (datos propios del cine: cartelera,
 * salas, funciones, asientos, reservas, compras, valoraciones).
 */
const CINE = (() => {
    const BASE = CONFIG.JSON_SERVER_URL;
    // Solo hay un puñado de salas y se consultan repetidamente (cada función,
    // cada cambio de fecha) — se cachean en memoria por el resto de la sesión.
    const roomCache = new Map();
    // Un asiento "selected" que nadie confirmó ni liberó (pestaña cerrada de
    // golpe, red caída) no debe quedar bloqueado para siempre -- pasado este
    // tiempo se trata como disponible de nuevo (ver getSeatMap).
    const SELECTION_HOLD_MINUTES = 10;

    async function request(path, options = {}) {
        let response;
        try {
            response = await fetch(`${BASE}${path}`, {
                headers: { "Content-Type": "application/json" },
                ...options
            });
        } catch {
            throw new Error(
                `No se pudo conectar con el servidor del cine (JSON Server). Verifica que esté corriendo en ${BASE}.`
            );
        }
        if (!response.ok) throw new Error(`Error del servidor del cine (código ${response.status}).`);
        if (response.status === 204) return null;
        return response.json();
    }

    /** GET /resource/:id que devuelve null (no lanza) si el recurso no existe (404). */
    async function getById(resource, id) {
        let response;
        try {
            response = await fetch(`${BASE}/${resource}/${encodeURIComponent(id)}`, {
                headers: { "Content-Type": "application/json" }
            });
        } catch {
            throw new Error(
                `No se pudo conectar con el servidor del cine (JSON Server). Verifica que esté corriendo en ${BASE}.`
            );
        }
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Error del servidor del cine (código ${response.status}).`);
        return response.json();
    }

    // ---------- Cartelera propia del cine ----------
    async function getBillboard() {
        return request("/billboard");
    }

    // ---------- Salas ----------
    async function getRoom(roomId) {
        const key = String(roomId);
        if (roomCache.has(key)) return roomCache.get(key);
        const room = await getById("rooms", roomId);
        if (room) roomCache.set(key, room);
        return room;
    }

    // ---------- Funciones ----------
    async function getFunctionsByMovie(tmdbId) {
        return request(`/functions?tmdbId=${encodeURIComponent(tmdbId)}`);
    }

    async function getFunction(functionId) {
        return getById("functions", functionId);
    }

    // ---------- Asientos físicos ----------
    async function getSeatsByRoom(roomId) {
        return request(`/seats?roomId=${encodeURIComponent(roomId)}`);
    }

    // ---------- Estado de asientos por función ----------
    async function getFunctionSeats(functionId) {
        return request(`/functionSeats?functionId=${encodeURIComponent(functionId)}`);
    }

    async function updateFunctionSeat(id, status, extra = {}) {
        return request(`/functionSeats/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status, ...extra })
        });
    }

    function isStaleSelection(fs) {
        if (fs.status !== "selected" || !fs.selectedAt) return false;
        const ageMs = Date.now() - new Date(fs.selectedAt).getTime();
        return ageMs > SELECTION_HOLD_MINUTES * 60 * 1000;
    }

    /**
     * Marca un asiento como "selected" (elegido, todavía no confirmado) para
     * ESTA función, atado a `holderToken` (identifica la pestaña/sesión que
     * lo tomó). Es la pieza que faltaba para que la relación función+asiento
     * sea real de verdad: dos personas no pueden "elegir" el mismo asiento
     * al mismo tiempo, porque el segundo PATCH ve que ya no está disponible.
     */
    async function selectFunctionSeat(functionSeatId, holderToken) {
        return updateFunctionSeat(functionSeatId, "selected", { holderToken, selectedAt: new Date().toISOString() });
    }

    /** Libera un asiento que se había "seleccionado" (deselección, cancelar,
     *  cerrar la pestaña) -- vuelve a quedar disponible para cualquiera. */
    async function releaseFunctionSeat(functionSeatId) {
        return updateFunctionSeat(functionSeatId, "available", { holderToken: null, selectedAt: null });
    }

    /** Cruza seats (físicos) + functionSeats (estado según la función) en un
     *  solo mapa. Las selecciones "selected" abandonadas hace más de
     *  SELECTION_HOLD_MINUTES se muestran (y se liberan) como disponibles. */
    async function getSeatMap(functionId, roomId) {
        const [seats, functionSeats] = await Promise.all([
            getSeatsByRoom(roomId),
            getFunctionSeats(functionId)
        ]);
        const statusBySeatId = new Map(functionSeats.map((fs) => [String(fs.seatId), fs]));
        return seats
            .sort((a, b) => (a.row === b.row ? a.number - b.number : a.row.localeCompare(b.row)))
            .map((seat) => {
                const fs = statusBySeatId.get(String(seat.id));
                if (fs && isStaleSelection(fs)) {
                    releaseFunctionSeat(fs.id).catch(() => {}); // auto-limpieza, best-effort
                    return { ...seat, functionSeatId: fs.id, status: "available" };
                }
                return { ...seat, functionSeatId: fs ? fs.id : null, status: fs ? fs.status : "available" };
            });
    }

    /**
     * Vuelve a consultar el estado REAL de los asientos justo antes de
     * confirmar una reserva/compra — nunca se confía solo en el frontend.
     * Un asiento solo es válido para confirmar si sigue "selected" Y el
     * `holderToken` es el mismo que lo seleccionó (si otra sesión lo tomó
     * después, o si nadie lo tiene reservado, la operación se detiene).
     */
    async function verifySeatsAvailable(functionId, functionSeatIds, holderToken) {
        const current = await getFunctionSeats(functionId);
        const byId = new Map(current.map((fs) => [String(fs.id), fs]));
        return functionSeatIds.every((id) => {
            const fs = byId.get(String(id));
            return fs && fs.status === "selected" && fs.holderToken === holderToken;
        });
    }

    // ---------- Reservas ----------
    async function createReservation(data) {
        return request("/reservations", {
            method: "POST",
            body: JSON.stringify({ status: "confirmed", createdAt: new Date().toISOString(), ...data })
        });
    }

    /** Historial: todas las reservas de un usuario (para "Mis tickets"). */
    async function getReservationsByUser(userId) {
        return request(`/reservations?userId=${encodeURIComponent(userId)}`);
    }

    // ---------- Compras ----------
    async function createPurchase(data) {
        return request("/purchases", {
            method: "POST",
            body: JSON.stringify({ status: "completed", createdAt: new Date().toISOString(), ...data })
        });
    }

    /** Historial: todas las compras de un usuario (para "Mis tickets"). */
    async function getPurchasesByUser(userId) {
        return request(`/purchases?userId=${encodeURIComponent(userId)}`);
    }

    // ---------- Valoraciones ----------
    async function getRatingsByMovie(tmdbId) {
        return request(`/ratings?tmdbId=${encodeURIComponent(tmdbId)}`);
    }

    async function createRating(data) {
        return request("/ratings", { method: "POST", body: JSON.stringify({ createdAt: new Date().toISOString(), ...data }) });
    }

    // ---------- Usuarios (login/registro) ----------
    /** null si no existe ninguna cuenta con ese email (no lanza error). */
    async function getUserByEmail(email) {
        const matches = await request(`/users?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return matches[0] || null;
    }

    async function createUser(data) {
        return request("/users", {
            method: "POST",
            body: JSON.stringify({ createdAt: new Date().toISOString(), ...data, email: data.email.trim().toLowerCase() })
        });
    }

    return {
        getBillboard,
        getRoom,
        getFunctionsByMovie,
        getFunction,
        getSeatsByRoom,
        getFunctionSeats,
        updateFunctionSeat,
        selectFunctionSeat,
        releaseFunctionSeat,
        getSeatMap,
        verifySeatsAvailable,
        createReservation,
        getReservationsByUser,
        createPurchase,
        getPurchasesByUser,
        getRatingsByMovie,
        createRating,
        getUserByEmail,
        createUser
    };
})();

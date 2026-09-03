/**
 * js/api/cine.js
 * Única puerta de entrada a los datos propios del cine (cartelera, salas,
 * funciones, asientos, reservas, compras, valoraciones, usuarios). Antes
 * hablaba con JSON Server por HTTP; ahora todo vive en localStorage vía
 * LocalDB (js/api/localdb.js) -- misma API pública, cero backend.
 */
const CINE = (() => {
    // Solo hay un puñado de salas y se consultan repetidamente (cada función,
    // cada cambio de fecha) — se cachean en memoria por el resto de la sesión.
    const roomCache = new Map();
    // Un asiento "selected" que nadie confirmó ni liberó (pestaña cerrada de
    // golpe, red caída) no debe quedar bloqueado para siempre -- pasado este
    // tiempo se trata como disponible de nuevo (ver getSeatMap).
    const SELECTION_HOLD_MINUTES = 10;

    // ---------- Cartelera propia del cine ----------
    async function getBillboard() {
        return LocalDB.getAll("billboard");
    }

    // ---------- Salas ----------
    async function getRoom(roomId) {
        const key = String(roomId);
        if (roomCache.has(key)) return roomCache.get(key);
        const room = LocalDB.getById("rooms", roomId);
        if (room) roomCache.set(key, room);
        return room;
    }

    // ---------- Funciones ----------
    async function getFunctionsByMovie(tmdbId) {
        return LocalDB.query("functions", (fn) => String(fn.tmdbId) === String(tmdbId));
    }

    async function getFunction(functionId) {
        return LocalDB.getById("functions", functionId);
    }

    // ---------- Asientos físicos ----------
    async function getSeatsByRoom(roomId) {
        return LocalDB.query("seats", (s) => String(s.roomId) === String(roomId));
    }

    // ---------- Estado de asientos por función ----------
    async function getFunctionSeats(functionId) {
        return LocalDB.query("functionSeats", (fs) => String(fs.functionId) === String(functionId));
    }

    async function updateFunctionSeat(id, status, extra = {}) {
        const updated = LocalDB.patch("functionSeats", id, { status, ...extra });
        if (!updated) throw new Error(`No se encontró el asiento de función #${id}.`);
        return updated;
    }

    function isStaleSelection(fs) {
        if (fs.status !== "selected" || !fs.selectedAt) return false;
        const ageMs = Date.now() - new Date(fs.selectedAt).getTime();
        return ageMs > SELECTION_HOLD_MINUTES * 60 * 1000;
    }

    /**
     * Marca un asiento como "selected" (elegido, todavía no confirmado) para
     * ESTA función, atado a `holderToken` (identifica la pestaña/sesión que
     * lo tomó). Antes de escribir, relee el estado actual: aunque localStorage
     * es de una sola pestaña a la vez (sin condiciones de carrera reales
     * entre navegadores distintos como con JSON Server), esta relectura sigue
     * evitando el caso encontrado en la auditoría: un segundo click sobre un
     * asiento que esta misma sesión ya tiene tomado en otra pestaña pisaba su
     * holderToken sin ningún aviso.
     */
    async function selectFunctionSeat(functionSeatId, holderToken) {
        const current = LocalDB.getById("functionSeats", functionSeatId);
        const heldByOther =
            current && current.status === "selected" && current.holderToken && current.holderToken !== holderToken && !isStaleSelection(current);
        const takenByOther = current && (current.status === "reserved" || current.status === "sold");
        if (heldByOther || takenByOther) {
            const err = new Error("El asiento ya no está disponible.");
            err.code = "SEAT_TAKEN";
            throw err;
        }
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
                    return { ...seat, functionSeatId: fs.id, status: "available", holderToken: null };
                }
                return {
                    ...seat,
                    functionSeatId: fs ? fs.id : null,
                    status: fs ? fs.status : "available",
                    // El llamador la usa para distinguir "esto lo elegí yo" (sigue
                    // interactivo) de "lo eligió otra persona ahora mismo" (debe
                    // verse y comportarse como ocupado, no como disponible).
                    holderToken: fs ? fs.holderToken || null : null
                };
            });
    }

    /**
     * Vuelve a consultar el estado REAL de los asientos justo antes de
     * confirmar una reserva/compra — nunca se confía solo en el frontend.
     * Un asiento solo es válido para confirmar si sigue "selected" Y el
     * `holderToken` es el mismo que lo seleccionó (si nadie lo tiene
     * reservado, o cambió de estado, la operación se detiene).
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
        return LocalDB.insert("reservations", { status: "confirmed", createdAt: new Date().toISOString(), ...data });
    }

    /** Historial: todas las reservas de un usuario (para "Mis tickets"). */
    async function getReservationsByUser(userId) {
        return LocalDB.query("reservations", (r) => String(r.userId) === String(userId));
    }

    // ---------- Compras ----------
    async function createPurchase(data) {
        return LocalDB.insert("purchases", { status: "completed", createdAt: new Date().toISOString(), ...data });
    }

    /** Historial: todas las compras de un usuario (para "Mis tickets"). */
    async function getPurchasesByUser(userId) {
        return LocalDB.query("purchases", (p) => String(p.userId) === String(userId));
    }

    // ---------- Valoraciones ----------
    async function getRatingsByMovie(tmdbId) {
        return LocalDB.query("ratings", (r) => String(r.tmdbId) === String(tmdbId));
    }

    async function createRating(data) {
        return LocalDB.insert("ratings", { createdAt: new Date().toISOString(), ...data });
    }

    // ---------- Usuarios (login/registro) ----------
    /** null si no existe ninguna cuenta con ese email (no lanza error). */
    async function getUserByEmail(email) {
        const normalized = email.trim().toLowerCase();
        const matches = LocalDB.query("users", (u) => u.email === normalized);
        return matches[0] || null;
    }

    async function createUser(data) {
        return LocalDB.insert("users", { createdAt: new Date().toISOString(), ...data, email: data.email.trim().toLowerCase() });
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

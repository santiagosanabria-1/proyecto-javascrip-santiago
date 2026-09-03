
const LocalDB = (() => {
    const DB_KEY = "cineverse_db";
    const DB_VERSION = 2;

    // -------------------------------------------------------------------
    // Datos semilla (traducción 1:1 de scripts/seed.js a runtime navegador)
    // -------------------------------------------------------------------
    const BILLBOARD_TMDB_IDS = [
        157336, 872585, 335984, 281957, 27205, 693134, 155, 550, 680, 13,
        122, 120, 603, 424, 496243, 634649, 299536, 299534, 118340, 76341,
        862, 585, 10681, 129, 372058, 346364, 493922
    ];

    const ROOMS = [
        { id: 1, name: "Sala 1", rows: 6, seatsPerRow: 8, capacity: 48, type: "Standard" },
        { id: 2, name: "Sala 2 IMAX", rows: 8, seatsPerRow: 10, capacity: 80, type: "IMAX" }
    ];

    const ROW_LETTERS = "ABCDEFGHIJ".split("");

    function locationForColumn(col, seatsPerRow) {
        const third = seatsPerRow / 3;
        if (col <= third) return "Izquierda";
        if (col <= third * 2) return "Centro";
        return "Derecha";
    }

    function buildSeats() {
    const seats = [];
    let id = 1;

    ROOMS.forEach((room) => {
        for (let r = 0; r < room.rows; r++) {
            const row = ROW_LETTERS[r];
            for (let n = 1; n <= room.seatsPerRow; n++) {
                let type = "standard";
                if (r === 0) type = "vip";
                else if (r === 1 || r === 2) type = "premium";

                seats.push({
                    id: id++,
                    roomId: room.id,
                    row,
                    number: n,
                    seatCode: `${row}${n}`,
                    location: locationForColumn(n, room.seatsPerRow),
                    type: type
                });
            }
        }
    }); // Cierra ROOMS.forEach

    return seats; // Dentro de buildSeats()
}


    /** Hoy + los próximos 2 días, para que las funciones nunca queden
     *  "programadas" en el pasado sin importar cuándo se abra la página. */
    function nextDates(count) {
        const dates = [];
        const today = new Date();
        for (let i = 0; i < count; i++) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
        return dates;
    }

    function buildFunctions() {
        const functions = [];
        const dates = nextDates(3);
        const timesByRoom = { 1: ["14:30", "17:15", "21:00"], 2: ["16:00", "19:30", "22:15"] };
        const basePrice = { 1: 6500, 2: 9800 };
        let id = 1;

        BILLBOARD_TMDB_IDS.forEach((tmdbId, movieIndex) => {
            dates.forEach((date, dateIndex) => {
                const roomId = ((movieIndex + dateIndex) % ROOMS.length) + 1;
                const times = timesByRoom[roomId];
                const time = times[(movieIndex + dateIndex) % times.length];
                functions.push({
                    id: id++,
                    tmdbId,
                    roomId,
                    date,
                    time,
                    price: basePrice[roomId] + (movieIndex % 3) * 500
                });
            });
        });
        return functions;
    }

    function buildFunctionSeats(functions, seats) {
        const functionSeats = [];
        let id = 1;
        const seatsByRoom = seats.reduce((acc, s) => {
            (acc[s.roomId] = acc[s.roomId] || []).push(s);
            return acc;
        }, {});

        functions.forEach((fn) => {
            const roomSeats = seatsByRoom[fn.roomId];
            roomSeats.forEach((seat) => {
                // Distribución determinística: ~8% vendidos, ~6% reservados,
                // el resto disponibles -- idéntica a scripts/seed.js.
                const hash = (fn.id * 31 + seat.id * 17) % 100;
                let status = "available";
                if (hash < 8) status = "sold";
                else if (hash < 14) status = "reserved";
                functionSeats.push({ id: id++, functionId: fn.id, seatId: seat.id, status, holderToken: null, selectedAt: null });
            });
        });
        return functionSeats;
    }

    function buildSeedData() {
        const seats = buildSeats();
        const functions = buildFunctions();
        const functionSeats = buildFunctionSeats(functions, seats);

        return {
            billboard: BILLBOARD_TMDB_IDS.map((tmdbId, i) => ({ id: i + 1, tmdbId })),
            rooms: ROOMS,
            seats,
            functions,
            functionSeats,
            reservations: [],
            purchases: [],
            ratings: [],
            users: [],
            promocodes: [
                {id: 1, code: "CINE20", discount:20, active: true},
                {id: 2, code: "CINE10", discount:10, active: true},
                {id: 3, code: "OLD50", discount:50, active: false   },
            ]
        };
    }

    // -------------------------------------------------------------------
    // Persistencia: todo vive en un único objeto en localStorage.
    // -------------------------------------------------------------------
    let cache = null; // evita releer/reparsear localStorage en cada llamada

    function load() {
        if (cache) return cache;
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.__version === DB_VERSION) {
                    cache = parsed;
                    return cache;
                }
            }
        } catch {
            // localStorage corrupto o inaccesible -- se reseedea abajo.
        }
        cache = { __version: DB_VERSION, ...buildSeedData() };
        persist();
        return cache;
    }

    function persist() {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(cache));
        } catch (err) {
            console.error("No se pudo guardar en localStorage (¿cuota llena o modo privado?):", err);
        }
    }

    function nextId(resource) {
        const rows = load()[resource] || [];
        return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    }

    // -------------------------------------------------------------------
    // Mini-CRUD genérico, con la misma forma que tenían las llamadas a
    // JSON Server (colección + id numérico autoincremental).
    // -------------------------------------------------------------------
    function getAll(resource) {
        return [...(load()[resource] || [])];
    }

    function getById(resource, id) {
        const rows = load()[resource] || [];
        const row = rows.find((r) => String(r.id) === String(id));
        return row ? { ...row } : null;
    }

    function query(resource, predicate) {
        return getAll(resource).filter(predicate);
    }

    function insert(resource, data) {
        const db = load();
        if (!db[resource]) db[resource] = [];
        const row = { id: nextId(resource), ...data };
        db[resource].push(row);
        persist();
        return { ...row };
    }

    function patch(resource, id, changes) {
        const db = load();
        const rows = db[resource] || [];
        const idx = rows.findIndex((r) => String(r.id) === String(id));
        if (idx === -1) return null;
        rows[idx] = { ...rows[idx], ...changes };
        persist();
        return { ...rows[idx] };
    }

    /** Borra toda la base local y la vuelve a sembrar desde cero -- útil
     *  para depurar ("localStorage.clear()" también sirve, esto es más
     *  explícito y no toca otras claves como la sesión o el flujo). */
    function reset() {
        cache = null;
        localStorage.removeItem(DB_KEY);
        load();
    }

    return { getAll, getById, query, insert, patch, reset };
 })();

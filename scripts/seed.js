/**
 * scripts/seed.js
 * Genera db.json desde cero con datos de demostración realistas:
 * cartelera (solo tmdbIds, nunca el payload completo de TMDB), salas,
 * asientos, funciones y el estado inicial de cada asiento por función
 * (con algunos `reserved`/`sold` ya cargados para poder ver los 4 estados
 * desde el primer render).
 *
 * Uso: node scripts/seed.js
 */
const fs = require("fs");
const path = require("path");

/**
 * Películas reales de TMDB que forman la programación del cine ("en
 * cartelera"). A propósito es una lista curada y no "todo lo que existe en
 * TMDB": si `pelicula.html` muestra funciones, tienen que ser reales, y un
 * cine real tampoco proyecta cada película jamás filmada. Se buscó variedad
 * de género para que los filtros (Acción/Sci-Fi/Drama/Comedia/Terror)
 * tengan resultados reales. `getMoviesByIds` ya descarta en silencio
 * cualquier id que TMDB no reconozca (Promise.allSettled), así que un id
 * ocasionalmente desactualizado no rompe nada, solo reduce el conteo.
 */
const BILLBOARD_TMDB_IDS = [
    157336, // Interstellar
    872585, // Oppenheimer
    335984, // Blade Runner 2049
    281957, // El renacido
    27205, // Origen (Inception)
    693134, // Dune: Parte dos
    155, // Batman: El caballero de la noche
    550, // El club de la pelea
    680, // Pulp Fiction
    13, // Forrest Gump
    122, // El señor de los anillos: El retorno del rey
    120, // El señor de los anillos: La comunidad del anillo
    603, // Matrix
    424, // La lista de Schindler
    496243, // Parásitos
    634649, // Spider-Man: Sin camino a casa
    299536, // Vengadores: Infinity War
    299534, // Vengadores: Endgame
    118340, // Guardianes de la Galaxia
    76341, // Mad Max: Furia en el camino
    862, // Toy Story
    585, // Monsters, Inc.
    10681, // WALL·E
    129, // El viaje de Chihiro
    372058, // Your Name
    346364, // It (2017)
    493922 // Hereditary
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
                seats.push({
                    id: id++,
                    roomId: room.id,
                    row,
                    number: n,
                    seatCode: `${row}${n}`,
                    location: locationForColumn(n, room.seatsPerRow),
                    type: room.type === "IMAX" && r === 0 ? "premium" : "standard"
                });
            }
        }
    });
    return seats;
}

/** Hoy + los próximos 2 días, en vez de fechas fijas -- así el seed nunca
 *  queda con funciones "programadas" en el pasado sin importar cuándo se
 *  ejecute `node scripts/seed.js`. */
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
            // Distribución determinística (no aleatoria) para que el seed sea
            // reproducible: ~8% vendidos, ~6% reservados, el resto disponibles.
            const hash = (fn.id * 31 + seat.id * 17) % 100;
            let status = "available";
            if (hash < 8) status = "sold";
            else if (hash < 14) status = "reserved";
            functionSeats.push({ id: id++, functionId: fn.id, seatId: seat.id, status });
        });
    });
    return functionSeats;
}

function build() {
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
        users: []
    };
}

const db = build();
const outPath = path.join(__dirname, "..", "db.json");
fs.writeFileSync(outPath, JSON.stringify(db, null, 2));
console.log(`db.json generado en ${outPath}`);
console.log(
    `  billboard: ${db.billboard.length} · rooms: ${db.rooms.length} · seats: ${db.seats.length} · ` +
        `functions: ${db.functions.length} · functionSeats: ${db.functionSeats.length}`
);

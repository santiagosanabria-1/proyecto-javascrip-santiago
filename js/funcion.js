/**
 * js/funcion.js
 * Lógica de funcion.html: arma el mapa de la sala (rooms + seats +
 * functionSeats) y controla la selección múltiple de asientos con
 * resumen en vivo. Al continuar, guarda la selección en FlowStore y
 * navega a reserva.html.
 */
let funcion_id = null;
let funcion_pricePerSeat = 0;
let funcion_movieTitle = "";
let funcion_selected = []; // [{ seatId, functionSeatId, seatCode, location }]

document.addEventListener("DOMContentLoaded", () => {
    const seatPanel = document.querySelector("[data-seat-map]");
    if (!seatPanel) return;

    const flow = FlowStore.get();
    funcion_id = getQueryParam("functionId") || flow?.functionId;

    if (!funcion_id) {
        renderFatal(seatPanel, "No se seleccionó ninguna función. Vuelve a elegir una película.");
        return;
    }
    loadSeatMap(seatPanel);
});

function renderFatal(seatPanel, message) {
    seatPanel.innerHTML = `
        <div class="state-block state-block--error">
            <span class="state-block__icon">✕</span>
            <p class="state-block__text">${message}</p>
            <a href="index.html" class="btn btn-blue">Volver a la cartelera</a>
        </div>`;
}

async function loadSeatMap(seatPanel) {
    showLoading(seatPanel, "Cargando mapa de asientos...");
    try {
        const fn = await CINE.getFunction(funcion_id);
        if (!fn) {
            renderFatal(seatPanel, "La función seleccionada ya no existe.");
            return;
        }
        const room = await CINE.getRoom(fn.roomId);
        if (!room) {
            renderFatal(seatPanel, "No se encontró la sala de esta función.");
            return;
        }

        funcion_pricePerSeat = fn.price;
        FlowStore.set({ functionId: fn.id, roomId: fn.roomId, price: fn.price, date: fn.date, time: fn.time, tmdbId: fn.tmdbId });

        updatePageMovieInfo(fn, room);

        const seatMapData = await CINE.getSeatMap(fn.id, room.id);
        renderSeatMap(seatPanel, seatMapData, room);
        initSummary();
    } catch (err) {
        console.error(err);
        renderFatal(seatPanel, err.message || "No se pudo cargar el mapa de asientos.");
    }
}

async function updatePageMovieInfo(fn, room) {
    const titleEl = document.querySelector("[data-seat-movie-title]");
    const subtitleEl = document.querySelector("[data-seat-subtitle]");
    try {
        const movie = await TMDB.getMovieDetails(fn.tmdbId);
        funcion_movieTitle = movie.title;
        if (titleEl) titleEl.textContent = movie.title;
    } catch {
        if (titleEl) titleEl.textContent = "Película";
    }
    if (subtitleEl) subtitleEl.textContent = `${formatDate(fn.date)} · ${fn.time} · ${room.name.toUpperCase()}`;
}

const SEAT_ICONS = { selected: "✓", reserved: "◔", sold: "✕" };
const SEAT_LABELS = { available: "disponible", selected: "seleccionado", reserved: "reservado", sold: "vendido" };

function renderSeatMap(seatPanel, seats, room) {
    const rows = {};
    seats.forEach((s) => (rows[s.row] = rows[s.row] || []).push(s));
    const rowLetters = Object.keys(rows).sort().reverse(); // filas de atrás hacia adelante
    const half = Math.ceil(room.seatsPerRow / 2);

    const rowsHtml = rowLetters
        .map((letter) => {
            const rowSeats = rows[letter].sort((a, b) => a.number - b.number);
            const left = rowSeats.slice(0, half);
            const right = rowSeats.slice(half);
            const seatBtn = (seat) => {
                const isTaken = seat.status === "reserved" || seat.status === "sold";
                const stateClass = isTaken ? `seat--${seat.status}` : "seat--available";
                const content = isTaken ? SEAT_ICONS[seat.status] : seat.seatCode;
                const label = SEAT_LABELS[seat.status] || "disponible";
                return `<button class="seat ${stateClass}"
                    data-seat-id="${seat.id}" data-function-seat-id="${seat.functionSeatId}"
                    data-seat-code="${seat.seatCode}" data-location="${seat.location}"
                    title="${seat.seatCode} · ${seat.location} · ${label}"
                    aria-label="Asiento ${seat.seatCode}, ${label}"
                    ${isTaken ? "disabled" : ""}>${content}</button>`;
            };
            return `
            <div class="seat-row">
                <span class="seat-row__label">${letter}</span>
                <div class="seat-block">${left.map(seatBtn).join("")}</div>
                <div class="seat-aisle"></div>
                <div class="seat-block">${right.map(seatBtn).join("")}</div>
                <span class="seat-row__label">${letter}</span>
            </div>`;
        })
        .join("");

    const legend = seatPanel.querySelector("[data-seat-legend]");
    seatPanel.innerHTML = "";
    if (legend) seatPanel.appendChild(legend);

    const gridWrap = document.createElement("div");
    gridWrap.className = "seat-rows";
    gridWrap.innerHTML = rowsHtml;
    seatPanel.appendChild(gridWrap);

    seatPanel.querySelectorAll("[data-seat-id]:not([disabled])").forEach((btn) => {
        btn.addEventListener("click", () => toggleSeat(btn));
    });

    if (typeof Animations !== "undefined") Animations.initSeatMapReveal("[data-seat-map]");
}

function toggleSeat(btn) {
    const seatId = btn.dataset.seatId;
    const already = funcion_selected.some((s) => s.seatId === seatId);

    if (already) {
        funcion_selected = funcion_selected.filter((s) => s.seatId !== seatId);
        btn.classList.remove("seat--selected");
        btn.classList.add("seat--available");
        btn.textContent = btn.dataset.seatCode;
    } else {
        funcion_selected.push({
            seatId,
            functionSeatId: btn.dataset.functionSeatId,
            seatCode: btn.dataset.seatCode,
            location: btn.dataset.location
        });
        btn.classList.add("seat--selected");
        btn.classList.remove("seat--available");
        btn.textContent = SEAT_ICONS.selected;
    }
    renderSummary();
}

function initSummary() {
    const continueBtn = document.querySelector("[data-continue-seats]");
    if (continueBtn) continueBtn.addEventListener("click", handleContinue);
    renderSummary();
}

function renderSummary() {
    const seatsEl = document.querySelector("[data-summary-seats]");
    const totalEl = document.querySelector("[data-summary-total]");
    const locationEl = document.querySelector("[data-summary-location]");
    const continueBtn = document.querySelector("[data-continue-seats]");

    if (seatsEl) {
        seatsEl.textContent = funcion_selected.length
            ? `${funcion_selected.map((s) => s.seatCode).join(", ")} (${funcion_selected.length} ${funcion_selected.length === 1 ? "ticket" : "tickets"})`
            : "Ninguno seleccionado";
    }
    if (totalEl) totalEl.textContent = formatCurrency(funcion_selected.length * funcion_pricePerSeat);
    if (locationEl) {
        locationEl.innerHTML = funcion_selected.length ? funcion_selected.map((s) => `${s.seatCode} — ${s.location}`).join("<br/>") : "";
    }
    if (continueBtn) {
        const disabled = funcion_selected.length === 0;
        continueBtn.disabled = disabled;
    }
}

function handleContinue() {
    if (!funcion_selected.length) return;
    FlowStore.set({
        seats: funcion_selected,
        quantity: funcion_selected.length,
        movieTitle: funcion_movieTitle,
        total: (funcion_selected.length * funcion_pricePerSeat).toFixed(2)
    });
    window.location.href = "reserva.html";
}

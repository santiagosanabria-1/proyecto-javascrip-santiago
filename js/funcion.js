/**
 * js/funcion.js
 * Lógica de funcion.html: arma el mapa de la sala (rooms + seats +
 * functionSeats) y controla la selección múltiple de asientos con
 * resumen en vivo. Cada selección/deselección se persiste de verdad en
 * JSON Server (functionSeats -> "selected"/"available"), identificada con
 * un token de sesión (SessionToken) -- así dos personas nunca pueden
 * terminar comprando el mismo asiento, ni siquiera si lo seleccionan al
 * mismo tiempo. Al continuar, guarda la selección en FlowStore y navega a
 * reserva.html.
 */
let funcion_id = null;
let funcion_pricePerSeat = 0;
let funcion_movieTitle = "";
let funcion_selected = []; // [{ seatId, functionSeatId, seatCode, location, row, number }]
let funcion_desiredQuantity = 1;
let funcion_leaving = false; // true cuando la navegación es intencional (continuar/volver) -- evita el doble release del beforeunload

document.addEventListener("DOMContentLoaded", () => {
    const seatPanel = document.querySelector("[data-seat-map]");
    if (!seatPanel) return;

    const flow = FlowStore.get();
    funcion_id = getQueryParam("functionId") || flow?.functionId;

    if (!funcion_id) {
        renderFatal(seatPanel, "No se seleccionó ninguna función. Vuelve a elegir una película.");
        return;
    }

    initQtyStepper();
    initBackLink();
    loadSeatMap(seatPanel);

    // Red de seguridad: si el usuario cierra la pestaña o navega afuera sin
    // continuar, se liberan los asientos que había "tomado" -- así no
    // quedan bloqueados para el resto de la gente por error de otra persona.
    window.addEventListener("beforeunload", () => {
        if (!funcion_leaving) releaseSelectedSeats(true);
    });
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
        restoreOwnSelection(seatMapData);
        initSummary();
    } catch (err) {
        console.error(err);
        renderFatal(seatPanel, err.message || "No se pudo cargar el mapa de asientos.");
    }
}

/**
 * Si esta misma pestaña ya tenía asientos "selected" a su nombre (recargó
 * la página sin haber confirmado ni abandonado) los recupera en
 * `funcion_selected` -- si no, quedarían marcados como propios en el mapa
 * (ver renderSeatMap) pero invisibles para el resumen/contador de tickets.
 */
function restoreOwnSelection(seatMapData) {
    const myToken = SessionToken.get();
    const mine = seatMapData.filter((seat) => seat.status === "selected" && seat.holderToken === myToken);
    if (!mine.length) return;
    funcion_selected = mine.map((seat) => ({
        seatId: String(seat.id),
        functionSeatId: seat.functionSeatId,
        seatCode: seat.seatCode,
        location: seat.location,
        row: seat.row,
        number: seat.number
    }));
    funcion_desiredQuantity = Math.max(funcion_desiredQuantity, mine.length);
    const valueEl = document.querySelector("[data-qty-value]");
    if (valueEl) valueEl.textContent = funcion_desiredQuantity;
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

// ---------------------------------------------------------------------------
// Cantidad de tickets (RF: la cantidad de tickets debe coincidir EXACTO con
// la cantidad de asientos seleccionados antes de poder continuar).
// ---------------------------------------------------------------------------
function initQtyStepper() {
    const valueEl = document.querySelector("[data-qty-value]");
    const minusBtn = document.querySelector("[data-qty-minus]");
    const plusBtn = document.querySelector("[data-qty-plus]");
    if (!valueEl) return;

    const MAX_QTY = 8;
    const render = () => {
        valueEl.textContent = funcion_desiredQuantity;
        if (minusBtn) minusBtn.disabled = funcion_desiredQuantity <= 1;
        if (plusBtn) plusBtn.disabled = funcion_desiredQuantity >= MAX_QTY;
        renderSummary();
    };

    minusBtn?.addEventListener("click", () => {
        if (funcion_desiredQuantity > 1) {
            funcion_desiredQuantity--;
            render();
        }
    });
    plusBtn?.addEventListener("click", () => {
        if (funcion_desiredQuantity < MAX_QTY) {
            funcion_desiredQuantity++;
            render();
        }
    });
    render();
}

function initBackLink() {
    const link = document.querySelector("[data-back-link]");
    if (!link) return;
    link.addEventListener("click", async (e) => {
        e.preventDefault();
        funcion_leaving = true;
        await releaseSelectedSeats(false);
        window.location.href = "pelicula.html?id=" + (FlowStore.get()?.tmdbId || "");
    });
}

/** Libera (PATCH a "available") todos los asientos que esta pestaña tenía
 *  tomados. `useBeacon` usa fetch con keepalive para que la petición
 *  sobreviva al cierre de la pestaña (no se puede "esperar" una respuesta
 *  en beforeunload, pero sí se puede disparar la petición). */
async function releaseSelectedSeats(useBeacon) {
    if (!funcion_selected.length) return;
    const ids = funcion_selected.map((s) => s.functionSeatId);
    funcion_selected = [];
    if (useBeacon) {
        ids.forEach((id) => {
            // fetch() nunca lanza de forma síncrona ante un fallo de red -- devuelve
            // una promesa rechazada. Sin este .catch() quedaba como una promise
            // rejection sin manejar en consola cada vez que el PATCH fallaba
            // (JSON Server caído, tab cerrándose de golpe): el try/catch de
            // alrededor no la atrapaba porque el rechazo es asíncrono.
            fetch(`${CONFIG.JSON_SERVER_URL}/functionSeats/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "available", holderToken: null, selectedAt: null }),
                keepalive: true
            }).catch(() => {
                /* best-effort: si falla, se autolimpia por vencimiento (ver getSeatMap) */
            });
        });
        return;
    }
    await Promise.all(ids.map((id) => CINE.releaseFunctionSeat(id).catch(() => {})));
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
            const myToken = SessionToken.get();
            const seatBtn = (seat) => {
                // Un asiento "selected" por OTRA sesión (dentro de la ventana de
                // 10 minutos) debe verse y comportarse como ocupado -- antes de
                // esta corrección se pintaba igual que uno disponible y se podía
                // clickear, robándole la selección a quien lo tenía tomado.
                const heldByOther = seat.status === "selected" && seat.holderToken !== myToken;
                const mine = seat.status === "selected" && seat.holderToken === myToken;
                const isTaken = seat.status === "reserved" || seat.status === "sold" || heldByOther;
                const stateClass = seat.status === "reserved" || seat.status === "sold" ? `seat--${seat.status}` : heldByOther ? "seat--held" : mine ? "seat--selected" : "seat--available";
                const content = seat.status === "reserved" || seat.status === "sold" ? SEAT_ICONS[seat.status] : heldByOther ? "…" : mine ? SEAT_ICONS.selected : seat.seatCode;
                const label = heldByOther ? "siendo elegido por otra persona" : SEAT_LABELS[seat.status] || "disponible";
                return `<button class="seat ${stateClass}"
                    data-seat-id="${seat.id}" data-function-seat-id="${seat.functionSeatId}"
                    data-seat-code="${seat.seatCode}" data-location="${seat.location}"
                    data-row="${seat.row}" data-number="${seat.number}"
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

/**
 * Selecciona/deselecciona un asiento. La selección es una petición HTTP
 * real a JSON Server (functionSeats -> "selected", con el token de esta
 * sesión) -- si otra persona ya lo tomó justo antes, el asiento deja de
 * estar disponible y este click se rechaza con un aviso, en vez de dejar
 * que dos personas "elijan" la misma silla en pantalla.
 */
async function toggleSeat(btn) {
    const seatId = btn.dataset.seatId;
    const already = funcion_selected.some((s) => s.seatId === seatId);

    if (already) {
        const entry = funcion_selected.find((s) => s.seatId === seatId);
        funcion_selected = funcion_selected.filter((s) => s.seatId !== seatId);
        btn.classList.remove("seat--selected");
        btn.classList.add("seat--available");
        btn.textContent = btn.dataset.seatCode;
        renderSummary();
        CINE.releaseFunctionSeat(entry.functionSeatId).catch((err) => console.error("No se pudo liberar el asiento:", err));
        return;
    }

    btn.disabled = true;
    btn.classList.add("seat--pending");
    try {
        const token = SessionToken.get();
        const updated = await CINE.selectFunctionSeat(btn.dataset.functionSeatId, token);

        // Confirma que la selección quedó a nombre de ESTA sesión: si otra
        // petición (otra persona) llegó primero, JSON Server ya tiene un
        // holderToken distinto y no debemos tomar el asiento como propio.
        if (updated.status !== "selected" || updated.holderToken !== token) {
            throw new Error("taken");
        }

        funcion_selected.push({
            seatId,
            functionSeatId: btn.dataset.functionSeatId,
            seatCode: btn.dataset.seatCode,
            location: btn.dataset.location,
            row: btn.dataset.row,
            number: btn.dataset.number
        });
        btn.classList.remove("seat--pending", "seat--available");
        btn.classList.add("seat--selected");
        btn.textContent = SEAT_ICONS.selected;
        btn.disabled = false;
        renderSummary();
    } catch (err) {
        btn.classList.remove("seat--pending");
        if (err.message === "taken" || err.code === "SEAT_TAKEN") {
            showToast(`El asiento ${btn.dataset.seatCode} ya no está disponible. Alguien más lo tomó justo ahora.`, "error");
            btn.classList.add("seat--held");
            btn.innerHTML = "…";
            btn.disabled = true;
        } else {
            console.error(err);
            showToast("No se pudo seleccionar el asiento. Intenta nuevamente.", "error");
            btn.disabled = false;
        }
    }
}

function initSummary() {
    const continueBtn = document.querySelector("[data-continue-seats]");
    if (continueBtn) continueBtn.addEventListener("click", handleContinue);
    renderSummary();
}

function renderSummary() {
    const seatsEl = document.querySelector("[data-summary-seats]");
    const totalEl = document.querySelector("[data-summary-total]");
    const unitPriceEl = document.querySelector("[data-summary-unit-price]");
    const locationEl = document.querySelector("[data-summary-location]");
    const continueBtn = document.querySelector("[data-continue-seats]");
    const qtyHint = document.querySelector("[data-qty-hint]");

    if (seatsEl) {
        seatsEl.textContent = funcion_selected.length
            ? `${funcion_selected.map((s) => s.seatCode).join(", ")} (${funcion_selected.length} ${funcion_selected.length === 1 ? "ticket" : "tickets"})`
            : "Ninguno seleccionado";
    }
    if (unitPriceEl) unitPriceEl.textContent = formatCurrency(funcion_pricePerSeat);
    if (totalEl) totalEl.textContent = formatCurrency(funcion_selected.length * funcion_pricePerSeat);
    if (locationEl) {
        // Fila/Número/Ubicación explícitos por cada silla elegida.
        locationEl.innerHTML = funcion_selected.length
            ? funcion_selected.map((s) => `${s.seatCode} — Fila ${s.row} · Número ${s.number} · ${s.location}`).join("<br/>")
            : "";
    }

    const matches = funcion_selected.length === funcion_desiredQuantity;
    if (qtyHint) {
        qtyHint.textContent =
            funcion_selected.length === 0
                ? ""
                : matches
                  ? ""
                  : `Elegiste ${funcion_selected.length} de ${funcion_desiredQuantity} tickets. Selecciona exactamente ${funcion_desiredQuantity}.`;
    }
    if (continueBtn) {
        const disabled = funcion_selected.length === 0 || !matches;
        continueBtn.disabled = disabled;
    }
}

function handleContinue() {
    // La cantidad de tickets DEBE coincidir con la cantidad de asientos
    // elegidos -- se revalida acá además de deshabilitar el botón, por si
    // se dispara el evento igual (defensa en profundidad).
    if (!funcion_selected.length || funcion_selected.length !== funcion_desiredQuantity) {
        showToast(`Selecciona exactamente ${funcion_desiredQuantity} ${funcion_desiredQuantity === 1 ? "asiento" : "asientos"} para continuar.`, "error");
        return;
    }
    funcion_leaving = true; // los asientos siguen "selected": no se liberan al navegar a reserva.html
    FlowStore.set({
        seats: funcion_selected,
        quantity: funcion_selected.length,
        movieTitle: funcion_movieTitle,
        holderToken: SessionToken.get(),
        total: (funcion_selected.length * funcion_pricePerSeat).toFixed(2)
    });
    window.location.href = "reserva.html";
}

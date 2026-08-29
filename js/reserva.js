/**
 * js/reserva.js
 * Lógica de reserva.html: resumen final, pasarela de pago simulada,
 * revalidación real anti-doble-venta contra JSON Server, persistencia de
 * la reserva/compra y transición a la vista de ticket.
 */
let reserva_flow = null;
let reserva_confirmed = false; // true tras crear la reserva/compra: los asientos ya son "reserved"/"sold" y no hay nada que liberar
let reserva_leaving = false; // true durante una navegación intencional (cancelar) -- evita liberar dos veces

document.addEventListener("DOMContentLoaded", () => {
    const btnConfirm = document.getElementById("btn-confirm");
    if (!btnConfirm) return;

    reserva_flow = FlowStore.get();
    if (!reserva_flow || !reserva_flow.functionId || !reserva_flow.seats?.length) {
        showToast("No hay ninguna selección de asientos activa. Vuelve a elegir tu función.");
        window.location.href = "index.html";
        return;
    }

    renderSummary(reserva_flow);
    prefillFromSession();
    initCardVisual();
    initDownloadTicket();
    initCancelLink();
    btnConfirm.addEventListener("click", () => handleConfirm(btnConfirm, "purchase"));

    const reserveBtn = document.querySelector("[data-reserve-btn]");
    if (reserveBtn) reserveBtn.addEventListener("click", () => handleConfirm(reserveBtn, "reservation"));

    // Red de seguridad: si cierran la pestaña o navegan afuera sin confirmar
    // ni cancelar explícitamente, los asientos "selected" de esta sesión se
    // liberan igual -- no deben quedar bloqueados por abandono.
    window.addEventListener("beforeunload", () => {
        if (!reserva_confirmed && !reserva_leaving) releaseReservaSeats(true);
    });
});

/** "✕ Cancelar": libera los asientos que esta pestaña había tomado (vuelven
 *  a estar disponibles para cualquiera) antes de volver al mapa de asientos. */
function initCancelLink() {
    const link = document.querySelector("[data-cancel-link]");
    if (!link) return;
    link.addEventListener("click", async (e) => {
        e.preventDefault();
        reserva_leaving = true;
        await releaseReservaSeats(false);
        window.location.href = link.getAttribute("href");
    });
}

async function releaseReservaSeats(useBeacon) {
    if (!reserva_flow?.seats?.length) return;
    const ids = reserva_flow.seats.map((s) => s.functionSeatId);
    if (useBeacon) {
        ids.forEach((id) => {
            try {
                fetch(`${CONFIG.JSON_SERVER_URL}/functionSeats/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "available", holderToken: null, selectedAt: null }),
                    keepalive: true
                });
            } catch {
                /* best-effort: si falla, se autolimpia por vencimiento (ver CINE.getSeatMap) */
            }
        });
        return;
    }
    await Promise.all(ids.map((id) => CINE.releaseFunctionSeat(id).catch(() => {})));
}

/** Si hay sesión activa, precarga nombre/email (siguen siendo editables) --
 *  el login es un plus, no un requisito: sin sesión el flujo manual de
 *  siempre sigue funcionando igual. */
function prefillFromSession() {
    const user = AuthStore.get();
    if (!user) return;
    const nameInput = document.querySelector("[data-input-name]");
    const emailInput = document.querySelector("[data-input-email]");
    if (nameInput && !nameInput.value) nameInput.value = user.name;
    if (emailInput && !emailInput.value) emailInput.value = user.email;
}

function renderSummary(flow) {
    document.querySelectorAll("[data-checkout-seats]").forEach((el) => {
        el.textContent = `${flow.seats.map((s) => s.seatCode).join(", ")} (${flow.quantity} ${flow.quantity === 1 ? "ticket" : "tickets"})`;
    });
    document.querySelectorAll("[data-checkout-total]").forEach((el) => (el.textContent = formatCurrency(flow.total)));
    document.querySelectorAll("[data-checkout-unit-price]").forEach((el) => (el.textContent = formatCurrency(flow.price)));
    document.querySelectorAll("[data-checkout-time]").forEach((el) => (el.textContent = flow.time || "—"));
    document.querySelectorAll("[data-checkout-date]").forEach((el) => (el.textContent = formatDate(flow.date)));
    document.querySelectorAll("[data-checkout-room]").forEach(async (el) => {
        try {
            const room = await CINE.getRoom(flow.roomId);
            el.textContent = room ? room.name.toUpperCase() : "—";
        } catch {
            el.textContent = "—";
        }
    });

    const titleEls = document.querySelectorAll("[data-checkout-movie-title]");
    if (titleEls.length) {
        TMDB.getMovieDetails(flow.tmdbId)
            .then((movie) => titleEls.forEach((el) => (el.textContent = movie.title)))
            .catch(() => titleEls.forEach((el) => (el.textContent = flow.movieTitle || "Película")));
    }

    const errorBox = document.querySelector("[data-checkout-error]");
    if (errorBox) errorBox.classList.add("hidden");
}

function showCheckoutError(message) {
    const errorBox = document.querySelector("[data-checkout-error]");
    const errorText = document.querySelector("[data-checkout-error-text]");
    if (errorBox) {
        (errorText || errorBox).textContent = message;
        errorBox.classList.remove("hidden");
    } else {
        showToast(message, "error");
    }
}

// ---------------------------------------------------------------------------
// Tarjeta 3D: autoformateo, detección de marca, preview en vivo y flip real
// (rotateY) al enfocar el CVV -- ver .card-visual en css/styles.css.
// ---------------------------------------------------------------------------
function detectCardBrand(digits) {
    if (/^4/.test(digits)) return "VISA";
    if (/^(5[1-5]|2[2-7])/.test(digits)) return "MASTERCARD";
    if (/^3[47]/.test(digits)) return "AMEX";
    if (/^6(?:011|5)/.test(digits)) return "DISCOVER";
    return "TARJETA";
}

function initCardVisual() {
    const visual = document.querySelector("[data-card-visual]");
    const nameInput = document.querySelector("[data-card-name]");
    const numberInput = document.querySelector("[data-card-number]");
    const expiryInput = document.querySelector("[data-card-expiry]");
    const cvvInput = document.querySelector("[data-card-cvv]");
    if (!visual || !numberInput) return;

    const brandEl = document.querySelector("[data-card-brand]");
    const numberPreview = document.querySelector("[data-card-number-preview]");
    const namePreview = document.querySelector("[data-card-name-preview]");
    const expiryPreview = document.querySelector("[data-card-expiry-preview]");
    const cvvPreview = document.querySelector("[data-card-cvv-preview]");

    numberInput.addEventListener("input", () => {
        const digits = numberInput.value.replace(/\D/g, "").slice(0, 16);
        numberInput.value = digits.replace(/(.{4})/g, "$1 ").trim();
        const groups = digits.padEnd(16, "•").match(/.{1,4}/g) || [];
        if (numberPreview) numberPreview.textContent = groups.join(" ");
        if (brandEl) brandEl.textContent = digits ? detectCardBrand(digits) : "TARJETA";
    });

    nameInput?.addEventListener("input", () => {
        if (namePreview) namePreview.textContent = nameInput.value.trim().toUpperCase() || "NOMBRE APELLIDO";
    });

    expiryInput?.addEventListener("input", () => {
        let digits = expiryInput.value.replace(/\D/g, "").slice(0, 4);
        if (digits.length >= 3) digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        expiryInput.value = digits;
        if (expiryPreview) expiryPreview.textContent = digits || "MM/AA";
    });

    cvvInput?.addEventListener("input", () => {
        cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 4);
        if (cvvPreview) cvvPreview.textContent = cvvInput.value.padEnd(3, "•");
    });
    cvvInput?.addEventListener("focus", () => visual.classList.add("is-flipped"));
    cvvInput?.addEventListener("blur", () => visual.classList.remove("is-flipped"));
}

/** Valida el formato de la tarjeta (nunca valida "de verdad" con un banco --
 *  esto es una pasarela simulada). Devuelve {ok, message} en vez de lanzar,
 *  para que el llamador decida qué campo enfocar. */
function validateCard() {
    const name = document.querySelector("[data-card-name]")?.value.trim() || "";
    const digits = (document.querySelector("[data-card-number]")?.value || "").replace(/\D/g, "");
    const expiry = document.querySelector("[data-card-expiry]")?.value.trim() || "";
    const cvv = document.querySelector("[data-card-cvv]")?.value.trim() || "";

    if (!name) return { ok: false, field: "[data-card-name]", message: "Ingresa el nombre tal como figura en la tarjeta." };
    if (digits.length < 13 || digits.length > 16) return { ok: false, field: "[data-card-number]", message: "El número de tarjeta no es válido." };

    const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
    if (!match) return { ok: false, field: "[data-card-expiry]", message: "Ingresa el vencimiento en formato MM/AA." };
    const month = parseInt(match[1], 10);
    const year = 2000 + parseInt(match[2], 10);
    if (month < 1 || month > 12) return { ok: false, field: "[data-card-expiry]", message: "El mes de vencimiento no es válido." };
    const now = new Date();
    const expiryDate = new Date(year, month); // primer día del mes SIGUIENTE al vencimiento
    if (expiryDate <= now) return { ok: false, field: "[data-card-expiry]", message: "La tarjeta está vencida." };

    if (cvv.length < 3 || cvv.length > 4) return { ok: false, field: "[data-card-cvv]", message: "El CVV no es válido." };

    return { ok: true, brand: detectCardBrand(digits), last4: digits.slice(-4) };
}

/** Secuencia visual de "procesando pago" (puramente simulada, sin backend
 *  de pagos real detrás) -- refuerza que comprar entradas se sienta como
 *  pasar por una pasarela real y no un simple guardado instantáneo. */
function runPaymentSimulation(triggerBtn) {
    const steps = ["Verificando tarjeta...", "Procesando pago...", "Pago aprobado ✓"];
    let i = 0;
    return new Promise((resolve) => {
        const tick = () => {
            triggerBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;"></span> ${steps[i]}`;
            i++;
            if (i < steps.length) setTimeout(tick, 420);
            else setTimeout(resolve, 380);
        };
        tick();
    });
}

async function handleConfirm(triggerBtn, mode) {
    const nameInput = document.querySelector("[data-input-name]");
    const emailInput = document.querySelector("[data-input-email]");

    nameInput?.classList.remove("has-error");
    emailInput?.classList.remove("has-error");
    document.querySelectorAll("[data-card-name],[data-card-number],[data-card-expiry],[data-card-cvv]").forEach((el) => el.classList.remove("has-error"));

    if (nameInput && !nameInput.value.trim()) {
        nameInput.focus();
        nameInput.classList.add("has-error");
        showCheckoutError("Ingresa tu nombre completo para continuar.");
        return;
    }
    const emailOk = emailInput && /.+@.+\..+/.test(emailInput.value.trim());
    if (emailInput && !emailOk) {
        emailInput.focus();
        emailInput.classList.add("has-error");
        showCheckoutError("Ingresa un correo electrónico válido para continuar.");
        return;
    }

    // La tarjeta solo se exige para "comprar" -- "reservar sin pagar" no cobra nada.
    let card = null;
    if (mode === "purchase") {
        card = validateCard();
        if (!card.ok) {
            const field = document.querySelector(card.field);
            field?.focus();
            field?.classList.add("has-error");
            showCheckoutError(card.message);
            return;
        }
    }

    const errorBox = document.querySelector("[data-checkout-error]");
    if (errorBox) errorBox.classList.add("hidden");

    const originalLabel = triggerBtn.innerHTML;
    triggerBtn.disabled = true;

    try {
        if (mode === "purchase") {
            await runPaymentSimulation(triggerBtn);
        } else {
            triggerBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;"></span> Procesando...`;
        }

        // 1) Re-validar disponibilidad REAL justo antes de confirmar: el
        // asiento debe seguir "selected" Y a nombre de ESTA pestaña (mismo
        // holderToken) -- si otra sesión lo tomó después, se rechaza.
        const functionSeatIds = reserva_flow.seats.map((s) => s.functionSeatId);
        const holderToken = reserva_flow.holderToken || SessionToken.get();
        const stillAvailable = await CINE.verifySeatsAvailable(reserva_flow.functionId, functionSeatIds, holderToken);

        if (!stillAvailable) {
            showCheckoutError(
                "Uno de los asientos seleccionados ya no está disponible. Vuelve al mapa de asientos y elige otro."
            );
            triggerBtn.disabled = false;
            triggerBtn.innerHTML = originalLabel;
            return;
        }

        const sessionUser = AuthStore.get();
        const payload = {
            userId: sessionUser ? sessionUser.id : null,
            userName: nameInput?.value.trim() || "",
            email: emailInput?.value.trim() || "",
            tmdbId: reserva_flow.tmdbId,
            functionId: reserva_flow.functionId,
            roomId: reserva_flow.roomId,
            quantity: reserva_flow.quantity,
            seats: reserva_flow.seats.map((s) => ({ seatId: Number(s.seatId), seatCode: s.seatCode, location: s.location }))
        };

        const newStatus = mode === "purchase" ? "sold" : "reserved";
        const record =
            mode === "purchase"
                ? await CINE.createPurchase({
                      ...payload,
                      unitPrice: reserva_flow.price,
                      total: Number(reserva_flow.total),
                      // Nunca se guarda el número completo ni el CVV -- solo lo
                      // que cualquier pasarela real devolvería para un recibo.
                      paymentMethod: { brand: card.brand, last4: card.last4 }
                  })
                : await CINE.createReservation(payload);

        // 2) Marcar los asientos como vendidos/reservados en JSON Server (ya
        // no están "en selección" de nadie, así que se limpia el holder).
        await Promise.all(
            functionSeatIds.map((id) => CINE.updateFunctionSeat(id, newStatus, { holderToken: null, selectedAt: null }))
        );

        reserva_confirmed = true; // los asientos ya son reserved/sold: nada que liberar al salir
        showSuccessView(record, mode);
        FlowStore.clear();
    } catch (err) {
        console.error(err);
        showCheckoutError(err.message || "No se pudo completar la operación. Intenta nuevamente.");
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = originalLabel;
    }
}

function showSuccessView(record, mode) {
    const viewCheckout = document.getElementById("view-checkout");
    const viewSuccess = document.getElementById("view-success");
    if (!viewCheckout || !viewSuccess) return;

    const successTitle = document.querySelector("[data-success-title]");
    if (successTitle) successTitle.textContent = mode === "purchase" ? "Compra confirmada" : "Reserva confirmada";

    // Toda la información de lo que compró/reservó el usuario, para que el
    // ticket (y su versión impresa) no deje nada afuera.
    const buyerEl = document.querySelector("[data-ticket-buyer]");
    if (buyerEl) buyerEl.textContent = record.userName || "—";
    const emailEl = document.querySelector("[data-ticket-email]");
    if (emailEl) emailEl.textContent = record.email || "—";
    const totalEl = document.querySelector("[data-ticket-total]");
    if (totalEl) totalEl.textContent = formatCurrency(reserva_flow.total);
    const paymentRow = document.querySelector("[data-ticket-payment-row]");
    const paymentEl = document.querySelector("[data-ticket-payment]");
    if (mode === "purchase" && record.paymentMethod) {
        if (paymentEl) paymentEl.textContent = `${record.paymentMethod.brand} •••• ${record.paymentMethod.last4}`;
        if (paymentRow) paymentRow.classList.remove("hidden");
    } else if (paymentRow) {
        paymentRow.classList.add("hidden"); // reserva sin pagar: no hay tarjeta que mostrar
    }

    document.querySelectorAll("[data-ticket-code]").forEach((el) => {
        const prefix = mode === "purchase" ? "CVRS" : "RSV";
        el.textContent = `${prefix}-${String(record.id).padStart(4, "0")}`;
    });

    if (typeof Animations !== "undefined") Animations.viewTransition(viewCheckout, viewSuccess);
    else {
        viewCheckout.classList.add("hidden");
        viewSuccess.classList.remove("hidden");
        viewSuccess.classList.add("flex");
    }
}

/** "Descargar ticket": el diálogo nativo de impresión del navegador (con
 *  el ticket como única vista, vía @media print) permite imprimir o
 *  "Guardar como PDF" -- es la simulación de descarga sin inventar
 *  generación de archivos ni traer una librería de PDF. */
function initDownloadTicket() {
    const btn = document.querySelector("[data-download-ticket]");
    if (btn) btn.addEventListener("click", () => window.print());
}

/**
 * js/mis-tickets.js
 * Lógica de mis-tickets.html: historial real de compras/reservas del
 * usuario logueado (JSON Server, filtrado por userId), con un botón para
 * ver el ticket completo (mismo componente `.ticket` que reserva.html,
 * imprimible/descargable con el mismo mecanismo).
 */
document.addEventListener("DOMContentLoaded", () => {
    const list = document.querySelector("[data-tickets-list]");
    if (!list) return;

    const user = AuthStore.get();
    if (!user) {
        list.innerHTML = `
            <div class="state-block">
                <span class="state-block__icon">—</span>
                <p class="state-block__text">Inicia sesión para ver el historial de tickets que compraste.</p>
                <a href="login.html" class="btn btn-gold" style="margin-top:10px;">Iniciar sesión</a>
            </div>`;
        return;
    }

    loadTickets(list, user);
});

async function loadTickets(list, user) {
    showLoading(list, "Cargando tu historial...");
    try {
        const [purchases, reservations] = await Promise.all([
            CINE.getPurchasesByUser(user.id),
            CINE.getReservationsByUser(user.id)
        ]);

        const all = [
            ...purchases.map((p) => ({ ...p, kind: "purchase" })),
            ...reservations.map((r) => ({ ...r, kind: "reservation" }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (!all.length) {
            showEmpty(list, "Todavía no compraste ni reservaste ningún ticket.");
            return;
        }

        // Se hidrata (película + sala + función) UNA vez por ticket y se
        // guarda en `enriched`: la fila y el modal "Ver ticket" reutilizan
        // los mismos datos, sin volver a pedirlos a TMDB/JSON Server.
        const enriched = await Promise.all(all.map(hydrateTicket));
        list.innerHTML = enriched.map(rowMarkup).join("");

        list.querySelectorAll("[data-view-ticket]").forEach((btn, i) => {
            btn.addEventListener("click", () => openTicketModal(enriched[i]));
        });

        if (typeof Animations !== "undefined") Animations.initRevealGrid(list, ".ticket-history-item");
    } catch (err) {
        console.error(err);
        showError(list, err.message || "No se pudo cargar tu historial de tickets.");
    }
}

/** La fecha/hora viven en la función, no en la reserva/compra en sí --
 *  se resuelven con la misma capa CINE que usa el resto del proyecto. */
async function hydrateTicket(item) {
    const [movie, room, fn] = await Promise.all([
        TMDB.getMovieDetails(item.tmdbId).catch(() => null),
        CINE.getRoom(item.roomId).catch(() => null),
        CINE.getFunction(item.functionId).catch(() => null)
    ]);
    return { ...item, movie, room, fn };
}

function ticketCode(t) {
    const prefix = t.kind === "purchase" ? "CVRS" : "RSV";
    return `${prefix}-${String(t.id).padStart(4, "0")}`;
}

function rowMarkup(t) {
    const title = t.movie ? t.movie.title : "Película";
    const poster = t.movie ? TMDB.imageUrl(t.movie.poster_path, "w185") : null;
    const isPurchase = t.kind === "purchase";
    const seats = (t.seats || []).map((s) => s.seatCode).join(", ");

    return `
        <div class="ticket-history-item glass-panel">
            <div class="ticket-history-item__poster">
                ${poster ? `<img src="${poster}" alt="${title}" loading="lazy"/>` : `<div class="ticket-history-item__poster--placeholder"></div>`}
            </div>
            <div class="ticket-history-item__body">
                <div class="ticket-history-item__top">
                    <h3 class="ticket-history-item__title">${title}</h3>
                    <span class="badge ${isPurchase ? "badge-gold" : "badge-blue"}">${isPurchase ? "COMPRADO" : "RESERVADO"}</span>
                </div>
                <div class="ticket-history-item__meta">
                    <span>${t.fn ? formatDate(t.fn.date) : "—"}</span>
                    <span>${t.fn ? t.fn.time : "—"}</span>
                    <span>${t.room ? t.room.name.toUpperCase() : "SALA"}</span>
                    <span>${seats || "—"}</span>
                </div>
                ${isPurchase ? `<div class="ticket-history-item__price">${formatCurrency(t.total)}${t.paymentMethod ? ` · ${t.paymentMethod.brand} •••• ${t.paymentMethod.last4}` : ""}</div>` : ""}
            </div>
            <div class="ticket-history-item__code">
                <span class="ticket-code">${ticketCode(t)}</span>
                <button class="btn btn-outline" data-view-ticket type="button">Ver ticket</button>
            </div>
        </div>`;
}

// ---------------------------------------------------------------------------
// Modal "Ver ticket": mismo componente .ticket que reserva.html, para que
// la información se vea (y se imprima) exactamente igual en los dos lugares.
// ---------------------------------------------------------------------------
function ticketMarkup(t) {
    const title = t.movie ? t.movie.title : "Película";
    const isPurchase = t.kind === "purchase";
    const seats = (t.seats || []).map((s) => s.seatCode).join(", ");

    return `
        <div class="ticket">
            <div class="ticket__stub">
                <span style="font-family:var(--font-label);font-size:11px;letter-spacing:.15em;color:var(--text-faint);">PREMIUM CINEMA</span>
            </div>
            <div class="ticket__body">
                <div class="checkout-summary__movie">${title}</div>
                <div class="ticket-grid">
                    <div><span class="k">FECHA</span><span class="v">${t.fn ? formatDate(t.fn.date) : "—"}</span></div>
                    <div><span class="k">HORA</span><span class="v">${t.fn ? t.fn.time : "—"}</span></div>
                    <div><span class="k">SALA</span><span class="v">${t.room ? t.room.name.toUpperCase() : "—"}</span></div>
                    <div><span class="k">ASIENTOS</span><span class="v">${seats || "—"}</span></div>
                    <div><span class="k">COMPRADOR</span><span class="v">${t.userName || "—"}</span></div>
                    <div><span class="k">CORREO</span><span class="v">${t.email || "—"}</span></div>
                    ${isPurchase && t.paymentMethod ? `<div><span class="k">PAGO CON</span><span class="v">${t.paymentMethod.brand} •••• ${t.paymentMethod.last4}</span></div>` : ""}
                    ${isPurchase ? `<div><span class="k">TOTAL</span><span class="v" style="color:var(--gold);">${formatCurrency(t.total)}</span></div>` : ""}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:18px;">
                    <div>
                        <div class="field-label">CÓDIGO</div>
                        <div class="ticket-code">${ticketCode(t)}</div>
                    </div>
                    <div style="width:56px;height:56px;background:#fff;border-radius:4px;"></div>
                </div>
            </div>
        </div>`;
}

function ensureTicketModal() {
    let modal = document.getElementById("ticket-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "ticket-modal";
    modal.className = "trailer-modal";
    modal.innerHTML = `
        <div class="trailer-modal__backdrop" data-ticket-modal-close></div>
        <div class="trailer-modal__panel ticket-modal__panel">
            <button class="trailer-modal__close" data-ticket-modal-close type="button" aria-label="Cerrar">✕</button>
            <div data-ticket-modal-content></div>
            <button class="btn btn-gold btn-block" data-print-ticket type="button" style="margin-top:20px;">Descargar ticket</button>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-ticket-modal-close]").forEach((el) => el.addEventListener("click", closeTicketModal));
    modal.querySelector("[data-print-ticket]").addEventListener("click", () => window.print());
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeTicketModal();
    });
    return modal;
}

function openTicketModal(t) {
    const modal = ensureTicketModal();
    modal.querySelector("[data-ticket-modal-content]").innerHTML = ticketMarkup(t);
    modal.classList.add("is-open");
    document.body.classList.add("no-scroll");
    if (typeof Animations !== "undefined") Animations.playModalReveal(modal);
}

function closeTicketModal() {
    const modal = document.getElementById("ticket-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
}

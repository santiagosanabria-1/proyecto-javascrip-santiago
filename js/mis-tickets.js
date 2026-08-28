/**
 * js/mis-tickets.js
 * Lógica de mis-tickets.html: historial real de compras/reservas del
 * usuario logueado (JSON Server, filtrado por userId) para que sepa
 * exactamente qué tickets compró.
 */
document.addEventListener("DOMContentLoaded", () => {
    const list = document.querySelector("[data-tickets-list]");
    if (!list) return;

    const user = AuthStore.get();
    if (!user) {
        list.innerHTML = `
            <div class="state-block">
                <span class="state-block__icon">🔒</span>
                <p class="state-block__text">Inicia sesión para ver el historial de tickets que compraste.</p>
                <a href="login.html" class="btn btn-gold" style="margin-top:10px;">👤 Iniciar sesión</a>
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

        const rendered = await Promise.all(all.map(renderTicketRow));
        list.innerHTML = rendered.join("");
        if (typeof Animations !== "undefined") Animations.initRevealGrid(list, ".ticket-history-item");
    } catch (err) {
        console.error(err);
        showError(list, err.message || "No se pudo cargar tu historial de tickets.");
    }
}

async function renderTicketRow(item) {
    // La fecha/hora viven en la función, no en la reserva/compra en sí --
    // se resuelven con la misma capa CINE que usa el resto del proyecto.
    const [movie, room, fn] = await Promise.all([
        TMDB.getMovieDetails(item.tmdbId).catch(() => null),
        CINE.getRoom(item.roomId).catch(() => null),
        CINE.getFunction(item.functionId).catch(() => null)
    ]);

    const title = movie ? movie.title : "Película";
    const poster = movie ? TMDB.imageUrl(movie.poster_path, "w185") : null;
    const isPurchase = item.kind === "purchase";
    const code = `${isPurchase ? "CVRS" : "RSV"}-${String(item.id).padStart(4, "0")}`;
    const seats = (item.seats || []).map((s) => s.seatCode).join(", ");

    return `
        <div class="ticket-history-item glass-panel">
            <div class="ticket-history-item__poster">
                ${poster ? `<img src="${poster}" alt="${title}" loading="lazy"/>` : `<div class="ticket-history-item__poster--placeholder">🎬</div>`}
            </div>
            <div class="ticket-history-item__body">
                <div class="ticket-history-item__top">
                    <h3 class="ticket-history-item__title">${title}</h3>
                    <span class="badge ${isPurchase ? "badge-gold" : "badge-blue"}">${isPurchase ? "COMPRADO" : "RESERVADO"}</span>
                </div>
                <div class="ticket-history-item__meta">
                    <span>${fn ? formatDate(fn.date) : "—"}</span>
                    <span>${fn ? fn.time : "—"}</span>
                    <span>${room ? room.name.toUpperCase() : "SALA"}</span>
                    <span>${seats || "—"}</span>
                </div>
                ${isPurchase ? `<div class="ticket-history-item__price">${formatCurrency(item.total)}${item.paymentMethod ? ` · ${item.paymentMethod.brand} •••• ${item.paymentMethod.last4}` : ""}</div>` : ""}
            </div>
            <div class="ticket-history-item__code">
                <span class="field-label">CÓDIGO</span>
                <span class="ticket-code">${code}</span>
            </div>
        </div>`;
}

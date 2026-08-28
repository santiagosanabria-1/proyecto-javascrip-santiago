/**
 * js/store.js
 * Estado del flujo de reserva/compra compartido entre páginas (sessionStorage).
 * Sin lógica de negocio: solo lectura/escritura del "carrito" función+asientos.
 */
const FLOW_KEY = "cineverse_flow";

const FlowStore = {
    get() {
        try {
            return JSON.parse(sessionStorage.getItem(FLOW_KEY)) || null;
        } catch {
            return null;
        }
    },
    set(data) {
        const current = FlowStore.get() || {};
        sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...current, ...data }));
    },
    clear() {
        sessionStorage.removeItem(FLOW_KEY);
    }
};

/**
 * Sesión del usuario logueado (login.js la escribe, el resto de páginas
 * solo la leen para pintar el navbar / precargar datos de compra). Vive en
 * localStorage (no sessionStorage) para persistir entre pestañas y visitas
 * — es la sesión, no el carrito de compra. Nunca guarda el password ni su
 * hash, solo los datos públicos del usuario.
 */
const AUTH_KEY = "cineverse_auth";

const AuthStore = {
    get() {
        try {
            return JSON.parse(localStorage.getItem(AUTH_KEY)) || null;
        } catch {
            return null;
        }
    },
    set(user) {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ id: user.id, name: user.name, email: user.email }));
    },
    clear() {
        localStorage.removeItem(AUTH_KEY);
    }
};

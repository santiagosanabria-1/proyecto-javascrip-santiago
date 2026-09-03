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

/**
 * Identifica esta pestaña/sesión de navegación (no al usuario logueado --
 * funciona igual sin sesión) para poder distinguir "yo seleccioné este
 * asiento" de "otra persona lo seleccionó". Es lo que hace que dos personas
 * NUNCA puedan terminar comprando el mismo asiento: si ambas lo seleccionan,
 * la segunda escritura gana en localStorage y el token de la primera deja de
 * coincidir, así que su confirmación se rechaza en verifySeatsAvailable.
 */
const SESSION_TOKEN_KEY = "cineverse_session_token";

const SessionToken = {
    get() {
        try {
            let token = sessionStorage.getItem(SESSION_TOKEN_KEY);
            if (!token) {
                token = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                sessionStorage.setItem(SESSION_TOKEN_KEY, token);
            }
            return token;
        } catch {
            return "tok_fallback";
        }
    }
};

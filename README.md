# CINEVERSE

Sistema web para la gestión de cartelera de cine mediante la API de TMDB.
Plataforma de cine premium con cartelera real, ficha de película, selección
de asientos en 3D, pasarela de pago simulada, login con historial de
tickets y una experiencia de scroll construida con GSAP + ScrollTrigger.

## Stack

- HTML5 + CSS3 + JavaScript (vanilla, sin frameworks de frontend)
- [TMDB API](https://www.themoviedb.org/documentation/api) — catálogo real de películas, reparto, director, trailers
- [JSON Server](https://github.com/typicode/json-server) — backend simulado (salas, funciones, asientos, reservas, compras, usuarios)
- [GSAP](https://gsap.com/) + ScrollTrigger — animaciones y experiencia de scroll

## Funcionalidades

- Cartelera real del cine (no todo el catálogo de TMDB) con búsqueda paginada sobre TMDB completo
- Ficha de película con reparto, director, trailer y funciones disponibles
- Mapa de asientos generado dinámicamente con estados `available/selected/reserved/sold`
- Pasarela de pago simulada con tarjeta 3D (flip real al ingresar el CVV) — nunca guarda el número completo ni el CVV
- Ticket final con toda la información de la compra, descargable/imprimible (`window.print` + hoja `@media print` dedicada)
- Login y registro con contraseña hasheada (SHA-256, Web Crypto nativo — sin librerías externas)
- Historial de tickets ("Mis tickets") por usuario
- Prevención real de doble reserva: se revalida disponibilidad contra el servidor antes de confirmar

## Arquitectura

```
├── index.html          Cartelera + hero + galería
├── pelicula.html        Ficha de película
├── funcion.html          Selección de asientos
├── reserva.html          Pago + ticket
├── login.html            Login / registro
├── mis-tickets.html      Historial de tickets
│
├── css/
│   ├── styles.css         Sistema de diseño (tokens, componentes)
│   └── animations.css     Estados iniciales de reveal + accesibilidad
│
├── js/
│   ├── config.js          Configuración (API keys, URLs)
│   ├── store.js            FlowStore (carrito) + AuthStore (sesión)
│   ├── ui-helpers.js        Estados de UI, formato, navbar/auth compartidos
│   ├── cartelera.js / pelicula.js / funcion.js / reserva.js / login.js / mis-tickets.js
│   ├── animations/          Módulos GSAP por página (global, home, movie, seats)
│   └── api/
│       ├── tmdb.js          Única puerta de entrada a TMDB
│       └── cine.js          Única puerta de entrada a JSON Server
│
├── scripts/seed.js       Genera db.json con datos de demostración
└── db.json               (generado, no versionado)
```

## Cómo ejecutarlo

```bash
npm install
npm run seed      # genera db.json con la programación del cine
npm run server    # levanta JSON Server en el puerto 4000
```

Servir la carpeta con cualquier servidor estático (nunca `file://`, porque
la app usa `fetch`), por ejemplo:

```bash
npx serve .
```

Antes de correrlo, completar `CONFIG.TMDB_API_KEY` en `js/config.js` con
una API Key propia de TMDB (gratuita en
https://www.themoviedb.org/settings/api).

## Notas

- La autenticación es de nivel demo (sin salt, sin servidor de sesiones
  real) — suficiente para este proyecto, no para producción.
- La pasarela de pago es 100% simulada: no procesa ningún cobro real.

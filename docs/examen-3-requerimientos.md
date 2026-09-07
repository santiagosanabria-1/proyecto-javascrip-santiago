# Examen Práctico 3 — Compra de Tickets con Tipos de Asiento y Descuentos

> Documento de requerimientos extraído de `ExamenesSeleccionados.pdf` (Examen 3 de 7).
> Objetivo: dejar la especificación versionada en el repo antes de comenzar la implementación.

## Situación

El cine incorporará salas con diferentes categorías de asiento y promociones comerciales.

## Objetivo

Implementar una compra cuyo precio dependa del tipo de silla y de promociones administradas mediante JSON Server.

## Tipos de asiento

El sistema deberá manejar tres categorías: `standard`, `premium`, `vip`.

```json
{
  "id": 25,
  "roomId": 2,
  "row": "D",
  "number": 4,
  "seatCode": "D4",
  "type": "vip"
}
```

## Requerimientos funcionales

- **RF-01. Mostrar tipos visualmente** — Los tres tipos de asiento deben diferenciarse en la interfaz.
- **RF-02. Precios** — El precio base de una función se usa para calcular:
  - Standard = precio base
  - Premium = precio base + 25%
  - VIP = precio base + 50%
- **RF-03. Selección** — Permitir seleccionar asientos de diferentes categorías en una misma compra.
- **RF-04. Resumen detallado** — Ejemplo:
  ```
  B3 Standard   $18.000
  B4 Standard   $18.000
  D3 VIP        $27.000

  Subtotal      $63.000
  ```
- **RF-05. Código promocional** — Campo "Código promocional"; los códigos se consultan desde JSON Server:
  ```json
  { "id": 1, "code": "CINE20", "discount": 20, "active": true }
  ```
- **RF-06. Validar promoción** — El descuento solo se aplica si el código existe y está `active`. Si no: `Código promocional inválido.`
- **RF-07. Aplicación de descuento** — Ejemplo con subtotal `$60.000` y descuento `20%`:
  ```
  Subtotal: $60.000
  Descuento: $12.000
  Total: $48.000
  ```
- **RF-08. Evitar aplicar dos veces el código** — El mismo código no puede incrementar el descuento repetidamente al presionar el botón varias veces.
- **RF-09. Método de pago** — Selección obligatoria entre: Tarjeta, Efectivo, PSE.
- **RF-10. Confirmación** — Mostrar un resumen completo antes de comprar.
- **RF-11. Registro** — Guardar la compra, ejemplo:
  ```json
  {
    "functionId": 5,
    "seats": [
      { "seatCode": "B3", "type": "standard", "price": 18000 },
      { "seatCode": "D3", "type": "vip", "price": 27000 }
    ],
    "subtotal": 45000,
    "discount": 9000,
    "total": 36000,
    "paymentMethod": "PSE"
  }
  ```
- **RF-12. Actualización** — Todos los asientos comprados deben actualizarse a `sold`.

## Reglas comunes (aplican a todos los exámenes)

1. Todo contenido dependiente de las APIs se genera/actualiza por JavaScript (DOM), nunca escrito estático en HTML.
2. Toda consulta usa `fetch()`, preferiblemente con `async/await` + `try/catch`:
   ```js
   async function cargarDatos() {
       try {
           const response = await fetch(url);
           if (!response.ok) throw new Error("Error al consultar los datos");
           const data = await response.json();
       } catch (error) {
           console.error(error);
       }
   }
   ```
3. Manejo de errores explícito: API no disponible, película inexistente, datos incompletos, operación no válida, error al guardar.
4. Evitar código duplicado, funciones gigantes, variables globales innecesarias. Se valora dividir en funciones como `loadMovies()`, `renderSeats()`, `selectSeat()`, `calculateTotal()`, `validateForm()`, `saveReservation()`.

## Rúbrica (100 pts)

| Criterio | Puntos |
|---|---|
| Construcción dinámica del mapa de asientos | 15 |
| Manejo de tipos de silla | 15 |
| Cálculo de precios y total de compra | 20 |
| Gestión de código promocional | 15 |
| Validaciones del proceso de compra | 10 |
| Resumen y confirmación de compra | 10 |
| Persistencia y actualización en JSON Server | 10 |
| Diseño responsive y usabilidad | 5 |
| **Total** | **100** |

### Desglose de evaluación

| Criterio | Aspectos que se evalúan |
|---|---|
| Construcción dinámica del mapa de asientos | Mapa generado con JS a partir de los datos de la sala; filas, códigos y estados correctos; solo permite seleccionar/deseleccionar asientos disponibles. |
| Manejo de tipos de silla | Diferencia `standard`/`premium`/`vip` visualmente y los usa para calcular precio. |
| Cálculo de precios y total de compra | Standard = base, premium +25%, vip +50%; subtotal/descuento/total se recalculan dinámicamente al seleccionar o quitar asientos. |
| Gestión de código promocional | Consulta JSON Server, valida existencia + `active`, aplica el % correcto, evita duplicar el descuento, mensajes claros si es inválido. |
| Validaciones del proceso de compra | Función seleccionada, al menos una silla, disponibilidad vigente, método de pago elegido; bloquea operaciones inválidas. |
| Resumen y confirmación de compra | Película, función, sala, sillas, tipo y precio individual, subtotal, descuento, total, método de pago — todo dinámico. |
| Persistencia y actualización en JSON Server | Registra la compra vía HTTP y actualiza los asientos comprados a `sold`; la UI refleja el cambio. |
| Diseño responsive y usabilidad | Funciona en escritorio/tablet/móvil; mapa de asientos legible y con controles táctiles adecuados. |

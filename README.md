# Apolonia · App de pedidos mayoristas

App web (se instala en el celular como una app) para que los clientes de la fábrica de pastas Apolonia hagan sus pedidos.

- **Restaurantes** ven y piden porciones congeladas.
- **Mayoristas** ven y piden cajas congeladas.
- Cada cliente entra con su email y contraseña. Al confirmar un pedido descarga el **remito en PDF** (comprobante interno, no fiscal), que también le queda guardado en "Mis pedidos".
- El dueño entra con su cuenta de administrador y tiene: pedidos (con estados), "A producir" (suma de lo pendiente por producto), clientes (aprobar, bloquear, cambiar tipo), productos y precios, y los datos que salen en el remito.

Es un proyecto aparte: no comparte base, usuarios ni código con ningún otro negocio.

## Dónde está cada cosa
- `web/` · la app (HTML, CSS y JavaScript, sin paso de compilación). Se publica tal cual en Vercel.
- `web/config.js` · dirección y clave pública de la base de Apolonia.
- `supabase/migrations/` · estructura de la base, permisos y catálogo inicial.

## Cuentas
- Base de datos y usuarios: Supabase, proyecto `apolonia` (`jhhalxfmcbbxiiwcidkg`, región San Pablo).

## Alta de clientes
1. El cliente entra a la app → "Soy cliente nuevo" → completa datos del negocio.
2. Queda pendiente. El administrador lo habilita en la pestaña **Clientes** (y confirma si es restaurante o mayorista).

## Dar permiso de administrador
La persona se registra primero en la app. Después, en Supabase → SQL Editor:

```sql
select apo_hacer_admin('mail@de-la-persona.com');
```

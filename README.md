# AlertaArroyo

Plataforma web de reporte ciudadano y alerta temprana geolocalizada para la mitigación del riesgo por desbordamiento de arroyos en el área metropolitana de Barranquilla.

Proyecto de grado – Ingeniería de Sistemas, UNAD (curso 202016907, Grupo 15). Prototipo funcional, nivel de madurez TRL 5.
Autores: Camilo Andrés Oliveros Taborda y Eduardo Guzmán Ceballos.

## Qué hace
| Requerimiento | Funcionalidad |
|---|---|
| RF1 | Registro e inicio de sesión, con autorización de tratamiento de datos (Ley 1581 de 2012) |
| RF2 | Reporte de un arroyo: ubicación, nivel del agua (bajo/medio/alto), descripción y foto opcional |
| RF3 | Mapa (OpenStreetMap + Leaflet) con reportes activos por nivel y zonas piloto |
| RF4 | Alerta automática a usuarios dentro del radio (1 000 m por defecto) de un reporte activo, calculada con PostGIS (`ST_DWithin`) |
| RF5 | Panel de administración: validar, marcar como resuelto o descartar reportes |
| RF6 | Estadísticas por zona, estado y tiempo reporte → alerta |
| Calidad | Un reporte nuevo aparece «sin confirmar» hasta que 2 ciudadanos lo confirman o un administrador lo valida |

## Arquitectura
Navegador (HTML/CSS/JS + Leaflet) → API REST (Node.js + Express) → PostgreSQL 16 con PostGIS. Servicio de notificaciones: alertas dentro de la aplicación y, si se configura SMTP, por correo.

## Ejecutar con Docker (recomendado)
```bash
docker compose up --build
# abrir http://localhost:3000
```
Administrador inicial: `admin@alertaarroyo.local` / `Admin12345` (cámbialo con las variables `ADMIN_CORREO` y `ADMIN_CLAVE` antes de usarlo en producción).

## Ejecutar sin Docker
Requisitos: Node.js 20+, PostgreSQL 14+ con PostGIS.
```bash
createdb alertaarroyo   # y un usuario con permiso para crear la extensión postgis
cp .env.example .env    # ajustar variables y exportarlas
npm install
npm run migrate         # crea tablas, zonas piloto y el administrador
npm start               # http://localhost:3000
```

## Pruebas automáticas
```bash
npm test
```
Verifican RF1–RF6 y los requisitos no funcionales RNF1 (reporte visible en el mapa en < 2 min), RNF4 (registrar un reporte en < 1 min) y la generación de la alerta en < 5 min.

## Notas
- Las zonas piloto del script `db/seed.sql` son polígonos **referenciales** para demostración; deben reemplazarse por los límites reales de los sectores (Rebolo, calle 84, Don Juan, etc.).
- En producción debe servirse tras HTTPS y definir `APP_SECRET`.
- La ubicación del usuario solo se usa con su autorización y no se muestra en el mapa.

## Despliegue en la nube (Render + Neon)

1. Crear una base de datos PostgreSQL en Neon (con PostGIS) y copiar su cadena de conexión.
2. En Render, crear un *Web Service* desde este repositorio con entorno **Docker**.
3. Definir las variables de entorno: `DATABASE_URL` (cadena de Neon), `APP_SECRET` (frase larga y aleatoria), `ADMIN_CORREO` y `ADMIN_CLAVE`.
4. Al iniciar, el contenedor crea las tablas y el administrador (`node src/migrate.js`) y luego arranca el servidor. Las fotografías se guardan en la base de datos, por lo que no dependen del disco del servidor.

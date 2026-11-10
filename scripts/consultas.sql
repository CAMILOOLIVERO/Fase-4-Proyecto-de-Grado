-- Consultas útiles para el SQL Editor de Neon (base de datos de AlertaArroyo)

-- Usuarios y cuántos reportes hizo cada uno
SELECT u.id, u.nombre, u.correo, u.rol, u.creado_en, count(r.id) AS reportes
FROM usuario u LEFT JOIN reporte r ON r.usuario_id = u.id
GROUP BY u.id ORDER BY u.id;

-- Reportes recientes con su autor
SELECT r.id, u.nombre AS autor, r.nivel, r.estado, r.descripcion, r.creado_en, r.editado_en
FROM reporte r JOIN usuario u ON u.id = r.usuario_id
ORDER BY r.creado_en DESC LIMIT 50;

-- Nota: la columna clave_hash guarda la clave cifrada con scrypt; no se puede revertir a texto.
-- Para cambiar una clave use:  node scripts/usuarios.js clave <correo> <clave nueva>

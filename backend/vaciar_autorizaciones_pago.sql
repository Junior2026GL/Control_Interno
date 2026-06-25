-- Vaciar autorizaciones de pago y reiniciar el correlativo.
-- Ejecutar manualmente solo cuando realmente quieras borrar todo el historial.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE autorizaciones_pago;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO autorizaciones_secuencia (id, siguiente_numero)
VALUES (1, 1)
ON DUPLICATE KEY UPDATE siguiente_numero = VALUES(siguiente_numero), actualizado_por = NULL;
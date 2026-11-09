-- Zonas piloto referenciales (polígonos aproximados, para demostración del prototipo)
INSERT INTO zona_riesgo (nombre, area) VALUES
 ('Rebolo – Carrera 21 (zona referencial)', ST_GeogFromText('POLYGON((-74.7890 10.9830,-74.7790 10.9830,-74.7790 10.9910,-74.7890 10.9910,-74.7890 10.9830))')),
 ('Calle 84 (zona referencial)',            ST_GeogFromText('POLYGON((-74.8080 10.9940,-74.7960 10.9940,-74.7960 11.0020,-74.8080 11.0020,-74.8080 10.9940))')),
 ('Don Juan (zona referencial)',            ST_GeogFromText('POLYGON((-74.8070 10.9500,-74.7950 10.9500,-74.7950 10.9590,-74.8070 10.9590,-74.8070 10.9500))'))
ON CONFLICT DO NOTHING;

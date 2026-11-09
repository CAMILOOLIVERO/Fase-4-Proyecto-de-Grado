-- AlertaArroyo: esquema de base de datos geoespacial (PostgreSQL + PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS usuario (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  correo        VARCHAR(120) NOT NULL UNIQUE,
  clave_hash    TEXT         NOT NULL,
  rol           VARCHAR(10)  NOT NULL DEFAULT 'ciudadano' CHECK (rol IN ('ciudadano','admin')),
  acepta_datos  BOOLEAN      NOT NULL CHECK (acepta_datos = TRUE),   -- Ley 1581/2012
  ubicacion     GEOGRAPHY(Point,4326),                               -- última ubicación autorizada
  ubicacion_en  TIMESTAMPTZ,
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zona_riesgo (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL,
  area    GEOGRAPHY(Polygon,4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS zona_area_gix ON zona_riesgo USING GIST (area);

CREATE TABLE IF NOT EXISTS reporte (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
  zona_id     INTEGER REFERENCES zona_riesgo(id),
  ubicacion   GEOGRAPHY(Point,4326) NOT NULL,
  nivel       VARCHAR(10) NOT NULL CHECK (nivel IN ('bajo','medio','alto')),
  descripcion VARCHAR(280),
  foto        TEXT,
  estado      VARCHAR(15) NOT NULL DEFAULT 'sin_confirmar'
              CHECK (estado IN ('sin_confirmar','confirmado','resuelto','descartado')),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reporte_ubic_gix ON reporte USING GIST (ubicacion);
CREATE INDEX IF NOT EXISTS reporte_estado_ix ON reporte (estado, creado_en DESC);

CREATE TABLE IF NOT EXISTS confirmacion (
  reporte_id INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (reporte_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS notificacion (
  id          SERIAL PRIMARY KEY,
  reporte_id  INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
  mensaje     TEXT NOT NULL,
  distancia_m INTEGER NOT NULL,
  canal       VARCHAR(10) NOT NULL DEFAULT 'app',
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  origen      VARCHAR(10) NOT NULL DEFAULT 'reporte' CHECK (origen IN ('reporte','ubicacion')),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporte_id, usuario_id)
);
-- bases de datos creadas con una versión anterior
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS origen VARCHAR(10) NOT NULL DEFAULT 'reporte';

CREATE TABLE IF NOT EXISTS foto_reporte (
  reporte_id INTEGER PRIMARY KEY REFERENCES reporte(id) ON DELETE CASCADE,
  tipo       VARCHAR(20) NOT NULL,
  datos      BYTEA NOT NULL
);

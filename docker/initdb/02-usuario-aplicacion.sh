#!/bin/sh
set -eu

# =============================================================================
# Inicialización del usuario de aplicación con mínimos privilegios.
#
# Correcciones de seguridad:
# - La contraseña se obtiene desde una variable de entorno.
# - No se almacenan credenciales fijas en el código.
# - La conexión utiliza autenticación SCRAM-SHA-256.
# - El usuario origen_app no tiene privilegios de superusuario.
# =============================================================================

# Verificar que las variables obligatorias estén configuradas.
: "${POSTGRES_USER:?Falta POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Falta POSTGRES_DB}"
: "${DB_APP_PASSWORD:?Falta DB_APP_PASSWORD}"

# Crear el usuario y asignarle únicamente los permisos necesarios.
PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 \
    PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 \
    --host /var/run/postgresql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    -v app_password="$DB_APP_PASSWORD" <<'SQL'

-- Crear el usuario únicamente si todavía no existe.
-- format(%L) permite escapar correctamente la contraseña.
SELECT format(
    'CREATE ROLE origen_app LOGIN PASSWORD %L',
    :'app_password'
)
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'origen_app'
)
\gexec

-- Permitir la conexión a la base de datos.
GRANT CONNECT ON DATABASE origen TO origen_app;

-- Permitir el acceso al esquema público.
GRANT USAGE ON SCHEMA public TO origen_app;

-- Permitir operaciones de lectura y escritura sobre las tablas.
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public TO origen_app;

-- Permitir el uso de secuencias.
GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public TO origen_app;

SQL
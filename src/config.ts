import path from 'path';

/**
 * Obtiene una variable de entorno obligatoria.
 * Si no está definida o está vacía, impide iniciar la aplicación.
 */
function obtenerVariableObligatoria(nombre: string): string {
  const valor = process.env[nombre];

  if (!valor || !valor.trim()) {
    throw new Error(`Falta configurar la variable de entorno: ${nombre}`);
  }

  return valor;
}

/**
 * Configuración de la aplicación.
 *
 * Corrección de seguridad:
 * - Credenciales sensibles obtenidas desde variables de entorno.
 * - Sin contraseñas ni secretos predeterminados.
 * - Usuario de base de datos con privilegios limitados.
 * - Validación de variables obligatorias al iniciar.
 */
export default {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'origen',
    user: obtenerVariableObligatoria('DB_USER'),
    password: obtenerVariableObligatoria('DB_PASSWORD'),
  },

  sessionSecret: obtenerVariableObligatoria('SESSION_SECRET'),

  credencialesPorDefecto: {
    username: process.env.ADMIN_USER || 'admin',
    password: obtenerVariableObligatoria('ADMIN_PASSWORD'),
  },

  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};
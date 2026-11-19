import bcrypt from 'bcryptjs';
import * as db from '../db';
import type { Usuario } from '../tipos';

const SALT_ROUNDS = 12;

/**
 * Servicio de usuarios.
 *
 * Consultas parametrizadas y contraseñas hasheadas con bcryptjs.
 */

/** Busca un usuario por nombre de usuario exacto (query parametrizada). */
export async function buscarPorUsername(username: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(
    'SELECT * FROM usuarios WHERE username = $1',
    [username]
  );
  return rows[0] || null;
}

/**
 * Autentica a un usuario comparando usuario y hash de contraseña con bcrypt.
 * Devuelve el usuario o null.
 */
export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(
    'SELECT * FROM usuarios WHERE username = $1',
    [username]
  );
  const usuario = rows[0];
  if (!usuario) return null;

  const coincide = await bcrypt.compare(password, usuario.password);
  return coincide ? usuario : null;
}

/** Lista todos los usuarios (para el panel de administración). */
export async function listar(): Promise<Usuario[]> {
  const { rows } = await db.query<Usuario>('SELECT * FROM usuarios ORDER BY id');
  return rows;
}

/**
 * Actualiza un usuario.
 */
export async function actualizar(id: number | string, cambios: Partial<Usuario>): Promise<Usuario | null> {
  const campos: string[] = [];
  const valores: unknown[] = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(cambios)) {
    campos.push(`${campo} = $${i}`);
    if (
      campo === 'password' &&
      typeof valor === 'string' &&
      !/^\$2[aby]\$\d{2}\$/.test(valor)
    ) {
      valores.push(await bcrypt.hash(valor, SALT_ROUNDS));
    } else {
      valores.push(valor);
    }
    i += 1;
  }
  if (campos.length === 0) return null;
  valores.push(id);
  const { rows } = await db.query<Usuario>(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
    valores
  );
  return rows[0] || null;
}

/** Cambia la contraseña de un usuario (se guarda hasheada con bcrypt). */
export async function cambiarPassword(id: number, nuevaPassword: string): Promise<Usuario | null> {
  const passwordHash = await bcrypt.hash(nuevaPassword, SALT_ROUNDS);
  const { rows } = await db.query<Usuario>(
    'UPDATE usuarios SET password = $1 WHERE id = $2 RETURNING *',
    [passwordHash, id]
  );
  return rows[0] || null;
}

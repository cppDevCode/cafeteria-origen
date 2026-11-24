import * as db from '../db';
import type { Comentario } from '../tipos';
import {
  esTextoValido,
  esEnteroEnRango,
  ErrorValidacion,
} from '../validacion';

/** Datos de una reseña nueva, tal como llegan en el cuerpo de la petición. */
export interface NuevoComentario {
  autor: string;
  texto: string;
  calificacion: number;
}

const LONGITUD_MIN_AUTOR = 1;
const LONGITUD_MAX_AUTOR = 100;
const LONGITUD_MIN_TEXTO = 1;
const LONGITUD_MAX_TEXTO = 1000;

/**
 * Servicio de comentarios / reseñas de la cafetería.
 *
 * Valida longitud, rango y formato (texto plano sin etiquetas HTML ni
 * caracteres de control) en el servidor antes de persistir cada reseña.
 */

/** Elimina caracteres de control no imprimibles y recorta espacios extremos. */
function sanitizarTexto(valor: string): string {
  return valor
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/** Lista todos los comentarios, del más nuevo al más viejo. */
export async function listar(): Promise<Comentario[]> {
  const { rows } = await db.query<Comentario>(
    'SELECT * FROM comentarios ORDER BY id DESC'
  );
  return rows;
}

/** Crea un comentario validando longitud, rango y formato en el servidor. */
export async function crear({ autor, texto, calificacion }: NuevoComentario): Promise<Comentario> {
  if (!esTextoValido(autor, LONGITUD_MIN_AUTOR, LONGITUD_MAX_AUTOR)) {
    throw new ErrorValidacion(
      `El autor debe tener entre ${LONGITUD_MIN_AUTOR} y ${LONGITUD_MAX_AUTOR} caracteres.`
    );
  }

  if (!esTextoValido(texto, LONGITUD_MIN_TEXTO, LONGITUD_MAX_TEXTO)) {
    throw new ErrorValidacion(
      `El comentario debe tener entre ${LONGITUD_MIN_TEXTO} y ${LONGITUD_MAX_TEXTO} caracteres.`
    );
  }

  if (!esEnteroEnRango(calificacion, 1, 5)) {
    throw new ErrorValidacion('La calificación debe ser un entero entre 1 y 5.');
  }

  const autorSanitizado = sanitizarTexto(autor);
  const textoSanitizado = sanitizarTexto(texto);

  if (
    autorSanitizado.length < LONGITUD_MIN_AUTOR ||
    autorSanitizado.length > LONGITUD_MAX_AUTOR
  ) {
    throw new ErrorValidacion(
      `El autor debe tener entre ${LONGITUD_MIN_AUTOR} y ${LONGITUD_MAX_AUTOR} caracteres.`
    );
  }

  if (
    textoSanitizado.length < LONGITUD_MIN_TEXTO ||
    textoSanitizado.length > LONGITUD_MAX_TEXTO
  ) {
    throw new ErrorValidacion(
      `El comentario debe tener entre ${LONGITUD_MIN_TEXTO} y ${LONGITUD_MAX_TEXTO} caracteres.`
    );
  }

  if (/<\/?[a-z][^>]*>/i.test(autorSanitizado) || /<\/?[a-z][^>]*>/i.test(textoSanitizado)) {
    throw new ErrorValidacion('El comentario no puede contener etiquetas HTML.');
  }

  const { rows } = await db.query<Comentario>(
    `INSERT INTO comentarios (autor, texto, calificacion)
      VALUES ($1, $2, $3)
    RETURNING *`,
    [autorSanitizado, textoSanitizado, calificacion]
  );

  return rows[0];
}

/** Elimina un comentario. */
export async function eliminar(id: number | string): Promise<Comentario | null> {
  const { rows } = await db.query<Comentario>(
    'DELETE FROM comentarios WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
}

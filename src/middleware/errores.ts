/**
 * Manejo centralizado de errores.
 *
 * Corrección de seguridad:
 * - No exponer stack traces ni detalles internos al cliente.
 * - Registrar los errores en el servidor.
 * - Conservar los códigos HTTP de errores controlados.
 */

import type { NextFunction, Request, Response } from 'express';
import type { ErrorHttp } from '../tipos';

export function rutaNoEncontrada(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Ruta no encontrada',
  });
}

// Express identifica este middleware por sus cuatro parámetros.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function manejadorErrores(
  err: ErrorHttp,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // El detalle técnico queda únicamente en los logs del servidor.
  console.error('[error]', err);

  // Conservar únicamente códigos de error HTTP válidos.
  const status =
    typeof err.status === 'number' &&
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 600
      ? err.status
      : 500;

  // No exponer mensajes internos de errores inesperados.
  const mensaje =
    status >= 500
      ? 'Error interno del servidor'
      : err.message || 'Error en la solicitud';

  res.status(status).json({
    error: mensaje,
  });
}
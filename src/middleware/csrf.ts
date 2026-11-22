import { randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { leerCookies, obtenerSesion } from './sesion';

// Función auxiliar para obtener el token de la sesión de Int. 1
// Como Int. 1 no definió "csrfToken" en su tipo, lo casteamos a any.
function obtenerTokenDeSesion(req: Request): string | undefined {
  const sesion = obtenerSesion(req);
  if (!sesion) return undefined;
  return (sesion as any).csrfToken;
}

export function generarTokenCsrf(req: Request, res: Response, next: NextFunction) {
  const sesion = obtenerSesion(req);
  if (sesion && !(sesion as any).csrfToken) {
    (sesion as any).csrfToken = randomBytes(32).toString('hex');
  }
  next();
}

export function obtenerTokenCsrf(req: Request, res: Response) {
  const sesion = obtenerSesion(req);
  
  // Si no hay sesión (ej. primera visita), devolvemos un token temporal
  // pero no creamos la cookie 'sid' para no pisar la sesión de Int. 1
  if (!sesion) {
    const tempToken = randomBytes(32).toString('hex');
    res.cookie('csrf_temp', tempToken, { httpOnly: true, sameSite: 'lax' });
    res.json({ csrfToken: tempToken });
    return;
  }

  if (!(sesion as any).csrfToken) {
    (sesion as any).csrfToken = randomBytes(32).toString('hex');
  }
  res.json({ csrfToken: (sesion as any).csrfToken });
}

export function validarCsrf(req: Request, res: Response, next: NextFunction) {
  const metodo = req.method.toUpperCase();
  
  // No validar CSRF en GETs ni en el login (el login es el punto de entrada)
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo) || req.path === '/api/auth/login') {
    return next();
  }

  const tokenEnviado = req.body?._csrf || req.header('X-CSRF-Token');
  const tokenSesion = obtenerTokenDeSesion(req);
  
  // Si no hay sesión válida, revisamos si es un token temporal
  const cookies = leerCookies(req);
  const tempToken = cookies.csrf_temp;

  const esValido = (tokenSesion && tokenEnviado === tokenSesion) || 
                   (!tokenSesion && tempToken && tokenEnviado === tempToken);

  if (!esValido) {
    return res.status(403).json({ error: 'Token CSRF inválido' });
  }

  // Verificación de Origin (CSRF-03)
  const origen = req.header('Origin') || req.header('Referer');
  if (origen) {
    const permitido = process.env.APP_ORIGIN || `http://localhost:${process.env.APP_PORT || 8090}`;
    if (!origen.startsWith(permitido)) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
  }

  next();
}
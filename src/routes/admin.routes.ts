
import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion } from '../middleware/auth';
import type { Usuario } from '../tipos';
import { obtenerSesion } from '../middleware/sesion';

const router = express.Router();

function requiereAdmin(req: any, res: any, next: any) {
  const sesion = obtenerSesion(req);

  if (!sesion || !sesion.usuario || sesion.usuario.rol !== 'admin') {
    return res.status(403).json({
      error: 'Acceso denegado: se requiere rol admin',
    });
  }

  next();
}

// Todas las rutas requieren rol administrador.
router.use(requiereAdmin);
router.use(requiereSesion);

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/usuarios/:id */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};

    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) cambios.rol = rol;
    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'Ya existe un producto con ese nombre.',
      });
    }

    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(
      req.params.id,
      req.body || {}
    );

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/productos/:id */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/cambiar-contrasena */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};

    if (!nueva) {
      return res.status(400).json({
        error: 'Falta la contraseña nueva.',
      });
    }

    const usuario = await usuarios.cambiarPassword(
      req.usuario!.id,
      nueva
    );

    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/probar-conexion */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  const comando = `ping -c 3 ${host}`;

  exec(comando, (error, stdout, stderr) => {
    res.json({
      comando,
      salida: stdout,
      error: stderr || (error ? error.message : null),
    });
  });
});

/** POST /api/admin/subir-archivo */
router.post('/subir-archivo', express.json({ limit: '8mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (!nombre || !contenidoBase64) {
      return res.status(400).json({
        error: 'Falta el archivo.',
      });
    }

    // Validación del nombre del archivo.
    if (
      typeof nombre !== 'string' ||
      path.basename(nombre) !== nombre ||
      nombre.includes('..')
    ) {
      return res.status(400).json({
        error: 'Nombre de archivo inválido.',
      });
    }

    // Validación de extensión.
    const ext = path.extname(nombre).toLowerCase();

    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext)) {
      return res.status(400).json({
        error: 'Extensión no permitida.',
      });
    }

    // Validación del contenido Base64.
    if (
      typeof contenidoBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contenidoBase64)
    ) {
      return res.status(400).json({
        error: 'Contenido Base64 inválido.',
      });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');

    // Límite de tamaño: 5 MB.
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Archivo demasiado grande.',
      });
    }

    fs.mkdirSync(config.uploadsDir, { recursive: true });

    const destino = path.join(config.uploadsDir, nombre);

    fs.writeFileSync(destino, buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombre}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

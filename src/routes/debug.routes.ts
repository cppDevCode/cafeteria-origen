import express from 'express';
import { requiereSesion, requiereRol } from '../middleware/auth';

const router = express.Router();

/**
 * Diagnóstico básico del servidor.
 * Acceso exclusivo para administradores autenticados.
 * No expone variables de entorno ni credenciales.
 */
router.get('/', requiereSesion, requiereRol('admin'), (_req, res) => {
  res.json({
    mensaje: 'Diagnóstico del servidor',
    version: '1.0.0',
    estado: 'operativo',
    sistema: {
      node: process.version,
      uptime: process.uptime(),
    },
  });
});

export default router;
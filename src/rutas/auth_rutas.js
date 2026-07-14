// Rutas de autenticación para el ERP de la barbería
// Define los endpoints para inicio de sesión e instalación inicial del administrador

import { Router } from 'express';
import { iniciarSesion, registrarPrimerAdministrador } from '../controladores/auth.js';

const rutas = Router();

// POST /api/auth/login - Inicio de sesión de usuarios (Administrador y Barberos)
rutas.post('/login', iniciarSesion);

// POST /api/auth/inicializar-admin - Creación del primer administrador (disponible solo si la base de datos está vacía)
rutas.post('/inicializar-admin', registrarPrimerAdministrador);

export default rutas;

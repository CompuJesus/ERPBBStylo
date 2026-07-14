// Rutas públicas orientadas a clientes e invitados
// Permite consultar catálogo, disponibilidad de barberos y realizar reservas

import { Router } from 'express';
import {
  listarCatalogo,
  listarBarberosActivos,
  obtenerHorasDisponibles,
  reservarCita
} from '../controladores/cliente.js';

const rutas = Router();

// GET /api/cliente/catalogo - Ver catálogo de combos/cortes y precios
rutas.get('/catalogo', listarCatalogo);

// GET /api/cliente/barberos - Listar barberos activos disponibles en el sistema
rutas.get('/barberos', listarBarberosActivos);

// GET /api/cliente/disponibilidad - Consultar grid de horas disponibles de un barbero para una fecha (AAAA-MM-DD)
rutas.get('/disponibilidad', obtenerHorasDisponibles);

// POST /api/cliente/reservar - Enviar solicitud para agendar una cita pendiente
rutas.post('/reservar', reservarCita);

export default rutas;

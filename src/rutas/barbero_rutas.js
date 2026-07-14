// Rutas operativas de barberos (y administradores)
// Define las rutas para facturar trabajos diarios y personalizar temas visuales

import { Router } from 'express';
import { validarToken, verificarRol } from '../middlewares/autorizacion.js';
import { 
  guardarPreferenciaTema, 
  registrarTrabajo, 
  listarServiciosActivos, 
  listarMetodosPagoActivos,
  obtenerHistoricoBarbero,
  actualizarPerfilUsuario,
  obtenerCitasPendientesBarbero,
  atenderCita
} from '../controladores/barbero.js';

const rutas = Router();

// Restringir el acceso para asegurar que los usuarios estén autenticados como BARBERO, CAJERO o ADMINISTRADOR
rutas.use(validarToken, verificarRol(['ADMINISTRADOR', 'BARBERO', 'CAJERO']));

// GET /api/barbero/servicios - Catálogo de servicios activos
rutas.get('/servicios', listarServiciosActivos);

// GET /api/barbero/metodos-pago - Métodos de pago activos
rutas.get('/metodos-pago', listarMetodosPagoActivos);

// PUT /api/barbero/tema - Actualiza el tema de colores personalizado del usuario actual
rutas.put('/tema', guardarPreferenciaTema);

// POST /api/barbero/registrar-trabajo - Registra una venta directa/corte realizado
rutas.post('/registrar-trabajo', registrarTrabajo);

// GET /api/barbero/historico - Historial de ventas individual del barbero autenticado
rutas.get('/historico', obtenerHistoricoBarbero);

// PUT /api/barbero/perfil - Permite actualizar los datos propios del perfil (nombre/contraseña)
rutas.put('/perfil', actualizarPerfilUsuario);

// GET /api/barbero/citas-pendientes - Citas pendientes asignadas al barbero autenticado
rutas.get('/citas-pendientes', obtenerCitasPendientesBarbero);

// PATCH /api/barbero/citas/:id/atender - Marcar una cita como atendida/completada
rutas.patch('/citas/:id/atender', atenderCita);

export default rutas;

// Rutas administrativas protegidas por RBAC (Solo Administradores)
// Define las rutas para métricas, control de barberos, catálogo y auditoría

import { Router } from 'express';
import { validarToken, verificarRol } from '../middlewares/autorizacion.js';
import {
  obtenerMetricasFinancieras,
  listarUsuarios,
  crearUsuarios,
  actualizarUsuarios,
  eliminarUsuarios,
  listarServicios,
  crearServicio,
  actualizarServicio,
  eliminarServicio,
  listarMetodosPago,
  crearMetodoPago,
  actualizarMetodoPago,
  eliminarMetodoPago,
  listarAuditoria,
  exportarAuditoriaPDF,
  exportarAuditoriaExcel
} from '../controladores/admin.js';

const rutas = Router();

// Forzar que cualquier solicitud a este enrutador requiera autenticación y rol de ADMINISTRADOR
rutas.use(validarToken, verificarRol(['ADMINISTRADOR']));

// GET /api/admin/metricas - Datos financieros del panel de control
rutas.get('/metricas', obtenerMetricasFinancieras);

// Rutas de gestión de barberos (CRUD)
rutas.get('/usuarios', listarUsuarios);
rutas.post('/usuarios', crearUsuarios);
rutas.put('/usuarios/:id', actualizarUsuarios);
rutas.delete('/usuarios/:id', eliminarUsuarios);

// Rutas de gestión del catálogo de servicios (CRUD)
rutas.get('/servicios', listarServicios);
rutas.post('/servicios', crearServicio);
rutas.put('/servicios/:id', actualizarServicio);
rutas.delete('/servicios/:id', eliminarServicio);

// Rutas de gestión de métodos de pago (CRUD)
rutas.get('/metodos-pago', listarMetodosPago);
rutas.post('/metodos-pago', crearMetodoPago);
rutas.put('/metodos-pago/:id', actualizarMetodoPago);
rutas.delete('/metodos-pago/:id', eliminarMetodoPago);

// GET /api/admin/auditoria - Historial de logs y transacciones financieras filtrables
rutas.get('/auditoria', listarAuditoria);

// GET /api/admin/auditoria/exportar-pdf - Descarga el reporte de ventas como PDF (SOLO LECTURA)
rutas.get('/auditoria/exportar-pdf', exportarAuditoriaPDF);

// GET /api/admin/auditoria/exportar-excel - Descarga el reporte de ventas como Excel (SOLO LECTURA)
rutas.get('/auditoria/exportar-excel', exportarAuditoriaExcel);

export default rutas;

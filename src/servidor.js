// Servidor principal y punto de entrada para el ERP de la Barbería "El Nuevo Stylo"
// Configura Express, registra rutas, sirve frontend estático y realiza el sembrado automático de datos de prueba

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Importar los routers de la API
import authRutas from './rutas/auth_rutas.js';
import adminRutas from './rutas/admin_rutas.js';
import barberoRutas from './rutas/barbero_rutas.js';
import clienteRutas from './rutas/cliente_rutas.js';

// Importar cliente de base de datos para verificación y sembrado
import prisma from './config/base_datos.js';
import { obtenerTasasTiempoReal } from './config/tasas_helper.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares globales
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir la interfaz gráfica del frontend (archivos estáticos)
app.use(express.static(path.join(__dirname, 'publico')));

// Registrar las rutas de la API
app.use('/api/auth', authRutas);
app.use('/api/admin', adminRutas);
app.use('/api/barbero', barberoRutas);
app.use('/api/cliente', clienteRutas);

// Endpoint público para obtener las tasas de cambio oficiales en tiempo real
app.get('/api/tasas', async (req, res) => {
  const tasas = await obtenerTasasTiempoReal();
  return res.json(tasas);
});

// Endpoint de salud del sistema
app.get('/api/estado', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      estado: 'ONLINE',
      mensaje: 'ERP Barbería "El Nuevo Stylo" funcionando perfectamente.',
      baseDatos: 'CONECTADA',
      fechaHoraServidor: new Date()
    });
  } catch (error) {
    return res.status(500).json({
      estado: 'ERROR',
      mensaje: 'Error de comunicación o fallo en la base de datos.',
      baseDatos: 'DESCONECTADA',
      error: error.message
    });
  }
});

/**
 * Función de sembrado automático (Seeding)
 * Lee si la base de datos está vacía y crea cuentas e información inicial del Excel provisto
 */
async function sembrarDatosIniciales() {
  try {
    const conteoUsuarios = await prisma.usuario.count();
    if (conteoUsuarios === 0) {
      console.log('----------------------------------------------------');
      console.log(' Base de datos vacía. Iniciando sembrado automático...');

      // Cifrar contraseñas de las cuentas de prueba
      const hashAdmin = await bcrypt.hash('admin123', 10);
      const hashJesus = await bcrypt.hash('jesus123', 10);
      const hashYefer = await bcrypt.hash('yefer123', 10);

      // 1. Crear usuarios (Administrador y Barberos del Excel)
      await prisma.usuario.createMany({
        data: [
          { nombre: 'Propietario Admin', usuario: 'admin', contrasena_hash: hashAdmin, rol: 'ADMINISTRADOR' },
          { nombre: 'Jesús', usuario: 'jesus', contrasena_hash: hashJesus, rol: 'BARBERO' },
          { nombre: 'Yefer', usuario: 'yefer', contrasena_hash: hashYefer, rol: 'BARBERO' }
        ]
      });

      // 2. Crear métodos de pago iniciales
      await prisma.metodoPago.createMany({
        data: [
          { nombre: 'Efectivo' },
          { nombre: 'Nequi' }
        ]
      });

      // 3. Crear catálogo de servicios basados en el Excel
      await prisma.servicio.createMany({
        data: [
          { nombre: 'Corte de Cabello', descripcion: 'Corte de cabello clásico y perfilado de patillas', precio: 18000 },
          { nombre: 'Corte y cejas', descripcion: 'Corte de cabello de caballero con diseño de cejas', precio: 20000 },
          { nombre: 'Corte,cejas y Barba', descripcion: 'Afeitado completo o recorte de barba, cejas y corte', precio: 25000 },
          { nombre: 'Corte,otros servicios', descripcion: 'Corte de cabello combinado con lavado e hidratación', precio: 22000 },
          { nombre: 'Servicio especial', descripcion: 'Masaje facial, toalla caliente y corte estilizado VIP', precio: 23000 }
        ]
      });

      console.log('✅ Sembrado inicial de prueba completado exitosamente.');
      console.log('   -> Administrador: admin / admin123');
      console.log('   -> Barbero 1:     jesus / jesus123');
      console.log('   -> Barbero 2:     yefer / yefer123');
      console.log('----------------------------------------------------');
    }
  } catch (error) {
    console.error('❌ Error durante la inicialización de la base de datos:', error);
  }
}

// Levantar el servidor
// Cambiamos el 'localhost' por '0.0.0.0' para abrirlo a la red
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`====================================================`);
  console.log(` Servidor iniciado en: http://0.0.0.0:${PORT}`);
  console.log(`====================================================`);

  // Ejecutar sembrado de datos
  await sembrarDatosIniciales();
});

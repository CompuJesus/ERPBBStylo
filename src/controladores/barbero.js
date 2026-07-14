// Controlador de barberos para el ERP
// Maneja el registro de trabajos realizados (facturación rápida) y la personalización del tema visual

import prisma from '../config/base_datos.js';
import bcrypt from 'bcryptjs';

/**
 * Guarda las preferencias de tema (colores de fondo, texto, acento) del usuario actual
 */
export async function guardarPreferenciaTema(req, res) {
  try {
    const { colorFondo, colorTexto, colorAcento, colorTarjeta } = req.body;
    const usuarioId = req.usuario.id;

    if (!colorFondo || !colorTexto || !colorAcento || !colorTarjeta) {
      return res.status(400).json({ 
        error: 'Todos los parámetros de color (Fondo, Texto, Acento, Tarjeta) son obligatorios.' 
      });
    }

    const nuevasPreferencias = JSON.stringify({
      colorFondo,
      colorTexto,
      colorAcento,
      colorTarjeta
    });

    // Actualizar el registro del usuario en la base de datos
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { preferencias_tema: nuevasPreferencias }
    });

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        barbero_id: usuarioId,
        accion: 'MODIFICACION_TEMA',
        detalles: `El usuario ${req.usuario.nombre} modificó las preferencias visuales de su interfaz.`
      }
    });

    return res.json({
      mensaje: 'Preferencias de tema guardadas con éxito.',
      preferencias_tema: { colorFondo, colorTexto, colorAcento, colorTarjeta }
    });
  } catch (error) {
    console.error('Error al guardar tema:', error);
    return res.status(500).json({ 
      error: 'Error interno al intentar guardar las preferencias de personalización.' 
    });
  }
}

/**
 * Registra una venta/trabajo realizado en el local (Facturación Rápida)
 * Crea la cita completada, registra el cobro y guarda el log de auditoría
 */
export async function registrarTrabajo(req, res) {
  try {
    const barberoId = req.usuario.id;
    const { 
      serviciosIds, 
      metodoPagoId, 
      referencia, 
      propina, 
      nombreCliente, 
      telefonoCliente, 
      correoCliente 
    } = req.body;

    // Validar datos obligatorios
    if (!serviciosIds || !Array.isArray(serviciosIds) || serviciosIds.length === 0 || !metodoPagoId) {
      return res.status(400).json({ 
        error: 'Debe seleccionar al menos un servicio y el método de pago.' 
      });
    }

    const valorPropina = parseFloat(propina) || 0;
    if (valorPropina < 0) {
      return res.status(400).json({ error: 'La propina no puede ser negativa.' });
    }

    // Verificar que los servicios existan y estén activos
    const servicios = await prisma.servicio.findMany({
      where: {
        id: { in: serviciosIds.map(id => parseInt(id)) },
        activo: true
      }
    });

    if (servicios.length !== serviciosIds.length) {
      return res.status(400).json({ error: 'Uno o más servicios seleccionados no existen o están inactivos.' });
    }

    // Verificar que el método de pago exista y esté activo
    const metodoPago = await prisma.metodoPago.findUnique({
      where: { id: parseInt(metodoPagoId) }
    });
    if (!metodoPago || !metodoPago.activo) {
      return res.status(404).json({ error: 'El método de pago seleccionado no existe o está inactivo.' });
    }

    // Calcular el monto total de los servicios
    const subtotalServicios = servicios.reduce((acc, s) => acc + s.precio, 0);

    // Regla de negocio inteligente para propinas: Máximo 30% del subtotal de servicios (mínimo permitido de 10,000 COP para cortes económicos) con un tope absoluto de 50,000 COP
    const limitePropina = Math.min(Math.max(subtotalServicios * 0.30, 10000), 50000);

    if (valorPropina > limitePropina) {
      return res.status(400).json({ 
        error: `Propina sospechosa detectada. El límite máximo de propina para esta transacción es de ${limitePropina.toLocaleString('es-CO')} COP.` 
      });
    }

    // Nombre por defecto si es cliente express sin cita previa registrada
    const nombreFinalCliente = nombreCliente || 'Cliente General (Sin Reserva)';
    const telefonoFinalCliente = telefonoCliente || 'N/D';
    const correoFinalCliente = correoCliente || 'N/D';

    // Ejecutar la creación de las citas y pagos de forma transaccional
    const resultado = await prisma.$transaction(async (tx) => {
      const citasCreadas = [];
      const pagosCreados = [];

      for (let i = 0; i < servicios.length; i++) {
        const serv = servicios[i];

        // 1. Crear una Cita con estado "COMPLETADA"
        const nuevaCita = await tx.cita.create({
          data: {
            nombre_cliente: nombreFinalCliente,
            telefono_cliente: telefonoFinalCliente,
            correo_cliente: correoFinalCliente,
            fecha_hora: new Date(),
            barbero_id: barberoId,
            servicio_id: serv.id,
            estado: 'COMPLETADA'
          }
        });
        citasCreadas.push(nuevaCita);

        // La propina se asocia únicamente al primer servicio para no duplicarla
        const propinaServicio = i === 0 ? valorPropina : 0;

        // 2. Registrar el Pago asociado a esa Cita
        const nuevoPago = await tx.pago.create({
          data: {
            cita_id: nuevaCita.id,
            metodo_pago_id: metodoPago.id,
            referencia: referencia || null,
            monto_cobrado: serv.precio, // Cada pago registra el precio exacto del servicio realizado
            propina: propinaServicio
          }
        });
        pagosCreados.push(nuevoPago);
      }

      // Nombres de los servicios para la descripción
      const nombresServicios = servicios.map(s => s.nombre).join(', ');

      // 3. Crear el log en Auditoría
      await tx.auditoria.create({
        data: {
          barbero_id: barberoId,
          accion: 'REGISTRO_VENTA',
          detalles: `El barbero ${req.usuario.nombre} facturó servicios: "${nombresServicios}" (Subtotal: ${subtotalServicios} COP, Propina: ${valorPropina} COP) a ${nombreFinalCliente} usando ${metodoPago.nombre}.`
        }
      });

      return { citasCreadas, pagosCreados };
    });

    return res.status(201).json({
      mensaje: 'Trabajo y facturación registrados exitosamente.',
      citas: resultado.citasCreadas,
      pagos: resultado.pagosCreados
    });
  } catch (error) {
    console.error('Error al registrar trabajo:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor al procesar la facturación rápida del trabajo.' 
    });
  }
}

/**
 * Retorna todos los servicios activos para la facturación rápida
 */
export async function listarServiciosActivos(req, res) {
  try {
    const servicios = await prisma.servicio.findMany({
      where: { activo: true }
    });
    return res.json(servicios);
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar los servicios activos.' });
  }
}

/**
 * Retorna todos los métodos de pago activos para la facturación rápida
 */
export async function listarMetodosPagoActivos(req, res) {
  try {
    const metodos = await prisma.metodoPago.findMany({
      where: { activo: true }
    });
    return res.json(metodos);
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar los métodos de pago activos.' });
  }
}

/**
 * Obtiene el historial de servicios realizados por el barbero autenticado
 * SOLO LECTURA y restringido a su propia información de trabajo
 */
export async function obtenerHistoricoBarbero(req, res) {
  try {
    const barberoId = req.usuario.id;
    
    const transacciones = await prisma.pago.findMany({
      where: {
        cita: {
          barbero_id: barberoId
        }
      },
      include: {
        cita: {
          include: {
            servicio: { select: { nombre: true, precio: true } }
          }
        },
        metodo_pago: { select: { nombre: true } }
      },
      orderBy: {
        fecha_pago: 'desc'
      }
    });

    return res.json(transacciones);
  } catch (error) {
    console.error('Error al obtener histórico del barbero:', error);
    return res.status(500).json({ error: 'Error al obtener el historial de servicios.' });
  }
}

/**
 * Permite a cualquier usuario autenticado (barbero o admin) actualizar sus datos de perfil
 */
export async function actualizarPerfilUsuario(req, res) {
  try {
    const usuarioId = req.usuario.id;
    const { nombre, contrasena } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }

    const data = { nombre };

    if (contrasena && contrasena.trim() !== '') {
      if (contrasena.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      }
      data.contrasena_hash = await bcrypt.hash(contrasena, 10);
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: usuarioId },
      data
    });

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        barbero_id: usuarioId,
        accion: 'ACTUALIZACION_PERFIL',
        detalles: `El usuario ${req.usuario.nombre} actualizó sus datos de perfil (Nombre/Contraseña).`
      }
    });

    return res.json({
      mensaje: 'Perfil actualizado con éxito.',
      usuario: {
        id: usuarioActualizado.id,
        nombre: usuarioActualizado.nombre,
        usuario: usuarioActualizado.usuario,
        rol: usuarioActualizado.rol
      }
    });
  } catch (error) {
    console.error('Error al actualizar perfil de usuario:', error);
    return res.status(500).json({ error: 'Error al actualizar los datos de perfil.' });
  }
}

/**
 * Retorna todas las citas PENDIENTES asignadas al barbero autenticado, ordenadas por fecha y hora ascendente
 */
export async function obtenerCitasPendientesBarbero(req, res) {
  try {
    const barberoId = req.usuario.id;

    const citas = await prisma.cita.findMany({
      where: {
        barbero_id: barberoId,
        estado: 'PENDIENTE'
      },
      orderBy: {
        fecha_hora: 'asc'
      },
      select: {
        id: true,
        fecha_hora: true,
        nombre_cliente: true,
        telefono_cliente: true,
        correo_cliente: true,
        estado: true,
        servicio: {
          select: { nombre: true }
        }
      }
    });

    const citasFormateadas = citas.map(c => {
      const isoString = c.fecha_hora.toISOString(); // Formato: 'YYYY-MM-DDTHH:MM:SS.SSSZ'
      const [fecha, resto] = isoString.split('T');
      const hora = resto.substring(0, 5); // Obtiene 'HH:MM'
      return {
        id: c.id,
        fecha, // 'YYYY-MM-DD'
        hora,  // 'HH:MM'
        nombre_cliente: c.nombre_cliente,
        telefono_cliente: c.telefono_cliente,
        correo_cliente: c.correo_cliente,
        estado: c.estado,
        servicio: c.servicio
      };
    });

    return res.json(citasFormateadas);
  } catch (error) {
    console.error('Error al obtener citas pendientes del barbero:', error);
    return res.status(500).json({ error: 'Error al obtener las citas pendientes.' });
  }
}

/**
 * Marca una cita PENDIENTE como COMPLETADA (el barbero la atendió o fue atendida)
 */
export async function atenderCita(req, res) {
  try {
    const { id } = req.params;
    const barberoId = req.usuario.id;

    // Verificar que la cita existe y pertenece a este barbero
    const cita = await prisma.cita.findUnique({
      where: { id: parseInt(id) }
    });

    if (!cita) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    if (cita.barbero_id !== barberoId) {
      return res.status(403).json({ error: 'No tienes permiso para modificar esta cita.' });
    }

    if (cita.estado !== 'PENDIENTE') {
      return res.status(400).json({ error: `La cita ya se encuentra en estado: ${cita.estado}.` });
    }

    await prisma.cita.update({
      where: { id: parseInt(id) },
      data: { estado: 'COMPLETADA' }
    });

    // Registrar en auditoría
    await prisma.auditoria.create({
      data: {
        barbero_id: barberoId,
        accion: 'CITA_ATENDIDA',
        detalles: `El barbero ${req.usuario.nombre} marcó la cita #${id} del cliente ${cita.nombre_cliente || 'Sin nombre'} como atendida.`
      }
    });

    return res.json({ mensaje: 'Cita marcada como atendida exitosamente.' });
  } catch (error) {
    console.error('Error al atender cita:', error);
    return res.status(500).json({ error: 'Error al actualizar el estado de la cita.' });
  }
}

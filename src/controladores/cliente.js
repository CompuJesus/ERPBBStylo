// Controlador público para clientes y sistema de reservas (Booking)
// Permite ver el catálogo, listar barberos y verificar disponibilidad horaria sin sobre-reservar

import prisma from '../config/base_datos.js';

// Rango de horas laborales de la barbería (intervalos de 1 hora)
const HORAS_LABORALES = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
];

/**
 * Retorna todos los servicios activos del catálogo para la vista pública
 */
export async function listarCatalogo(req, res) {
  try {
    const catalogo = await prisma.servicio.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        precio: true
      }
    });
    return res.json(catalogo);
  } catch (error) {
    console.error('Error al listar catálogo:', error);
    return res.status(500).json({ error: 'Error al cargar el catálogo de servicios.' });
  }
}

/**
 * Retorna todos los barberos activos para que el cliente seleccione con quién desea su cita
 */
export async function listarBarberosActivos(req, res) {
  try {
    const barberos = await prisma.usuario.findMany({
      where: { rol: 'BARBERO', activo: true },
      select: {
        id: true,
        nombre: true
      }
    });
    return res.json(barberos);
  } catch (error) {
    console.error('Error al listar barberos:', error);
    return res.status(500).json({ error: 'Error al obtener la lista de barberos.' });
  }
}

/**
 * Consulta la disponibilidad de horas de un barbero para una fecha específica (formato YYYY-MM-DD)
 * Retorna un grid de horas con su respectivo estado (disponible/ocupado)
 */
export async function obtenerHorasDisponibles(req, res) {
  try {
    const { barberoId, fecha } = req.query; // fecha en formato 'AAAA-MM-DD' y barberoId numérico

    if (!barberoId || !fecha) {
      return res.status(400).json({ 
        error: 'El identificador del barbero (barberoId) y la fecha (fecha YYYY-MM-DD) son obligatorios.' 
      });
    }

    const idBarbero = parseInt(barberoId);

    // Buscar las citas existentes del barbero para ese día específico
    // Para simplificar la comparación, buscaremos citas que coincidan en la misma fecha base
    const inicioDia = new Date(`${fecha}T00:00:00.000Z`);
    const finDia = new Date(`${fecha}T23:59:59.999Z`);

    const citasExistentes = await prisma.cita.findMany({
      where: {
        barbero_id: idBarbero,
        fecha_hora: {
          gte: inicioDia,
          lte: finDia
        },
        estado: {
          in: ['PENDIENTE', 'COMPLETADA'] // Las canceladas no bloquean el espacio
        }
      },
      select: {
        fecha_hora: true
      }
    });

    // Mapear las horas de las citas ya ocupadas en formato 'HH:MM'
    const horasOcupadas = citasExistentes.map(cita => {
      const fechaCita = new Date(cita.fecha_hora);
      const horas = String(fechaCita.getUTCHours()).padStart(2, '0');
      const minutos = String(fechaCita.getUTCMinutes()).padStart(2, '0');
      return `${horas}:${minutos}`;
    });

    // Construir el grid de horas indicando cuáles están disponibles
    const gridDisponibilidad = HORAS_LABORALES.map(hora => {
      const estaOcupado = horasOcupadas.includes(hora);
      return {
        hora,
        disponible: !estaOcupado
      };
    });

    return res.json({
      fecha,
      barberoId: idBarbero,
      disponibilidad: gridDisponibilidad
    });
  } catch (error) {
    console.error('Error al obtener horas disponibles:', error);
    return res.status(500).json({ error: 'Error al procesar la disponibilidad horaria.' });
  }
}

/**
 * Registra una reserva de cita para un cliente
 * Valida que la fecha y hora sigan disponibles para ese barbero antes de guardar
 */
export async function reservarCita(req, res) {
  try {
    const { 
      nombreCliente, 
      telefonoCliente, 
      correoCliente, 
      fecha,          // Formato 'YYYY-MM-DD'
      hora,           // Formato 'HH:MM'
      barberoId, 
      servicioId 
    } = req.body;

    if (!nombreCliente || !telefonoCliente || !correoCliente || !fecha || !hora || !barberoId || !servicioId) {
      return res.status(400).json({ 
        error: 'Todos los campos de la reserva (nombre, teléfono, correo, fecha, hora, barbero y servicio) son obligatorios.' 
      });
    }

    // Validar formato de hora laboral
    if (!HORAS_LABORALES.includes(hora)) {
      return res.status(400).json({ error: 'La hora seleccionada se encuentra fuera del rango laboral.' });
    }

    const idBarbero = parseInt(barberoId);
    const idServicio = parseInt(servicioId);

    // Validar existencia del barbero
    const barbero = await prisma.usuario.findUnique({
      where: { id: idBarbero, rol: 'BARBERO', activo: true }
    });
    if (!barbero) {
      return res.status(404).json({ error: 'El barbero seleccionado no está disponible o no existe.' });
    }

    // Validar existencia del servicio
    const servicio = await prisma.servicio.findUnique({
      where: { id: idServicio, activo: true }
    });
    if (!servicio) {
      return res.status(404).json({ error: 'El servicio seleccionado no está activo o no existe.' });
    }

    // Crear la fecha y hora final de la cita en UTC
    const fechaHoraCita = new Date(`${fecha}T${hora}:00.000Z`);

    // Validar si el barbero ya tiene una cita ocupada a esa misma hora para evitar sobre-reservas (Doble Booking)
    const citaExistente = await prisma.cita.findFirst({
      where: {
        barbero_id: idBarbero,
        fecha_hora: fechaHoraCita,
        estado: {
          in: ['PENDIENTE', 'COMPLETADA']
        }
      }
    });

    if (citaExistente) {
      return res.status(409).json({ 
        error: 'Disculpe, este horario ya ha sido reservado con el barbero seleccionado. Elija otra hora o barbero.' 
      });
    }

    // Registrar la cita pendiente
    const nuevaCita = await prisma.cita.create({
      data: {
        nombre_cliente: nombreCliente,
        telefono_cliente: telefonoCliente,
        correo_cliente: correoCliente,
        fecha_hora: fechaHoraCita,
        barbero_id: idBarbero,
        servicio_id: idServicio,
        estado: 'PENDIENTE'
      }
    });

    return res.status(201).json({
      mensaje: 'Su cita ha sido reservada con éxito.',
      cita: nuevaCita
    });
  } catch (error) {
    console.error('Error al reservar cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor al procesar la reserva.' });
  }
}

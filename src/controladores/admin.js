// Controlador de administración del ERP
// Contiene la lógica para métricas financieras, gestión de barberos, servicios, métodos de pago y auditoría

import bcrypt from 'bcryptjs';
import prisma from '../config/base_datos.js';
import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

// ==========================================
// 1. PANEL DE CONTROL (DASHBOARD)
// ==========================================

/**
 * Obtiene métricas financieras clave del ERP (Facturación total, por barbero y método de pago)
 */
export async function obtenerMetricasFinancieras(req, res) {
  try {
    const ahora = new Date();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    // 1. Total facturado histórico
    const totalHistorico = await prisma.pago.aggregate({
      _sum: { monto_cobrado: true }
    });

    // 2. Facturación del día de hoy
    const totalHoy = await prisma.pago.aggregate({
      _sum: { monto_cobrado: true },
      where: {
        fecha_pago: { gte: inicioDia }
      }
    });

    // 3. Facturación del mes en curso
    const totalMes = await prisma.pago.aggregate({
      _sum: { monto_cobrado: true },
      where: {
        fecha_pago: { gte: inicioMes }
      }
    });

    // 4. Cantidad total de citas completadas, pendientes y canceladas
    const conteoEstados = await prisma.cita.groupBy({
      by: ['estado'],
      _count: { id: true }
    });

    // 5. Facturación desglosada por barbero
    const pagosPorBarbero = await prisma.pago.findMany({
      include: {
        cita: {
          include: {
            barbero: { select: { nombre: true, usuario: true } }
          }
        }
      }
    });

    const facturacionBarberos = {};
    pagosPorBarbero.forEach(pago => {
      const barberoNombre = pago.cita.barbero.nombre;
      if (!facturacionBarberos[barberoNombre]) {
        facturacionBarberos[barberoNombre] = 0;
      }
      facturacionBarberos[barberoNombre] += pago.monto_cobrado;
    });

    // 6. Facturación desglosada por método de pago
    const facturacionMetodos = await prisma.pago.findMany({
      include: {
        metodo_pago: { select: { nombre: true } }
      }
    });

    const facturacionPorMetodo = {};
    facturacionMetodos.forEach(pago => {
      const metodoNombre = pago.metodo_pago.nombre;
      if (!facturacionPorMetodo[metodoNombre]) {
        facturacionPorMetodo[metodoNombre] = 0;
      }
      facturacionPorMetodo[metodoNombre] += pago.monto_cobrado;
    });

    return res.json({
      totalHistorico: totalHistorico._sum.monto_cobrado || 0,
      totalHoy: totalHoy._sum.monto_cobrado || 0,
      totalMes: totalMes._sum.monto_cobrado || 0,
      citasPorEstado: conteoEstados,
      facturacionBarberos,
      facturacionPorMetodo
    });
  } catch (error) {
    console.error('Error al obtener métricas:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor al procesar las métricas financieras.' 
    });
  }
}

// ==========================================
// 2. CRUD DE BARBEROS (USUARIOS)
// ==========================================

export async function listarUsuarios(req, res) {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: {
        eliminado: false // <--- Trae a TODOS los usuarios sin importar si son BARBERO o ADMIN
      },
      select: {
        id: true,
        nombre: true,
        usuario: true,
        rol: true,
        activo: true,
        fecha_creacion: true
      }
    });
    return res.json(usuarios);
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar los usuarios del ERP.' });
  }
}

export async function crearUsuarios(req, res) {
  try {
    const { nombre, usuario, contrasena, rol } = req.body;

    if (!nombre || !usuario || !contrasena) {
      return res.status(400).json({ error: 'Todos los campos (nombre, usuario, contrasena) son obligatorios.' });
    }

    const usuarioExistente = await prisma.usuario.findUnique({ where: { usuario } });
    if (usuarioExistente) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado en el sistema.' });
    }

    const contrasena_hash = await bcrypt.hash(contrasena, 10);

    // Rol dinámico: acepta cualquier rol que envíe el admin, por defecto BARBERO
    const rolAsignado = (rol && rol.trim() !== '') ? rol.trim().toUpperCase() : 'BARBERO';

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombre,
        usuario,
        contrasena_hash,
        rol: rolAsignado
      }
    });

    return res.status(201).json({
      mensaje: 'Usuario creado correctamente.',
      usuario: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        usuario: nuevoUsuario.usuario,
        rol: nuevoUsuario.rol
      }
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    return res.status(500).json({ error: 'Error interno del servidor al registrar el usuario.' });
  }
}

export async function actualizarUsuarios(req, res) {
  try {
    const { id } = req.params;
    const { nombre, activo, rol } = req.body;

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: parseInt(id) }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const datosActualizados = {};
    if (nombre !== undefined && nombre.trim() !== '') datosActualizados.nombre = nombre.trim();
    if (activo !== undefined) datosActualizados.activo = activo;
    // Rol dinámico: el admin puede cambiar el rol a cualquier valor
    if (rol !== undefined && rol.trim() !== '') {
      datosActualizados.rol = rol.trim().toUpperCase();
    }

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: datosActualizados
    });

    return res.json({
      mensaje: 'Usuario actualizado correctamente.',
      usuario: {
        id: usuarioActualizado.id,
        nombre: usuarioActualizado.nombre,
        usuario: usuarioActualizado.usuario,
        rol: usuarioActualizado.rol,
        activo: usuarioActualizado.activo
      }
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    return res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
}

// REEMPLAZA ESTA FUNCIÓN COMPLETA EN TU ARCHIVO CONTROLADOR
export async function eliminarUsuarios(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = parseInt(id);

    // 1. Validar que el ID sea correcto
    if (isNaN(usuarioId)) {
      return res.status(400).json({ error: 'El ID de usuario no es válido.' });
    }

    // 2. Realizamos un borrado lógico en lugar de un .delete()
    // Al poner 'eliminado: true', el usuario se mantiene en la BD pero no se verá en la lista
    const barberoEliminado = await prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        eliminado: true,
        activo: false // También lo desactivamos por seguridad
      }
    });

    // 3. Registro en auditoría (opcional pero recomendado)
    await prisma.auditoria.create({
      data: {
        barbero_id: req.usuario ? req.usuario.id : usuarioId,
        accion: 'BORRADO_LOGICO_USUARIO',
        detalles: `El usuario ${barberoEliminado.nombre} ha sido marcado como eliminado.`
      }
    });

    return res.json({
      ok: true,
      mensaje: `El barbero "${barberoEliminado.nombre}" ha sido eliminado de la interfaz.`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al realizar el borrado lógico.' });
  }
}

export async function cambiarRolUsuario(req, res) {
  try {
    const { id } = req.params;
    const { nuevoRol } = req.body; // Recibirá: 'ADMINISTRADOR', 'CONTADORA', 'CAJERA', 'BARBERO'

    const usuarioActualizado = await prisma.usuario.update({
      where: { id: parseInt(id) },
                                                           data: { rol: nuevoRol }
    });

    return res.json({
      mensaje: `El rol de ${usuarioActualizado.nombre} fue actualizado a ${nuevoRol}.`,
      usuario: usuarioActualizado
    });
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo actualizar el rol.' });
  }
}

// ==========================================
// 3. CRUD DE SERVICIOS (CORTES Y COMBOS)
// ==========================================

export async function listarServicios(req, res) {
  try {
    const servicios = await prisma.servicio.findMany();
    return res.json(servicios);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener el catálogo de servicios.' });
  }
}

export async function crearServicio(req, res) {
  try {
    const { nombre, descripcion, precio } = req.body;

    if (!nombre || descripcion === undefined || precio === undefined) {
      return res.status(400).json({ error: 'Nombre, descripción y precio son requeridos.' });
    }

    const nuevoServicio = await prisma.servicio.create({
      data: {
        nombre,
        descripcion,
        precio: parseFloat(precio)
      }
    });

    return res.status(201).json({
      mensaje: 'Servicio creado correctamente.',
      servicio: nuevoServicio
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear el servicio.' });
  }
}

export async function actualizarServicio(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio, activo } = req.body;

    const datosActualizados = {};
    if (nombre) datosActualizados.nombre = nombre;
    if (descripcion !== undefined) datosActualizados.descripcion = descripcion;
    if (precio !== undefined) datosActualizados.precio = parseFloat(precio);
    if (activo !== undefined) datosActualizados.activo = activo;

    const servicioActualizado = await prisma.servicio.update({
      where: { id: parseInt(id) },
      data: datosActualizados
    });

    return res.json({
      mensaje: 'Servicio actualizado correctamente.',
      servicio: servicioActualizado
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar el servicio.' });
  }
}

export async function eliminarServicio(req, res) {
  try {
    const { id } = req.params;

    // Desactivación en vez de borrado físico para evitar fallos de claves foráneas
    await prisma.servicio.update({
      where: { id: parseInt(id) },
      data: { activo: false }
    });

    return res.json({ mensaje: 'Servicio desactivado del catálogo correctamente.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al desactivar el servicio.' });
  }
}

// ==========================================
// 4. CRUD DE MÉTODOS DE PAGO
// ==========================================

export async function listarMetodosPago(req, res) {
  try {
    const metodos = await prisma.metodoPago.findMany();
    return res.json(metodos);
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar los métodos de pago.' });
  }
}

export async function crearMetodoPago(req, res) {
  try {
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del método de pago es requerido.' });
    }

    const nuevoMetodo = await prisma.metodoPago.create({
      data: { nombre }
    });

    return res.status(201).json({
      mensaje: 'Método de pago registrado correctamente.',
      metodo: nuevoMetodo
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear el método de pago.' });
  }
}

export async function actualizarMetodoPago(req, res) {
  try {
    const { id } = req.params;
    const { nombre, activo } = req.body;

    const datosActualizados = {};
    if (nombre) datosActualizados.nombre = nombre;
    if (activo !== undefined) datosActualizados.activo = activo;

    const metodoActualizado = await prisma.metodoPago.update({
      where: { id: parseInt(id) },
      data: datosActualizados
    });

    return res.json({
      mensaje: 'Método de pago actualizado.',
      metodo: metodoActualizado
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar el método de pago.' });
  }
}

export async function eliminarMetodoPago(req, res) {
  try {
    const { id } = req.params;

    await prisma.metodoPago.update({
      where: { id: parseInt(id) },
      data: { activo: false }
    });

    return res.json({ mensaje: 'Método de pago desactivado del catálogo.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al desactivar el método de pago.' });
  }
}

// ==========================================
// 5. MÓDULO DE AUDITORÍA Y REGISTRO
// ==========================================

/**
 * Consulta y filtra el historial de auditoría de transacciones y accesos
 * Filtros permitidos por query params: barberoId (usuario), dia (AAAA-MM-DD), o mes (1-12) y anio (AAAA)
 */
export async function listarAuditoria(req, res) {
  try {
    const { barberoId, dia, mes, anio } = req.query;

    const condiciones = {};

    if (barberoId) {
      condiciones.barbero_id = parseInt(barberoId);
    }

    if (dia) {
      const fechaDia = new Date(dia);
      const inicioDia = new Date(fechaDia.getFullYear(), fechaDia.getMonth(), fechaDia.getDate());
      const finDia = new Date(fechaDia.getFullYear(), fechaDia.getMonth(), fechaDia.getDate(), 23, 59, 59, 999);
      condiciones.fecha_registro = {
        gte: inicioDia,
        lte: finDia
      };
    } else if (mes && anio) {
      const anioInt = parseInt(anio);
      const mesInt = parseInt(mes) - 1; // JS Date maneja meses indexados en 0 (0 = Enero)
      const inicioMes = new Date(anioInt, mesInt, 1);
      const finMes = new Date(anioInt, mesInt + 1, 0, 23, 59, 59, 999);
      condiciones.fecha_registro = {
        gte: inicioMes,
        lte: finMes
      };
    }

    const registros = await prisma.auditoria.findMany({
      where: condiciones,
      include: {
        barbero: {
          select: { nombre: true, usuario: true, rol: true }
        }
      },
      orderBy: {
        fecha_registro: 'desc'
      }
    });

    // También traemos los registros financieros detallados de las citas cobradas
    const transaccionesFinancieras = await prisma.pago.findMany({
      where: dia ? {
        fecha_pago: condiciones.fecha_registro
      } : mes && anio ? {
        fecha_pago: condiciones.fecha_registro
      } : {},
      include: {
        cita: {
          include: {
            barbero: { select: { nombre: true } },
            servicio: { select: { nombre: true } }
          }
        },
        metodo_pago: { select: { nombre: true } }
      },
      orderBy: {
        fecha_pago: 'desc'
      }
    });

    return res.json({
      auditoriaAccesos: registros,
      auditoriaVentas: transaccionesFinancieras
    });
  } catch (error) {
    console.error('Error al listar auditoría:', error);
    return res.status(500).json({ error: 'Error al consultar los registros de auditoría.' });
  }
}

// ==========================================
// 6. EXPORTACIONES SEGURAS (SOLO LECTURA)
// ==========================================

/**
 * Función auxiliar para obtener las ventas de auditoría con todos los filtros aplicados.
 * Reutilizada tanto por el endpoint de listado como por los de exportación.
 */
async function obtenerVentasParaExportar(barberoId, dia, mes, anio) {
  const condFecha = {};

  if (dia) {
    const fechaDia = new Date(dia);
    condFecha.gte = new Date(fechaDia.getFullYear(), fechaDia.getMonth(), fechaDia.getDate());
    condFecha.lte = new Date(fechaDia.getFullYear(), fechaDia.getMonth(), fechaDia.getDate(), 23, 59, 59, 999);
  } else if (mes && anio) {
    const anioInt = parseInt(anio);
    const mesInt = parseInt(mes) - 1;
    condFecha.gte = new Date(anioInt, mesInt, 1);
    condFecha.lte = new Date(anioInt, mesInt + 1, 0, 23, 59, 59, 999);
  }

  const wherePago = {};
  if (Object.keys(condFecha).length > 0) {
    wherePago.fecha_pago = condFecha;
  }

  // Si hay filtro por barbero, filtramos a través de la relación con la cita
  if (barberoId) {
    wherePago.cita = { barbero_id: parseInt(barberoId) };
  }

  return prisma.pago.findMany({
    where: wherePago,
    include: {
      cita: {
        include: {
          barbero: { select: { nombre: true, rol: true } },
          servicio: { select: { nombre: true, precio: true } }
        }
      },
      metodo_pago: { select: { nombre: true } }
    },
    orderBy: { fecha_pago: 'desc' }
  });
}

/**
 * Exporta el historial de auditoría de ventas como un archivo PDF descargable.
 * SOLO LECTURA: No permite ninguna modificación de los datos.
 */
export async function exportarAuditoriaPDF(req, res) {
  try {
    const { barberoId, dia, mes, anio } = req.query;
    const ventas = await obtenerVentasParaExportar(barberoId, dia, mes, anio);

    // Preparar el documento PDF en memoria
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // Configurar las cabeceras de descarga en la respuesta HTTP
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_barberia_${Date.now()}.pdf"`);
    doc.pipe(res);

    // Encabezado del documento
    doc.fontSize(20).font('Helvetica-Bold').text('Barbería El Nuevo Stylo', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Reporte de Auditoría de Ventas', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#888888').text(`Generado: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
    doc.fillColor('#000000').moveDown(1);

    // Línea separadora
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);

    if (ventas.length === 0) {
      doc.fontSize(12).text('No se encontraron registros para los filtros aplicados.', { align: 'center' });
    } else {
      // Calcular totales desglosados
      const totalServicios = ventas.reduce((acc, v) => acc + v.monto_cobrado, 0);
      const totalPropinas  = ventas.reduce((acc, v) => acc + (v.propina || 0), 0);
      const totalGeneral   = totalServicios + totalPropinas;

      // Encabezados de la tabla — nueva distribución con Usuario(Rol), Servicio, Método(Ref), Monto, Propina, Total
      const colX = { fecha: 40, usuario: 125, servicio: 240, metodoPago: 345, monto: 430, propina: 478, total: 522 };

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#003366');
      const yCab = doc.y;
      doc.text('Fecha/Hora',       colX.fecha,     yCab, { width: 80 });
      doc.text('Usuario (Rol)',    colX.usuario,   yCab, { width: 110 });
      doc.text('Servicio',        colX.servicio,  yCab, { width: 100 });
      doc.text('Método / Ref.',   colX.metodoPago, yCab, { width: 80 });
      doc.text('Monto',           colX.monto,     yCab, { width: 44, align: 'right' });
      doc.text('Propina',         colX.propina,   yCab, { width: 40, align: 'right' });
      doc.text('Total',           colX.total,     yCab, { width: 40, align: 'right' });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(562, doc.y).strokeColor('#003366').stroke();
      doc.strokeColor('#000000');
      doc.moveDown(0.3);

      // Filas de datos
      doc.font('Helvetica').fontSize(7.5).fillColor('#000000');
      ventas.forEach((venta, idx) => {
        if (idx % 2 === 0) {
          doc.rect(40, doc.y - 2, 522, 13).fill('#f0f4f8').fillColor('#000000');
        }

        const fecha = new Date(venta.fecha_pago).toLocaleString('es-ES', {
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
        const usuarioRol   = `${venta.cita.barbero.nombre} (${venta.cita.barbero.rol})`;
        const metodoRef    = venta.referencia ? `${venta.metodo_pago.nombre} (${venta.referencia})` : venta.metodo_pago.nombre;
        const propina      = venta.propina || 0;
        const totalFila    = venta.monto_cobrado + propina;

        const y = doc.y;
        doc.text(fecha,                                        colX.fecha,     y, { width: 80 });
        doc.text(usuarioRol,                                   colX.usuario,   y, { width: 110 });
        doc.text(venta.cita.servicio.nombre,                   colX.servicio,  y, { width: 100 });
        doc.text(metodoRef,                                    colX.metodoPago, y, { width: 80 });
        doc.text(venta.monto_cobrado.toLocaleString('es-ES'),  colX.monto,     y, { width: 44, align: 'right' });
        doc.text(propina.toLocaleString('es-ES'),              colX.propina,   y, { width: 40, align: 'right' });
        doc.text(totalFila.toLocaleString('es-ES'),            colX.total,     y, { width: 40, align: 'right' });

        doc.moveDown(0.85);

        if (doc.y > 750) doc.addPage();
      });

      // Sección de totales desglosados al final
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.4);
      doc.fontSize(9).font('Helvetica')
        .text(`Total Servicios: ${totalServicios.toLocaleString('es-ES')} COP`, { align: 'right' });
      doc.text(`Total Propinas: ${totalPropinas.toLocaleString('es-ES')} COP`, { align: 'right' });
      doc.moveDown(0.2);
      doc.fontSize(11).font('Helvetica-Bold')
        .text(`Total General Facturado: ${totalGeneral.toLocaleString('es-ES')} COP`, { align: 'right' });
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica').fillColor('#888888')
        .text(`Registros totales: ${ventas.length}`, { align: 'right' });
    }

    doc.end();
  } catch (error) {
    console.error('Error al exportar PDF:', error);
    return res.status(500).json({ error: 'Error al generar el PDF de auditoría.' });
  }
}

/**
 * Exporta el historial de auditoría de ventas como un archivo Excel (.xlsx) descargable.
 * SOLO LECTURA: No permite ninguna modificación de los datos.
 */
export async function exportarAuditoriaExcel(req, res) {
  try {
    const { barberoId, dia, mes, anio } = req.query;
    const ventas = await obtenerVentasParaExportar(barberoId, dia, mes, anio);

    // Crear el libro de trabajo y la hoja principal
    const workbook = XLSX.utils.book_new();

    // Calcular totales acumulados
    const totalServicios = ventas.reduce((acc, v) => acc + v.monto_cobrado, 0);
    const totalPropinas  = ventas.reduce((acc, v) => acc + (v.propina || 0), 0);
    const totalGeneral   = totalServicios + totalPropinas;

    // Preparar filas con todos los campos incluyendo Rol, Propina y Total Cobrado
    const filas = ventas.map(venta => {
      const monto   = venta.monto_cobrado;
      const propina = venta.propina || 0;
      return {
        'Fecha y Hora':       new Date(venta.fecha_pago).toLocaleString('es-ES'),
        'Usuario':            venta.cita.barbero.nombre,
        'Rol':                venta.cita.barbero.rol,
        'Cliente':            venta.cita.nombre_cliente,
        'Servicio Realizado': venta.cita.servicio.nombre,
        'Precio Servicio':    monto,
        'Propina':            propina,
        'Total Cobrado':      monto + propina,
        'Método de Pago':     venta.metodo_pago.nombre,
        'Referencia':         venta.referencia || 'N/D'
      };
    });

    // Fila de totales al final de la hoja
    filas.push({
      'Fecha y Hora':       'TOTALES',
      'Usuario':            '',
      'Rol':                '',
      'Cliente':            '',
      'Servicio Realizado': `${ventas.length} registro(s)`,
      'Precio Servicio':    totalServicios,
      'Propina':            totalPropinas,
      'Total Cobrado':      totalGeneral,
      'Método de Pago':     '',
      'Referencia':         ''
    });

    const hoja = XLSX.utils.json_to_sheet(filas);

    // Ajustar anchos de columnas
    hoja['!cols'] = [
      { wch: 20 }, // Fecha y Hora
      { wch: 20 }, // Usuario
      { wch: 16 }, // Rol
      { wch: 22 }, // Cliente
      { wch: 28 }, // Servicio
      { wch: 16 }, // Precio Servicio
      { wch: 12 }, // Propina
      { wch: 16 }, // Total Cobrado
      { wch: 18 }, // Método de Pago
      { wch: 16 }  // Referencia
    ];

    XLSX.utils.book_append_sheet(workbook, hoja, 'Auditoría de Ventas');

    // Serializar el libro a un buffer y enviarlo como descarga
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_barberia_${Date.now()}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Error al exportar Excel:', error);
    return res.status(500).json({ error: 'Error al generar el archivo Excel de auditoría.' });
  }
}


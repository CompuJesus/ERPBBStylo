// Controlador de autenticación del ERP
// Maneja el inicio de sesión y el registro del primer administrador del sistema

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/base_datos.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_para_erp_barberia_nuevo_stylo_2026';

/**
 * Autentica un usuario (Administrador o Barbero) y genera un token JWT
 */
export async function iniciarSesion(req, res) {
  try {
    const { usuario, contrasena } = req.body;

    // Validación de campos requeridos
    if (!usuario || !contrasena) {
      return res.status(400).json({ 
        error: 'El nombre de usuario y la contraseña son requeridos.' 
      });
    }

    // Buscar al usuario por su nombre de usuario único
    const usuarioEncontrado = await prisma.usuario.findUnique({
      where: { usuario }
    });

    // Validar existencia y estado del usuario
    if (!usuarioEncontrado || !usuarioEncontrado.activo) {
      return res.status(401).json({ 
        error: 'Las credenciales ingresadas son incorrectas o el usuario está inactivo.' 
      });
    }

    // Comparar la contraseña con el hash almacenado
    const contrasenaValida = await bcrypt.compare(contrasena, usuarioEncontrado.contrasena_hash);
    if (!contrasenaValida) {
      return res.status(401).json({ 
        error: 'Las credenciales ingresadas son incorrectas.' 
      });
    }

    // Registrar inicio de sesión en la tabla de auditoría para fines de control
    await prisma.auditoria.create({
      data: {
        barbero_id: usuarioEncontrado.id,
        accion: 'LOGIN',
        detalles: `El usuario ${usuarioEncontrado.nombre} (${usuarioEncontrado.rol}) inició sesión.`
      }
    });

    // Firmar el token JWT con duración de 24 horas
    const token = jwt.sign(
      { id: usuarioEncontrado.id, rol: usuarioEncontrado.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Intentar analizar las preferencias de tema (JSON) guardadas en la base de datos
    let preferenciasTema;
    try {
      preferenciasTema = JSON.parse(usuarioEncontrado.preferencias_tema);
    } catch {
      preferenciasTema = usuarioEncontrado.preferencias_tema;
    }

    return res.json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id: usuarioEncontrado.id,
        nombre: usuarioEncontrado.nombre,
        usuario: usuarioEncontrado.usuario,
        rol: usuarioEncontrado.rol,
        preferencias_tema: preferenciasTema
      }
    });
  } catch (error) {
    console.error('Error en iniciarSesion:', error);
    return res.status(500).json({ 
      error: 'Error interno en el servidor al intentar iniciar sesión.' 
    });
  }
}

/**
 * Permite registrar al primer administrador cuando la base de datos está totalmente vacía.
 * Si ya existe algún usuario en el sistema, esta ruta es denegada automáticamente.
 */
export async function registrarPrimerAdministrador(req, res) {
  try {
    const totalUsuarios = await prisma.usuario.count();
    if (totalUsuarios > 0) {
      return res.status(400).json({ 
        error: 'Ya existe al menos un usuario registrado en el sistema. Operación no permitida.' 
      });
    }

    const { nombre, usuario, contrasena } = req.body;

    if (!nombre || !usuario || !contrasena) {
      return res.status(400).json({ 
        error: 'Los campos nombre, usuario y contrasena son requeridos.' 
      });
    }

    // Encriptar la contraseña con bcrypt
    const contrasena_hash = await bcrypt.hash(contrasena, 10);

    // Crear el primer usuario administrador
    const nuevoAdmin = await prisma.usuario.create({
      data: {
        nombre,
        usuario,
        contrasena_hash,
        rol: 'ADMINISTRADOR'
      }
    });

    return res.status(201).json({
      mensaje: 'Primer administrador creado exitosamente.',
      usuario: {
        id: nuevoAdmin.id,
        nombre: nuevoAdmin.nombre,
        usuario: nuevoAdmin.usuario,
        rol: nuevoAdmin.rol
      }
    });
  } catch (error) {
    console.error('Error al registrar primer administrador:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor al crear el primer administrador.' 
    });
  }
}

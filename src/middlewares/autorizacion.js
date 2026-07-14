// Middleware de autorización y control de acceso (RBAC) para el ERP
// Verifica el token JWT del usuario y restringe las rutas según sus roles asignados

import jwt from 'jsonwebtoken';
import prisma from '../config/base_datos.js';

// Clave secreta obtenida de las variables de entorno
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_para_erp_barberia_nuevo_stylo_2026';

/**
 * Valida que el token JWT enviado en las cabeceras sea correcto y pertenezca a un usuario activo.
 */
export async function validarToken(req, res, next) {
  try {
    const cabeceraAutorizacion = req.headers['authorization'];
    // Se espera el formato "Bearer <token>"
    const token = cabeceraAutorizacion && cabeceraAutorizacion.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Acceso denegado. No se proporcionó un token de autenticación.' 
      });
    }

    // Decodificar y verificar la validez del token
    const datosDecodificados = jwt.verify(token, JWT_SECRET);

    // Buscar al usuario en la base de datos para garantizar que siga activo
    const usuario = await prisma.usuario.findUnique({
      where: { id: datosDecodificados.id }
    });

    if (!usuario || !usuario.activo) {
      return res.status(403).json({ 
        error: 'Usuario no encontrado o se encuentra inactivo.' 
      });
    }

    // Guardar la información del usuario en la solicitud para los siguientes middlewares o controladores
    req.usuario = usuario;
    next();
  } catch (error) {
    return res.status(403).json({ 
      error: 'Token inválido o expirado. Inicie sesión nuevamente.' 
    });
  }
}

/**
 * Restringe el acceso a la ruta si el usuario no tiene al menos uno de los roles autorizados.
 * @param {string[]} rolesPermitidos - Lista de roles permitidos (ej. ['ADMINISTRADOR', 'BARBERO'])
 */
export function verificarRol(rolesPermitidos) {
  return (req, res, next) => {
    // Verificar si el usuario ha sido autenticado por el middleware validarToken
    if (!req.usuario) {
      return res.status(401).json({ 
        error: 'Usuario no autenticado.' 
      });
    }

    // Comprobar si el rol del usuario actual está en la lista de permitidos
    const tienePermiso = rolesPermitidos.includes(req.usuario.rol);
    if (!tienePermiso) {
      return res.status(403).json({ 
        error: `Acceso denegado. Se requiere el rol de: ${rolesPermitidos.join(' o ')}.` 
      });
    }

    next();
  };
}

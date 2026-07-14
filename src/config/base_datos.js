// Configuración y conexión de la base de datos a través de Prisma
// Exporta la instancia única del cliente de Prisma para interactuar con la base de datos SQLite

import { PrismaClient } from '@prisma/client';

// Instanciar el cliente de Prisma para realizar consultas y operaciones
const prisma = new PrismaClient();

// Exportar la instancia del cliente para su uso en los controladores del ERP
export default prisma;

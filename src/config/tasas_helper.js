import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaTasas = path.join(__dirname, 'tasas.json');

/**
 * Lee las tasas de cambio locales almacenadas en el archivo JSON.
 * Sirve de fallback si falla la conexión a internet.
 * @returns {Object} Objeto con las tasas de cambio de USD a COP y VES.
 */
export function leerTasas() {
  try {
    if (!fs.existsSync(rutaTasas)) {
      // Si no existe el archivo, se crea con valores base de respaldo
      const tasasPorDefecto = { usd_cop: 4000.0, usd_ves: 36.5 };
      fs.writeFileSync(rutaTasas, JSON.stringify(tasasPorDefecto, null, 2), 'utf-8');
      return tasasPorDefecto;
    }
    const contenido = fs.readFileSync(rutaTasas, 'utf-8');
    return JSON.parse(contenido);
  } catch (error) {
    console.error('Error al leer el archivo tasas.json:', error);
    return { usd_cop: 4000.0, usd_ves: 36.5 };
  }
}

/**
 * Guarda nuevas tasas de cambio de forma persistente en el archivo local.
 * @param {number} usdCop - Tasa de cambio de 1 USD a COP.
 * @param {number} usdVes - Tasa de cambio de 1 USD a VES.
 * @returns {boolean} True si se guardó correctamente, false de lo contrario.
 */
export function guardarTasas(usdCop, usdVes) {
  try {
    const nuevasTasas = { usd_cop: parseFloat(usdCop), usd_ves: parseFloat(usdVes) };
    fs.writeFileSync(rutaTasas, JSON.stringify(nuevasTasas, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error al persistir las tasas de cambio en tasas.json:', error);
    return false;
  }
}

/**
 * Consulta la API pública externa de tasas de cambio para obtener los valores oficiales en tiempo real.
 * Si tiene éxito, actualiza el archivo local y retorna las tasas.
 * Si falla, retorna los últimos valores guardados localmente.
 * @returns {Promise<Object>} Objeto con las tasas de cambio oficiales de USD a COP y VES.
 */
export async function obtenerTasasTiempoReal() {
  try {
    // API pública y gratuita de tasas de cambio referenciales sin requerir API Key
    const respuesta = await fetch('https://open.er-api.com/v6/latest/USD');
    
    if (!respuesta.ok) {
      throw new Error(`Respuesta inválida de la API externa. Código de estado: ${respuesta.status}`);
    }

    const datos = await respuesta.json();
    
    if (datos && datos.rates && datos.rates.COP && datos.rates.VES) {
      const tasaCop = parseFloat(datos.rates.COP);
      const tasaVes = parseFloat(datos.rates.VES);
      
      // Persistir las tasas en el archivo local para mantener caché
      guardarTasas(tasaCop, tasaVes);
      
      return { usd_cop: tasaCop, usd_ves: tasaVes, fuente: 'API_TIEMPO_REAL' };
    } else {
      throw new Error('El formato de respuesta de la API no contiene las monedas requeridas (COP y VES).');
    }
  } catch (error) {
    console.warn('Fallo al obtener tasas en tiempo real, se usará el archivo local de respaldo:', error.message);
    const tasasLocales = leerTasas();
    return { ...tasasLocales, fuente: 'ARCHIVO_RESPALDO' };
  }
}

/* Números de las piezas que se instancian: los comparten el worker (qué va dónde) y kit.ts (cómo son). */

/* Kit de fachada. Cada pieza mide 1×1×1: x de −.5 a .5, y de 0 a 1, z de 0 a 1 hacia afuera. */
export const K_CAJA = 0, K_CORNISA = 1, K_MENSULA = 2, K_REJA = 3, K_CANO = 4, K_MARCO = 5, K_AIRE = 6, K_LUCARNA = 7, K_ARCO = 8, K_VIDRIO = 9, K_MARCO_PB = 10;
export const N_KIT = 11;

/* Objetos de la calle */
export const P_FAROLA = 0, P_FAROL_PLAZA = 1, P_SEMAFORO = 2, P_GARITA = 3, P_BANCO = 4, P_CESTO = 5, P_CONTENEDOR = 6, P_RECICLADO = 7, P_FUENTE = 8, P_BICIS = 9, P_ECOBICI = 10, P_BUZON = 11,
  P_TELEFONO = 12, P_SUBTE = 13, P_ESTATUA = 14, P_HIDRANTE = 15, P_GABINETE = 16, P_BOLARDO = 17, P_CAJERO = 18, P_BEBEDERO = 19, P_RELOJ = 20, P_POSTE_CALLE = 21, P_KIOSCO = 22, P_PARADA = 23, P_SEPARADOR = 24, P_ANTENA = 25, P_AUTO = 26, P_TAXI = 27, P_CAMIONETA = 28, P_BOVEDA = 29,
  P_POSTA = 30, P_MESA = 31, P_BANDERA = 32, P_MACETA = 33, P_CAFE = 34, P_SOMBRILLA = 35, P_PUBLICIDAD = 36, P_SENAL = 37, P_PARQUIMETRO = 38, P_FLORES = 39, P_JUEGOS = 40, P_ARBUSTO = 41, P_POSTE_LUZ = 42, P_VALLA = 43, P_PIRAMIDE = 44;
export const N_PROPS = 45;

/* Especies de árbol */
export const A_PLATANO = 0, A_TIPA = 1, A_JACARANDA = 2, A_FRESNO = 3, A_PALO_BORRACHO = 4, A_GOMERO = 5, A_PALMERA = 6;
export const N_ESPECIES = 7;

/* Semáforos: un ciclo de 44 s con dos grupos de calles */
export const CICLO_SEMAFORO = 44;
/** 0 verde, 1 amarillo, 2 rojo. `grupo` 0 o 1, `corr` corrimiento en segundos. */
export function luzSemaforo(t: number, grupo: number, corr: number) {
  const f = ((t + corr + grupo * 0.5 * CICLO_SEMAFORO) % CICLO_SEMAFORO) / CICLO_SEMAFORO;
  return f < 0.42 ? 0 : f < 0.48 ? 1 : 2;
}

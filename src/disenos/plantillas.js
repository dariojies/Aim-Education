// Plantillas de partida del editor de diseños: se eligen al crear uno nuevo y
// luego se cambia todo lo que haga falta. Los colores son los de la marca.
import { nuevoId } from './render.js';

const LOGO = '/src/brand/Aim_Horizontal.png';
const LOGO_BLANCO = '/src/brand/Aim_White.png';
const COLORES = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4'];
const txt = (o) => ({ id: nuevoId(), tipo: 'texto', rot: 0, opacidad: 1, fuente: 'Montserrat', color: '#1A1A1A', alinear: 'centro', interlineado: 1.2, ...o });
const franjas = (ancho, y, alto) => COLORES.map((c, i) => ({ id: nuevoId(), tipo: 'rect', x: (ancho / 6) * i, y, w: ancho / 6 + 1, h: alto, rot: 0, opacidad: 1, relleno: c, radio: 0 }));

export const PLANTILLAS = [
  {
    id: 'diploma', nombre: 'Diploma del club', tipo: 'diploma', tamano: 'a4h',
    crear: () => ({
      ancho: 1754, alto: 1240, fondo: { tipo: 'color', color: '#ffffff' },
      elementos: [
        ...franjas(1754, 0, 22), ...franjas(1754, 1218, 22),
        { id: nuevoId(), tipo: 'rect', x: 60, y: 76, w: 1634, h: 1088, rot: 0, opacidad: 1, relleno: 'transparent', borde: '#D9D4EC', grosor: 3, radio: 28 },
        { id: nuevoId(), tipo: 'imagen', url: LOGO, x: 727, y: 130, w: 300, h: 112, rot: 0, opacidad: 1, ajuste: 'contener', radio: 0 },
        txt({ x: 140, y: 290, w: 1474, h: 80, texto: 'DIPLOMA DE APROVECHAMIENTO', tamano: 62, negrita: true, color: '#5233A8', espaciado: 4 }),
        txt({ x: 240, y: 400, w: 1274, h: 40, texto: 'AIM Education certifica que', tamano: 30, color: '#6B7280' }),
        txt({ x: 140, y: 460, w: 1474, h: 90, texto: '{alumno}', tamano: 72, negrita: true }),
        { id: nuevoId(), tipo: 'linea', x: 527, y: 572, w: 700, h: 4, rot: 0, opacidad: 1, color: '#E5E7EB', grosor: 3 },
        txt({ x: 240, y: 610, w: 1274, h: 40, texto: 'ha completado con aprovechamiento el curso', tamano: 30, color: '#6B7280' }),
        txt({ x: 140, y: 665, w: 1474, h: 64, texto: '«{curso}»', tamano: 46, negrita: true }),
        txt({ x: 240, y: 745, w: 1274, h: 40, texto: 'del aula virtual de AIM Education, superando sus {lecciones} lecciones.', tamano: 27, color: '#6B7280' }),
        txt({ x: 170, y: 960, w: 560, h: 34, texto: 'Algeciras, a', tamano: 24, color: '#6B7280', alinear: 'izquierda' }),
        txt({ x: 170, y: 995, w: 560, h: 40, texto: '{fecha}', tamano: 30, negrita: true, alinear: 'izquierda' }),
        txt({ x: 1024, y: 960, w: 560, h: 34, texto: 'Profesor/a del curso', tamano: 24, color: '#6B7280', alinear: 'derecha' }),
        txt({ x: 1024, y: 995, w: 560, h: 40, texto: '{profesor}', tamano: 30, negrita: true, alinear: 'derecha' }),
        txt({ x: 340, y: 1110, w: 1074, h: 28, texto: 'Código del diploma: {codigo} · www.aimeducation.es', tamano: 18, color: '#6B7280' }),
      ],
    }),
  },
  {
    id: 'diploma-infantil', nombre: 'Diploma infantil', tipo: 'diploma', tamano: 'a4h',
    crear: () => ({
      ancho: 1754, alto: 1240, fondo: { tipo: 'degradado', color: '#FFF6D6', color2: '#FFE3F1', angulo: 135 },
      elementos: [
        { id: nuevoId(), tipo: 'elipse', x: -160, y: -160, w: 520, h: 520, rot: 0, opacidad: 0.5, relleno: '#FFD526' },
        { id: nuevoId(), tipo: 'elipse', x: 1450, y: 900, w: 480, h: 480, rot: 0, opacidad: 0.45, relleno: '#00BBF4' },
        { id: nuevoId(), tipo: 'elipse', x: 1500, y: -120, w: 300, h: 300, rot: 0, opacidad: 0.4, relleno: '#FF5FA2' },
        { id: nuevoId(), tipo: 'rect', x: 120, y: 110, w: 1514, h: 1020, rot: 0, opacidad: 1, relleno: '#ffffff', radio: 48, sombra: true },
        { id: nuevoId(), tipo: 'imagen', url: LOGO, x: 752, y: 160, w: 250, h: 94, rot: 0, opacidad: 1, ajuste: 'contener', radio: 0 },
        txt({ x: 220, y: 290, w: 1314, h: 130, texto: '¡Enhorabuena!', tamano: 110, fuente: 'Pacifico', color: '#FF5FA2' }),
        txt({ x: 220, y: 450, w: 1314, h: 90, texto: '{alumno}', tamano: 76, negrita: true, color: '#5233A8' }),
        txt({ x: 260, y: 570, w: 1234, h: 120, texto: 'ha terminado el curso «{curso}»\ny lo ha hecho genial.', tamano: 38, color: '#374151', interlineado: 1.35 }),
        txt({ x: 220, y: 960, w: 1314, h: 40, texto: '{fecha}', tamano: 28, negrita: true, color: '#6B7280' }),
      ],
    }),
  },
  {
    id: 'post', nombre: 'Post de Instagram', tipo: 'libre', tamano: 'ig',
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'degradado', color: '#5233A8', color2: '#FF5FA2', angulo: 135 },
      elementos: [
        txt({ x: 90, y: 300, w: 900, h: 260, texto: 'Título del post', tamano: 110, negrita: true, color: '#ffffff', fuente: 'Plus Jakarta Sans' }),
        txt({ x: 140, y: 600, w: 800, h: 120, texto: 'Una frase que cuente lo importante', tamano: 42, color: '#ffffff', opacidad: 0.9 }),
        { id: nuevoId(), tipo: 'imagen', url: LOGO_BLANCO, x: 390, y: 900, w: 300, h: 110, rot: 0, opacidad: 1, ajuste: 'contener', radio: 0 },
      ],
    }),
  },
  {
    id: 'cartel', nombre: 'Cartel A3', tipo: 'libre', tamano: 'a3v',
    crear: () => ({
      ancho: 1754, alto: 2480, fondo: { tipo: 'color', color: '#FFFFFF' },
      elementos: [
        { id: nuevoId(), tipo: 'rect', x: 0, y: 0, w: 1754, h: 1100, rot: 0, opacidad: 1, relleno: '#5233A8', relleno2: '#00BBF4', angulo: 135, radio: 0 },
        txt({ x: 120, y: 330, w: 1514, h: 420, texto: 'GRAN\nEVENTO', tamano: 220, fuente: 'Bebas Neue', color: '#ffffff', interlineado: 0.95 }),
        txt({ x: 160, y: 1240, w: 1434, h: 90, texto: 'Sábado 15 de noviembre · 11:00', tamano: 70, negrita: true, color: '#5233A8' }),
        txt({ x: 200, y: 1400, w: 1354, h: 260, texto: 'Cuenta aquí de qué va, quién puede venir y qué hay que traer.', tamano: 52, color: '#374151', interlineado: 1.35 }),
        ...franjas(1754, 2440, 40),
        { id: nuevoId(), tipo: 'imagen', url: LOGO, x: 627, y: 2150, w: 500, h: 190, rot: 0, opacidad: 1, ajuste: 'contener', radio: 0 },
      ],
    }),
  },
  {
    id: 'historia', nombre: 'Historia', tipo: 'libre', tamano: 'historia',
    crear: () => ({
      ancho: 1080, alto: 1920, fondo: { tipo: 'degradado', color: '#21B668', color2: '#00BBF4', angulo: 160 },
      elementos: [
        txt({ x: 90, y: 640, w: 900, h: 400, texto: 'Tu mensaje\naquí', tamano: 130, negrita: true, color: '#ffffff', fuente: 'Plus Jakarta Sans' }),
        { id: nuevoId(), tipo: 'imagen', url: LOGO_BLANCO, x: 340, y: 1660, w: 400, h: 150, rot: 0, opacidad: 1, ajuste: 'contener', radio: 0 },
      ],
    }),
  },
];

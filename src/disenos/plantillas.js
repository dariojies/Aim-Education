// Plantillas de partida del editor de diseños: se eligen al crear uno nuevo y
// luego se cambia todo lo que haga falta. Los colores son los de la marca.
// Las de temporada llevan sus meses (temporada: [9, 10]…): en «Nuevo diseño»
// salen primero las de estas fechas.
import { nuevoId, TAMANOS, adaptarDiseno } from './render.js';

const LOGO = '/src/brand/Aim_Horizontal.png';
const LOGO_BLANCO = '/src/brand/Aim_White.png';
const COLORES = ['#5233A8', '#FF5FA2', '#F99B35', '#FFD526', '#21B668', '#00BBF4'];
const txt = (o) => ({ id: nuevoId(), tipo: 'texto', rot: 0, opacidad: 1, fuente: 'Montserrat', color: '#1A1A1A', alinear: 'centro', interlineado: 1.2, ...o });
const franjas = (ancho, y, alto) => COLORES.map((c, i) => ({ id: nuevoId(), tipo: 'rect', x: (ancho / 6) * i, y, w: ancho / 6 + 1, h: alto, rot: 0, opacidad: 1, relleno: c, radio: 0 }));
// El alto de un texto: sus líneas por la letra y el interlineado (el editor lo ajusta luego).
const alto = (lineas, tamano, interlineado = 1.2) => Math.round(lineas * tamano * interlineado);
const forma = (tipo, o) => ({ id: nuevoId(), tipo, rot: 0, opacidad: 1, radio: 0, ...o });
const logo = (o) => ({ id: nuevoId(), tipo: 'imagen', url: LOGO, rot: 0, opacidad: 1, ajuste: 'contener', radio: 0, ...o });
const icono = (icono, x, y, lado, color) => ({ id: nuevoId(), tipo: 'icono', icono, x, y, w: lado, h: lado, rot: 0, opacidad: 1, color });
const qr = (texto, x, y, lado) => ({ id: nuevoId(), tipo: 'qr', texto, x, y, w: lado, h: lado, rot: 0, opacidad: 1, color: '#17151C', fondo: '#FFFFFF', radio: 0 });
const confeti = (lista) => lista.map(([x, y, d, c2, o = 0.85]) => forma('elipse', { x, y, w: d, h: d, relleno: c2, opacidad: o }));
const INSCRIPCION = 'https://www.aimeducation.es/auth?mode=register';

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
    id: 'horario', nombre: 'Horario de una actividad', tipo: 'libre', tamano: 'ig',
    crear: () => ({
      ancho: 1080, alto: 1350, fondo: { tipo: 'degradado', color: '#5233A8', color2: '#00BBF4', angulo: 150 },
      elementos: [
        txt({ x: 80, y: 110, w: 920, h: alto(1, 150, 1), texto: 'HORARIO', tamano: 150, fuente: 'Bebas Neue', color: '#ffffff', interlineado: 1, espaciado: 6 }),
        txt({ x: 80, y: 270, w: 920, h: alto(1, 46), texto: 'Taekwon-Do · Temporada 2026/2027', tamano: 46, negrita: true, color: '#ffffff', opacidad: 0.92 }),
        forma('rect', { x: 80, y: 390, w: 920, h: 700, relleno: '#ffffff', radio: 36, sombra: true }),
        txt({ x: 130, y: 450, w: 820, h: alto(6, 42, 1.5), texto: 'Lunes y miércoles · 17:30 – 18:30\nInfantil (de 4 a 7 años)\n\nMartes y jueves · 18:30 – 19:30\nJuvenil y adultos\n', tamano: 42, color: '#1A1A1A', interlineado: 1.5, alinear: 'izquierda', vertical: 'arriba' }),
        txt({ x: 130, y: 990, w: 820, h: alto(1, 26), texto: 'Truco: «Añadir → Datos del club» pone el horario de verdad.', tamano: 26, color: '#6B7280', alinear: 'izquierda' }),
        logo({ url: LOGO_BLANCO, x: 390, y: 1160, w: 300, h: 110 }),
      ],
    }),
  },
  {
    id: 'examen', nombre: 'Examen de cinturón', tipo: 'libre', tamano: 'a4v',
    crear: () => ({
      ancho: 1240, alto: 1754, fondo: { tipo: 'color', color: '#FFFFFF' },
      elementos: [
        ...['#FFFFFF', '#FFD526', '#21B668', '#00BBF4', '#E53935', '#1A1A1A'].map((c, i) => forma('rect', { x: 0, y: 120 + i * 46, w: 1240, h: 46, relleno: c, borde: '#E5E7EB', grosor: i === 0 ? 2 : 0 })),
        txt({ x: 80, y: 480, w: 1080, h: alto(2, 150, 0.95), texto: 'EXAMEN DE\nCINTURÓN', tamano: 150, fuente: 'Bebas Neue', color: '#5233A8', interlineado: 0.95, espaciado: 4 }),
        txt({ x: 80, y: 820, w: 1080, h: alto(1, 58), texto: 'Sábado 13 de diciembre · 10:00', tamano: 58, negrita: true, color: '#1A1A1A' }),
        txt({ x: 80, y: 910, w: 1080, h: alto(1, 40), texto: 'En el dojang de Aim Education', tamano: 40, color: '#6B7280' }),
        forma('rect', { x: 140, y: 1040, w: 960, h: 300, relleno: '#F6F4EF', radio: 28 }),
        txt({ x: 190, y: 1085, w: 860, h: alto(3, 36, 1.4), texto: 'Trae el dobok limpio y planchado, la matrícula pagada y muchas ganas. ¡Mucha suerte a todos!', tamano: 36, color: '#374151', interlineado: 1.4 }),
        logo({ x: 445, y: 1480, w: 350, h: 130 }),
      ],
    }),
  },
  {
    id: 'resultados', nombre: 'Resultados de competición', tipo: 'libre', tamano: 'ig',
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'color', color: '#17151C' },
      elementos: [
        ...franjas(1080, 0, 14),
        txt({ x: 60, y: 90, w: 960, h: alto(1, 150, 1), texto: '¡RESULTADOS!', tamano: 150, fuente: 'Bebas Neue', color: '#FFFFFF', interlineado: 1, espaciado: 4 }),
        txt({ x: 60, y: 260, w: 960, h: alto(1, 44), texto: 'Campeonato de Andalucía ITF · Sevilla', tamano: 44, negrita: true, color: '#FFD526' }),
        ...[['#FFD526', '3', 'Oros', 120], ['#C9CDD6', '2', 'Platas', 410], ['#D08A4E', '4', 'Bronces', 700]].flatMap(([c, n, t, x]) => [
          forma('elipse', { x, y: 400, w: 260, h: 260, relleno: c }),
          txt({ x, y: 455, w: 260, h: alto(1, 130, 1), texto: n, tamano: 130, negrita: true, color: '#17151C', interlineado: 1, fuente: 'Plus Jakarta Sans' }),
          txt({ x, y: 690, w: 260, h: alto(1, 40), texto: t, tamano: 40, negrita: true, color: '#FFFFFF' }),
        ]),
        txt({ x: 90, y: 800, w: 900, h: alto(1, 40), texto: '¡Enhorabuena, equipo! Orgullosos de vosotros.', tamano: 40, color: '#FFFFFF', opacidad: 0.85 }),
        logo({ url: LOGO_BLANCO, x: 390, y: 920, w: 300, h: 110 }),
      ],
    }),
  },
  {
    id: 'cumpleanos', nombre: 'Feliz cumpleaños', tipo: 'libre', tamano: 'ig',
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'degradado', color: '#FFE36E', color2: '#FF8FC0', angulo: 135 },
      elementos: [
        ...[[60, 80, 90, '#5233A8'], [900, 120, 70, '#00BBF4'], [140, 860, 60, '#21B668'], [880, 840, 110, '#F99B35'], [500, 60, 40, '#FFFFFF'], [40, 480, 44, '#FFFFFF']]
          .map(([x, y, d, c]) => forma('elipse', { x, y, w: d, h: d, relleno: c, opacidad: 0.8 })),
        txt({ x: 80, y: 280, w: 920, h: alto(2, 120, 1.05), texto: '¡Feliz\ncumpleaños!', tamano: 120, fuente: 'Pacifico', color: '#5233A8', interlineado: 1.05 }),
        txt({ x: 80, y: 570, w: 920, h: alto(1, 80), texto: 'Nombre', tamano: 80, negrita: true, color: '#17151C', fuente: 'Plus Jakarta Sans' }),
        txt({ x: 140, y: 700, w: 800, h: alto(2, 40, 1.3), texto: 'Todo el club te desea un día genial. ¡A por muchos más!', tamano: 40, color: '#374151', interlineado: 1.3 }),
        logo({ x: 415, y: 930, w: 250, h: 94 }),
      ],
    }),
  },
  {
    id: 'festivo', nombre: 'Cerrado por festivo', tipo: 'libre', tamano: 'ig',
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'color', color: '#F6F4EF' },
      elementos: [
        ...franjas(1080, 0, 20), ...franjas(1080, 1060, 20),
        txt({ x: 60, y: 260, w: 960, h: alto(1, 200, 1), texto: 'CERRADO', tamano: 200, fuente: 'Bebas Neue', color: '#5233A8', interlineado: 1, espaciado: 8 }),
        txt({ x: 80, y: 500, w: 920, h: alto(1, 52), texto: 'Lunes 8 de diciembre', tamano: 52, negrita: true, color: '#17151C' }),
        txt({ x: 80, y: 580, w: 920, h: alto(1, 40), texto: 'Día de la Inmaculada', tamano: 40, color: '#6B7280' }),
        txt({ x: 140, y: 700, w: 800, h: alto(1, 38), texto: 'No hay clases. ¡Nos vemos el martes!', tamano: 38, color: '#374151' }),
        logo({ x: 400, y: 880, w: 280, h: 105 }),
      ],
    }),
  },
  {
    id: 'campamento', nombre: 'Cartel del campamento', tipo: 'libre', tamano: 'a3v', temporada: [3, 4, 5, 6],
    crear: () => ({
      ancho: 1754, alto: 2480, fondo: { tipo: 'color', color: '#FFFFFF' },
      elementos: [
        forma('rect', { x: 0, y: 0, w: 1754, h: 1180, relleno: '#21B668', relleno2: '#00BBF4', angulo: 135 }),
        forma('elipse', { x: 1280, y: -180, w: 620, h: 620, relleno: '#FFD526', opacidad: 0.9 }),
        txt({ x: 120, y: 300, w: 1514, h: alto(2, 230, 0.95), texto: 'CAMPAMENTO\nDE VERANO', tamano: 230, fuente: 'Bebas Neue', color: '#FFFFFF', interlineado: 0.95, alinear: 'izquierda' }),
        txt({ x: 120, y: 820, w: 1514, h: alto(1, 70), texto: 'Del 22 de junio al 31 de julio', tamano: 70, negrita: true, color: '#FFFFFF', alinear: 'izquierda' }),
        txt({ x: 120, y: 920, w: 1514, h: alto(1, 56), texto: 'De 9:00 a 14:00 · De 3 a 14 años', tamano: 56, color: '#FFFFFF', alinear: 'izquierda', opacidad: 0.92 }),
        txt({ x: 120, y: 1320, w: 1000, h: alto(4, 58, 1.35), texto: 'Deporte, inglés, robótica, manualidades y mucha diversión, con monitores titulados.', tamano: 58, color: '#374151', interlineado: 1.35, alinear: 'izquierda' }),
        { id: nuevoId(), tipo: 'qr', texto: 'https://www.aimeducation.es/campamento', x: 1214, y: 1300, w: 420, h: 420, rot: 0, opacidad: 1, color: '#17151C', fondo: '#FFFFFF', radio: 0 },
        txt({ x: 1164, y: 1740, w: 520, h: alto(1, 40), texto: 'Apúntate aquí', tamano: 40, negrita: true, color: '#21B668' }),
        logo({ x: 627, y: 2120, w: 500, h: 190 }),
        ...franjas(1754, 2440, 40),
      ],
    }),
  },
  {
    id: 'carrusel', nombre: 'Carrusel de Instagram (3 páginas)', tipo: 'libre', tamano: 'ig',
    crear: () => {
      const fondo = { tipo: 'degradado', color: '#5233A8', color2: '#FF5FA2', angulo: 150 };
      const flecha = () => ({ id: nuevoId(), tipo: 'forma', figura: 'flecha', x: 860, y: 1200, w: 140, h: 70, rot: 0, opacidad: 0.9, relleno: '#FFFFFF', borde: '#1A1A1A', grosor: 0 });
      const num = (n) => txt({ x: 80, y: 90, w: 300, h: alto(1, 40), texto: `${n} / 3`, tamano: 40, negrita: true, color: '#FFFFFF', alinear: 'izquierda', opacidad: 0.8 });
      return {
        ancho: 1080, alto: 1350, fondo,
        elementos: [
          num(1),
          txt({ x: 80, y: 360, w: 920, h: alto(3, 120, 1.05), texto: '3 razones para\nempezar\nTaekwon-Do', tamano: 120, negrita: true, color: '#FFFFFF', fuente: 'Plus Jakarta Sans', interlineado: 1.05, alinear: 'izquierda' }),
          txt({ x: 80, y: 820, w: 920, h: alto(1, 44), texto: 'Desliza para verlas →', tamano: 44, color: '#FFFFFF', alinear: 'izquierda', opacidad: 0.9 }),
          flecha(),
        ],
        paginas: [
          { fondo, elementos: [
            num(2),
            { id: nuevoId(), tipo: 'icono', icono: 'trofeo', x: 80, y: 260, w: 200, h: 200, rot: 0, opacidad: 1, color: '#FFD526' },
            txt({ x: 80, y: 520, w: 920, h: alto(2, 90, 1.1), texto: 'Confianza y\ndisciplina', tamano: 90, negrita: true, color: '#FFFFFF', fuente: 'Plus Jakarta Sans', interlineado: 1.1, alinear: 'izquierda' }),
            txt({ x: 80, y: 760, w: 900, h: alto(3, 42, 1.35), texto: 'Cada cinturón es una meta que se consigue con constancia. Y se nota fuera del tatami.', tamano: 42, color: '#FFFFFF', interlineado: 1.35, alinear: 'izquierda', opacidad: 0.92 }),
            flecha(),
          ] },
          { fondo, elementos: [
            num(3),
            txt({ x: 80, y: 260, w: 920, h: alto(2, 100, 1.05), texto: '¿Lo\nprobamos?', tamano: 100, negrita: true, color: '#FFFFFF', fuente: 'Plus Jakarta Sans', interlineado: 1.05, alinear: 'izquierda' }),
            txt({ x: 80, y: 520, w: 560, h: alto(3, 42, 1.35), texto: 'La primera clase es de prueba. Apúntate desde el código.', tamano: 42, color: '#FFFFFF', interlineado: 1.35, alinear: 'izquierda' }),
            { id: nuevoId(), tipo: 'qr', texto: 'https://www.aimeducation.es/auth?mode=register', x: 680, y: 500, w: 320, h: 320, rot: 0, opacidad: 1, color: '#17151C', fondo: '#FFFFFF', radio: 0 },
            logo({ url: LOGO_BLANCO, x: 390, y: 1150, w: 300, h: 110 }),
          ] },
        ],
      };
    },
  },
  {
    id: 'folleto', nombre: 'Folleto A4 (dos caras)', tipo: 'libre', tamano: 'a4v',
    crear: () => ({
      ancho: 1240, alto: 1754, fondo: { tipo: 'color', color: '#FFFFFF' },
      elementos: [
        { id: nuevoId(), tipo: 'imagen', url: null, marco: 'rect', ajuste: 'cubrir', x: 0, y: 0, w: 1240, h: 900, rot: 0, opacidad: 1, radio: 0 },
        ...franjas(1240, 900, 18),
        txt({ x: 90, y: 980, w: 1060, h: alto(2, 110, 1.05), texto: 'Aim Education\nAlgeciras', tamano: 110, negrita: true, color: '#5233A8', fuente: 'Plus Jakarta Sans', interlineado: 1.05, alinear: 'izquierda' }),
        txt({ x: 90, y: 1250, w: 1000, h: alto(3, 42, 1.35), texto: 'Taekwon-Do, ballet, baile, inglés, robótica y mucho más, para niños y mayores.', tamano: 42, color: '#374151', interlineado: 1.35, alinear: 'izquierda' }),
        logo({ x: 90, y: 1560, w: 330, h: 124 }),
        txt({ x: 760, y: 1600, w: 400, h: alto(1, 32), texto: 'Dale la vuelta →', tamano: 32, negrita: true, color: '#FF5FA2', alinear: 'derecha' }),
      ],
      paginas: [
        { fondo: { tipo: 'color', color: '#F6F4EF' }, elementos: [
          txt({ x: 90, y: 120, w: 1060, h: alto(1, 80), texto: 'Nuestras actividades', tamano: 80, negrita: true, color: '#17151C', fuente: 'Plus Jakarta Sans', alinear: 'izquierda' }),
          txt({ x: 90, y: 260, w: 1060, h: alto(8, 40, 1.5), texto: '· Taekwon-Do ITF\n· Ballet clásico y baile moderno\n· Inglés\n· Robótica y STEM\n· Pilates y entrenamiento funcional\n· Campamento de verano\n\nTruco: «Añadir → Datos del club» pone el horario de verdad.', tamano: 40, color: '#374151', interlineado: 1.5, alinear: 'izquierda', vertical: 'arriba' }),
          { id: nuevoId(), tipo: 'qr', texto: 'https://www.aimeducation.es/actividades', x: 90, y: 1200, w: 340, h: 340, rot: 0, opacidad: 1, color: '#17151C', fondo: '#FFFFFF', radio: 0 },
          txt({ x: 480, y: 1250, w: 670, h: alto(3, 40, 1.4), texto: 'Toda la información y los horarios en la web.\nwww.aimeducation.es · 956 742 216', tamano: 40, color: '#17151C', interlineado: 1.4, alinear: 'izquierda' }),
          ...franjas(1240, 1714, 40),
        ] },
      ],
    }),
  },
  // ── De temporada ──
  {
    id: 'vuelta', nombre: 'Vuelta al cole', tipo: 'libre', tamano: 'ig', temporada: [8, 9],
    crear: () => ({
      ancho: 1080, alto: 1350, fondo: { tipo: 'degradado', color: '#FFD526', color2: '#F99B35', angulo: 160 },
      elementos: [
        ...confeti([[860, 70, 150, '#FFFFFF', 0.5], [60, 1080, 110, '#FFFFFF', 0.45]]),
        txt({ x: 60, y: 120, w: 960, h: alto(1, 190, 1), texto: '¡VOLVEMOS!', tamano: 190, fuente: 'Bebas Neue', color: '#FFFFFF', interlineado: 1, sombra: true, sombraColor: '#C2410C', sombraOpacidad: 0.5, sombraX: 0, sombraY: 8, sombraDifu: 0 }),
        txt({ x: 80, y: 340, w: 920, h: alto(1, 50), texto: 'Empieza la temporada 2026/2027', tamano: 50, negrita: true, color: '#17151C' }),
        forma('rect', { x: 90, y: 470, w: 900, h: 520, relleno: '#FFFFFF', radio: 40, sombra: true }),
        txt({ x: 140, y: 520, w: 520, h: alto(5, 44, 1.45), texto: 'Taekwon-Do\nBallet y baile\nInglés\nRobótica\n¡y mucho más!', tamano: 44, color: '#17151C', interlineado: 1.45, alinear: 'izquierda', lista: 'puntos' }),
        qr(INSCRIPCION, 680, 560, 260),
        txt({ x: 640, y: 840, w: 340, h: alto(1, 32), texto: 'Apúntate aquí', tamano: 32, negrita: true, color: '#C2410C' }),
        logo({ x: 380, y: 1120, w: 320, h: 120 }),
      ],
    }),
  },
  {
    id: 'inscripciones', nombre: 'Inscripciones abiertas', tipo: 'libre', tamano: 'ig', temporada: [6, 7, 8, 9, 10],
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'color', color: '#5233A8' },
      elementos: [
        ...franjas(1080, 0, 16),
        txt({ x: 70, y: 130, w: 940, h: alto(2, 170, 0.95), texto: 'INSCRIPCIONES\nABIERTAS', tamano: 170, fuente: 'Bebas Neue', color: '#FFFFFF', interlineado: 0.95 }),
        txt({ x: 280, y: 480, w: 520, h: alto(1, 46), texto: 'Plazas limitadas', tamano: 46, negrita: true, color: '#17151C', resalte: '#FFD526', resalteMargen: 16, resalteRadio: 10 }),
        qr(INSCRIPCION, 390, 610, 300),
        logo({ url: LOGO_BLANCO, x: 400, y: 950, w: 280, h: 100 }),
      ],
    }),
  },
  {
    id: 'halloween', nombre: 'Fiesta de Halloween', tipo: 'libre', tamano: 'ig', temporada: [10],
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'color', color: '#17151C' },
      elementos: [
        forma('elipse', { x: 330, y: 90, w: 420, h: 360, relleno: '#F99B35' }),
        forma('rect', { x: 520, y: 50, w: 40, h: 80, relleno: '#21B668', radio: 12 }),
        forma('triangulo', { x: 430, y: 200, w: 80, h: 70, relleno: '#17151C' }), forma('triangulo', { x: 570, y: 200, w: 80, h: 70, relleno: '#17151C' }),
        forma('elipse', { x: 450, y: 320, w: 180, h: 60, relleno: '#17151C' }),
        txt({ x: 60, y: 500, w: 960, h: alto(1, 120, 1.05), texto: 'Fiesta de Halloween', tamano: 120, fuente: 'Pacifico', color: '#F99B35', interlineado: 1.05 }),
        txt({ x: 80, y: 690, w: 920, h: alto(1, 52), texto: 'Viernes 30 de octubre · 17:30', tamano: 52, negrita: true, color: '#FFFFFF' }),
        txt({ x: 80, y: 780, w: 920, h: alto(1, 40), texto: '¡Ven disfrazado! Habrá juegos y caramelos.', tamano: 40, color: '#FFFFFF', opacidad: 0.85 }),
        logo({ url: LOGO_BLANCO, x: 400, y: 940, w: 280, h: 100 }),
      ],
    }),
  },
  {
    id: 'navidad', nombre: 'Feliz Navidad', tipo: 'libre', tamano: 'ig', temporada: [11, 12],
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'degradado', color: '#B91C1C', color2: '#7F1D1D', angulo: 160 },
      elementos: [
        ...[[90, 110, 70], [900, 160, 90], [180, 820, 60], [880, 760, 70], [520, 70, 50]].map(([x, y, d]) => forma('forma', { x, y, w: d, h: d, figura: 'destello', relleno: '#FFD526', opacidad: 0.9 })),
        txt({ x: 60, y: 300, w: 960, h: alto(1, 150, 1.1), texto: '¡Feliz Navidad!', tamano: 150, fuente: 'Great Vibes', color: '#FFFFFF', interlineado: 1.1 }),
        txt({ x: 80, y: 520, w: 920, h: alto(1, 56), texto: 'y próspero año nuevo', tamano: 56, fuente: 'Playfair Display', cursiva: true, color: '#FDE68A' }),
        txt({ x: 140, y: 660, w: 800, h: alto(2, 38, 1.35), texto: 'Os lo desea toda la familia de Aim Education', tamano: 38, color: '#FFFFFF', interlineado: 1.35, opacidad: 0.9 }),
        logo({ url: LOGO_BLANCO, x: 400, y: 920, w: 280, h: 100 }),
      ],
    }),
  },
  {
    id: 'horario-navidad', nombre: 'Horario de Navidad', tipo: 'libre', tamano: 'ig', temporada: [11, 12],
    crear: () => ({
      ancho: 1080, alto: 1350, fondo: { tipo: 'color', color: '#F6F4EF' },
      elementos: [
        ...franjas(1080, 0, 18),
        icono('calendario', 470, 110, 140, '#B91C1C'),
        txt({ x: 60, y: 290, w: 960, h: alto(1, 100), texto: 'Horario de Navidad', tamano: 100, negrita: true, color: '#17151C', fuente: 'Plus Jakarta Sans' }),
        { id: nuevoId(), tipo: 'tabla', x: 120, y: 480, w: 840, h: 400, rot: 0, opacidad: 1, celdas: [['Días', 'Clases'], ['22 dic – 6 ene', 'No hay clases'], ['7 de enero', '¡Volvemos!']],
          cabecera: true, rayas: true, fuente: 'Montserrat', tamano: 42, color: '#17151C', fondoCabecera: '#B91C1C', colorCabecera: '#FFFFFF', fondoFilas: '#FFFFFF', fondoRayas: '#FDECEC', borde: '#F3D5D5', grosor: 2, radio: 20, alinear: 'izquierda' },
        txt({ x: 120, y: 980, w: 840, h: alto(2, 36, 1.35), texto: 'La secretaría abre del 22 al 30 de diciembre de 10:00 a 13:00.', tamano: 36, color: '#374151', interlineado: 1.35 }),
        logo({ x: 380, y: 1170, w: 320, h: 120 }),
      ],
    }),
  },
  {
    id: 'carnaval', nombre: 'Carnaval', tipo: 'libre', tamano: 'ig', temporada: [1, 2],
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'degradado', color: '#FF5FA2', color2: '#00BBF4', angulo: 135 },
      elementos: [
        ...confeti([[70, 80, 60, '#FFD526'], [930, 120, 80, '#21B668'], [150, 860, 70, '#F99B35'], [880, 840, 60, '#FFD526'], [500, 60, 40, '#FFFFFF'], [60, 480, 46, '#5233A8'], [990, 520, 40, '#FFFFFF']]),
        txt({ x: 60, y: 250, w: 960, h: alto(1, 220, 1), texto: '¡CARNAVAL!', tamano: 220, fuente: 'Bebas Neue', color: '#FFFFFF', interlineado: 1, contorno: '#5233A8', contornoGrosor: 8 }),
        txt({ x: 80, y: 520, w: 920, h: alto(1, 54), texto: 'Viernes 12 de febrero', tamano: 54, negrita: true, color: '#17151C', resalte: '#FFFFFF', resalteMargen: 18, resalteRadio: 14 }),
        txt({ x: 120, y: 650, w: 840, h: alto(2, 40, 1.35), texto: 'Ven disfrazado a clase: ¡habrá premio al mejor disfraz!', tamano: 40, color: '#FFFFFF', interlineado: 1.35 }),
        logo({ url: LOGO_BLANCO, x: 400, y: 930, w: 280, h: 100 }),
      ],
    }),
  },
  {
    id: 'semana-santa', nombre: 'Semana Santa', tipo: 'libre', tamano: 'ig', temporada: [3, 4],
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'color', color: '#F6F4EF' },
      elementos: [
        ...franjas(1080, 0, 20), ...franjas(1080, 1060, 20),
        icono('calendario', 465, 140, 150, '#5233A8'),
        txt({ x: 60, y: 340, w: 960, h: alto(1, 110), texto: 'Semana Santa', tamano: 110, negrita: true, color: '#5233A8', fuente: 'Plus Jakarta Sans' }),
        txt({ x: 100, y: 520, w: 880, h: alto(2, 48, 1.3), texto: 'Del 30 de marzo al 5 de abril\nno hay clases.', tamano: 48, color: '#17151C', interlineado: 1.3 }),
        txt({ x: 100, y: 700, w: 880, h: alto(1, 40), texto: '¡Nos vemos el lunes 6!', tamano: 40, negrita: true, color: '#21B668' }),
        logo({ x: 400, y: 880, w: 280, h: 105 }),
      ],
    }),
  },
  {
    id: 'fin-curso', nombre: 'Festival de fin de curso', tipo: 'libre', tamano: 'a4v', temporada: [5, 6],
    crear: () => ({
      ancho: 1240, alto: 1754, fondo: { tipo: 'color', color: '#FFFFFF' },
      elementos: [
        forma('rect', { x: 0, y: 0, w: 1240, h: 760, relleno: '#5233A8', relleno2: '#FF5FA2', angulo: 135 }),
        { id: nuevoId(), tipo: 'imagen', url: null, marco: 'arco', ajuste: 'cubrir', x: 400, y: 120, w: 440, h: 540, rot: 0, opacidad: 1, radio: 0, borde: '#FFFFFF', grosor: 10 },
        icono('estrella', 150, 200, 110, '#FFD526'), icono('musica', 990, 260, 110, '#FFFFFF'),
        txt({ x: 80, y: 830, w: 1080, h: alto(2, 120, 1), texto: 'FESTIVAL DE\nFIN DE CURSO', tamano: 120, fuente: 'Bebas Neue', color: '#5233A8', interlineado: 1 }),
        txt({ x: 80, y: 1110, w: 1080, h: alto(1, 52), texto: 'Sábado 20 de junio · 11:00', tamano: 52, negrita: true, color: '#17151C' }),
        txt({ x: 80, y: 1190, w: 1080, h: alto(1, 40), texto: 'En el pabellón · Entrada libre', tamano: 40, color: '#6B7280' }),
        txt({ x: 140, y: 1300, w: 960, h: alto(2, 38, 1.35), texto: 'Ballet, baile, Taekwon-Do y mucho más: vienen a enseñaros lo que han aprendido este año.', tamano: 38, color: '#374151', interlineado: 1.35 }),
        logo({ x: 460, y: 1520, w: 320, h: 120 }),
        ...franjas(1240, 1714, 40),
      ],
    }),
  },
  {
    id: 'agosto', nombre: 'Cerrado en agosto', tipo: 'libre', tamano: 'ig', temporada: [7, 8],
    crear: () => ({
      ancho: 1080, alto: 1080, fondo: { tipo: 'degradado', color: '#00BBF4', color2: '#21B668', angulo: 170 },
      elementos: [
        forma('elipse', { x: 760, y: -120, w: 420, h: 420, relleno: '#FFD526' }),
        forma('rect', { x: 0, y: 820, w: 1080, h: 260, relleno: '#FDE68A' }),
        txt({ x: 60, y: 260, w: 960, h: alto(1, 140, 1.05), texto: '¡Feliz verano!', tamano: 140, fuente: 'Pacifico', color: '#FFFFFF', interlineado: 1.05 }),
        txt({ x: 100, y: 500, w: 880, h: alto(2, 50, 1.3), texto: 'Cerramos en agosto.\nVolvemos el 1 de septiembre.', tamano: 50, negrita: true, color: '#17151C', interlineado: 1.3 }),
        logo({ x: 400, y: 900, w: 280, h: 105 }),
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

// Las que se dibujaron en otro tamaño (los posts, cuadrados) salen ya en el suyo: el post
// de Instagram es 4:5 (#472). Se adaptan como «En otros tamaños».
for (const p of PLANTILLAS) {
  const t = TAMANOS.find(x => x.id === p.tamano), crear = p.crear;
  p.crear = () => { const d = crear(); return t && (d.ancho !== t.ancho || d.alto !== t.alto) ? adaptarDiseno(d, t.ancho, t.alto) : d; };
}

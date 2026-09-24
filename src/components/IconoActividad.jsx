import React from 'react';
import { I } from './Icons.jsx';
import svgBallet from '../assets/actividades/ballet.svg';
import svgIngles from '../assets/actividades/ingles.svg';
import svgPilates from '../assets/actividades/pilates.svg';
import svgPintura from '../assets/actividades/pintura.svg';
import svgRobotica from '../assets/actividades/robotica.svg';
import svgTkd from '../assets/actividades/tkd.svg';

// ─────────────────────────────────────────────────────────────────────────────
// El icono de cada actividad. Lo usan el panel (Lista de clases, fichas) y la
// web pública (#295), para que una actividad se vea igual en todas partes y una
// nueva creada en el panel salga en la web con su icono sin tocar nada.
// ─────────────────────────────────────────────────────────────────────────────

// Los iconos se guardan con los nombres de MaterialCommunityIcons que usa
// aim-tul (así su app los pinta bien); aquí cada uno tiene su equivalente
// dibujado. Nada de emojis: los pinta el sistema operativo y cada equipo los
// enseña distinto, así que rompen el aspecto del panel.
export const ICONOS = [
  ['karate', 'Karate', 'Taekwondo / artes marciales'],
  ['shoe-ballet', 'Slipper', 'Ballet'],
  ['yoga', 'HandsUp', 'Baile'],
  ['run', 'Run', 'Correr'],
  ['soccer', 'Ball', 'Fútbol'],
  ['basketball', 'Basketball', 'Baloncesto'],
  ['tennis', 'Tennis', 'Tenis'],
  ['swim', 'Swim', 'Natación'],
  ['bike', 'Bike', 'Ciclismo'],
  ['boxing-glove', 'Glove', 'Boxeo / kick boxing'],
  ['palette', 'Brush', 'Pintura'],
  ['music', 'Music', 'Música'],
  ['robot', 'Robot', 'Robótica / STEM'],
  ['translate', 'Globe', 'Idiomas'],
  ['weight-lifter', 'Dumbbell', 'Musculación'],
  ['dumbbell', 'Dumbbell', 'Pesas'],
  ['human-handsup', 'HandsUp', 'Gimnasia'],
  ['meditation', 'Meditation', 'Pilates / yoga'],
  ['sword-cross', 'Swords', 'Esgrima'],
  ['shield-half-full', 'Shield', 'Defensa personal'],
];

// El dibujo abstracto (MaterialCommunityIcons portado) de un icono. Es lo que
// se guarda en la actividad y lo que pinta aim-tul, así que se conserva para el
// selector y como respaldo cuando no hay SVG de marca.
export function dibujoDe(icon) {
  const nombre = (ICONOS.find(([n]) => n === icon) || [null, 'Run'])[1];
  return I[nombre] || I.Run;
}

// Los iconos cuadrados de AIM (info/SVG, los que no llevan "Aim_"), por el
// nombre de icono que tiene guardado cada actividad. No hay versión cuadrada de
// Baile Moderno, Kick Boxing ni Defensa Personal: esas se quedan con el dibujo.
// El campo 'icon' NO se toca: esto es solo cómo se pinta aquí.
const SVG_ACTIVIDAD = {
  'shoe-ballet': svgBallet,
  'translate': svgIngles,
  'meditation': svgPilates,
  'palette': svgPintura,
  'robot': svgRobotica,
  'karate': svgTkd,
  // Kick Boxing y Defensa Personal comparten el icono de Taekwon-Do (#220).
  'boxing-glove': svgTkd,
  'shield-half-full': svgTkd,
};
// Estos vienen dibujados en blanco (para fondo oscuro): sobre la tarjeta blanca
// no se verían, así que se oscurecen para que salgan como los demás.
const SVG_BLANCO = new Set(['palette', 'karate', 'boxing-glove', 'shield-half-full']);

// sobreColor: para pintarlo sobre el color de la actividad (los bloques de la
// portada, #302). Cada SVG va entonces con su color de origen, que es el que le
// pega a su fondo: los de fondo claro (ballet, inglés, pilates, robótica) son
// oscuros y los de fondo fuerte (Taekwon-Do, pintura, kick boxing), blancos. Los
// que no tienen SVG se dibujan en blanco.
export function IconoActividad({ icon, size = 20, style, sobreColor = false, ...resto }) {
  const svg = SVG_ACTIVIDAD[icon];
  if (svg) {
    return <img src={svg} alt="" style={{
      width: size, height: size, objectFit: 'contain', display: 'block',
      ...(!sobreColor && SVG_BLANCO.has(icon) ? { filter: 'brightness(0.23)' } : null),
      ...style,
    }} {...resto} />;
  }
  const Dibujo = dibujoDe(icon);
  return <Dibujo width={size} height={size} style={sobreColor ? { color: '#fff', ...style } : style} {...resto} />;
}


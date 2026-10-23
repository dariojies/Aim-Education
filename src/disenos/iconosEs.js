// ─────────────────────────────────────────────────────────────────────────────
// Buscar iconos en castellano: los iconos de Material vienen con su nombre y sus
// etiquetas en inglés. Cada palabra de aquí (sin tildes) se busca también con
// sus equivalentes en inglés. Lo que no está aquí se busca tal cual (en inglés).
// ─────────────────────────────────────────────────────────────────────────────
const ES = {
  // El club y las clases
  artes: 'martial,karate', marcial: 'martial,karate', marciales: 'martial,karate', taekwondo: 'martial,karate,kick', karate: 'martial,karate', judo: 'martial',
  patada: 'kick,martial', cinturon: 'martial,belt', dojang: 'martial,dojo', dojo: 'dojo,martial', combate: 'combat,fighting,boxing', boxeo: 'boxing,mma',
  deporte: 'sports,athlete,fitness', deportes: 'sports,athlete', gimnasio: 'gym,fitness', entrenamiento: 'fitness,exercise,gym', ejercicio: 'exercise,fitness',
  pesas: 'fitness,weight', yoga: 'self_improvement,yoga,meditation', pilates: 'self_improvement,yoga', meditar: 'self_improvement,meditation', relax: 'spa,self_improvement',
  baile: 'dance,music', bailar: 'dance', ballet: 'dance', musica: 'music,audio', cancion: 'music,song', piano: 'piano', guitarra: 'guitar,music', micro: 'mic',
  pintura: 'palette,brush,paint,art', pintar: 'brush,paint,palette', dibujo: 'draw,brush,edit', arte: 'palette,art,brush', manualidades: 'palette,cut,content_cut',
  robotica: 'smart_toy,robot,precision_manufacturing', robot: 'smart_toy,robot', programar: 'code,terminal,developer', programacion: 'code,terminal', ordenador: 'computer,laptop,desktop',
  ingles: 'translate,language,school', idioma: 'translate,language', idiomas: 'translate,language', traducir: 'translate',
  campamento: 'camping,cabin,park,hiking', verano: 'beach,sunny,pool,summer', piscina: 'pool,swimming', nadar: 'pool,swimming', natacion: 'pool,swimming', playa: 'beach',
  excursion: 'hiking,directions_walk,landscape', montana: 'landscape,terrain,hiking', naturaleza: 'park,nature,eco,forest', arbol: 'park,forest,nature', planta: 'eco,spa,yard,grass',
  futbol: 'soccer', baloncesto: 'basketball', tenis: 'tennis', voleibol: 'volleyball', balonmano: 'handball', bici: 'bike,cycling', bicicleta: 'bike,cycling', correr: 'run,directions_run',
  patinaje: 'skateboarding,roller', patines: 'roller_skating', esqui: 'downhill_skiing,ski', golf: 'golf', rugby: 'rugby', beisbol: 'baseball', hockey: 'hockey',
  trofeo: 'trophy,emoji_events,award', copa: 'trophy,emoji_events', medalla: 'medal,military_tech,workspace_premium', premio: 'award,trophy,emoji_events,workspace_premium',
  ganador: 'trophy,emoji_events,winner', campeon: 'trophy,emoji_events', competicion: 'trophy,emoji_events,sports', examen: 'quiz,assignment,school,grading', diploma: 'school,workspace_premium,certificate',
  clase: 'school,class', clases: 'school,class', colegio: 'school', escuela: 'school', profesor: 'school,person,teacher', alumno: 'person,school,student', alumnos: 'groups,school,student',
  estudiar: 'menu_book,school,book', libro: 'book,menu_book,library', libros: 'book,library', lectura: 'menu_book,book', deberes: 'assignment,homework',
  ninos: 'child,kid,family', nino: 'child,boy,kid', nina: 'child,girl,kid', bebe: 'baby,child', familia: 'family,people,groups', padres: 'family,people', grupo: 'groups,people,group',
  equipo: 'groups,team,people', gente: 'people,groups,person', persona: 'person,people', personas: 'people,groups', amigos: 'people,groups,diversity',
  // Avisos, fechas y horarios
  calendario: 'calendar,event,date', fecha: 'calendar,event,date', dia: 'today,calendar,date', semana: 'calendar,date_range,week', mes: 'calendar,month', evento: 'event,celebration',
  horario: 'schedule,clock,time', hora: 'schedule,clock,time,alarm', reloj: 'schedule,clock,watch', tiempo: 'schedule,timer,time', alarma: 'alarm', cronometro: 'timer,stopwatch',
  aviso: 'notifications,campaign,warning,info', avisos: 'notifications,campaign', atencion: 'warning,error,priority', importante: 'priority,warning,star,error', alerta: 'warning,error,notifications',
  informacion: 'info,information', info: 'info', ayuda: 'help,support', pregunta: 'help,question,quiz', duda: 'help,question', nuevo: 'new,fiber_new,add', novedad: 'new,fiber_new,campaign',
  anuncio: 'campaign,announcement,megaphone', megafono: 'campaign,megaphone', noticia: 'newspaper,article,feed', noticias: 'newspaper,article',
  cerrado: 'lock,block,do_not_disturb', abierto: 'lock_open,door', festivo: 'celebration,event,beach', vacaciones: 'beach,flight,luggage,holiday', puente: 'beach,celebration',
  inscripcion: 'how_to_reg,edit_note,person_add,assignment', inscripciones: 'how_to_reg,person_add,assignment', matricula: 'how_to_reg,assignment', apuntate: 'how_to_reg,person_add',
  plazas: 'event_seat,chair,seat', oferta: 'local_offer,sell,discount,percent', descuento: 'percent,discount,local_offer', gratis: 'redeem,gift,card_giftcard', regalo: 'redeem,gift,card_giftcard',
  precio: 'euro,payments,sell,price', dinero: 'euro,payments,money,savings', pagar: 'payments,credit_card,euro', pago: 'payments,credit_card', euro: 'euro', tarjeta: 'credit_card,card',
  // Fiestas y temporadas
  fiesta: 'celebration,party,cake,festival', celebracion: 'celebration,party', cumpleanos: 'cake,celebration,party,birthday', tarta: 'cake', navidad: 'christmas,ac_unit,park,redeem',
  invierno: 'ac_unit,snow,winter', nieve: 'ac_unit,snow', frio: 'ac_unit,cold', otono: 'eco,park,autumn', primavera: 'local_florist,spa,eco,flower', flor: 'local_florist,flower,filter_vintage',
  flores: 'local_florist,flower', sol: 'sunny,sun,wb_sunny,light_mode', luna: 'dark_mode,moon,bedtime,nightlight', estrella: 'star,grade', estrellas: 'star,auto_awesome', noche: 'nightlight,bedtime,dark_mode',
  lluvia: 'umbrella,rainy,water', paraguas: 'umbrella', nube: 'cloud', calor: 'sunny,thermostat,heat', halloween: 'skull,ghost,pumpkin,dark_mode,nightlight', carnaval: 'theater,mask,celebration,festival',
  disfraz: 'theater,mask,face', mascara: 'theater,masks', magia: 'auto_fix,auto_awesome,magic', globo: 'celebration,balloon', fuegos: 'celebration,fireworks', confeti: 'celebration',
  // Lugares y contacto
  casa: 'home,house', hogar: 'home,house', sede: 'store,location_city,apartment,business', tienda: 'store,shop,storefront', ciudad: 'location_city,city', edificio: 'apartment,business,domain',
  mapa: 'map,place,location', ubicacion: 'location,place,pin,map', direccion: 'location,place,directions,map', donde: 'location,place,pin', aqui: 'location,place,pin,near_me',
  coche: 'car,directions_car,drive', autobus: 'bus,directions_bus', tren: 'train', avion: 'flight,airplane', viaje: 'flight,luggage,travel,trip', parking: 'local_parking,parking',
  telefono: 'phone,call,smartphone', llamar: 'call,phone', movil: 'smartphone,phone_iphone,mobile', whatsapp: 'chat,forum,smartphone,message', correo: 'mail,email,inbox', email: 'mail,email',
  mensaje: 'chat,message,sms,forum', chat: 'chat,forum', web: 'language,public,web,globe', internet: 'language,wifi,public', wifi: 'wifi', foto: 'photo,image,camera', fotos: 'photo_library,image,camera',
  camara: 'camera,photo_camera', video: 'videocam,movie,play,video', pelicula: 'movie,theaters,film', cine: 'movie,theaters', teatro: 'theater,masks,theater_comedy', redes: 'share,public,groups',
  compartir: 'share', enlace: 'link', qr: 'qr_code', codigo: 'qr_code,code', descargar: 'download', subir: 'upload', imprimir: 'print,printer',
  // Cosas y acciones
  corazon: 'favorite,heart,love', amor: 'favorite,heart,love', gracias: 'favorite,thumb_up,volunteer_activism,handshake', bien: 'check,thumb_up,done', ok: 'check,done,thumb_up', vale: 'check,thumb_up',
  si: 'check,done', no: 'close,block,do_not_disturb', mal: 'thumb_down,close', like: 'thumb_up', mano: 'pan_tool,front_hand,waving_hand,back_hand', saludo: 'waving_hand,hand', hola: 'waving_hand,hand',
  apreton: 'handshake', acuerdo: 'handshake', cara: 'face,sentiment,mood,emoji', sonrisa: 'mood,sentiment_satisfied,emoji,smile', feliz: 'mood,sentiment_very_satisfied,celebration', triste: 'sentiment_dissatisfied,mood_bad',
  idea: 'lightbulb,emoji_objects,tips', bombilla: 'lightbulb', cohete: 'rocket', fuego: 'local_fire_department,whatshot,fire', rayo: 'bolt,flash,electric', energia: 'bolt,energy,battery',
  salud: 'health,medical,favorite,healing', medico: 'medical,local_hospital,health', botiquin: 'medical_services,health', comida: 'restaurant,food,lunch_dining,fastfood', comer: 'restaurant,food,lunch',
  bebida: 'local_drink,local_cafe,water,drink', agua: 'water_drop,water,local_drink', cafe: 'local_cafe,coffee', merienda: 'bakery_dining,cookie,icecream,food', helado: 'icecream', pizza: 'local_pizza,pizza',
  juego: 'sports_esports,videogame,games,toys,casino,extension', juegos: 'sports_esports,games,toys,extension', juguete: 'toys,smart_toy', puzzle: 'extension,puzzle', dados: 'casino,dice',
  animal: 'pets,cruelty_free', animales: 'pets,cruelty_free', perro: 'pets,dog', gato: 'pets,cat', mascota: 'pets', pajaro: 'flutter_dash,bird', pez: 'phishing,set_meal,fish', mariposa: 'flutter_dash,butterfly',
  camaleon: 'pets,cruelty_free,eco', dinosaurio: 'pets,cruelty_free', conejo: 'cruelty_free,rabbit', huella: 'pets,fingerprint',
  seguridad: 'security,shield,lock,verified', escudo: 'shield,security', verificado: 'verified,check_circle,badge', candado: 'lock', llave: 'key,vpn_key', ver: 'visibility,eye',
  buscar: 'search', lupa: 'search,zoom', ajustes: 'settings,tune', herramienta: 'build,construction,handyman', herramientas: 'build,construction,handyman', obras: 'construction,engineering',
  lapiz: 'edit,create,draw', escribir: 'edit,create,draw', nota: 'note,sticky_note,description', notas: 'notes,sticky_note', lista: 'list,checklist,format_list', tarea: 'task,assignment,checklist',
  documento: 'description,article,document', papel: 'description,article', carpeta: 'folder', archivo: 'description,folder,file', grafico: 'bar_chart,insert_chart,leaderboard,analytics',
  estadisticas: 'bar_chart,insert_chart,analytics,leaderboard', ranking: 'leaderboard,trophy', podio: 'leaderboard', nivel: 'signal_cellular,trending_up,leaderboard', subir_nivel: 'trending_up,upgrade',
  flecha: 'arrow', arriba: 'arrow_upward,north', abajo: 'arrow_downward,south', izquierda: 'arrow_back,west', derecha: 'arrow_forward,east', mas: 'add,plus', menos: 'remove,minus',
  numero: 'tag,pin,numbers', uno: 'looks_one,filter_1', dos: 'looks_two,filter_2', tres: 'looks_3,filter_3', cien: '100,percent', porcentaje: 'percent',
  bandera: 'flag,emoji_flags', meta: 'flag,sports_score,emoji_flags', objetivo: 'flag,track_changes,gps_fixed,target', diana: 'track_changes,gps_fixed,target', mundo: 'public,language,globe,travel_explore',
  corona: 'crown,emoji_events', rey: 'crown', diamante: 'diamond', joya: 'diamond', bolsa: 'shopping_bag,local_mall', carrito: 'shopping_cart', compras: 'shopping_cart,shopping_bag',
  ropa: 'checkroom,dry_cleaning', camiseta: 'checkroom', uniforme: 'checkroom,dry_cleaning', zapatilla: 'roller_skating,hiking', silla: 'chair,event_seat', puerta: 'door,meeting_room',
  musica_nota: 'music_note', altavoz: 'volume_up,speaker,campaign', silencio: 'volume_off,do_not_disturb', sonido: 'volume_up,graphic_eq',
  ciencia: 'science,biotech,experiment', experimento: 'science,experiment', laboratorio: 'science,biotech', planeta: 'public,language,rocket', espacio: 'rocket,satellite,public',
  matematicas: 'calculate,functions', calculadora: 'calculate', ajedrez: 'chess,games,casino', cerebro: 'psychology,lightbulb', pensar: 'psychology,lightbulb', mente: 'psychology,self_improvement',
};

const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');

// Para cada palabra buscada, lo que vale: ella misma y sus equivalentes en inglés.
export function alternativas(palabra) {
  const p = sinTildes(palabra).trim();
  if (!p) return [];
  const extra = new Set([p]);
  for (const [es, en] of Object.entries(ES)) {
    if (es === p || (p.length >= 3 && es.startsWith(p))) en.split(',').forEach(x => extra.add(x));
  }
  return [...extra];
}

// ¿El icono [nombre, camino, etiquetas] sale con esta búsqueda? Todas las palabras tienen que estar.
export function encaja(icono, palabras) {
  const [nombre, , etiquetas] = icono;
  const trozos = `${nombre.replace(/_/g, ' ')} ${etiquetas.replace(/,/g, ' ')}`.split(' ');
  // Por el principio de la palabra («sol» no es «console»); un nombre con «_», el icono justo.
  return palabras.every(alts => alts.some(a => (a.includes('_') ? nombre.startsWith(a) : trozos.some(t => t.startsWith(a)))));
}

export { sinTildes };

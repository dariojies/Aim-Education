// ─────────────────────────────────────────────────────────────────────────────
// La «API» de SCORM que busca un paquete (#475): la ponemos en la ventana del
// aula (window.API en SCORM 1.2, window.API_1484_11 en 2004) y el paquete, dentro
// de su marco, la encuentra subiendo por window.parent. Lo que guarda (cmi.*) se
// apunta en el servidor al hacer Commit, al terminar (Finish / Terminate) y al
// salir de la lección; ahí se decide si está aprobado y la nota (aula-scorm.js).
// ─────────────────────────────────────────────────────────────────────────────
const ERRORES = {
  '1.2': { 0: 'No error', 101: 'General exception', 201: 'Invalid argument error', 202: 'Element cannot have children', 203: 'Element not an array - cannot have count',
    301: 'Not initialized', 401: 'Not implemented error', 402: 'Invalid set value, element is a keyword', 403: 'Element is read only', 404: 'Element is write only', 405: 'Incorrect data type' },
  2004: { 0: 'No Error', 101: 'General Exception', 102: 'General Initialization Failure', 103: 'Already Initialized', 104: 'Content Instance Terminated', 111: 'General Termination Failure',
    112: 'Termination Before Initialization', 113: 'Termination After Termination', 122: 'Retrieve Data Before Initialization', 123: 'Retrieve Data After Termination',
    132: 'Store Data Before Initialization', 133: 'Store Data After Termination', 142: 'Commit Before Initialization', 143: 'Commit After Termination', 201: 'General Argument Error',
    301: 'General Get Failure', 351: 'General Set Failure', 391: 'General Commit Failure', 401: 'Undefined Data Model Element', 402: 'Unimplemented Data Model Element',
    403: 'Data Model Element Value Not Initialized', 404: 'Data Model Element Is Read Only', 405: 'Data Model Element Is Write Only', 406: 'Data Model Element Type Mismatch',
    407: 'Data Model Element Value Out Of Range', 408: 'Data Model Dependency Not Established' },
};
const HIJOS = {
  '1.2': {
    'cmi._children': 'core,suspend_data,launch_data,comments,objectives,student_data,student_preference,interactions',
    'cmi.core._children': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
    'cmi.core.score._children': 'raw,min,max',
    'cmi.objectives._children': 'id,score,status',
    'cmi.student_data._children': 'mastery_score,max_time_allowed,time_limit_action',
    'cmi.student_preference._children': 'audio,language,speed,text',
    'cmi.interactions._children': 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency',
  },
  2004: {
    'cmi.score._children': 'scaled,raw,min,max',
    'cmi.objectives._children': 'id,score,success_status,completion_status,progress_measure,description',
    'cmi.interactions._children': 'id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description',
    'cmi.learner_preference._children': 'audio_level,language,delivery_speed,audio_captioning',
    'cmi.comments_from_learner._children': 'comment,location,timestamp',
    'cmi.comments_from_lms._children': 'comment,location,timestamp',
  },
};
// Lo que no se puede escribir y lo que no se puede leer.
const SOLO_LEER = {
  '1.2': /^cmi\.(core\.(student_id|student_name|credit|entry|total_time|lesson_mode)|launch_data|student_data\.(mastery_score|max_time_allowed|time_limit_action)|_children|_count|.*\._children|.*\._count)$/,
  2004: /^cmi\.(learner_id|learner_name|credit|entry|mode|total_time|launch_data|completion_threshold|scaled_passing_score|max_time_allowed|time_limit_action|_version|comments_from_lms\..*|.*\._children|.*\._count)$/,
};
const SOLO_ESCRIBIR = { '1.2': /^cmi\.core\.(exit|session_time)$/, 2004: /^cmi\.(exit|session_time)$/ };

// datos: lo que da GET /api/aula/lecciones/:id/scorm. guardar(cmi, terminar): al servidor.
export function crearApiScorm({ version, cmi = {}, alumno, entrada, masteryScore, launchData, gestor, guardar }) {
  const v = version === '2004' ? 2004 : '1.2';
  const datos = { ...cmi };
  let iniciado = false, terminado = false, error = 0, cambios = false;
  const fijos = v === 2004
    ? { 'cmi.learner_id': alumno.id, 'cmi.learner_name': alumno.nombre, 'cmi.credit': gestor ? 'no-credit' : 'credit', 'cmi.entry': entrada,
      'cmi.mode': gestor ? 'browse' : 'normal', 'cmi.launch_data': launchData || '', 'cmi._version': '1.0', 'cmi.time_limit_action': 'continue,no message',
      'cmi.scaled_passing_score': '', 'cmi.completion_threshold': '', 'cmi.max_time_allowed': '' }
    : { 'cmi.core.student_id': alumno.id, 'cmi.core.student_name': alumno.nombre, 'cmi.core.credit': gestor ? 'no-credit' : 'credit', 'cmi.core.entry': entrada,
      'cmi.core.lesson_mode': gestor ? 'browse' : 'normal', 'cmi.launch_data': launchData || '', 'cmi.student_data.mastery_score': masteryScore == null ? '' : String(masteryScore),
      'cmi.student_data.max_time_allowed': '', 'cmi.student_data.time_limit_action': 'continue,no message' };
  const porDefecto = v === 2004
    ? { 'cmi.completion_status': 'unknown', 'cmi.success_status': 'unknown', 'cmi.location': '', 'cmi.suspend_data': '', 'cmi.progress_measure': '', 'cmi.total_time': 'PT0H0M0S' }
    : { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.lesson_location': '', 'cmi.suspend_data': '', 'cmi.core.score.raw': '', 'cmi.core.score.min': '', 'cmi.core.score.max': '',
      'cmi.comments': '', 'cmi.core.total_time': '0000:00:00' };
  // Cuántos hay de una lista (objetivos, interacciones…): el índice más alto guardado + 1.
  const cuantos = (base) => {
    let n = 0;
    const re = new RegExp(`^${base.replace(/\./g, '\\.')}\\.(\\d+)\\.`);
    for (const k of Object.keys(datos)) { const m = re.exec(k); if (m) n = Math.max(n, Number(m[1]) + 1); }
    return n;
  };
  // De uno en uno y en orden (Commit y Finish suelen ir seguidos).
  let cola = Promise.resolve();
  const enviar = (terminar) => { cambios = false; const copia = { ...datos }; cola = cola.then(() => guardar(copia, terminar)).catch(() => {}); return cola; };

  function obtener(k) {
    k = String(k || '');
    if (v === 2004 ? !iniciado || terminado : !iniciado) { error = v === 2004 ? (terminado ? 123 : 122) : 301; return ''; }
    if (!k) { error = v === 2004 ? 301 : 201; return ''; }
    if (SOLO_ESCRIBIR[v].test(k)) { error = v === 2004 ? 405 : 404; return ''; }
    error = 0;
    if (HIJOS[v][k]) return HIJOS[v][k];
    if (k.endsWith('._count')) return String(cuantos(k.slice(0, -7)));
    if (k in fijos) return fijos[k];
    if (k === 'cmi.core.total_time' || k === 'cmi.total_time') return datos[k] || porDefecto[k];
    if (k in datos) return datos[k];
    if (k in porDefecto) return porDefecto[k];
    if (k.startsWith('adl.nav.request_valid')) return 'unknown';
    if (!k.startsWith('cmi.') && !k.startsWith('adl.')) { error = v === 2004 ? 401 : 201; return ''; }
    if (v === 2004) error = 403;
    return '';
  }
  function poner(k, valor) {
    k = String(k || '');
    if (v === 2004 ? !iniciado || terminado : !iniciado) { error = v === 2004 ? (terminado ? 133 : 132) : 301; return 'false'; }
    if (!k.startsWith('cmi.') && !k.startsWith('adl.')) { error = v === 2004 ? 401 : 201; return 'false'; }
    if (k.endsWith('._children')) { error = v === 2004 ? 404 : 402; return 'false'; }
    if (k.endsWith('._count')) { error = v === 2004 ? 404 : 402; return 'false'; }
    if (SOLO_LEER[v].test(k)) { error = v === 2004 ? 404 : 403; return 'false'; }
    error = 0;
    if (k.startsWith('adl.')) return 'true';   // la navegación entre actividades la lleva el aula
    datos[k] = String(valor ?? '');
    cambios = true;
    return 'true';
  }
  function iniciar() {
    if (iniciado && !terminado) { error = v === 2004 ? 103 : 101; return 'false'; }
    if (terminado && v === 2004) { error = 104; return 'false'; }
    iniciado = true; terminado = false; error = 0;
    // Al empezar, «sin empezar» pasa a «sin terminar» (1.2).
    if (v === '1.2' && (datos['cmi.core.lesson_status'] || 'not attempted') === 'not attempted') { datos['cmi.core.lesson_status'] = 'incomplete'; cambios = true; }
    return 'true';
  }
  function confirmar() {
    if (!iniciado || terminado) { error = v === 2004 ? (terminado ? 143 : 142) : 301; return 'false'; }
    error = 0; enviar(false); return 'true';
  }
  function acabar() {
    if (!iniciado) { error = v === 2004 ? 112 : 301; return 'false'; }
    if (terminado) { error = v === 2004 ? 113 : 101; return 'false'; }
    terminado = true; error = 0; enviar(true);
    return 'true';
  }
  const textoError = (c) => ERRORES[v][Number(c)] || '';
  const api = v === 2004
    ? { Initialize: iniciar, Terminate: acabar, GetValue: obtener, SetValue: poner, Commit: confirmar,
      GetLastError: () => String(error), GetErrorString: textoError, GetDiagnostic: (c) => textoError(c ?? error) }
    : { LMSInitialize: iniciar, LMSFinish: acabar, LMSGetValue: obtener, LMSSetValue: poner, LMSCommit: confirmar,
      LMSGetLastError: () => String(error), LMSGetErrorString: textoError, LMSGetDiagnostic: (c) => textoError(c ?? error) };
  const nombre = v === 2004 ? 'API_1484_11' : 'API';
  // Si el paquete no guarda en mucho rato, se guarda solo cada minuto.
  let reloj = null;
  return {
    instalar() { window[nombre] = api; reloj = setInterval(() => { if (iniciado && !terminado && cambios) enviar(false); }, 60_000); },
    // Al salir de la lección sin que el paquete haya terminado: se guarda como terminado.
    quitar() {
      clearInterval(reloj);
      if (iniciado && !terminado) { terminado = true; enviar(true); }
      if (window[nombre] === api) delete window[nombre];
    },
  };
}

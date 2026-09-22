// ─────────────────────────────────────────────────────────────────────────────
// Textos legales de la web (tickets #295 y #255).
//
// Salen de los que había en aimeducation.es (privacidad, cookies y reglamento) y
// en allegro.in-mae.es (aviso legal y términos de venta, que en aimeducation.es
// no estaban publicados), puestos a nombre de la sociedad, que es quien presta
// hoy el servicio y factura (ticket #296), y corregidos donde ya no eran ciertos
// (ley derogada, IVA, formas de pago, cookies que la web no usa). Conviene que
// los revise la gestoría o un abogado antes de darlos por definitivos.
//
// Los datos de la empresa van aquí arriba, en un solo sitio.
// ─────────────────────────────────────────────────────────────────────────────

export const EMPRESA_LEGAL = {
  razonSocial: 'AIM Deporte y Educación S.L.',
  nombreComercial: 'AIM Education',
  cif: 'B93870103',
  domicilio: 'Urb. Terrazas de Doña Lola, Local 1, 11203 Algeciras (Cádiz)',
  email: 'info@aimeducation.es',
  telefono: '956 742 216',
  web: 'www.aimeducation.es',
  // Datos de inscripción en el Registro Mercantil (los exige el art. 10 de la
  // LSSI para una sociedad). Pendiente: cuando se tengan, p. ej.
  // 'Inscrita en el Registro Mercantil de Cádiz, Tomo …, Folio …, Hoja CA-…'.
  registroMercantil: null,
};

// Versión de los textos: se guarda con cada consentimiento para poder demostrar
// qué aceptó cada uno. Si se cambian los textos, se sube la versión.
export const VERSION_LEGAL = '2026-09-22';

const E = EMPRESA_LEGAL;

// Cada documento es una lista de bloques: ['h', título] · ['p', párrafo] ·
// ['ul', [elementos]] · ['ol', [elementos]] · ['tabla', [cabecera, ...filas]].
export const DOCS_LEGALES = [
  {
    id: 'aviso-legal',
    titulo: 'Aviso legal',
    bloques: [
      ['p', `${E.razonSocial} (en adelante, «la empresa»), con domicilio en ${E.domicilio} y CIF ${E.cif}${E.registroMercantil ? `, ${E.registroMercantil}` : ''}, titular de la marca ${E.nombreComercial}, informa:`],
      ['p', `El nombre de dominio ${E.web} y sus subdominios (como aim.aimeducation.es) están debidamente registrados por la empresa, conforme a la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico. Estos Términos Legales se ajustan a la normativa vigente en materia de protección de datos, comercio electrónico, condiciones de contratación, propiedad intelectual y demás disposiciones aplicables.`],
      ['p', `Puede contactar con la empresa en ${E.email} o en el teléfono ${E.telefono}.`],

      ['h', '1. Aceptación de los términos legales'],
      ['p', 'El acceso a este sitio web o su utilización en cualquier forma implica la aceptación de todos y cada uno de los presentes Términos Legales, reservándose la empresa el derecho a modificarlos en cualquier momento. En consecuencia, es responsabilidad de todo visitante o usuario la lectura atenta de los Términos Legales vigentes cada vez que acceda a este sitio web; si no está de acuerdo con cualquiera de ellos, deberá abstenerse de usarlo.'],

      ['h', '2. Objeto'],
      ['p', `A través de la web ${E.web} se facilita a los usuarios el acceso a diversos contenidos, servicios, información y datos (los «contenidos»). La empresa se reserva el derecho de modificar en cualquier momento la presentación, configuración y localización de la web, así como los contenidos, productos y servicios que en ella se ofrecen.`],

      ['h', '3. Condiciones de acceso'],
      ['p', 'El acceso a la información de los productos y servicios del sitio web y su navegación son libres y gratuitos: no se exige a los usuarios registrarse, facilitar datos personales ni utilizar claves o contraseñas.'],
      ['p', 'Cuando para acceder a determinados contenidos o servicios sea necesario facilitar datos personales, los usuarios garantizarán su veracidad, exactitud, autenticidad y vigencia. La empresa tratará dichos datos en función de su naturaleza o finalidad, en los términos indicados en la Política de privacidad y protección de datos.'],

      ['h', '4. Condiciones de utilización'],
      ['p', 'El usuario se compromete a hacer un uso adecuado y lícito del sitio web y de sus contenidos y servicios, de conformidad con la legislación aplicable, estos Términos Legales, la moral y las buenas costumbres generalmente aceptadas y el orden público. El usuario deberá abstenerse de:'],
      ['ol', [
        'Hacer un uso no autorizado o fraudulento del sitio web o de sus contenidos con fines o efectos ilícitos, prohibidos en estos Términos Legales, lesivos de los derechos e intereses de terceros, o que de cualquier forma puedan dañar, inutilizar, sobrecargar, deteriorar o impedir la normal utilización de los servicios o de cualquier contenido almacenado en cualquier equipo informático.',
        'Acceder o intentar acceder a recursos o áreas restringidas del sitio web sin cumplir las condiciones exigidas para ello.',
        'Provocar daños en los sistemas físicos o lógicos del sitio web, de sus proveedores o de terceros.',
        'Introducir o difundir en la red virus informáticos o cualesquiera otros sistemas físicos o lógicos que puedan provocar daños en los sistemas de la empresa, de sus proveedores o de terceros.',
        'Intentar acceder, utilizar o manipular los datos de la empresa, de terceros proveedores y de otros usuarios.',
        'Reproducir o copiar, distribuir, comunicar públicamente, transformar o modificar los contenidos, salvo autorización expresa del titular de los derechos o cuando la ley lo permita.',
        'Suprimir, ocultar o manipular las notas sobre derechos de propiedad intelectual o industrial y demás datos identificativos incorporados a los contenidos, así como los dispositivos técnicos de protección o de información que puedan contener.',
        'Intentar obtener datos personales distintos de los que esté autorizado a conocer, empleando medios o procedimientos ilícitos, fraudulentos o que puedan causar cualquier tipo de daño.',
        'Transmitir, difundir o poner a disposición de terceros cualquier material que atente contra los derechos fundamentales y libertades públicas; que induzca o promueva actuaciones delictivas, difamatorias, violentas o discriminatorias; que resulte ofensivo, nocivo o degradante; que induzca a prácticas peligrosas para la salud; que vulnere derechos de propiedad intelectual o industrial; que sea contrario al honor, a la intimidad personal y familiar o a la propia imagen; que constituya publicidad; o que incluya virus o programas que impidan el normal funcionamiento del sitio web.',
      ]],

      ['h', '5. Responsabilidades'],
      ['p', 'La empresa no garantiza el acceso continuado ni la correcta visualización, descarga o utilidad de los elementos e informaciones de la web, que pueden verse impedidos, dificultados o interrumpidos por factores o circunstancias ajenos a su control.'],
      ['p', 'La empresa podrá interrumpir el servicio o resolver de inmediato la relación con el usuario si detecta un uso de la web o de sus servicios contrario a estos Términos Legales.'],
      ['p', `La empresa pone a disposición de los usuarios la dirección ${E.email} para que se le comunique cualquier contenido que pueda afectar a la actividad de otros usuarios, con la voluntad de rectificarlo si procede.`],
      ['p', 'La empresa no se hace responsable de los daños, perjuicios, pérdidas, reclamaciones o gastos producidos por: interferencias, interrupciones, fallos, averías, retrasos o desconexiones del sistema electrónico debidos a deficiencias, sobrecargas o errores en las líneas y redes de telecomunicaciones o a cualquier otra causa ajena a su control; intromisiones ilegítimas mediante programas malignos de cualquier tipo; el uso indebido o inadecuado de la web; o errores de seguridad o navegación producidos por un mal funcionamiento del navegador o por el uso de versiones no actualizadas. La empresa se reserva el derecho de retirar, total o parcialmente, cualquier contenido o información de la web.'],
      ['p', 'La empresa excluye cualquier responsabilidad por los daños y perjuicios de toda naturaleza que puedan deberse a la mala utilización de los servicios de libre disposición por parte de los usuarios. Los formularios de recogida de datos sirven únicamente para prestar los servicios que la empresa ofrece.'],

      ['h', '6. Propiedad intelectual e industrial'],
      ['p', 'El usuario reconoce y acepta que todas las marcas, nombres comerciales o signos distintivos y todos los derechos de propiedad industrial e intelectual sobre los contenidos y demás elementos de la web son propiedad exclusiva de la empresa o de terceros. El acceso a la web no implica ninguna renuncia, transmisión, licencia ni cesión de dichos derechos, salvo que se establezca expresamente lo contrario. Cualquier uso o explotación distinto de los aquí previstos requiere la autorización previa y expresa de la empresa o del tercero titular.'],
      ['p', 'Los contenidos, textos, fotografías, diseños, logotipos, imágenes, programas de ordenador, códigos fuente y, en general, cualquier creación intelectual de este sitio, así como el propio sitio en su conjunto, están protegidos por la legislación de propiedad intelectual. No podrán ser reproducidos, transmitidos ni registrados, total ni parcialmente, en ninguna forma ni medio, sin la autorización previa y por escrito de la empresa.'],
      ['p', 'Queda prohibido suprimir, eludir o manipular el «copyright» y los dispositivos técnicos de protección o de información que puedan contener los contenidos. La empresa se reserva el ejercicio de cuantas acciones legales le correspondan en defensa de sus derechos.'],

      ['h', '7. Protección de datos'],
      ['p', 'Para utilizar algunos servicios los usuarios deben facilitar datos personales, que la empresa trata conforme al Reglamento (UE) 2016/679, General de Protección de Datos, y a la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales. Toda la información está en la Política de privacidad y protección de datos.'],

      ['h', '8. Duración y terminación'],
      ['p', 'La prestación del servicio de este sitio web tiene, en principio, una duración indefinida. No obstante, la empresa podrá dar por terminado o suspender cualquiera de sus servicios y, cuando sea posible, lo anunciará con antelación.'],

      ['h', '9. Fuerza mayor'],
      ['p', 'La empresa no será responsable de la imposibilidad de prestar el servicio cuando se deba a interrupciones prolongadas del suministro eléctrico o de las telecomunicaciones, conflictos sociales, huelgas, catástrofes naturales, actos de la autoridad y, en general, cualquier supuesto de fuerza mayor.'],

      ['h', '10. Ley aplicable y jurisdicción'],
      ['p', 'Estos Términos Legales se rigen por la ley española. En la medida en que la ley lo permita, las partes se someten a los Juzgados y Tribunales del domicilio social de la empresa, con renuncia a cualquier otro fuero. Si el usuario es consumidor, será competente el juzgado de su domicilio.'],
    ],
  },

  {
    id: 'privacidad',
    titulo: 'Privacidad y protección de datos',
    bloques: [
      ['h', '1. Responsable del tratamiento'],
      ['p', `El responsable de los datos recogidos mediante esta web es ${E.razonSocial}, con CIF ${E.cif} y domicilio en ${E.domicilio}. Puede contactar con el responsable en ${E.email} o en el teléfono ${E.telefono}.`],

      ['h', '2. Finalidades'],
      ['ul', [
        'Gestionar tu cuenta y la de tu familia, las inscripciones en actividades, el campamento y los eventos.',
        'Gestión de clientes, contable, fiscal y administrativa: cobros, facturación y los registros que exige la ley.',
        'Organizar las clases: listas, asistencia, horarios y comunicaciones sobre la actividad (cambios de horario, cierres, avisos).',
        'Atender las consultas que nos hagas por el formulario de contacto, por correo o por teléfono.',
        'Cuidar de la seguridad de los alumnos: los datos de salud que la familia nos facilite (alergias, enfermedades, medicación, contacto de emergencia) se usan solo para ese fin.',
        'Enviarte noticias, eventos y ofertas del club, solo si nos lo has autorizado. Puedes retirarlo cuando quieras.',
        'Comercio electrónico: el pago por internet de mensualidades, inscripciones y material.',
      ]],
      ['p', 'Los datos no se utilizan para tomar decisiones automatizadas ni para elaborar perfiles.'],

      ['h', '3. Plazo de conservación'],
      ['p', 'Conservamos los datos mientras se mantenga la relación con el club o sean necesarios para las finalidades indicadas y, después, durante los plazos que exige la ley: los documentos contables y las facturas, seis años (Código de Comercio) y los necesarios a efectos fiscales mientras la Administración pueda comprobarlos; el registro de jornada del personal, cuatro años. Las consultas del formulario de contacto se conservan el tiempo necesario para atenderlas.'],

      ['h', '4. Legitimación'],
      ['p', 'La normativa aplicable es el Reglamento (UE) 2016/679, General de Protección de Datos (RGPD), y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales. Las bases que legitiman cada tratamiento son:'],
      ['ul', [
        'Art. 6.1.b RGPD, la ejecución de un contrato: la gestión de la cuenta, las inscripciones, los cobros y la organización de las clases.',
        'Art. 6.1.c RGPD, el cumplimiento de obligaciones legales: facturación, contabilidad y obligaciones fiscales.',
        'Art. 6.1.a RGPD, tu consentimiento: el formulario de contacto y las comunicaciones comerciales.',
        'Art. 9.2.a RGPD, el consentimiento explícito de la familia para los datos de salud.',
      ]],
      ['p', 'No estás obligado a facilitarnos los datos, pero sin los necesarios no podremos gestionar la inscripción ni atender tu consulta.'],

      ['h', '5. Menores de edad'],
      ['p', 'Los datos de los alumnos menores de 14 años los facilitan y los gestionan sus madres, padres o tutores, que son quienes prestan el consentimiento en su nombre (art. 7 de la Ley Orgánica 3/2018). Las facturas se emiten siempre a nombre de un adulto responsable.'],

      ['h', '6. Destinatarios'],
      ['ul', [
        'Administraciones públicas con competencia en la materia, cuando lo exija la ley (por ejemplo, la Agencia Tributaria).',
        'Entidades bancarias y la pasarela de pago del banco, para los cobros con tarjeta.',
        'Proveedores que nos prestan servicios (alojamiento de la web y de la base de datos, correo electrónico, medición anónima de las visitas a la web), como encargados del tratamiento y con el contrato que exige el RGPD. Solo acceden a los datos para prestarnos ese servicio.',
      ]],
      ['p', 'No se ceden datos a terceros con fines comerciales.'],

      ['h', '7. Transferencias internacionales'],
      ['p', 'Si alguno de nuestros proveedores trata datos fuera del Espacio Económico Europeo, lo hace con las garantías que exige el RGPD: una decisión de adecuación de la Comisión Europea (como el Marco de Privacidad de Datos UE-EE. UU.) o cláusulas contractuales tipo.'],

      ['h', '8. Derechos'],
      ['p', `Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a ${E.email} o por correo postal a ${E.domicilio}, indicando qué derecho ejerces y acreditando tu identidad (por ejemplo, con una copia de tu DNI).`],
      ['p', 'Puedes retirar en cualquier momento el consentimiento que nos hayas dado, sin que ello afecte a la licitud del tratamiento anterior.'],
      ['p', 'Si consideras que no hemos atendido bien tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).'],

      ['h', '9. Procedencia y categorías de datos'],
      ['p', 'Los datos los facilita el propio interesado o, en el caso de los menores, su familia. Tratamos estas categorías:'],
      ['ul', [
        'Nombre y apellidos.', 'NIF/DNI/NIE.', 'Dirección.', 'Teléfono.', 'Correo electrónico.', 'Firma.',
        'Datos de salud (alergias, enfermedades, medicación y contacto de emergencia).', 'Datos económicos y de facturación.',
      ]],
    ],
  },

  {
    id: 'cookies',
    titulo: 'Política de cookies',
    bloques: [
      ['h', 'Qué son las cookies'],
      ['p', 'Una cookie es un pequeño fichero que se descarga en tu dispositivo al acceder a determinadas páginas web. Las cookies permiten a una web, entre otras cosas, almacenar y recuperar información sobre la navegación o recordar tus preferencias.'],

      ['h', 'Qué cookies usa esta web'],
      ['p', 'Esta web no usa cookies de análisis ni de publicidad. Solo usa las imprescindibles para funcionar y, si tú lo aceptas, las de los servicios externos que muestran algunos contenidos.'],
      ['tabla', [
        ['Nombre', 'Quién la pone', 'Para qué', 'Duración'],
        ['aim_session', 'Nosotros', 'Mantener tu sesión iniciada cuando entras con tu cuenta. Es técnica y necesaria: sin ella no se puede entrar.', '24 horas'],
        ['aim_cookies', 'Nosotros (almacenamiento local)', 'Recordar lo que has elegido en el aviso de cookies.', '12 meses'],
        ['Cookies de YouTube (Google)', 'YouTube', 'Mostrar el vídeo de presentación del club. Solo se cargan si aceptas los contenidos externos o si le das a ver el vídeo.', 'Según YouTube'],
        ['Cookies de HubSpot', 'HubSpot', 'El formulario de «Trabaja con nosotros», cuando está activo. Solo se cargan si aceptas los contenidos externos.', 'Según HubSpot'],
      ]],
      ['p', 'Las cookies de terceros las gestionan esos servicios. Puedes consultar cómo lo hacen en sus propias políticas: policies.google.com/privacy (YouTube) y legal.hubspot.com/privacy-policy (HubSpot).'],

      ['h', 'Medición de visitas'],
      ['p', 'Para saber cuántas personas visitan la web y qué páginas leen usamos Metricool, que mide las visitas de forma anónima y agregada: no usa cookies, no guarda nada en tu dispositivo ni te asigna ningún identificador, y tu dirección IP solo se usa durante la conexión, sin guardarse. Por eso, según la guía de la Agencia Española de Protección de Datos, no necesita tu consentimiento. Más información en metricool.com/privacy-policy.'],

      ['h', 'Cómo cambiar tu elección'],
      ['p', 'Puedes cambiar lo que elegiste en cualquier momento desde «Configurar cookies», en el pie de todas las páginas.'],
      ['p', 'También puedes permitir, bloquear o eliminar las cookies desde la configuración de tu navegador:'],
      ['ul', [
        'Chrome: support.google.com/chrome/answer/95647',
        'Safari: support.apple.com/es-es/guide/safari/sfri11471/mac',
        'Firefox: support.mozilla.org/es/kb/Borrar%20cookies',
        'Microsoft Edge: support.microsoft.com/es-es/microsoft-edge (Eliminar cookies en Microsoft Edge)',
      ]],
      ['p', 'Si bloqueas la cookie de sesión, no podrás entrar en tu cuenta.'],
    ],
  },

  {
    id: 'terminos',
    titulo: 'Términos y condiciones de venta',
    bloques: [
      ['h', 'Introducción'],
      ['p', `${E.nombreComercial} pone a tu disposición un servicio de pago por internet para abonar nuestros servicios (mensualidades, inscripciones, campamento y eventos) y los artículos para la realización de las actividades. A continuación te invitamos a revisar las condiciones generales de venta que regulan la compra a través de esta web. Su uso supone, en lo que le sea de aplicación, la aceptación de estas condiciones. Si tienes cualquier duda, puedes ponerte en contacto con nosotros.`],

      ['h', 'Nuestros datos'],
      ['p', `${E.nombreComercial} es el nombre comercial de nuestra marca. En nuestras facturas encontrarás estos datos:`],
      ['ul', [E.razonSocial + '.', 'CIF ' + E.cif + '.', E.domicilio + '.', E.email + '.']],

      ['h', 'Precio y pago'],
      ['p', 'Los precios de esta web se muestran en euros. Pueden cambiar en cualquier momento, pero los cambios no afectan a las compras ya realizadas.'],
      ['p', 'Las clases de enseñanza están exentas de IVA (artículo 20.Uno.9º de la Ley 37/1992). El material y el resto de servicios llevan el IVA correspondiente, que se indica en la factura.'],
      ['p', 'Aceptamos el pago en nuestro centro (efectivo, tarjeta, Bizum o transferencia) y por internet con tarjeta de crédito o débito. El pago con tarjeta por internet se realiza en tiempo real a través de la pasarela segura del banco, una vez comprobados los datos; nosotros no vemos ni guardamos los datos de tu tarjeta.'],
      ['p', 'Das tu consentimiento expreso a recibir la factura en formato electrónico. Si prefieres recibirla en papel, puedes pedírnosla en cualquier momento.'],

      ['h', 'Entrega'],
      ['p', `Los servicios se prestan en nuestro centro, en ${E.domicilio}.`],
      ['p', 'El material se recoge en el centro. Se trata de material para la realización de las actividades, que adquieren las personas que son clientes de alguno de nuestros servicios.'],

      ['h', 'Cambios, devoluciones y cancelación'],
      ['p', 'Tienes derecho a desistir de la compra de material, y a su cambio o devolución, en un plazo de 14 días naturales sin necesidad de justificación.'],
      ['p', 'Puedes cancelar la compra de un servicio en un plazo de 14 días naturales desde la compra, siempre que no lo hayas disfrutado.'],
      ['p', 'No hay derecho a devolución en estos casos:'],
      ['ul', [
        'Servicios que ya se hayan disfrutado, parcial o completamente.',
        'Artículos personalizados o manipulados tras la entrega.',
        'Bienes precintados por razones de salud o higiene que se hayan desprecintado tras la entrega.',
      ]],
      ['p', 'La devolución de material se hace siempre en el centro, y el reembolso se realiza por el mismo medio con el que se pagó.'],

      ['h', 'Garantía'],
      ['p', 'Si contratas como consumidor, tienes derecho a medidas correctoras gratuitas en caso de falta de conformidad de los bienes, en los términos legalmente establecidos para cada tipo de producto.'],
      ['p', 'Quedan excluidos de la garantía los productos dañados por un uso inadecuado o por desgaste. Para cualquier reclamación sobre material será necesario presentar el recibo o la factura de compra.'],
    ],
  },

  {
    id: 'reglamento',
    titulo: 'Reglamento interno y condiciones de matrícula',
    bloques: [
      ['h', 'Normativa general'],
      ['ol', [
        'No está permitida la entrada al vestuario de acompañantes, nuestro equipo atenderá a los alumnos en caso de necesidad.',
        'Durante la realización de las clases, nadie podrá permanecer dentro del centro debido a que los alumnos están realizando sus actividades y puede ser causa de molestia.',
        'Está prohibido comer en todo el centro.',
        'Deberá ser comunicado al centro si el alumno tiene algún problema de salud que pueda ser peligroso para llevar a cabo la actividad.',
        'Para asistir a una clase será imprescindible haber reservado plaza con anterioridad, no permitiéndose la entrada a ninguna persona que no aparezca en la lista.',
        'Todos los alumnos deben cambiarse en los vestuarios, quedando totalmente prohibido hacerlo en los descansillos o pasillos.',
        'La empresa no se responsabiliza de los objetos perdidos. Recomendamos a los padres que marquen los objetos con las iniciales del nombre y los dos apellidos de sus hijos, de este modo los profesores podrán recuperarlos y entregarlos a sus propietarios.',
      ]],
      ['h', 'Horarios y apertura del centro'],
      ['ol', [
        'Los estudiantes tendrán que estar preparados al menos cinco minutos antes del inicio de las clases.',
        'No se permitirá la entrada a clase pasados diez minutos del inicio de la clase.',
        'Los días festivos no se impartirán clases.',
        'En los periodos de Navidad y Semana Santa el centro permanecerá cerrado.',
      ], 8],
      ['h', 'Condiciones de pago'],
      ['ol', [
        'La matrícula supone un compromiso de asistencia durante el curso escolar completo y abono de todas las mensualidades desde el mes de septiembre hasta junio.',
        'Los pagos se realizarán de forma mensual del 1 al 10 de cada mes.',
        'Las cuotas se abonan en concepto de derecho a utilización de los servicios prestados por la empresa. La no utilización de dichos servicios no da derecho a reclamación sobre las cantidades abonadas o descuento en las mensualidades.',
        'En el caso de formalizar la matrícula por primera vez a mitad de mes se realizará un 25% de descuento en dicha mensualidad.',
        'Las bajas deberán comunicarse en la recepción 10 días antes de finalizar el mes anterior a causar baja. En caso contrario, deberá abonar la cuota de la mensualidad en la que causa baja.',
        'Las bajas se realizarán por voluntad propia del interesado o incumplimiento por su parte de las reglas de este contrato.',
      ], 12],
    ],
  },
];

export const DOC_POR_ID = Object.fromEntries(DOCS_LEGALES.map(d => [d.id, d]));

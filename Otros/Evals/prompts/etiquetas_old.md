estructura_ejemplo =
"<Etiqueta>
<NombreEtiqueta> Asistencia Sanitaria MAZ </NombreEtiqueta>
<Contexto> MAZ es una mutua colaboradora con la Seguridad Social que presta servicios médicos y asistenciales. </Contexto> <Contenido> Esta etiqueta incluye normativa sobre asistencia sanitaria, salud pública y cartera de servicios del SNS. </Contenido> <Razonamiento>
 Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos: a) obliga a empresas como MAZ a implementar cambios en su operativa b) presenta un precedente sancionador o judicial c) es una ley general u orgánica (o modifica una ley general u orgánica) relevante para la etiqueta d) se establece una recomendación o mejores prácticas relevantes para el sector </Razonamiento> <DocumentosNoIncluidos>Si el <DOCUMENTO> a analizar es alguno de los siguientes textos normativos, no debe ser identificado con esta etiqueta (esta lista es exhaustiva y no se debe ampliar): Ofertas de empleo público, oposiciones, convocatorias de plazas, concursos para dotación de personal médico, anuncios de adjudicación de suministros o licitaciones hospitalarias, convenios administrativos o protocolos de intenciones sin carácter normativo. </DocumentosNoIncluidos>
</Etiqueta>"

input = "Etiqueta: Protección de Datos y Privacidad

Definicion: En el contexto de EOS una entidad de gesión de crédito en España, Única y exclusivamente, resoluciones AEPD y otra normativa que altere y crea un nuevo criterio interpretativo en materia de bases de legitimación, profiling, conservación, transferencias internacionales o sanciones de datos, todo ello APLICABLE al tratamiento de información de deudores y cesionarios; esencial para adaptar sistemas, contratos y evitar multas.
"

output = "<Etiqueta>
<NombreEtiqueta>Protección de Datos y Privacidad</NombreEtiqueta>
<Contexto> EOS es una entidad de gestión de crédito y recobro que trata datos personales de deudores y cesionarios conforme al RGPD y la LOPDGDD. </Contexto>
<Objetivo> El objetivo de esta etiqueta es detectar novedades normativas relevantes en protección de datos y privacidad  </Objetivo>
<Razonamiento>
Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
 a) Impone nuevas obligaciones, prohibiciones o medidas que obliguen a empresas como EOS a adaptar su operativa.
 b) Establece sanciones económicas (de reguladores como la AEPD) o criterio jurisprudencial en materia de protección de datos. Aunque afecten a particulares concretos distintos de EOS y la sanción o decisión judicial no suponga un criterio novedoso, deben ser etiquetadas ya que sirven como indicativo de tendencias reguladoras y judiciales
 c) Es una ley general u orgánica (o modifica una ley general u orgánica) relevante para la etiqueta 
 d) Establece una recomendación o guía de mejores prácticas relevantes en protección de datos
 e) Altera o crea un nuevo criterio interpretativo en materia de bases de legitimación, profiling, conservación o transferencias internacionales
 f) Establece novedades normativas en el tratamiento de información de deudores y cesionarios
</Razonamiento>
<DocumentosNoIncluidos>
Quedan excluidos (lista exhaustiva, no ampliar):
 • Convenios o resoluciones no sancionadoras que afectan a particulares o empresas concretas sin efectos jurídicos generales. 
 • Anuncios de licitación, adjudicaciones o concursos de servicios de datos.
</DocumentosNoIncluidos>
</Etiqueta>"

input2 = "Etiqueta: Protección de Datos y Privacidad MAZ
Definicion:
Contexto: MAZ es una mutua colaboradora con la Seguridad Social que presta servicios médicos y asistenciales. Contenido: Esta etiqueta incluye normativa sobre IA y protección de datos que genere efectos jurídicos e implicaciones materiales, especialmente si está relacionada con el ámbito sanitario. Para determinar si se etiqueta el texto o no, evalua si obliga a empresas como MAZ a implementar cambios en su operativa, si presenta un precedente sancionador o judicial  o aumenta el riesgo normativo o si establece una recomendación o mejores prácticas relevantes para el sector. Listado exhaustivo de documentos no incluidos: Si el <DOCUMENTO> a analizar es alguno de los siguientes textos normativos, no debe ser identificado con esta etiqueta (esta lista es exhaustiva y no se debe ampliar): – Nombramientos o ceses individuales de DPOs. – Sanciones sin valor generalizable. – Convenios o políticas privadas sin fuerza legal. – Subvenciones sin impacto en la regulación del tratamiento de datos." 

output2 = "<Etiqueta>
<NombreEtiqueta>Protección de Datos y Privacidad MAZ</NombreEtiqueta>
<Contexto>MAZ es una mutua colaboradora con la Seguridad Social que presta servicios médicos y asistenciales.</Contexto>
<Objetivo>Detectar novedades normativas relevantes en protección de datos e IA</Objetivo>
<Razonamiento>
Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
 a) Impone nuevas obligaciones, prohibiciones o medidas que obliguen a empresas como MAZ a adaptar su operativa o sistemas.
 b) Establece sanciones económicas (de reguladores como la AEPD) o decisiones judiciales en materia de protección de datos. Aunque el <DOCUMENTO> afecte a particulares concretos distintos de MAZ y la sanción o decisión judicial no suponga un criterio novedoso, debe ser identificado por esta etiqueta ya que sirve como indicativo de tendencias reguladoras y judiciales
 c) Es una ley general u orgánica (o modifica una ley general u orgánica) relevante para la etiqueta 
 d) Establece novedades normativas en materia de datos sanitarios.
 e) Establece una recomendación o guía de mejores prácticas relevantes para protección de datos o aplicación de la IA en ámbito sanitario.
</Razonamiento>
<DocumentosNoIncluidos>
Lista exhaustiva (no ampliar):
• Nombramientos o ceses individuales de Delegados de Protección de Datos (DPO).
• Convenios o resoluciones no sancionadoras que afectan a particulares o empresas concretas sin efectos jurídicos generales
 • Subvenciones sin impacto en la regulación del tratamiento de datos.
</DocumentosNoIncluidos>
</Etiqueta>"

input3 = "Etiqueta: Residuos y Medio Ambiente GAyPombo

Definicion: 
Gómez-Acebo & Pombo asesora a empresas altamente reguladas en sectores clave, combinando rigor jurídico con visión estratégica. Este agente detecta nuevas normas, actualizaciones y documentos vinculantes sobre residuos (tasas...), economía circular, vertederos, envases y responsabilidad ampliada del productor. Incluye proyectos en consulta y softlaw (esta última, no incluye informes de proyectos/explotaciones privadas en particular). Cobertura: BOE, DOUE, boletines autonómicos y publicaciones oficiales (MITECO, comunidades autónomas y ayuntamientos), incluso cuando no figuren en fuentes agregadas. Incluye: leyes, reales decretos, decretos autonómicos, órdenes y ordenanzas definitivas que introduzcan obligaciones o tasas. No incluye: planes estratégicos, subvenciones y ayudas, programas o convenios sin fuerza normativa, informes de impacto ambiental, resoluciones judiciales aisladas o textos normativos que afecten únicamente a una explotación o planta en particular. Tampoco incluye normativa relacionada con empleo público o funcionarios.
" 
output3 = "<Etiqueta>
<NombreEtiqueta>Residuos y Medio Ambiente – Gomez Acebo y Pombo</NombreEtiqueta>
<Contexto>Gómez-Acebo & Pombo asesora a empresas altamente reguladas y les notifica sobre novedades normativas relevantes en sus áreas de interés</Contexto>
<Objetivo>Detectar novedades normativas sobre residuos, economía circular, descarbonización y asuntos relacionados para notificar a clientes</Objetivo>
<Contenido>
 Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
 a) Establece novedades normativas que afectan a vertederos, envases, responsabilidad ampliada del productor o economía circular.
 b) Se pueden derivar oportunidades estratégicas o incentivos fiscales del <DOCUMENTO> 
relacionados con el sector de residuos, economía circular, descarbonización o similar. Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que es útil para los clientes de GAyPombo poder detectar estas oportunidades e incentivos
 c) Establece sanciones económicas de reguladores o criterio judicial en materia de residuos o economía circular. Aunque afecten a particulares concretos y la sanción o decisión judicial no suponga un criterio novedoso, deben ser etiquetadas ya que sirven como indicativo de tendencias reguladoras y judiciales
 d) Es un proyecto normativo en consulta pública relacionado con el sector residuos/economía circular.
 e) Establece una recomendación o guía de mejores prácticas relevantes para residuos, economía circular o industrias limpias. Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales
 f) Es una ley, real decreto, decreto autonómico, orden o ordenanza definitiva que introduce obligaciones o tasas sobre residuos
</Contenido>
<DocumentosNoIncluidos>
Exclusiones (lista exhaustiva):
 a) Planes estratégicos, subvenciones y ayudas.
 b) Programas o convenios sin fuerza normativa.
 c) Informes de impacto ambiental.
 d) Textos normativos que afecten únicamente a una explotación o planta en particular.
 e) Normativa sobre empleo público o funcionarios.
</DocumentosNoIncluidos>
</Etiqueta>"

input4 = "Etiqueta: Novedades normativas en residuos - Harmon

Definicion: Harmon.es asesora a una empresa española de economía circular, gestión de residuos, limpieza urbana y mantenimiento de zonas verdes, en la adaptación a su entorno regulatorio. Este agente monitoriza normativa, políticas y resoluciones sobre recogida y triaje de basuras, reciclaje, recuperación de materiales, compostaje, biometanización, biogás, gasificación, incineración y valorización de residuos. También cubre limpieza viaria, mantenimiento de parques/jardines y contratos públicos de basuras e industriales. Permite al consultor identificar cambios en la Ley de residuos, requisitos técnicos, trazabilidad, licencias, obligaciones ambientales, subvenciones verdes y oportunidades en economía circular. Facilita la anticipación de riesgos regulatorios y la construcción de estrategias de licitación, sostenibilidad y propósito empresarial. NO inluye conevnios o informes de proyectos en específico.
"
output4 = "<Etiqueta>
<NombreEtiqueta>Novedades normativas en residuos – Harmon</NombreEtiqueta>
<Contexto>Harmon.es asesora a una empresa española de economía circular dedicada a la gestión de residuos, limpieza urbana y mantenimiento de zonas verdes.</Contexto>
<Objetivo>Detectar novedades normativas relevantes para recogida y triaje de basuras, reciclaje, valorización y demás actividades de residuos con el objetivo de anticipar riesgos regulatorios y oportunidades de licitación.</Objetivo>
<Contenido>
Se debe etiquetar el <DOCUMENTO> si:
 a) Modifica la Ley de Residuos o alguna ley General u orgánica relevante en el sector residuos.
 b) Regula actividades de reciclaje, compostaje, biometanización, biogás, gasificación, incineración o valorización de residuos.
 c) Afecta a limpieza viaria, mantenimiento de parques/jardines o contratos públicos/industriales de gestión de basuras.
 d) Es una ley, real decreto, decreto autonómico, orden o ordenanza definitiva que introduce obligaciones o tasas sobre residuos
</Contenido>
<DocumentosNoIncluidos>
Exclusiones (lista exhaustiva):
 • Convenios o informes específicos de proyectos sin efectos normativos generales.
</DocumentosNoIncluidos>
</Etiqueta>"

input5 = "Etiqueta: Residuos urbanos e industriales — PreZero

Definicion: PreZero España, líder en economía circular, gestiona residuos y su valorización. Harmon le asesora y necesita alertas inmediatas sobre cambios que afecten a la recogida, transporte, tratamiento y trazabilidad de residuos urbanos, industriales y suelos contaminados.
El agente monitoriza BOE, DOUE y los 17 boletines autonómicos, detectando leyes, reales decretos y órdenes sobre clasificación, RAP, SDDR, tasas de vertido, reciclaje y contratos de limpieza. También alerta sobre licencias, requisitos técnicos y ayudas. Incluye normativa local relevante, como la modificación de tasas de recogida de basuras."

output5 = "<Etiqueta>
<NombreEtiqueta>Residuos urbanos e industriales – PreZero</NombreEtiqueta>
<Contexto>Harmon asesora y proporciona alertas normativas a sus clientes sobre sus áreas de interés. PreZero España, es un cliente de Harmon, que gestiona residuos y su valorización y necesita alertas inmediatas sobre cambios normativos que afecten a sus operaciones.</Contexto>
<Objetivo>Detectar novedades normativas relevantes sobre residuos, limpieza y contaminación 
</Objetivo>
<Contenido>
Se debe etiquetar el <DOCUMENTO> si:
 a) Introduce o modifica obligaciones sobre residuos urbanos/industriales.
 b) Regula RAP, sistemas de depósito y retorno (SDDR) o tasas de vertido/basuras.
 c) Establece novedades normativas que afectan a reciclaje, limpieza o suelos contaminados
 c) Afecta a licencias, requisitos técnicos o ayudas aplicables al sector.
</Contenido>
<DocumentosNoIncluidos>
Exclusiones (lista exhaustiva):
 • Normativa que solo afecte a empleo público o funcionarios.
 • Textos aplicables únicamente a una planta o explotación particular sin alcance general.
 • Toda la normativa municipal de Asturias, salvo que el ambito de aplicación del <DOCUMENTO> sea en el municipio de Tineo
</DocumentosNoIncluidos>
</Etiqueta>"

inpu6= "Etiqueta: Employment & PRL – Gomez Acebo y Pombo

Definicion: Gómez-Acebo & Pombo asesora a empresas altamente reguladas en sectores clave, combinando rigor jurídico con visión estratégica. Este agente detecta cambios legales en prevención de riesgos laborales y condiciones de trabajo: coordinación de actividades, EPIs, jornada, desconexión digital, igualdad y protección sindical. Cobertura: BOE, DOUE, INSST, DGOSS, boletines autonómicos. No incluye: convenios colectivos (estatales, autonómicos o de empresa), informes técnicos sin valor normativo, resoluciones judiciales aisladas."

output6 = "<Etiqueta>
<NombreEtiqueta>Employment & PRL – Gomez Acebo y Pombo</NombreEtiqueta>
<Contexto>Gómez-Acebo & Pombo asesora a empresas altamente reguladas y les notifica sobre novedades normativas relevantes en sus áreas de interés</Contexto>
<Objetivo>Detectar novedades normativas sobre prevención de riesgos laborales y condiciones de trabajo para notificar a clientes</Objetivo>
<Contenido>
 Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
 a) Establece nuevas obligaciones o prohibiciones que afectan a prevención de riesgos laborales o condiciones de trabajo.
 b) Es una ley general u orgánica (o modifica una ley general u orgánica) relevante para la etiqueta 
 c) Establece una recomendación o guía de mejores prácticas relevantes en condiciones de trabajo o prevención de riesgos laborales.  Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales
 d) Establece sanciones económicas (de reguladores) o criterio jurisprudencial en materia de condiciones de trabajo o prevención de riesgos laborales. Aunque el <DOCUMENTO> afecte a particulares concretos y la sanción o decisión judicial no suponga un criterio novedoso, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales
 e) Es un convenio de interés general que afecten directamente a todo un sector, subsector o administración. Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que los convenios de interes general son relevantes para GAyPombo
 f) Establece novedades normativas en coordinación de actividades, EPIs, jornada, desconexión digital, igualdad y protección sindical
</Contenido>
<DocumentosNoIncluidos>
Exclusiones (lista exhaustiva):
 • Convenios que no estén incluidos en el apartado e) de <contenido>
 • Informes específicos de proyectos sin efectos normativos generales.
 • Todas las órdenes y resoluciones sobre particulares concretos que no estén incluidas en el apartado d) de <contenido>
 </DocumentosNoIncluidos>
 </Etiqueta>"

input7 = "Etiqueta: Agente Normativo Comunitario (UE)
Definicion: 
El ICAM (Ilustre Colegio de la Abogacía de Madrid) agrupa y representa a los abogados y abogadas de Madrid, ofreciéndoles formación, servicios y defensa institucional de la profesión.
Este agente cubre la normativa de la Unión Europea que genera efectos jurídicos en España en sectores como competencia, protección de datos, medioambiente, energía o consumo. Sólo reglamemntos legislativos. 
NO incluye comunicaciones, dictámenes ni reglamentos de ejecución o delegados  (NO confundir con reglamentos legislativos). (medidas restricitvas NO, y menos en países como Mauritania), (NO concentracioens notifciadas), (NO cincluir correciones de errores)
Debe analizar el DOUE (serie L) para detectar ÚNICAMENTE reglamentos, directivas y decisiones del Consejo o Comisión con impacto jurídico general y directo. Decisiones PESC únicamente aquellas que tengan gran impacto y relevnacia para abogados en España."

output7 = "<Etiqueta><NombreEtiqueta>Agente Normativo Comunitario (UE)</NombreEtiqueta><Contexto>El ICAM (Ilustre Colegio de la Abogacía de Madrid) analiza y publica las novedades normativas más relevantes para los abogados miembros del Colegio</Contexto><Objetivo>Detectar normativa de la Unión Europea con efectos jurídicos en España en sectores como competencia, protección de datos, medioambiente, energía o consumo.</Objetivo><Contenido> Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos: a) Procede del DOUE (serie L) y es un reglamento legislativo, directiva o decisión del Consejo o de la Comisión con impacto jurídico general y directo en España. b) Es una decisión PESC con gran impacto y relevancia para la abogacía en España.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Comunicaciones y dictámenes. • Reglamentos de ejecución o delegados (no confundir con reglamentos legislativos). • Medidas restrictivas. • Concentraciones notificadas. • Correcciones de errores.</DocumentosNoIncluidos></Etiqueta>"

input8="Etiqueta: Agente de Subvenciones, Becas y Ayudas
Definicion: DEl ICAM (Ilustre Colegio de la Abogacía de Madrid) agrupa y representa a los abogados y abogadas de Madrid, ofreciéndoles formación, servicios y defensa institucional de la profesión.
Este agente identifica convocatorias abiertas DIRIGIDAS A profesionales jurídicos o sus clientes, incluyendo becas, premios, subvenciones y ayudas de interés.
No incluye sentencias, convocatorias cerradas, premios simbólicos ni ayudas sin valor económico o sin base jurídica publicada.
Debe analizar el BOE (Sección III) y el BOCM para extraer convocatorias con base normativa publicadas por organismos públicos y ofrecer síntesis con plazos, beneficiarios y requisitos clave.
El ICAM (Ilustre Colegio de la Abogacía de Madrid) agrupa y representa a los abogados y abogadas de Madrid, ofreciéndoles formación, servicios y defensa institucional de la profesión.
Este agente identifica convocatorias abiertas DIRIGIDAS A profesionales jurídicos o sus clientes, incluyendo becas, premios, subvenciones y ayudas de interés.
No incluye sentencias, convocatorias cerradas, premios simbólicos ni ayudas sin valor económico o sin base jurídica publicada.
Debe analizar el BOE (Sección III) y el BOCM para extraer convocatorias con base normativa publicadas por organismos públicos y ofrecer síntesis con plazos, beneficiarios y requisitos clave."

output8 = "<Etiqueta><NombreEtiqueta>Agente de Subvenciones, Becas y Ayudas</NombreEtiqueta><Contexto>El ICAM (Ilustre Colegio de la Abogacía de Madrid) analiza y publica las novedades normativas más relevantes para los abogados miembros del Colegio</Contexto><Objetivo>Identificar convocatorias abiertas dirigidas a profesionales jurídicos o a sus clientes, incluyendo becas, premios, subvenciones y ayudas con base jurídica publicada, y ofrecer en la explicación síntesis con plazos, beneficiarios y requisitos clave.</Objetivo><Contenido>Lee detenidamente el siguiente supuesto. Se debe etiquetar el <DOCUMENTO> si cumple el supuesto: a) Publica una convocatoria con base normativa emitida por un organismo público. que esté abierta y tenga valor económico o jurídico para profesionales jurídicos o sus clientes.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Sentencias. • Convocatorias cerradas. • Premios simbólicos o ayudas sin valor económico. • Ayudas sin base jurídica publicada.</DocumentosNoIncluidos></Etiqueta>"

input9 = "Etiqueta: Agente Normativo Administrativo
Definicion:
El ICAM (Ilustre Colegio de la Abogacía de Madrid) agrupa y representa a los abogados y abogadas de Madrid, ofreciéndoles formación, servicios y defensa institucional de la profesión.
Este agente cubre las necesidades de profesionales que asesoran o litigan en procedimientos administrativos, contratación pública, urbanismo, función pública o sanciones.
Debe analizar el BOE (principalmente Secciones I y III), el BOCM (disposiciones generales) y el DOUE (serie L) para identificar normas que introduzcan o modifiquen disposiciones aplicables al Derecho Administrativo.
IMPORTANTE: No incluye resoluciones individuales (como subastas de lotes/tanteo), órdenes, NO  ayudas/subvenciones, ministeriales, anuncios, disposiciones simbólicas (como leyes que afectan temas de una región en particular y que no son de materias especialmente relvantes) ni normas sin efecto práctico (garantías para cuadros...)"

output9 = "<Etiqueta><NombreEtiqueta>Agente Normativo Administrativo</NombreEtiqueta><Contexto>El ICAM (Ilustre Colegio de la Abogacía de Madrid) analiza y publica las novedades normativas más relevantes para los abogados miembros del Colegio.</Contexto><Objetivo>Detectar novedades normativas relevantes en procedimientos administrativos, contratación pública, urbanismo, función pública o sanciones</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> únicamente si procede del BOE (principalmente Secciones I y III), del BOCM (disposiciones generales) o del DOUE (serie L) y cumple al menos uno de los siguientes supuestos: a) Introduce o modifica disposiciones aplicables al Derecho Administrativo en las materias indicadas (procedimiento, contratación pública, urbanismo, función pública, sanciones).  b) Establece sanciones económicas (de reguladores) o criterio jurisprudencial relevante para el derecho administrativo. Aunque el <DOCUMENTO> afecte a particulares concretos y la sanción o decisión judicial no suponga un criterio novedoso, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Resoluciones u órdenes sin efectos generales, que afecten a personas, empresas o adminisitraciones concretas, salvo las del apartado b) de <Contenido> que sí deben incluirse. • Órdenes ministeriales y anuncios. • Ayudas o subvenciones. • Documentos cuyo ámbito de aplicación afecte únicamente a un municipio • Normas sin efectos prácticos relevantes.</DocumentosNoIncluidos></Etiqueta>"

input10 = "Etiqueta: Financial Regulatory – Gomez Acebo y Pombo

Definicion: Gómez-Acebo & Pombo asesora a empresas altamente reguladas en sectores clave, combinando rigor jurídico con visión estratégica. Este agente monitoriza cambios normativos y técnicos en regulación financiera, prevención de blanqueo, mercados de valores, pagos y criptoactivos. Cobertura: CNMV, Banco de España, ESMA, EBA, DOUE. Incluye directivas, reglamentos, guías y Q&A de supervisores. No incluye: comunicaciones comerciales, sanciones individuales, decisiones prejudiciales sin efecto general, resoluciones interpretativas sin carácter normativo."

output10 = "<Etiqueta><NombreEtiqueta>Financial Regulatory – Gomez Acebo y Pombo</NombreEtiqueta><Contexto>Gómez-Acebo & Pombo asesora a empresas altamente reguladas en sectores financieros.</Contexto><Objetivo>Detectar cambios normativos y técnicos en regulación financiera, prevención de blanqueo, mercados de valores, pagos y criptoactivos.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos: a) Directiva o reglamento europeos en materia financiera, mercados, pagos o criptoactivos. b) Guía, Q&A o recomendación de CNMV, Banco de España, ESMA o EBA relevante para regulación financiera o PBC/FT; aunque el <DOCUMENTO> no introduzca obligaciones ni sanciones, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y supervisoras. c) Establece sanciones económicas (de reguladores como CNMV o Banco de España) o criterio jurisprudencial en materia financiera o PBC/FT; aunque el <DOCUMENTO> afecte a particulares concretos y la sanción o decisión judicial no suponga un criterio novedoso, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales. d) Establece criterios o actualizaciones de supervisores/reguladores que impacten en regulación financiera o PBC/FT.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Comunicaciones comerciales. • Decisiones prejudiciales sin efecto general. • Resoluciones u órdenes sin efectos generales que afecten a personas, empresas o administraciones concretas, salvo las del apartado c) de <Contenido> que sí deben incluirse.</DocumentosNoIncluidos></Etiqueta>"
---

input11="Etiqueta: Seguridad Social MAZ: Seguridad Social MAZ

Definicion: MAZ es una mutua colaboradora con la Seguridad Social que ofrece servicios de seguros y asistencia sanitaria en España. Este agente informa sobre cambios normativos relevantes en cotizaciones, prestaciones sociales, régimen laboral aplicable a mutualistas y modificaciones significativas en procedimientos administrativos de afiliación, alta y baja, excluyendo convenios interadministrativos o acuerdos de colaboración sin impacto normativo sustancial. Justificación: Facilita a MAZ adaptar procesos internos, optimizar su operativa aseguradora y garantizar cumplimiento preciso ante cambios importantes del marco laboral y de seguridad social."

output11 = "<Etiqueta><NombreEtiqueta>Seguridad Social MAZ</NombreEtiqueta><Contexto>MAZ es una mutua colaboradora con la Seguridad Social que ofrece servicios de seguros y asistencia sanitaria en España.</Contexto><Objetivo>Informar sobre cambios normativos relevantes en cotizaciones, prestaciones sociales, régimen laboral aplicable a mutualistas y modificaciones significativas en procedimientos administrativos de afiliación, alta y baja.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno: a) Cambia las cotizaciones o prestaciones sociales. b) Modifica el régimen laboral aplicable a mutualistas. c) Introduce modificaciones significativas relacionadas con la Seguridad Social o el procedimientos de afiliación, alta o baja.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Convenios interadministrativos o acuerdos de colaboración sin impacto normativo sustancial. • Resoluciones u órdenes sin efectos generales que afecten a personas o entidades concretas.</DocumentosNoIncluidos></Etiqueta>"
---

input12="Etiqueta: Morosidad

Definicion: En el contexto de EOS una entidad de gesión de crédito en España, Aquellas normas que impacten en su operativa en materia de morosidad, relacionado con Ley 3/2004 y su posible recast europeo, normas sectoriales, sanciones y doctrina que amplíen plazos máximos de pago, incrementen intereses de demora, impongan reporting o establezcan multas por retraso, afectando la rentabilidad esperada de facturas y préstamos impagados"

output12 = "<Etiqueta><NombreEtiqueta>Morosidad – EOS</NombreEtiqueta><Contexto>EOS es una entidad de gestión de crédito en España.</Contexto><Objetivo>Detectar normas que impacten la operativa en materia de morosidad y la rentabilidad de facturas y préstamos impagados.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si: a) Afecta a la Ley 3/2004 sobre morosidad o a su posible recast europeo. b) Introduce normas sectoriales sobre plazos máximos de pago, intereses de demora, obligaciones de reporting o multas por retraso. c) Contiene sanciones o criterio doctrinal/jurisprudencial que amplíen plazos, incrementen intereses de demora, impongan reporting o establezcan multas; aunque el <DOCUMENTO> afecte a particulares concretos y la sanción o decisión no suponga un criterio novedoso, debe ser etiquetado ya que sirve como indicativo de tendencias regulatorias y judiciales.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Resoluciones u órdenes sin efectos generales que afecten a personas o empresas concretas, salvo las del apartado c) de <Contenido> que sí deben incluirse.</DocumentosNoIncluidos></Etiqueta>"

---
input13="
Etiqueta: Cesión de Crédito

Definicion: En el contexto de EOS una entidad de gesión de crédito en España,Cualquier reforma o interpretación en Código Civil, Ley de Contratos de Crédito, fiscalidad, directiva y normas de gestores de créditos, plusvalías, notificación al deudor, garantías y régimen de responsabilidades, que altere proceso, coste o seguridad jurídica en la compra-venta o servicing de carter
"
output13 = "<Etiqueta><NombreEtiqueta>Cesión de Crédito – EOS</NombreEtiqueta><Contexto>EOS es una entidad de gestión de crédito en España.</Contexto><Objetivo>Detectar reformas o interpretaciones que alteren el proceso, coste o seguridad jurídica en la compra-venta o servicing de carteras.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si: a) Afecta al Código Civil o a la Ley de Contratos de Crédito. b) Afecta a fiscalidad o directivas y normas de gestores de créditos. c) Regula plusvalías, notificación al deudor, garantías o régimen de responsabilidades. d) Establece sanciones económicas o criterio jurisprudencial que afecte a la cesión o servicing de créditos; aunque el <DOCUMENTO> afecte a particulares y la sanción o decisión no suponga un criterio novedoso, debe ser etiquetado por su valor indicativo de tendencia.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Resoluciones u órdenes sin efectos generales que afecten a particulares, salvo las del apartado d) de <Contenido> que sí deben incluirse.</DocumentosNoIncluidos></Etiqueta>"

---

input14="Etiqueta: Blanqueo de Capitales

Definicion: En el contexto de EOS una entidad de gesión de crédito en España, Reformas de la Ley 10/2010, nuevas Directivas AML, guías, sanciones relevantes y criterios jurisprudenciales que amplíen obligaciones de diligencia debida, listEtiqueta que agrupa todas las obligaciones legales que pueden afectar a Allianz como aseguradora global. Incluye cumplimiento del RGPD, LOPDGDD y normativa sectorial (Solvencia II, IDD), así como requisitos de ciberseguridad conforme a marcos europeos (NIS2, DORA) y buenas prácticas internacionales como el marco NIST del gobierno de EE. UU que puede impactar indirectamente. Abarca también prevención de blanqueo (AML/CFT), transparencia en la comercialización de seguros, gobernanza de producto (POG), contratación electrónica y reporte ante autoridades (DGSFP, EIOPA). Se extiende a riesgos tecnológicos, uso de IA, biometría y automatización, con actualización continua ante cambios normativos europeos.as de sancionados, trazabilidad de fondos o comunicación de operaciones sospechosas, lo que eleva riesgo sancionador y costes de cumplimiento
"
output14 = "<Etiqueta><NombreEtiqueta>Blanqueo de Capitales – EOS</NombreEtiqueta><Contexto>EOS es una entidad de gestión de crédito en España.</Contexto><Objetivo>Detectar reformas y criterios que amplíen obligaciones de diligencia debida y requisitos AML/CFT.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si: a) Reformas de la Ley 10/2010. b) Nuevas Directivas AML. c) Guías, sanciones relevantes o criterios jurisprudenciales sobre listas de sancionados, trazabilidad de fondos o comunicación de operaciones sospechosas; aunque el <DOCUMENTO> afecte a particulares y no suponga un criterio novedoso, debe ser etiquetado por su valor indicativo de tendencia.</Contenido><DocumentosNoIncluidos>Exclusiones (lista exhaustiva): • Resoluciones u órdenes sin efectos generales sobre particulares, salvo las del apartado c) de <Contenido> que sí deben incluirse.</DocumentosNoIncluidos></Etiqueta>"
---

input15= "Etiqueta: Administradores de Créditos (Credit Servicers)

Definicion: En el contexto de EOS una entidad de gesión de crédito en España, Directiva (UE) 2021/2167, y normas nacionales sobre autorización, solvencia, gobierno corporativo y reporting, que determinan requisitos prudenciales y de conducta para el propio servicer
"
output15 = "<Etiqueta><NombreEtiqueta>Administradores de Créditos (Credit Servicers) – EOS</NombreEtiqueta><Contexto>EOS es una entidad de gestión de crédito en España.</Contexto><Objetivo>Detectar normativa aplicable a credit servicers.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si: a) Desarrolla o implementa la Directiva (UE) 2021/2167. b) Establece normas nacionales sobre autorización, solvencia, gobierno corporativo o reporting que determinen requisitos prudenciales y de conducta para el servicer.</Contenido><DocumentosNoIncluidos></DocumentosNoIncluidos></Etiqueta>"
---

input16="Etiqueta: Enjuiciamiento Civil

Definición: En el contexto de EOS una entidad de gesión de crédito en España, Cambios en la LEC, leyes procesales complementarias u otras disposiciones que reajusten plazos, costas, subastas electrónicas, ejecución hipotecaria o monitorios; incluyen digitalización judicial, criterios sobre admisibilidad de documentos y tasas, dado que modifican directamente la estrategia, el coste y el calendario de recuperación de NPL
"
output16 = "<Etiqueta><NombreEtiqueta>Enjuiciamiento Civil – EOS</NombreEtiqueta><Contexto>EOS es una entidad de gestión de crédito en España.</Contexto><Objetivo>Detectar cambios procesales que afecten a estrategia, costes y calendario de recuperación de NPL.</Objetivo><Contenido>Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si: a) Modifica la Ley de Enjuiciamiento Civil. b) Modifica leyes procesales complementarias. c) Ajusta plazos, costas, subastas electrónicas, ejecución hipotecaria o procedimientos monitorios. d) Introduce medidas de digitalización judicial. e) Establece criterios sobre admisibilidad de documentos. f) Modifica tasas.</Contenido><DocumentosNoIncluidos></DocumentosNoIncluidos></Etiqueta>"


Indicaciones redaccion: 1. no incluyas "\n" entre cada tag xml
Aprendizaje pendiente por incluir:
    "Etiquetas con alcance sectorial muy parecido
    Cuando dos etiquetas cubran ámbitos muy cercanos (p.ej., dos de residuos o dos de protección de datos), usar un mismo patrón de redacción para <Contenido> y <DocumentosNoIncluidos>.
    Esto evita que una esté más “abierta” que otra y genere inconsistencias"

Aprendizajes
- 1. La definición de los agentes debe ser inequívoca (lo contrario de ambigua)
    
    Las afirmaciones en positivo sobre que debe buscar el agente filtran el contenido detectable. Es crucial dejar claro si es contenido ilustrativo (ejemplos de cosas a detectar) o exhaustivo. Sin aclarar esto, hay veces que la IA decide que es exhaustivo y no detecta impacto y otras ilustrativo y si lo pone (más o menos 50/50)
    
    1. ejs.
        1. Doc: https://www.boe.es/boe/dias/2025/07/29/pdfs/BOE-A-2025-15652.pdf
            1. Agente: “**Protección de Datos MAZ**
            Contexto: MAZ es una mutua colaboradora con la Seguridad Social que ofrece servicios de seguros y asistencia sanitaria en España. **Incluye** Incluye Reglamentos, **leyes** u órdenes que **modifiquen la LOPDGDD, el RGPD o su desarrollo sectorial.** Resoluciones, guías y circulares de la AEPD, EDPB o CEPD con alcance general. Criterios, directrices o sanciones de interés transversal sobre tratamiento de datos de salud, IA o brechas de seguridad. No incluye Nombramientos o ceses de delegados de protección de datos en entidades concretas. Sanciones o resoluciones singulares sin valor doctrinal. Acuerdos o convenios privados sin fuerza normativa, ni subvenciones que introducen novedades en datos. Únicamente lo relevante para la empresa Maz.”
            2. Explicacion IA no deteccion: "Protección de Datos MAZ": {
            "explicacion": "Aunque impone obligaciones genéricas de tratamiento de datos sanitarios, no modifica directamente RGPD/LOPDGDD sectorial ni emite criterios de la AEPD aplicables a MAZ.",
            3. Agente: "**Asistencia Sanitaria MAZ**
            Contexto: MAZ es una mutua colaboradora con la Seguridad Social que presta servicios médicos y asistenciales. Incluye **Leyes**, reales decretos‑ley, reales decretos y órdenes ministeriales o autonómicas **que regulen la asistencia sanitaria de mutuas y la cartera de servicios del SNS**. Resoluciones o instrucciones de la Dirección General de Ordenación Profesional, Consejo Interterritorial, INS, o consejerías autonómicas que introduzcan nuevos requisitos asistenciales, protocolos, estándares de calidad, autorizaciones o procedimientos de homologación. Normas sobre acreditación de centros, homologación de profesionales sanitarios y sistemas de información clínica. No incluye Ofertas de empleo público, oposiciones, convocatorias de plazas, concursos para dotación de personal médico. Anuncios de adjudicación de suministros o licitaciones hospitalarias. Convenios administrativos o protocolos de intenciones sin carácter normativo.”
            4. Explicacion IA: "Asistencia Sanitaria MAZ": {
            "explicacion": "La norma crea una agencia de salud pública y modifica la Ley de Salud Pública, pero no regula cartera de servicios de mutuas ni autorizaciones asistenciales.",
            "nivel_impacto": "No identificado"
            5. No se debe dejar a la IA razonar en abierto cuando haya posibles interpretaciones distintas. Ej1: novedades relevantes pero que no alteran el status quo (no producen nuevas obligaciones o no cambian el criterio judicial) la IA razona correctamente que no se requieren cambios normativos y no etiqueta. Ej2: si se dice que notificaque novedades normativas de xx sector relevantes para xx empresa produce inconsistencias. A veces la IA razona que no aplica exactamente a ese sector y no la incluye aunq sea relevante. **En estos casos dejar claro el comportamiento que esperamos de la IA:**
                
                Ej1:  b) Establece sanciones económicas (de reguladores como la AEPD) o criterio jurisprudencial en materia de protección de datos. Aunque afecten a particulares concretos distintos de MAZ y la sanción o decisión judicial **no suponga un criterio novedoso, deben ser etiquetadas ya que sirven como indicativo de tendencias reguladoras y judiciales.** Con esto se evita: *"Protección de Datos y Privacidad MAZ": { "explicacion": "Se trata de una sanción individual de la AEPD contra una empresa concreta sin efectos normativos generales para MAZ.", "nivel_impacto": "No identificado" }*
                
                Ej2: <Contexto>MAZ es una mutua colaboradora con la Seguridad Social que presta servicios médicos y asistenciales.</Contexto>
                <Objetivo>Detectar novedades normativas sobre IA y protección de datos **relevantes para MAZ**</Objetivo> **Resultado:** Auto Europeo Meta: "Protección de Datos y Privacidad MAZ": {
                "explicacion": "Aunque es jurisprudencia de protección de datos, el fallo no afecta específicamente al tratamiento de datos sanitarios de mutuas colaboradoras ni impone obligaciones particulares en ese ámbito.",
                "nivel_impacto": "No identificado" —> se quita la coletilla “relevantes para MAZ”
                
- 2. Incluir un apartado de consistencia como criterio, mejora la consistencia de resultados
    
    Ej (en test con doc con idioma distinto, de 70% acierto a 90%):
    
    1. **Consistencia**: Debes razonar y etiquetar de manera consistente, de tal manera que si tuvieras que etiquetar un texto 100 veces, las 100 tendrían el mismo resultado

- 3. Agrupar el contenido por bloques de XML/variables ayuda al modelo a identificar y no equivocarse a que nos referimos. Es muy importante referirse al texto a analizar como <DOCUMENTO> y no como texto, texto juridico u otros nombres
    
    Ej: En el idioma, cuando le decias que si el texto era distinto de español o ingles no etiquetara, mejora la consistencia al indicarlo que es el texto de <DOCUMENTO> y debajo meter el texto a analizar dentro de <DOCUMENTO> </DOCUMENTO>
    
    Ej: en razonamiento dentro de la etiqueta, sustituir “texto” por documento, mejora accuracy de (7/10) a (0/10). “Se debe incluir la etiqueta como identificada si el **<DOCUMENTO>** cumple alguno de los siguientes casos: a) obliga a empresas como MAZ a implementar cambios en su operativa b) presenta un precedente sancionador o judicial…”
    
- 4. Definir el objetivo del agente con la finalidad/implicaciones requeridas, en vez de intentar redactar un listado de los tipos de textos a incluir. Escribir los textos concretos incluidos por el agente, genera inconsistencias y que faltan textos en producción, porque es imposible y poco eficiente redactar todos los tipos de textos posibles

- 5. Numerar los objetos de un listado (usando 1,2,3.. o a,b,c…). Una lista larga  textos o contenidos a incluir separados por comas o puntos, hace que la IA se confunda.
    
    Ej: mejora precision de (6/10) a (10/10). Con listado de comas a veces solo comprobaba primeros dos elementos y dejaba fuera el texto (que tenia que cogerlo por ser modificacion de ley general relevante para sector)
    
    - antes:  Para determinar si se etiqueta el texto o no, evalua si obliga a empresas como MAZ a implementar cambios en su operativa, o si presenta un precedente sancionador o judicial, o si se trata de una ley general u orgánica relevante para la etiqueta o si establece una recomendación o mejores prácticas relevantes para el sector. **Resultado:** "La ley crea una agencia de salud pública y modifica la Ley General de Salud Pública, s**in alterar la cartera de servicios sanitarios ni imponer cambios operativos en la prestación de asistencia sanitaria.**"
    - despues: Se debe incluir la etiqueta como identificada si el texto cumple alguno de los siguientes casos: a) obliga a empresas como MAZ a implementar cambios en su operativa b) presenta un precedente sancionador o judicial c) se trata de una ley general u orgánica relevante para la etiqueta d) se establece una recomendación o mejores prácticas relevantes para el sector
- 6. Ajustes parametros api: o4mini_medium, temperature=0 (no se puede ajustar parece), seed=1,
- 7. Elementos del bloque de contenido
    
    Ej proteccion de datos EOS: 
    
    ```
    <Razonamiento>
    Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:
     a) **Nuevas obligaciones, Ej:** Impone nuevas obligaciones, prohibiciones o medidas correctivas que obliguen a empresas como EOS a adaptar su operativa.
     b) **Sanciones y jurisprudencia, Ej:** Establece sanciones económicas (de reguladores como la AEPD) o criterio jurisprudencial en materia de protección de datos
     c) **Leyes generales, Ej:** Es una ley general u orgánica (o modifica una ley general u orgánica) relevante para la etiqueta 
     d) **Soft-law, recomendaciones, Ej:** Establece una recomendación o guía de mejores prácticas relevantes en protección de datos.  Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales
     e) **Personalizada 1, Ej:** Altera o crea un nuevo criterio interpretativo en materia de bases de legitimación, profiling, conservación o transferencias internacionales
     f) **Personalizada 2, Ej:** Establece novedades normativas en el tratamiento de información de deudores y cesionarios
     g) **Oportunidades estratégicas o incentivos:** Establece oportunidades estratégicas o incentivos en residuos, economía circular o descarbonización
     h) **Consultas públicas:** Es un proyecto normativo en consulta pública relacionado con el sector residuos/economía circular.
    </Razonamiento>
    # Extra: 
    ```
    
    Aprendizaje: Si por ej, no hay una clausula sobre subvenciones o icnentivos fiscales, no aparecera etiquetado un texto sobre eso (dado que no impone obligaciones)
    
    **Ej employment GAP**
    
    ```markdown
    **<Etiqueta>
    <NombreEtiqueta>Employment & PRL – Gomez Acebo y Pombo</NombreEtiqueta>
    <Contexto>Gómez-Acebo & Pombo asesora a empresas altamente reguladas y les notifica sobre novedades normativas relevantes en sus áreas de interés</Contexto>
    <Objetivo>Detectar novedades normativas sobre prevención de riesgos laborales y condiciones de trabajo para notificar a clientes</Objetivo>
    <Contenido>
     Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:**
     a) **Clausula generica sobre obligaciones o prohibiciones del objetivo etiqueta** Establece nuevas obligaciones o prohibiciones que afectan a prevención de riesgos laborales y condiciones de trabajo.
     b) **Clausula de cambios en leyes principales del sector** Es una ley general u orgánica (o modifica una ley general u orgánica) relevante para la etiqueta 
     c) **Clausula soft law, recomendaciones** Establece una recomendación o guía de mejores prácticas relevantes en condiciones de trabajo o prevención de riesgos laborales.  Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales
     d) **Sanciones, criterio judicial** Establece sanciones económicas (de reguladores) o criterio jurisprudencial en materia de condiciones de trabajo o prevención de riesgos laborales. Aunque el <DOCUMENTO> afecte a particulares concretos y la sanción o decisión judicial no suponga un criterio novedoso, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales
     e) **Convenios IG** Convenios de interés general que afecten directamente a todo un sector, subsector o administración 
     f) **Personalizado 1** Establece novedades normativas en coordinación de actividades, EPIs, jornada, desconexión digital, igualdad y protección sindical
    **</Contenido>
    <DocumentosNoIncluidos>
    Exclusiones (lista exhaustiva):
     • Exclusion de conveniosn, Ej**: Todos los convenios que no estén incluidos en el apartado b) de <contenido>
     • Informes específicos de proyectos sin efectos normativos generales.
     • **Exclusión de disposiciones particulares:** Todas las órdenes y resoluciones sobre particulares concretos que no estén incluidas en el apartado d) de <contenido>
     **</DocumentosNoIncluidos>
     </Etiqueta>**
    ```
    Otros ejemplos de clausulas:
    - **Otra version sobre exclusion de particulares:** “• Resoluciones, convenios u órdenes sin efectos generales, que afecten a personas, empresas o adminisitraciones concretas, salvo las del apartado b) de <Contenido> que sí deben incluirse” —> más detalle en lo que es particulares
    - **Exclusion de nomativa municipal/local:** Documentos cuyo ámbito de aplicación afecte únicamente a una región o municipio
    - **Criterio que se debe cumplir siempre + lista de supuestos: “**Se debe etiquetar el <DOCUMENTO> únicamente si procede del BOE (principalmente Secciones I y III), del BOCM (disposiciones generales) o del DOUE (serie L) y cumple al menos uno de los siguientes supuestos:…”
    - **Clausula sobre criterios/actualziaciones reguladores**: Establece criterios o actualizaciones de supervisores/reguladores que impacten en regulación financiera o PBC/FT.

- 8. Dejar claro que excluir convenios particulares y resoluciones de particulares, no implica no recoger sanciones y decisiones judiciales
    
    Ej (mejora de 0/6 a 6/6) : 
    
    <Contenido> b) Establece sanciones económicas (de reguladores como la AEPD) o criterio jurisprudencial en materia de protección de datos, **ya que sirven como indicativo de tendencias reguladoras y judiciales, aunque afecten a particulares concretos distintos de MAZ**
    
    <DocumentosNoIncluidos>
    Lista exhaustiva (no ampliar):
    • Nombramientos o ceses individuales de Delegados de Protección de Datos (DPO).
    • Convenios y resto de resoluciones **(que no sean sanciones o decisiones judiciales)** que afectan a particulares o empresas concretas sin efectos jurídicos generales
    
- 9. Incluir contenido sobre dos ámbitos distintos en líneas separadas mejora el output.
    
    Ej: “ f) Es una ley, real decreto, decreto autonómico, orden o ordenanza definitiva que introduce obligaciones o tasas sobre residuos **o tabaco” —> falla** , **separando en lineas funciona:** “ f) Es una ley, real decreto, decreto autonómico, orden o ordenanza definitiva que introduce obligaciones o tasas sobre residuos  g) Novedades normativas sobre tabaco”
    
- 10. Importancia de las palabras clave/keywords. En residuos y economia circular, faltaba “industria limpia” y no pillaba una recomendación. También faltaba “incentivo fiscal” para pillar otra
      Materias
Keywords: Acumuladores, Aparatos eléctricos, Aparatos electrónicos, Convivencia,Economía Circular, Envases, Espacios públicos, Estrategia, Filtros, Fumar, Gestión ambiental, Infraestructuras verdes, Medio ambiente, Neumáticos, Pilas, Plásticos, Playas, Productor, Productor de producto, Residuos, Responsabilidad ampliada, Subproducto, Tabaco, Vertederos

- 11. Las menciones repetidas de obligaciones en el objetivo del system prompt hacia que a veces no identificara otras disposiciones (recomendaciones, sanciones etc…). Se ha redactado un objetivo más genérico y parece que funciona correctamente
    
    Ej **Antiguo: “**1. OBJETIVO
    
    Determinar qué sectores quedan directamente afectados por **las obligaciones, prohibiciones o modificaciones de un texto jurídico** y evaluar el nivel de impacto ESPECÍFICO para cada sector/etiqueta. NO pongas ningún convenio colectivo o convenios entre administraciones públicas, son irrelevantes siempre.
    Las etiquetas representan los intereses normativos de clientes que quieren ser notificados cuando un texto normativo tiene un impacto según la definición de la etiqueta y las instrucciones siguientes:”
    
    **Ej Nuevo: “**1. OBJETIVO
    
    **Determinar si el contenido del <DOCUMENTO> coincide con el contenido descrito en las <etiquetas>** y evaluar el nivel de impacto ESPECÍFICO para cada etiqueta, tendiendo en cuenta el procedimiento, criterios y estructura de output descritos a continuación. NO pongas ningún convenio colectivo o convenios entre administraciones públicas, son irrelevantes siempre.
    Las etiquetas representan los intereses normativos de clientes que quieren ser notificados cuando el <DOCUMENTO> coincide con el contenido descrito. “
    
- 12. En listados, cuando no sean exhaustivos añadir “similar” al final, para contemplar casos que no sean exactos y que la IA no pueda razonar que no es relevante. Ademas, cuando se quiera mayor amplitud utiliar terminos como “relacionado con sector…” mas que “empresas que operen en sector…”. Este ult. exige que la IA considere que sea relevante para esas empresas que operan en ese sector, el otro solo que este relacionado. Esto aplica para otros terminos y casuísticas.
    
    Ej:  “Se pueden derivar oportunidades estratégicas o incentivos fiscales del <DOCUMENTO> para **empresas que operen en el sector de residuos**, economía circular o descarbonización. Aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado ya que es útil para los clientes de GAyPombo poder detectar estas oportunidades e incentivos” —→ “Se pueden derivar oportunidades estratégicas o incentivos fiscales del <DOCUMENTO> **relacionados con el sector** de residuos, economía circular, descarbonización **o similar**” (Acierto de 60% —> 100% en run de 10)
    
- 12. En exclusiones, cuando sean todos los de un tipo menos x que si debe estar incluido, se debe meter ese x como clausula positiva de contenido (el documento es xx) y redactar la exclusion: “Se excluyen Convenios/Resoluciones/xx que no estén incluidas en apartado x) de <contenido>
    
    
- 13. Listados largos de keywords o palabras a incluir, dejarlo abierto produce resultados más inconsitentes/impredcibles. ej: “en sectores como competencia, protección de datos, medioambiente, energía o consumo.” vs ““en los sectores de competencia, protección de datos, medioambiente, energía y consumo”
- 14. Redacción de supuestos de contenido: a) disyuncion logica (OR) (ej:  ****“Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:…” b) parte conjuncion logica y parte disyuncion logica (AND + OR)  ( **“**Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> únicamente si procede del BOE (principalmente Secciones I y III), del BOCM (disposiciones generales) o del DOUE (serie L) y cumple al menos uno de los siguientes supuestos: …” c) conjuncion logica (AND) ( **“**Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> únicamente si se cumplen todos los siguientes supuestos: …”. Es importante que a la hora de redactar los supuestos de contenido utilices alguno de estos metodos, no inventes otra manera
    
    
- 15. Objetivo: el objetivo se debe redactar teniendo en cuenta la generalidad/funcionalidad de la etiqueta. Normalmente seguira una estructura similar a: “”Detectar novedades normativas relevantes en… {sector/area de interes de la etiqueta}” dado que ese es el objetivo de la mayoria. Pero en ocasiones, pueden tener un objetivo mas actoado y especifico como “Identificar convocatorias abiertas dirigidas a profesionales jurídicos o a sus clientes, incluyendo becas, premios, subvenciones y ayudas con base jurídica publicada, y ofrecer en la explicación síntesis con plazos, beneficiarios y requisitos clave.”
    - correcto: "Detectar reformas/criterios que alteren proceso, fiscalidad y responsabilidades en compra-venta y servicing de carteras."
    - correcto (ejemplo con más detalle). Muy importante dejar "o similar" para que pueden incluirse otras novedades relevantes, salvo que se quiera acotar mucho la búsqueda
    - incorrecto: "Detectar Ley 4/2022 y normas conexas, códigos BDE, RDs y guías que extiendan protecciones (desahucios, topes, atenciones prioritarias)." (debe ser mas genral sobre la materia y luego meter detalle en contenido, salvo que el suusario diga lo contrario)

- 16. Contexto: debe resumir en una o dos frases a que se dedica la empresa usuaria de la plataforma
    - misma empresa, deberia ser el mismo y generico sobre las ooeraciones de la empresa
    - correcto: "EOS es una entidad de gestión de crédito que opera en España y gestiona carteras NPL (Non Performing Loans)" Incorrecto "EOS opera con deudores minoristas; la protección a colectivos vulnerables impacta recobro, reputación y riesgos."
- 17. Evitar la omisión de palabras, para no dar lugar a interpretaciones Ej: "Reglamentos de ejecución o delegados" se podria interepretar como que "delegados" es un tipo de docoumento. Redactar: "Reglamentos de ejecución o reglamentos delegados", para evitar ambiguedades
- 18. Establecer prevalencias ante contradicciones: "prevalence las restricciones sobre inclusiones"
- 19. Incluir la identificaciond e variables clave (idioma y rango) relevantes para tomar decisiones/aplicar criterios de interpretación
- 20. Pendiente: definir criterios para evaluar si el agente es especifico o general.
- 21. Crear listado de preguntas que debe hacer la IA sobre para afinar agente: tipo de documento: rango alto ley, lo, ley general, europeo, sanciones, jurisprudencia, guias, soft-low, resoluciones, convenios, ordenes, planes estrategicos, subvenciones, informes,mandatos, nombramientos,licitaciones públicas ver si alguno más ), sujeto afectado (particulares, empresas u organismos pubkicos concretas, efectos generales), ámbito de aplicación geográfico (estatal/europeo, nacional, regional, municipal)
- 22. Considerar sis son olbigaciones/prohibiciones con efecto general o con alcance limitado al <DOCUMENTO> (contrato/resolución...) como manera de medir si son referencias tangenciales a etiqueta y no deben estar incluidas (obligaciones de datos, residuos, employment, fiscales...)  

- IMPORTANTE. `Paquetizar todo en keywords a incluir, clausulas de inclusion (obligaciones/prohibiciones, sanciones/jrisprudencia...), docs a excluir... + personalizado (para frase personaliadas incluidas por usuario, se meten como tag XML extra. Explicar estructura agente en)

REFLEXIONES:
1. Subvenciones identificadas pero no aplicables a la empresa
2. Mayor consistencia en output explicacion impacto (mas corta y estructurada) . Que siempre mete explicacion de pq impacto es alyo/medio/bajo o nunca. Lo mismo con la clausula por la que razona que es relevante
3. ⁠Como hacer que solo salgan novedades relevantes para X empresa, sobretodo de ámbitos muy horizontales (ej rrhh y financiero weber), sin meter ruido
4. ⁠Como definir cláusula que funcione siempre, para dejar fuera resoluciones, órdenes,etc que solo afecten a determinados particulares
5. ⁠Crear cláusula sobre tramitación normativa/participación pública. Quieres que te salten notificaciones de textos en este proceso relacionados con (ej: rrhh y laboral). Weber a lo mejor si, Maz no se. Que puedan elegir
6. ⁠Como hacer para que de manera sistemática (si usuario quiere) se metan textos relevantes a nivel nacional que pueden no tener un impacto directo en la empresa actualmente pero son relevantes (ej: Consejera de Valencia se opone públicamente a condoncaicon de deuda a ccaa, fuente Comunidad_valenciana_noticias)
7. ⁠que hacer con temas relevantes pero más a nivel público (emisiones de bonos del estado para agente de área financiera de weber). Ruido? Preguntar a usuario?

-  23. Clausulados estándar reutilizables (soft-law, sanciones/jurisprudencia y exclusión de particulares)
     
    Importante: Iniciar <Contenido> siempre con: "Teniendo en cuenta el <Objetivo> de la etiqueta,se debe etiquetar el <DOCUMENTO> si cumple al menos uno de los siguientes supuestos:". Iniciar <DocumentosnoIncluidos> siempre con: "Aunque cumpla los criterios de inclusión, EL <DOCUMENTO> no debe ser etiquetado por esta etiqueta si cumple alguno de los siguientes supuestos:" A cotnuacion de ambas frases completar con las clausulas correspondientes:
    
     Nota de uso: Cada vez que el input incluya, en las secciones de Contenido o DocumentosNoIncluidos, información que encaje con alguna de las siguientes cláusulas tipo, conviértela a la plantilla correspondiente sustituyendo los tokens `<AMBITO>`, `<SUJETO>`,`<AUTORIDAD>`, `<FUENTES>`, `<LISTA_MATERIAS>` o `<letra_sanciones>` según aplique. Importante que `<SUJETO>`, debe tenr siempre esta estructura "empresas como {nombre sujeto}"  Mantén el encabezado “Lee detenidamente y uno por uno los siguientes supuestos. Se debe etiquetar el <DOCUMENTO> si…” y enumera a), b), c)… con disyunción lógica (OR), salvo que explícitamente se indique AND o se fije un criterio previo de procedencia.
     
     Cláusulas tipo para CONTENIDO (elige y combina):
     - Criterio previo de procedencia (AND + OR):
       "Se debe etiquetar el <DOCUMENTO> únicamente si procede de `<FUENTES>` y cumple al menos uno de los siguientes supuestos: …"
       (Ejemplos de `<FUENTES>`: BOE [Secc. I/III], BOCM [disposiciones generales], DOUE [serie L])
     - Clausula general: Nuevas obligaciones/prohibiciones/medidas. Versión empresa y sector.:
       - empresa:"Impone nuevas obligaciones, prohibiciones o medidas correctivas que obliguen a `<SUJETO>` a adaptar su operativa/sistemas."
       - sector: "Establece nuevas obligaciones o prohibiciones que afectan a `<ÁMBITO>`."
     - Principales leyes: Ley general u orgánica (o modificación). Abierta o cerrada:
       - abierta: "Es una ley general u orgánica (o modifica una ley general u orgánica) relevante para `<AMBITO>`."
       - cerrada: "Desarrolla o implementa la Directiva (UE) 2021/2167 o el GDPR." 
     - Soft-law (guías, Q&A, recomendaciones):
       "Guía, Q&A o recomendación de `<AUTORIDAD>` relevante para `<AMBITO>`; aunque el <DOCUMENTO> no introduzca obligaciones ni sanciones, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y supervisoras/judiciales."
     - Sanciones y jurisprudencia:
       "Establece sanciones económicas (de reguladores como `<AUTORIDAD>`) o criterio jurisprudencial en `<AMBITO>`; aunque el <DOCUMENTO> afecte a particulares concretos y la sanción o decisión judicial no suponga un criterio novedoso, debe ser etiquetado ya que sirve como indicativo de tendencias reguladoras y judiciales."
     - Criterios/actualizaciones de supervisores:
       "Establece criterios o actualizaciones de supervisores/reguladores que impacten en `<AMBITO>`."
     - Proyectos en consulta pública:
       "Es un proyecto normativo en consulta pública relacionado con `<AMBITO>`."
     - Oportunidades estratégicas o incentivos:
       "Se derivan oportunidades estratégicas o incentivos (incl. fiscales) relacionados con `<AMBITO>` o similar; aunque el <DOCUMENTO> no introduzca obligaciones o sanciones, debe ser etiquetado por su utilidad para los usuarios."
     - Convenios de interés general (cuando aplique):
       "Convenio de interés general que afecta directamente a todo un sector, subsector o administración."
     - Novedades específicas enumeradas (plantilla abierta):
       "Establece novedades normativas en `<LISTA_MATERIAS>` (p.ej., coordinación de actividades, EPIs, jornada, desconexión digital, igualdad, protección sindical / bases de legitimación, perfilado, conservación, transferencias internacionales / trazabilidad, licencias, RAP, SDDR, tasas, etc.)."
     
     Cláusulas tipo para DOCUMENTOS NO INCLUIDOS (elige y combina):
     - Exclusión de particulares con excepción:
       "Resoluciones, convenios u órdenes sin efectos generales que afecten a personas, empresas o administraciones concretas, salvo las del apartado `<letra_sanciones>` de <Contenido> que sí deben incluirse."
        " • Documentos cuyos sujetos afectados sean únicamente organismos o administraciones del sector público "
        " b) resoluciones, contratos, convenios o pliegos que afecten a individuos particulares, empresas particulares u organismos del sector público, salvo las del apartado d) de <Contenido> sobre sanciones o criterio judicial "
        - ULTIMO: "a) Resoluciones, órdenes, convenios u otra normativa sin efectos generales que afecten a personas, empresas, administraciones o inmuebles concretos, salvo las del apartado f) de <Contenido> sobre sanciones y doctrina judicial que sí deben incluirse"
     - Exclusión de convenios no IG:
       "Convenios que no estén incluidos en el apartado de <Contenido> sobre convenios de interés general." "Convenios o resoluciones no sancionadoras que afectan a particulares concretos, empresas concretas o interadministrativos sin efectos jurídicos generales" 
     - Exclusión de informes, proyectos o explotaciones particulares. Especialmente relevantes para residuos:
       "Textos normativos que afecten únicamente a un proyecto, explotación, planta , reserva natural o parque natural en particular."
    - Exclusiones relevantes para Universidades:
        I) No incluir modulos profesionales, ciclos formativos, curriculos profesionales, aprobacion de grados, convocatorias, prácticas, subvenciones. 
        II) Documentos sobre centros academicos concretos o universidades concretas


     - Exclusión de normativa local/ámbito acotado:
       a)Municpal: "Documentos cuyo ámbito de aplicación afecte únicamente a un municipio (normativa local), salvo que el agente especifique lo contrario."
       b) autonómico:" Documentos cuyo ámbito de aplicación sea solo municipal o regional (que afecte únicamente a una Comunidad Autónoma) sin tener efecto general en España, salvo que imponga obligaciones relevantes en `<AMBITO>` que sean indicativas de tendencia regulatoria "
     - Exclusión de órdenes/anuncios administrativos (usar solo si el agente así lo define):
       "Órdenes ministeriales y/o anuncios que no introduzcan efectos normativos generales."
     - Exclusión de ayudas/subvenciones (si el agente no las cubre):
       "Ayudas o subvenciones sin base jurídica publicada, sin valor económico o fuera del alcance del agente."
     - Exclusión de sentencias (si el agente no cubre jurisprudencia):
       "Sentencias o resoluciones judiciales cuando no formen parte del alcance definido en <Contenido>."
       - Exlcusión referencias tangenciales. Se debe aplicar a etiquetas generales/horizontales (ej: protección de datos, empleo, tributación...)
        "•  **Documentos cuyo foco NO es la protección de datos y cuya “inclusión” provendría solo de uno de los siguientes supuestos: i) referencias tangenciales al RGPD/LOPDGDD/o normativa referente de datos similar ii) Disposiciones de tratamiento de datos para un procedimiento concreto: convocatorias, bases, subvenciones, inscripciones o similar. El apartado d) no se exluirá si la referencia tangencial o procedimiento trata sobre `<AMBITO>`**
        - "c) referencias tangenciales a `<AMBITO>` que no impliquen cambios operativos para empresas como `<SUJETO>`

    Errores clausulas:
        - d) Introduce sanciones o doctrina aplicable con efecto general. --> efecto general para que? especifico sobre donde afecta. Ademas sanciones y dcotrina sueles para aprticulares, pero no implica que no sean relevantes (generan jurisprudencia o precedentes)
        - listado largo, destruturado y repetivo sin numerar los contenidos no incluidos: "Aunque cumpla los criterios de inclusión, el <DOCUMENTO> no debe ser etiquetado por esta etiqueta si cumple alguno de los siguientes supuestos: acuerdos privados; resoluciones de partes concretas (salvo criterios generales); comunicados comerciales; menciones tangenciales sin cambios en plazos/intereses/reporting. " 
     
     Formato y consistencia:
     - Un solo renglón por etiqueta; no introducir "\n" entre tags XML.
     - Orden y numeración estable (a), b), c)…); usar OR por defecto; si se requiere AND, indicarlo explícitamente en el criterio previo de procedencia.
     - Mantener la misma literalidad de nombres de etiquetas y campos que en el catálogo/definición de entrada.
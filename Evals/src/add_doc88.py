import pandas as pd
import json
import os

def add_doc88_to_datasets():
    """
    Añade Doc88 tanto al dataset enhanced v2 como al dataset de Notion.
    """
    
    # Texto completo de la resolución AEPD para el dataset enhanced v2
    full_text = """1/18
 Expediente Nº: EXP202401054
RESOLUCIÓN DE TERMINACIÓN DEL PROCEDIMIENTO POR PAGO
VOLUNTARIO
Del procedimiento instruido por la Agencia Española de Protección de Datos y en base
a los siguientes
ANTECEDENTES
PRIMERO: Con fecha 18 de julio de 2024, la Directora de la Agencia Española de
Protección de Datos acordó iniciar procedimiento sancionador a VALORA
PREVENCIÓN, S.L.U. (en adelante, VALORA PREVENCIÓN). Notificado el acuerdo
de inicio y tras analizar las alegaciones presentadas, con fecha 18 de junio de 2025 se
emitió la propuesta de resolución que a continuación se transcribe:
<<
Expediente N.º: EXP202401054
PROPUESTA DE RESOLUCIÓN DE PROCEDIMIENTO SANCIONADOR
Del procedimiento instruido por la Agencia Española de Protección de Datos y en base
a los siguientes:
HECHOS
PRIMERO: A.A.A. (en adelante, la parte reclamante) con fecha 10 de diciembre de
2023 interpuso reclamación ante la Agencia Española de Protección de Datos. La
reclamación se dirige contra VALORA PREVENCIÓN, S.L.U. con NIF B97673453. Los
motivos en que basa la reclamación son los siguientes:
La parte reclamante expone que con fecha 16/10/2023 se sometió a un
reconocimiento médico y que obtuvo los resultados de este sin ninguna incidencia; que
en fecha 09/11/2023 recibió una llamada telefónica de un compañero de trabajo para
advertirle de que había accedido a través de la web del Servicio de Prevención
reclamado para descargar los resultados de su reconocimiento médico y que al abrir el
documento PDF descargado, advirtió que, adjunto a su reconocimiento, figuraban
anexas las pruebas médicas complementarias que se habían realizado a la parte
reclamante.
Aporta, entre otros, copia del resultado del reconocimiento médico de su compañero
con las pruebas médicas complementarias que se habían realizado al reclamante,
correo electrónico de fecha 14/11/2023, del DPD de la parte reclamada reconociendo
el error y comunicando su subsanación. Este último correo, dirigido a la parte
reclamante, incluye el texto siguiente:
"Estimado Sr… (nombre y apellido de la parte reclamante):
Me pongo en contacto con usted por una incidencia que me han comunicado respecto
del último reconocimiento médico que se ha realizado.
En primer lugar, le pido disculpas por el error y le informo que como medida de
contención se ha eliminado de la web privada el reconocimiento médico que contenía
información errónea, y se ha procedido a subirlo de nuevo con la información correcta.
Además, se ha solicitado al usuario que proceda a eliminar la documentación
confidencial que se haya podido descargar y/o imprimir contenida erróneamente en su
reconocimiento médico".
SEGUNDO: De conformidad con el artículo 65.4 de la Ley Orgánica 3/2018, de 5 de
diciembre, de Protección de Datos Personales y garantía de los derechos digitales (en
adelante LOPDGDD), se dio traslado de dicha reclamación a VALORA PREVENCIÓN,
S.L.U, para que procediese a su análisis e informase a esta Agencia en el plazo de un
mes, de las acciones llevadas a cabo para adecuarse a los requisitos previstos en la
normativa de protección de datos.
El traslado, que se practicó conforme a las normas establecidas en la Ley 39/2015, de
1 de octubre, del Procedimiento Administrativo Común de las Administraciones
Públicas (en adelante, LPACAP), fue recogido en fecha 22/01/2024 como consta en el
acuse de recibo que obra en el expediente.
Con fecha 20/02/2024 se recibe en esta Agencia escrito de respuesta indicando lo
siguiente:
"Tras la investigación de los hechos ocurridos se constata que el reconocimiento
médico se ha realizado en un centro sanitario externo (***EMPRESA.1) en
***LOCALIDAD.1 y al mecanizar manualmente por parte del sanitario de valora
prevención los datos en nuestro sistema y escanear las pruebas complementarias de
A.A.A., se han incorporado erróneamente al reconocimiento médico de B.B.B. debido
a un error humano.
Por parte de la dpo de valora prevención se ha enviado correo electrónico a B.B.B.
disculpándose e informándole del incidente ocurrido, las medidas de contención
aplicadas y solicitando la eliminación de la información contenida erróneamente.
Igualmente se procedió a enviar correo electrónico a A.A.A., informándole de los
mismos extremos que a B.B.B..
(…)
4. Conclusión
Tras realizar la valoración y cálculos, siguiendo la Guía de la AEPD y sobre
notificación de brechas de seguridad y el procedimiento habilitado al efecto por parte
de VALORA PREVENCIÓN se llega a la conclusión de que estamos ante un incidente
y NO ante una brecha de seguridad de acuerdo a la valoración del riesgo efectuada.
Estos extremos han de ser elevados y valorados por el Responsable del
Tratamiento… para refrendar dicha opinión del DPO y actuar en consecuencia no
comunicando o -por el contrario- notificándola.
Aunque no se comunique a la AEPD se debe de gestionar el incidente. Ello exige que:
a) Se registre internamente. (se adjunta registro interno de la incidencia).
b) Se han adoptado las siguientes medidas para su solución:
. Se ha eliminado el documento que contenía la analítica erróneamente y se ha subido
el informe correcto.
. Se ha comunicado al trabajador vía correo electrónico que proceda a destruir el
documento erróneo.
. Se ha informado por correo electrónico al afectado por la incidencia, con indicaciones
de las medidas de contención
c) Se adopten medidas necesarias para evitar se produzca de nuevo la situación.
Habida cuenta de cómo ha sucedido el incidente, se apuntan como medidas
recomendables, las siguientes:
. Aplicación periódica de programas de formación, educación y sensibilización para los
empleados sobre sus obligaciones en materia de privacidad y seguridad, y la
detección y notificación de amenazas a la seguridad de los datos personales.
Establecimiento de prácticas, procedimientos y sistemas sólidos y eficaces en materia
de protección de datos y privacidad: doble comprobación de los archivos antes de
enviarlos-subirlos.
Tras el seguimiento realizado a la incidencia, ha quedado contrastado que la violación
de seguridad solo ha afectado a la confidencialidad de los datos. La cantidad de datos
afectados puede considerarse baja. El hecho que el trabajador, se haya puesto en
contacto con su compañero de trabajo para informarle de la incidencia se considera un
factor de reducción de riesgo. Debido a las medidas adecuadas adoptadas tras la
violación de seguridad de los datos, es probable que no tenga ninguna repercusión en
los derechos y libertades del interesado"."""
    
    # Output JSON como especificaste
    output_json = {
        "Protección de Datos y Privacidad MAZ": {
            "explicacion": "Resolución sancionadora de la AEPD (EXP202401054) que impone 40.000 € (32.000 € tras pronto-pago) a Valora Prevención por vulnerar el principio de integridad y confidencialidad del art. 5.1 f) RGPD al exponer resultados médicos de un trabajador a un tercero. La Agencia detalla cómo valora la gravedad (datos de salud, pérdida de control) y la aplicación del art. 85 LPACAP (reducción del 20 % por pago voluntario). Aunque no introduce nuevos criterios normativos, refuerza la interpretación práctica de la AEPD sobre sanciones por brechas de confidencialidad y recuerda que las medidas correctivas posteriores no eximen de responsabilidad, lo que exige a los responsables revisar protocolos y formación para evitar multas.",
            "nivel_impacto": "Bajo"
        },
        "Protección de Datos y Privacidad": {
            "explicacion": "Resolución sancionadora de la AEPD (EXP202401054) que impone 40.000 € (32.000 € tras pronto-pago) a Valora Prevención por vulnerar el principio de integridad y confidencialidad del art. 5.1 f) RGPD al exponer resultados médicos de un trabajador a un tercero. La Agencia detalla cómo valora la gravedad (datos de salud, pérdida de control) y la aplicación del art. 85 LPACAP (reducción del 20 % por pago voluntario). Aunque no introduce nuevos criterios normativos, refuerza la interpretación práctica de la AEPD sobre sanciones por brechas de confidencialidad y recuerda que las medidas correctivas posteriores no eximen de responsabilidad, lo que exige a los responsables revisar protocolos y formación para evitar multas.",
            "nivel_impacto": "Bajo"
        }
    }
    
    # Convertir el JSON a string
    output_json_str = json.dumps(output_json, ensure_ascii=False, indent=2)
    
    print("AÑADIENDO DOC88 A LOS DATASETS")
    print("=" * 50)
    
    # 1. Añadir a dataset enhanced v2
    try:
        df_enhanced = pd.read_csv('data/Dataset_langsmith_enhanced_v2.csv')
        print(f"Dataset enhanced v2 cargado: {len(df_enhanced)} filas")
        
        # Crear nueva fila para enhanced v2
        new_row_enhanced = {
            'input_question': f"Doc88: {full_text}",
            'output_output': output_json_str
        }
        
        # Añadir la nueva fila
        df_enhanced_new = pd.concat([df_enhanced, pd.DataFrame([new_row_enhanced])], ignore_index=True)
        
        # Guardar el dataset actualizado
        df_enhanced_new.to_csv('data/Dataset_langsmith_enhanced_v2.csv', index=False)
        print(f"✅ Doc88 añadido al dataset enhanced v2. Nuevas filas: {len(df_enhanced_new)}")
        
    except Exception as e:
        print(f"❌ Error al actualizar dataset enhanced v2: {e}")
    
    # 2. Añadir a dataset de Notion
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        print(f"Dataset Notion cargado: {len(df_notion)} filas")
        
        # Crear nueva fila para Notion (texto truncado a 75 caracteres)
        texto_truncado = full_text[:75]
        
        new_row_notion = {
            'ID': 'Doc88',
            'Área': 'Falta: Proteccion de datos',
            'Texto (primeros 75 caracteres)': texto_truncado,
            'URL': '',  # Vacío ya que es contenido manual
            'Output esperado': output_json_str
        }
        
        # Añadir la nueva fila
        df_notion_new = pd.concat([df_notion, pd.DataFrame([new_row_notion])], ignore_index=True)
        
        # Guardar el dataset actualizado
        df_notion_new.to_csv('data/Dataset_notion_1620_01_08.csv', index=False)
        print(f"✅ Doc88 añadido al dataset Notion. Nuevas filas: {len(df_notion_new)}")
        
    except Exception as e:
        print(f"❌ Error al actualizar dataset Notion: {e}")
    
    print("\n📋 RESUMEN DOC88:")
    print("=" * 30)
    print(f"ID: Doc88")
    print(f"Área en Notion: Falta: Proteccion de datos")
    print(f"Longitud texto completo: {len(full_text)} caracteres")
    print(f"Texto truncado (75 chars): {texto_truncado}")
    print(f"Número de etiquetas en output: 2")
    print("  - Protección de Datos y Privacidad MAZ")
    print("  - Protección de Datos y Privacidad")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    print(f"Directorio de trabajo: {os.getcwd()}")
    add_doc88_to_datasets() 
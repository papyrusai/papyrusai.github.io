import pandas as pd
import os

def add_doc87_to_datasets():
    """
    Añade Doc87 tanto al dataset enhanced v2 como al dataset de Notion.
    """
    
    # Texto completo de la ley para el dataset enhanced v2
    full_text = """I. DISPOSICIONES GENERALES
JEFATURA DEL ESTADO
15652 Ley 7/2025, de 28 de julio, por la que se crea la Agencia Estatal de Salud
Pública y se modifica la Ley 33/2011, de 4 de octubre, General de Salud
Pública.
FELIPE VI
REY DE ESPAÑA
A todos los que la presente vieren y entendieren.
Sabed: Que las Cortes Generales han aprobado y Yo vengo en sancionar la
siguiente ley:
PREÁMBULO
I
La Ley 14/1986, de 25 de abril, General de Sanidad, desarrolla la previsión
constitucional de protección de la salud con una visión integradora de los servicios
sanitarios y descentralizadora de la sanidad, a través de la creación del Sistema
Nacional de Salud (en adelante, SNS) con una organización adecuada para prestar una
atención integral a la salud, comprensiva tanto de su promoción y de la prevención de la
enfermedad como de la curación y rehabilitación, procurando altos niveles de calidad,
debidamente evaluados y controlados.
Por su parte, la Ley 33/2011, de 4 de octubre, General de Salud Pública, sienta las
bases para dar una respuesta completa al requerimiento de protección de la salud
contenido en el artículo 43 de la Constitución Española y tratar de alcanzar y mantener el
máximo nivel de salud posible en la población a través de la salud pública, definida como
el conjunto de actividades organizadas por las Administraciones públicas, con la
participación de la sociedad, para prevenir la enfermedad, así como para proteger,
promover y recuperar la salud de las personas, tanto en el ámbito individual como en el
colectivo, mediante acciones sanitarias, sectoriales y transversales. Entre otras,
considera como «Actuaciones de salud pública» la vigilancia en salud pública, la
prevención de la enfermedad, la promoción de la salud, la coordinación de la promoción
de la salud y la prevención de enfermedades y lesiones en el Sistema Nacional de Salud,
la gestión sanitaria como una acción de salud pública, la protección de la salud de la
población y la evaluación del impacto en salud de otras políticas. Esta ley desarrolla más
extensamente las competencias del Ministerio de Sanidad y de las comunidades
autónomas en materia de salud pública, de conformidad con lo establecido en la
Constitución Española y en los Estatutos de Autonomía."""
    
    # Output esperado para Doc87
    output_esperado = """{
  "Asistencia Sanitaria MAZ": {
    "explicacion": "La Ley 7/2025 crea la Agencia Estatal de Salud Pública (AESAP) y modifica la Ley 33/2011 y el TRLG de medicamentos. 1) Obliga a todas las entidades sanitarias –incluidas las mutuas colaboradoras como MAZ– a suministrar datos sanitarios y epidemiológicos a la AESAP y a participar en planes estatales de preparación y respuesta ante emergencias (arts. 6-7, DA 8.ª). 2) Refuerza la vigilancia y trazabilidad de salud pública, lo que impacta en los sistemas de información clínica y de protección de datos de la mutua. 3) Ajusta el sistema de precios de referencia de medicamentos (art. 98 TRLG), relevante para la gestión farmacéutica de MAZ al financiar tratamientos de contingencias profesionales. Estos cambios requieren revisión de protocolos de reporte, adaptación de TI y seguimiento de la nueva política de precios.",
    "nivel_impacto": "Medio"
  },
  "Protección de datos y privacidad MAZ": {
    "explicacion": "Refuerza la vigilancia y trazabilidad de salud pública, lo que impacta en los sistemas de información clínica y de protección de datos de la mutua",
    "nivel_impacto": "Medio"
  }
}"""
    
    # 1. Añadir a dataset enhanced v2
    print("Añadiendo Doc87 al dataset enhanced v2...")
    try:
        df_enhanced = pd.read_csv('data/Dataset_langsmith_enhanced_v2.csv')
        
        # Crear nueva fila para dataset enhanced
        new_row_enhanced = {
            'input_question': f"Doc87: {full_text}",
            'output_output': output_esperado
        }
        
        # Añadir la nueva fila
        df_enhanced = pd.concat([df_enhanced, pd.DataFrame([new_row_enhanced])], ignore_index=True)
        
        # Guardar el dataset actualizado
        df_enhanced.to_csv('data/Dataset_langsmith_enhanced_v2.csv', index=False)
        print(f"✅ Doc87 añadido al dataset enhanced v2. Total filas: {len(df_enhanced)}")
        
    except Exception as e:
        print(f"❌ Error al actualizar dataset enhanced v2: {e}")
    
    # 2. Añadir a dataset de Notion
    print("\nAñadiendo Doc87 al dataset de Notion...")
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        
        # Texto truncado a 75 caracteres para Notion
        texto_truncado = full_text[:75]
        
        # Crear nueva fila para dataset de Notion
        new_row_notion = {
            'ID': 'Doc87',
            'Área': 'Falta: Proteccion Datos y Asistencia Sanitaria',
            'Reason': '',
            'Etiqueta problemática': '',
            'Detalle': '',
            'URL': '',  # No hay URL específica para esta entrada manual
            'Output esperado': output_esperado,
            'Texto (primeros 75 caracteres)': texto_truncado,
            'Conclusiones': '',
            'Created Date': ''
        }
        
        # Añadir la nueva fila
        df_notion = pd.concat([df_notion, pd.DataFrame([new_row_notion])], ignore_index=True)
        
        # Guardar el dataset actualizado
        df_notion.to_csv('data/Dataset_notion_1620_01_08.csv', index=False)
        print(f"✅ Doc87 añadido al dataset de Notion. Total filas: {len(df_notion)}")
        
    except Exception as e:
        print(f"❌ Error al actualizar dataset de Notion: {e}")
    
    # 3. Generar reporte de la adición
    print("\n" + "="*60)
    print("REPORTE DE ADICIÓN DE DOC87")
    print("="*60)
    print(f"📄 DocID: Doc87")
    print(f"📊 Área: Falta: Proteccion Datos y Asistencia Sanitaria")
    print(f"📝 Longitud texto completo: {len(full_text)} caracteres")
    print(f"📝 Texto truncado (Notion): {len(texto_truncado)} caracteres")
    print(f"🎯 Output esperado: Asistencia Sanitaria MAZ + Protección de datos MAZ")
    print(f"✅ Añadido a ambos datasets exitosamente")
    
    print(f"\n📁 Archivos actualizados:")
    print(f"- Dataset_langsmith_enhanced_v2.csv")
    print(f"- Dataset_notion_1620_01_08.csv")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    print(f"Directorio de trabajo: {os.getcwd()}")
    
    # Ejecutar la adición de Doc87
    add_doc87_to_datasets() 
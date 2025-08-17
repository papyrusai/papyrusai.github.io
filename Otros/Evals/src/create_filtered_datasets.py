import pandas as pd
import os

def create_filtered_datasets():
    """
    Crea 3 datasets filtrados basándose en el campo 'Área' del dataset de Notion
    y cruzándolo con el dataset de Langsmith enhanced v2.
    """
    
    print("CREANDO DATASETS FILTRADOS")
    print("=" * 50)
    
    # Cargar datasets
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        df_langsmith = pd.read_csv('data/Dataset_langsmith_enhanced_v2.csv')
        
        print(f"✅ Dataset Notion cargado: {len(df_notion)} filas")
        print(f"✅ Dataset Langsmith enhanced v2 cargado: {len(df_langsmith)} filas")
        
    except Exception as e:
        print(f"❌ Error cargando datasets: {e}")
        return
    
    # Función para extraer DocID del campo input_question de Langsmith
    def extract_doc_id_from_langsmith(input_text):
        if pd.isna(input_text) or not isinstance(input_text, str):
            return None
        # Buscar patrón DocXX: al inicio del texto
        import re
        match = re.match(r'^(Doc\d+)', input_text.strip())
        if match:
            return match.group(1)
        return None
    
    # Extraer DocIDs del dataset de Langsmith
    df_langsmith['DocID'] = df_langsmith['input_question'].apply(extract_doc_id_from_langsmith)
    
    print(f"\n📊 DocIDs extraídos de Langsmith: {df_langsmith['DocID'].notna().sum()}")
    
    # 1. DATASET FALTA: Área empieza por "Falta"
    print("\n🔍 PROCESANDO DATASET FALTA:")
    print("-" * 30)
    
    # Filtrar filas de Notion donde Área empieza por "Falta"
    notion_falta = df_notion[df_notion['Área'].str.startswith('Falta', na=False)]
    falta_doc_ids = notion_falta['ID'].tolist()
    
    print(f"DocIDs en Notion con área 'Falta': {len(falta_doc_ids)}")
    print(f"Lista: {falta_doc_ids}")
    
    # Cruzar con Langsmith
    langsmith_falta = df_langsmith[df_langsmith['DocID'].isin(falta_doc_ids)]
    
    # Guardar dataset
    langsmith_falta.to_csv('data/Dataset_langsmith_falta.csv', index=False)
    print(f"✅ Dataset_langsmith_falta.csv creado: {len(langsmith_falta)} filas")
    
    # 2. DATASET GRISES: Área contiene "Gris"
    print("\n🔍 PROCESANDO DATASET GRISES:")
    print("-" * 30)
    
    # Filtrar filas de Notion donde Área contiene "Gris"
    notion_grises = df_notion[df_notion['Área'].str.contains('Gris', na=False, case=False)]
    grises_doc_ids = notion_grises['ID'].tolist()
    
    print(f"DocIDs en Notion con área que contiene 'Gris': {len(grises_doc_ids)}")
    print(f"Lista: {grises_doc_ids}")
    
    # Cruzar con Langsmith
    langsmith_grises = df_langsmith[df_langsmith['DocID'].isin(grises_doc_ids)]
    
    # Guardar dataset
    langsmith_grises.to_csv('data/Dataset_langsmith_grises.csv', index=False)
    print(f"✅ Dataset_langsmith_grises.csv creado: {len(langsmith_grises)} filas")
    
    # 3. DATASET RUIDO: Área empieza por "Ruido" O contiene "Correccion"
    print("\n🔍 PROCESANDO DATASET RUIDO:")
    print("-" * 30)
    
    # Filtrar filas de Notion donde Área empieza por "Ruido" O contiene "Correccion"
    condition_ruido = (
        df_notion['Área'].str.startswith('Ruido', na=False) |
        df_notion['Área'].str.contains('Correccion', na=False, case=False)
    )
    notion_ruido = df_notion[condition_ruido]
    ruido_doc_ids = notion_ruido['ID'].tolist()
    
    print(f"DocIDs en Notion con área 'Ruido' o 'Corrección': {len(ruido_doc_ids)}")
    print(f"Lista: {ruido_doc_ids}")
    
    # Cruzar con Langsmith
    langsmith_ruido = df_langsmith[df_langsmith['DocID'].isin(ruido_doc_ids)]
    
    # Guardar dataset
    langsmith_ruido.to_csv('data/Dataset_langsmith_ruido.csv', index=False)
    print(f"✅ Dataset_langsmith_ruido.csv creado: {len(langsmith_ruido)} filas")
    
    # RESUMEN FINAL
    print("\n📋 RESUMEN DE DATASETS CREADOS:")
    print("=" * 40)
    print(f"📁 Dataset_langsmith_falta.csv: {len(langsmith_falta)} filas")
    print(f"📁 Dataset_langsmith_grises.csv: {len(langsmith_grises)} filas")
    print(f"📁 Dataset_langsmith_ruido.csv: {len(langsmith_ruido)} filas")
    
    total_filtered = len(langsmith_falta) + len(langsmith_grises) + len(langsmith_ruido)
    print(f"\n📊 Total filas en datasets filtrados: {total_filtered}")
    print(f"📊 Dataset original Langsmith: {len(df_langsmith)} filas")
    
    # Mostrar algunos ejemplos de cada categoría
    print("\n🔍 EJEMPLOS DE CLASIFICACIÓN:")
    print("-" * 30)
    
    if len(notion_falta) > 0:
        print(f"✅ FALTA - Ejemplo: {notion_falta.iloc[0]['ID']} -> '{notion_falta.iloc[0]['Área']}'")
    
    if len(notion_grises) > 0:
        print(f"🔘 GRISES - Ejemplo: {notion_grises.iloc[0]['ID']} -> '{notion_grises.iloc[0]['Área']}'")
        
    if len(notion_ruido) > 0:
        print(f"🔇 RUIDO - Ejemplo: {notion_ruido.iloc[0]['ID']} -> '{notion_ruido.iloc[0]['Área']}'")
    
    # Verificar que no hay duplicados entre categorías
    print("\n🔍 VERIFICACIÓN DE SOLAPAMIENTOS:")
    print("-" * 35)
    
    set_falta = set(falta_doc_ids)
    set_grises = set(grises_doc_ids)
    set_ruido = set(ruido_doc_ids)
    
    overlap_falta_grises = set_falta.intersection(set_grises)
    overlap_falta_ruido = set_falta.intersection(set_ruido)
    overlap_grises_ruido = set_grises.intersection(set_ruido)
    
    print(f"Solapamiento Falta-Grises: {len(overlap_falta_grises)} DocIDs")
    if overlap_falta_grises:
        print(f"  -> {list(overlap_falta_grises)}")
        
    print(f"Solapamiento Falta-Ruido: {len(overlap_falta_ruido)} DocIDs")
    if overlap_falta_ruido:
        print(f"  -> {list(overlap_falta_ruido)}")
        
    print(f"Solapamiento Grises-Ruido: {len(overlap_grises_ruido)} DocIDs")
    if overlap_grises_ruido:
        print(f"  -> {list(overlap_grises_ruido)}")
    
    print(f"\n✅ Proceso completado exitosamente")
    print(f"📂 Los datasets originales se mantienen intactos")
    print(f"📂 Nuevos datasets creados en la carpeta data/")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    print(f"Directorio de trabajo: {os.getcwd()}")
    create_filtered_datasets() 
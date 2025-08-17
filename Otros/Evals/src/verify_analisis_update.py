import pandas as pd
import os

def verify_analisis_update():
    """Verificar el dataset de análisis creado y la actualización de Notion."""
    
    print("VERIFICACIÓN DATASET ANÁLISIS Y ACTUALIZACIÓN NOTION")
    print("=" * 60)
    
    # Verificar dataset de análisis
    try:
        df_analisis = pd.read_csv('data/Dataset_langsmith_analisis.csv')
        print(f"✅ Dataset análisis cargado: {len(df_analisis)} filas")
        
        # Extraer DocIDs
        def extract_doc_id(input_text):
            if pd.isna(input_text) or not isinstance(input_text, str):
                return None
            import re
            match = re.match(r'^(Doc\d+)', input_text.strip())
            return match.group(1) if match else None
        
        df_analisis['DocID'] = df_analisis['input_question'].apply(extract_doc_id)
        analisis_doc_ids = df_analisis['DocID'].dropna().tolist()
        
        print(f"DocIDs en dataset análisis: {analisis_doc_ids}")
        
    except Exception as e:
        print(f"❌ Error verificando dataset análisis: {e}")
    
    # Verificar dataset de Notion actualizado
    try:
        df_notion = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
        print(f"\n✅ Dataset Notion actualizado cargado: {len(df_notion)} filas")
        
        print(f"\n📊 ESTRUCTURA DEL DATASET NOTION:")
        print("-" * 35)
        print(f"Columnas totales: {len(df_notion.columns)}")
        print(f"Columnas: {list(df_notion.columns)}")
        
        if 'Área1' in df_notion.columns:
            area1_pos = df_notion.columns.tolist().index('Área1')
            area_pos = df_notion.columns.tolist().index('Área')
            print(f"✅ Área1 encontrada en posición: {area1_pos + 1}")
            print(f"✅ Área encontrada en posición: {area_pos + 1}")
            print(f"✅ Área1 está antes de Área: {area1_pos < area_pos}")
        else:
            print("❌ Columna Área1 no encontrada")
            return
        
        print(f"\n📋 DISTRIBUCIÓN DE CLASIFICACIONES:")
        print("-" * 35)
        classification_counts = df_notion['Área1'].value_counts()
        for classification, count in classification_counts.items():
            print(f"   {classification}: {count} documentos")
        
        print(f"\n🔍 EJEMPLOS DE CLASIFICACIONES:")
        print("-" * 35)
        
        # Mostrar ejemplos de cada tipo
        for classification in ['Falta', 'Gris', 'Ruido', 'Analisis']:
            examples = df_notion[df_notion['Área1'] == classification]
            if len(examples) > 0:
                example = examples.iloc[0]
                print(f"   {classification}: {example['ID']} -> '{example['Área']}'")
        
        # Mostrar clasificaciones múltiples
        multiple_classifications = df_notion[df_notion['Área1'].str.contains('-', na=False)]
        print(f"\n🔗 CLASIFICACIONES MÚLTIPLES ({len(multiple_classifications)}):")
        print("-" * 45)
        for _, row in multiple_classifications.head(5).iterrows():
            print(f"   {row['ID']}: '{row['Área1']}' -> '{row['Área']}'")
        
        # Verificar documentos de análisis específicamente
        analisis_docs = df_notion[df_notion['Área1'].str.contains('Analisis', na=False)]
        print(f"\n📊 DOCUMENTOS DE ANÁLISIS ({len(analisis_docs)}):")
        print("-" * 35)
        for _, row in analisis_docs.iterrows():
            print(f"   {row['ID']}: '{row['Área']}'")
        
        # Verificar consistencia con dataset de análisis creado
        notion_analisis_ids = set(analisis_docs['ID'].tolist())
        langsmith_analisis_ids = set(analisis_doc_ids)
        
        print(f"\n🔍 CONSISTENCIA ENTRE DATASETS:")
        print("-" * 35)
        print(f"DocIDs en Notion con 'Analisis': {len(notion_analisis_ids)}")
        print(f"DocIDs en Langsmith análisis: {len(langsmith_analisis_ids)}")
        
        missing_in_langsmith = notion_analisis_ids - langsmith_analisis_ids
        if missing_in_langsmith:
            print(f"❌ Faltantes en Langsmith: {missing_in_langsmith}")
        else:
            print(f"✅ Consistencia perfecta")
        
        print(f"\n✅ VERIFICACIÓN COMPLETADA")
        
    except Exception as e:
        print(f"❌ Error verificando dataset Notion: {e}")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    verify_analisis_update() 
import pandas as pd
import re
import os

def extract_doc_id_from_input(input_text):
    """
    Extrae el DocID del texto de input del dataset de Langsmith.
    Busca patrones como 'Doc01:', 'Doc86:', etc. al inicio del texto.
    """
    if pd.isna(input_text) or not isinstance(input_text, str):
        return None
    
    # Buscar patrón DocXX: al inicio del texto
    match = re.match(r'^(Doc\d+)', input_text.strip())
    if match:
        return match.group(1)
    
    # Buscar patrón DocNoIdentificado o similar
    if input_text.strip().startswith('DocNoIdentificado'):
        return 'DocNoIdentificado'
    
    return None

def cross_reference_datasets():
    """
    Cruza el dataset de Notion con el de Langsmith y actualiza el reference_output
    donde hay coincidencias en los DocIDs.
    """
    # Rutas de los archivos
    notion_file = 'data/Dataset_notion_1400_01_08.csv'
    langsmith_file = 'data/Dataset_langsmith_withID_1140_01_08.csv'
    output_file = 'data/Dataset_notion_updated.csv'
    
    print("Cargando dataset de Notion...")
    try:
        notion_df = pd.read_csv(notion_file)
        print(f"Dataset de Notion cargado: {len(notion_df)} filas")
        print(f"Columnas: {list(notion_df.columns)}")
    except Exception as e:
        print(f"Error al cargar dataset de Notion: {e}")
        return
    
    print("\nCargando dataset de Langsmith...")
    try:
        # Cargar en chunks para manejar archivos grandes
        langsmith_chunks = []
        chunk_size = 1000
        
        for chunk in pd.read_csv(langsmith_file, chunksize=chunk_size):
            langsmith_chunks.append(chunk)
        
        langsmith_df = pd.concat(langsmith_chunks, ignore_index=True)
        print(f"Dataset de Langsmith cargado: {len(langsmith_df)} filas")
        print(f"Columnas: {list(langsmith_df.columns)}")
    except Exception as e:
        print(f"Error al cargar dataset de Langsmith: {e}")
        return
    
    # Extraer DocIDs del dataset de Langsmith
    print("\nExtrayendo DocIDs del dataset de Langsmith...")
    langsmith_df['doc_id'] = langsmith_df['input_question'].apply(extract_doc_id_from_input)
    
    # Mostrar algunos ejemplos de extracción
    valid_docs = langsmith_df[langsmith_df['doc_id'].notna()]
    print(f"DocIDs extraídos exitosamente: {len(valid_docs)}")
    if len(valid_docs) > 0:
        print("Ejemplos de DocIDs extraídos:")
        for i, row in valid_docs.head(5).iterrows():
            print(f"  {row['doc_id']}: {row['input_question'][:50]}...")
    
    # Crear diccionario de mapeo DocID -> output_output
    doc_mapping = {}
    for _, row in langsmith_df.iterrows():
        if pd.notna(row['doc_id']) and pd.notna(row['output_output']):
            doc_mapping[row['doc_id']] = row['output_output']
    
    print(f"\nDiccionario de mapeo creado con {len(doc_mapping)} entradas")
    
    # Actualizar el dataset de Notion
    print("\nActualizando dataset de Notion...")
    matches_found = 0
    no_matches = 0
    
    for idx, row in notion_df.iterrows():
        doc_id = row['ID']
        if doc_id in doc_mapping:
            notion_df.at[idx, 'Output esperado'] = doc_mapping[doc_id]
            matches_found += 1
        else:
            no_matches += 1
    
    print(f"Matches encontrados: {matches_found}")
    print(f"No matches: {no_matches}")
    
    # Guardar el resultado
    print(f"\nGuardando resultado en {output_file}...")
    notion_df.to_csv(output_file, index=False)
    print("¡Proceso completado!")
    
    # Mostrar estadísticas finales
    print(f"\nEstadísticas finales:")
    print(f"- Total de filas en Notion: {len(notion_df)}")
    print(f"- Filas actualizadas: {matches_found}")
    print(f"- Filas sin cambios: {no_matches}")
    print(f"- Archivo guardado: {output_file}")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    print(f"Directorio de trabajo: {os.getcwd()}")
    cross_reference_datasets() 
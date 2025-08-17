import pandas as pd

def verify_text_extraction():
    """Verificar que se extrajo texto completo correctamente."""
    
    # Cargar el dataset mejorado v2
    df = pd.read_csv('data/Dataset_langsmith_enhanced_v2.csv')
    
    print("VERIFICACIÓN DE EXTRACCIÓN DE TEXTO COMPLETO")
    print("=" * 60)
    print(f"Total de filas en dataset v2: {len(df)}")
    
    # Verificar Doc41 específicamente (el ejemplo que mencionaste)
    doc41_rows = df[df['input_question'].str.contains('Doc41:', na=False)]
    
    if not doc41_rows.empty:
        doc41_content = doc41_rows.iloc[0]['input_question']
        
        print(f"\n✅ EJEMPLO Doc41:")
        print(f"Longitud total: {len(doc41_content)} caracteres")
        print(f"\nPrimeros 800 caracteres:")
        print("-" * 40)
        print(doc41_content[:800])
        print("\n[... CONTENIDO CONTINÚA ...]")
        
        # Verificar que no contenga los marcadores antiguos
        if "[DOCUMENTO PDF - URL:" in doc41_content:
            print("❌ ERROR: Aún contiene marcadores de PDF")
        elif "Anuncio a la atención" in doc41_content:
            print("✅ ÉXITO: Contiene texto real extraído del PDF")
        else:
            print("⚠️  Contenido extraído pero necesita verificación manual")
    
    # Estadísticas generales
    print(f"\n📊 ESTADÍSTICAS GENERALES:")
    print(f"-" * 30)
    
    # Contar filas con texto real vs marcadores
    real_text_count = 0
    pdf_marker_count = 0
    error_marker_count = 0
    
    for _, row in df.iterrows():
        content = str(row['input_question'])
        if '[DOCUMENTO PDF - URL:' in content:
            pdf_marker_count += 1
        elif '[ERROR:' in content:
            error_marker_count += 1
        elif len(content) > 100:  # Asumiendo que texto real tiene más de 100 chars
            real_text_count += 1
    
    print(f"Filas con texto real extraído: {real_text_count}")
    print(f"Filas con marcador PDF (sin extraer): {pdf_marker_count}")
    print(f"Filas con error de extracción: {error_marker_count}")
    
    # Mostrar algunos ejemplos de longitudes
    print(f"\n📏 EJEMPLOS DE LONGITUDES DE TEXTO:")
    print(f"-" * 35)
    
    # Obtener filas con texto largo (exitosas)
    long_text_rows = []
    for _, row in df.tail(20).iterrows():  # Últimas 20 filas (las añadidas)
        content = str(row['input_question'])
        if len(content) > 1000 and not content.startswith('['):
            doc_id = content.split(':')[0] if ':' in content else 'Unknown'
            long_text_rows.append((doc_id, len(content)))
    
    # Ordenar por longitud y mostrar top 5
    long_text_rows.sort(key=lambda x: x[1], reverse=True)
    for i, (doc_id, length) in enumerate(long_text_rows[:5], 1):
        print(f"{i}. {doc_id}: {length:,} caracteres")

if __name__ == "__main__":
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    verify_text_extraction() 
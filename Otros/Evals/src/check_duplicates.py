import pandas as pd
import re
from collections import Counter
import csv

def extract_doc_id(input_text: str) -> str:
    """Extrae el DocID del principio del texto de input."""
    if pd.isna(input_text) or input_text == "":
        return "NO_DOC_ID"
    
    # Buscar patrón DocXX: o DocNoIdentificado: al principio del texto
    match = re.match(r'^"?(Doc\d+|DocNoIdentificado):', str(input_text))
    if match:
        return match.group(1)
    
    # Si no encuentra el patrón esperado, buscar cualquier cosa antes de ":"
    fallback_match = re.match(r'^"?([^:]+):', str(input_text))
    if fallback_match:
        return f"UNKNOWN_FORMAT_{fallback_match.group(1)}"
    
    return "NO_DOC_ID"

def check_duplicates():
    """Analiza el dataset y reporta DocIDs duplicados."""
    print("Analizando duplicados en Dataset_langsmith_withID_1140_01_08.csv...")
    
    try:
        # Leer solo las columnas necesarias para ser más eficiente
        print("Cargando dataset...")
        df = pd.read_csv('data/Dataset_langsmith_withID_1140_01_08.csv', 
                        usecols=['input_question'])
        print(f"Dataset cargado: {len(df)} filas")
        
        # Extraer DocIDs de todas las filas
        print("Extrayendo DocIDs...")
        doc_ids = []
        
        for idx, row in df.iterrows():
            if idx % 1000 == 0:
                print(f"Procesando fila {idx}/{len(df)} ({idx/len(df)*100:.1f}%)")
            
            doc_id = extract_doc_id(row['input_question'])
            doc_ids.append(doc_id)
        
        print("Análisis completado. Generando reporte...")
        
        # Contar frecuencias de DocIDs
        doc_id_counts = Counter(doc_ids)
        
        # Encontrar duplicados (DocIDs que aparecen más de una vez)
        duplicates = {doc_id: count for doc_id, count in doc_id_counts.items() 
                     if count > 1}
        
        # Generar reporte
        print("\n" + "="*60)
        print("REPORTE DE DUPLICADOS")
        print("="*60)
        
        total_docs = len(doc_ids)
        unique_docs = len(doc_id_counts)
        duplicate_docs = len(duplicates)
        
        print(f"Total de registros analizados: {total_docs:,}")
        print(f"DocIDs únicos encontrados: {unique_docs:,}")
        print(f"DocIDs con duplicados: {duplicate_docs}")
        
        if duplicates:
            print("\nDocIDs DUPLICADOS encontrados:")
            print("-" * 40)
            
            # Ordenar duplicados por frecuencia (más frecuentes primero)
            sorted_duplicates = sorted(duplicates.items(), 
                                     key=lambda x: x[1], reverse=True)
            
            for doc_id, count in sorted_duplicates:
                print(f"{doc_id}: {count} veces")
            
            print(f"\nTotal de registros duplicados: {sum(duplicates.values()) - len(duplicates)}")
            
        else:
            print("\n✅ No se encontraron DocIDs duplicados!")
        
        # Mostrar distribución de tipos de DocID
        print("\n" + "="*60)
        print("DISTRIBUCIÓN DE TIPOS DE DocID")
        print("="*60)
        
        # Categorizar DocIDs
        doc_types = {
            'DocNoIdentificado': 0,
            'DocIDs válidos': 0,
            'Sin DocID': 0,
            'Formato desconocido': 0
        }
        
        for doc_id in doc_ids:
            if doc_id == 'DocNoIdentificado':
                doc_types['DocNoIdentificado'] += 1
            elif doc_id == 'NO_DOC_ID':
                doc_types['Sin DocID'] += 1
            elif doc_id.startswith('UNKNOWN_FORMAT_'):
                doc_types['Formato desconocido'] += 1
            elif doc_id.startswith('Doc') and doc_id[3:].isdigit():
                doc_types['DocIDs válidos'] += 1
            else:
                doc_types['Formato desconocido'] += 1
        
        for doc_type, count in doc_types.items():
            percentage = (count / total_docs) * 100
            print(f"{doc_type}: {count:,} ({percentage:.1f}%)")
        
        # Guardar reporte detallado
        print("\nGuardando reporte detallado...")
        with open('data/duplicates_report.txt', 'w', encoding='utf-8') as f:
            f.write("REPORTE DE DUPLICADOS - Dataset_langsmith_withID_1140_01_08.csv\n")
            f.write("="*70 + "\n\n")
            
            f.write(f"Total de registros analizados: {total_docs:,}\n")
            f.write(f"DocIDs únicos encontrados: {unique_docs:,}\n")
            f.write(f"DocIDs con duplicados: {duplicate_docs}\n\n")
            
            if duplicates:
                f.write("DocIDs DUPLICADOS:\n")
                f.write("-" * 30 + "\n")
                for doc_id, count in sorted_duplicates:
                    f.write(f"{doc_id}: {count} veces\n")
                f.write(f"\nTotal de registros duplicados: {sum(duplicates.values()) - len(duplicates)}\n\n")
            
            f.write("DISTRIBUCIÓN DE TIPOS:\n")
            f.write("-" * 30 + "\n")
            for doc_type, count in doc_types.items():
                percentage = (count / total_docs) * 100
                f.write(f"{doc_type}: {count:,} ({percentage:.1f}%)\n")
        
        print("Reporte guardado en: data/duplicates_report.txt")
        
        return duplicates, doc_id_counts
        
    except FileNotFoundError:
        print("❌ Error: No se encuentra el archivo Dataset_langsmith_withID_1140_01_08.csv")
        print("Asegúrate de que el archivo esté en el directorio data/")
        return None, None
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        return None, None

if __name__ == "__main__":
    duplicates, counts = check_duplicates() 
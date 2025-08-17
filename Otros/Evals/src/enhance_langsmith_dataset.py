import pandas as pd
import requests
import re
import os
import time
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def extract_doc_id_from_input(input_text):
    """
    Extrae el DocID del texto de input del dataset de Langsmith.
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

def scrape_text_from_url(url, max_retries=3):
    """
    Extrae el texto completo de una URL mediante webscraping.
    """
    if pd.isna(url) or not isinstance(url, str) or url.strip() == '':
        return None
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Intentando scraping de: {url} (intento {attempt + 1})")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            # Detectar el tipo de contenido
            content_type = response.headers.get('content-type', '').lower()
            
            if 'pdf' in content_type:
                logger.warning(f"URL es PDF, no se puede extraer texto: {url}")
                return f"[DOCUMENTO PDF - URL: {url}]"
            
            # Parsear HTML
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remover scripts y estilos
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Extraer texto
            text = soup.get_text()
            
            # Limpiar texto
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            # Limitar longitud del texto
            if len(text) > 5000:
                text = text[:5000] + "... [TEXTO TRUNCADO]"
            
            logger.info(f"Texto extraído exitosamente ({len(text)} caracteres)")
            return text
            
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout en intento {attempt + 1} para {url}")
        except requests.exceptions.RequestException as e:
            logger.warning(f"Error en intento {attempt + 1} para {url}: {e}")
        except Exception as e:
            logger.error(f"Error inesperado en intento {attempt + 1} para {url}: {e}")
        
        if attempt < max_retries - 1:
            time.sleep(2)  # Esperar antes del siguiente intento
    
    logger.error(f"No se pudo extraer texto de {url} después de {max_retries} intentos")
    return f"[ERROR: No se pudo extraer texto de {url}]"

def identify_missing_docids():
    """
    Identifica qué DocIDs están en Notion pero no en Langsmith.
    """
    # Cargar datasets
    logger.info("Cargando datasets...")
    
    # Dataset de Notion actualizado
    notion_df = pd.read_csv('data/Dataset_notion_1620_01_08.csv')
    logger.info(f"Dataset de Notion cargado: {len(notion_df)} filas")
    
    # Dataset de Langsmith
    try:
        langsmith_chunks = []
        chunk_size = 1000
        
        for chunk in pd.read_csv('data/Dataset_langsmith_withID_1140_01_08.csv', chunksize=chunk_size):
            langsmith_chunks.append(chunk)
        
        langsmith_df = pd.concat(langsmith_chunks, ignore_index=True)
        logger.info(f"Dataset de Langsmith cargado: {len(langsmith_df)} filas")
    except Exception as e:
        logger.error(f"Error al cargar dataset de Langsmith: {e}")
        return [], None, None
    
    # Extraer DocIDs de Langsmith
    langsmith_df['doc_id'] = langsmith_df['input_question'].apply(extract_doc_id_from_input)
    langsmith_docids = set(langsmith_df['doc_id'].dropna())
    
    # DocIDs de Notion
    notion_docids = set(notion_df['ID'].dropna())
    
    # Encontrar DocIDs faltantes
    missing_docids = notion_docids - langsmith_docids
    
    logger.info(f"DocIDs en Notion: {len(notion_docids)}")
    logger.info(f"DocIDs en Langsmith: {len(langsmith_docids)}")
    logger.info(f"DocIDs faltantes en Langsmith: {len(missing_docids)}")
    
    return list(missing_docids), notion_df, langsmith_df

def enhance_langsmith_dataset():
    """
    Función principal que añade las filas faltantes al dataset de Langsmith.
    """
    # Identificar DocIDs faltantes
    missing_docids, notion_df, langsmith_df = identify_missing_docids()
    
    if not missing_docids:
        logger.info("No hay DocIDs faltantes. El dataset ya está completo.")
        return []
    
    logger.info(f"Procesando {len(missing_docids)} DocIDs faltantes...")
    
    # Lista para almacenar las nuevas filas
    new_rows = []
    successfully_added = []
    failed_docids = []
    
    # Procesar cada DocID faltante
    for i, doc_id in enumerate(missing_docids, 1):
        logger.info(f"Procesando DocID {doc_id} ({i}/{len(missing_docids)})")
        
        # Encontrar la fila correspondiente en Notion
        notion_row = notion_df[notion_df['ID'] == doc_id]
        
        if notion_row.empty:
            logger.warning(f"DocID {doc_id} no encontrado en Notion")
            failed_docids.append(doc_id)
            continue
        
        notion_row = notion_row.iloc[0]
        url = notion_row['URL']
        output_esperado = notion_row['Output esperado']
        
        # Hacer webscraping del texto completo
        full_text = scrape_text_from_url(url)
        
        if full_text is None:
            logger.error(f"No se pudo extraer texto para DocID {doc_id}")
            failed_docids.append(doc_id)
            continue
        
        # Crear la entrada con formato de Langsmith
        input_question = f"{doc_id}: {full_text}"
        output_output = output_esperado if pd.notna(output_esperado) else ""
        
        new_rows.append({
            'input_question': input_question,
            'output_output': output_output
        })
        
        successfully_added.append(doc_id)
        logger.info(f"DocID {doc_id} añadido exitosamente")
        
        # Pausa entre requests para ser respetuoso con los servidores
        time.sleep(1)
    
    # Añadir las nuevas filas al dataset de Langsmith
    if new_rows:
        new_rows_df = pd.DataFrame(new_rows)
        enhanced_langsmith_df = pd.concat([langsmith_df[['input_question', 'output_output']], new_rows_df], ignore_index=True)
        
        # Guardar el dataset mejorado
        output_file = 'data/Dataset_langsmith_enhanced.csv'
        enhanced_langsmith_df.to_csv(output_file, index=False)
        logger.info(f"Dataset mejorado guardado en: {output_file}")
        
        # Generar reporte
        generate_report(successfully_added, failed_docids, output_file)
    
    return successfully_added

def generate_report(successfully_added, failed_docids, output_file):
    """
    Genera un reporte de los DocIDs añadidos al dataset de Langsmith.
    """
    report_file = 'data/enhancement_report.txt'
    
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write("REPORTE DE MEJORA DEL DATASET DE LANGSMITH\n")
        f.write("=" * 50 + "\n\n")
        
        f.write(f"Fecha: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Archivo de salida: {output_file}\n\n")
        
        f.write(f"RESUMEN:\n")
        f.write(f"- DocIDs añadidos exitosamente: {len(successfully_added)}\n")
        f.write(f"- DocIDs que fallaron: {len(failed_docids)}\n")
        f.write(f"- Total procesados: {len(successfully_added) + len(failed_docids)}\n\n")
        
        if successfully_added:
            f.write("DOCIDS AÑADIDOS EXITOSAMENTE:\n")
            f.write("-" * 30 + "\n")
            for doc_id in sorted(successfully_added):
                f.write(f"✓ {doc_id}\n")
            f.write("\n")
        
        if failed_docids:
            f.write("DOCIDS QUE FALLARON:\n")
            f.write("-" * 20 + "\n")
            for doc_id in sorted(failed_docids):
                f.write(f"✗ {doc_id}\n")
            f.write("\n")
    
    logger.info(f"Reporte generado en: {report_file}")
    
    # Mostrar resumen en consola
    print("\n" + "=" * 50)
    print("REPORTE DE MEJORA DEL DATASET DE LANGSMITH")
    print("=" * 50)
    print(f"✓ DocIDs añadidos exitosamente: {len(successfully_added)}")
    print(f"✗ DocIDs que fallaron: {len(failed_docids)}")
    print(f"📁 Archivo de salida: {output_file}")
    print(f"📄 Reporte detallado: {report_file}")
    
    if successfully_added:
        print(f"\nPrimeros DocIDs añadidos: {', '.join(sorted(successfully_added)[:10])}")
        if len(successfully_added) > 10:
            print(f"... y {len(successfully_added) - 10} más")

if __name__ == "__main__":
    # Cambiar al directorio Evals
    script_dir = os.path.dirname(os.path.abspath(__file__))
    evals_dir = os.path.dirname(script_dir)
    os.chdir(evals_dir)
    print(f"Directorio de trabajo: {os.getcwd()}")
    
    # Ejecutar la mejora del dataset
    enhance_langsmith_dataset() 
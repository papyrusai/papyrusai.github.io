import pandas as pd
import requests
from bs4 import BeautifulSoup
import time
import re
from urllib.parse import urlparse
import logging
import io
import fitz  # PyMuPDF para PDFs
from PIL import Image
import tempfile
import os

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def is_pdf_url(url):
    """
    Determina si una URL apunta a un archivo PDF
    """
    return url.lower().endswith('.pdf') or 'pdf' in url.lower()

def extract_text_from_pdf(content):
    """
    Extrae texto de contenido PDF usando PyMuPDF
    """
    try:
        # Crear un documento PDF desde bytes
        pdf_document = fitz.open(stream=content, filetype="pdf")
        
        text_content = []
        # Extraer texto de las primeras páginas (máximo 2 para obtener 75 palabras)
        max_pages = min(2, pdf_document.page_count)
        
        for page_num in range(max_pages):
            page = pdf_document[page_num]
            text = page.get_text()
            
            if text.strip():
                text_content.append(text)
                
            # Si ya tenemos suficiente texto, parar
            total_words = len(' '.join(text_content).split())
            if total_words >= 100:  # Un poco más para asegurar 75 palabras limpias
                break
        
        pdf_document.close()
        
        # Unir todo el texto
        full_text = ' '.join(text_content)
        
        # Limpiar el texto
        full_text = re.sub(r'\s+', ' ', full_text)  # Normalizar espacios
        full_text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]', '', full_text)  # Quitar caracteres de control
        
        return full_text.strip()
        
    except Exception as e:
        logging.error(f"Error extrayendo texto del PDF: {str(e)}")
        return f"Error extrayendo texto del PDF: {str(e)[:100]}"

def extract_text_from_html(content, response):
    """
    Extrae texto de contenido HTML
    """
    try:
        # Detectar encoding
        response.encoding = response.apparent_encoding
        
        # Parsear HTML
        soup = BeautifulSoup(content, 'html.parser')
        
        # Remover scripts, estilos y otros elementos no deseados
        for element in soup(["script", "style", "nav", "header", "footer", "aside", "meta", "link"]):
            element.decompose()
        
        # Buscar el contenido principal
        main_content = None
        
        # Intentar encontrar elementos con contenido principal
        for selector in ['main', '[role="main"]', '.content', '.main-content', '#content', '.article', 'article']:
            main_content = soup.select_one(selector)
            if main_content and main_content.get_text(strip=True):
                break
        
        # Si no encontramos contenido principal, usar el body
        if not main_content:
            main_content = soup.find('body') or soup
        
        # Extraer texto
        text = main_content.get_text()
        
        # Limpiar texto
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)
        
        # Remover texto repetitivo común en sitios web
        text = re.sub(r'(skip to|saltar a|ir a|jump to).{0,50}(content|contenido|main|principal)', '', text, flags=re.IGNORECASE)
        text = re.sub(r'(cookies?|política de privacidad|aviso legal).{0,100}', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
        
    except Exception as e:
        logging.error(f"Error extrayendo texto del HTML: {str(e)}")
        return f"Error extrayendo texto del HTML: {str(e)[:100]}"

def extract_text_from_url(url, timeout=15):
    """
    Extrae texto de una URL, manejando PDFs y HTML apropiadamente
    """
    try:
        if not url or pd.isna(url) or url.strip() == '':
            return "URL no disponible"
        
        # Headers para simular un navegador
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        logging.info(f"Procesando URL: {url}")
        
        # Realizar petición HTTP
        response = requests.get(url, headers=headers, timeout=timeout, verify=False, stream=True)
        response.raise_for_status()
        
        # Obtener contenido
        content = response.content
        content_type = response.headers.get('content-type', '').lower()
        
        # Determinar si es PDF
        is_pdf = is_pdf_url(url) or 'application/pdf' in content_type
        
        if is_pdf:
            logging.info("Detectado PDF, extrayendo texto...")
            extracted_text = extract_text_from_pdf(content)
        else:
            logging.info("Detectado HTML, extrayendo texto...")
            extracted_text = extract_text_from_html(content, response)
        
        # Dividir en palabras y tomar las primeras 75
        words = extracted_text.split()
        first_75_words = ' '.join(words[:75])
        
        return first_75_words if first_75_words else "No se pudo extraer texto legible"
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Error de conexión para {url}: {str(e)}")
        return f"Error de conexión: {str(e)[:100]}"
    except Exception as e:
        logging.error(f"Error procesando {url}: {str(e)}")
        return f"Error: {str(e)[:100]}"

def process_csv(input_file, output_file):
    """
    Procesa el archivo CSV y actualiza la columna 'Texto 1'
    """
    try:
        # Leer CSV
        logging.info(f"Leyendo archivo: {input_file}")
        df = pd.read_csv(input_file)
        
        logging.info(f"Archivo cargado. Filas: {len(df)}")
        
        # Verificar que existe la columna URL
        if 'URL' not in df.columns:
            raise ValueError("No se encontró la columna 'URL' en el CSV")
        
        # Asegurar que existe la columna 'Texto 1'
        if 'Texto 1' not in df.columns:
            df['Texto 1'] = ''
        
        # Procesar cada fila
        for index, row in df.iterrows():
            url = row.get('URL', '')
            
            if pd.isna(url) or url.strip() == '':
                logging.info(f"Fila {index + 1}: URL vacía, saltando...")
                df.at[index, 'Texto 1'] = f"Doc{index + 1:02d}: URL no disponible"
                continue
            
            logging.info(f"Procesando fila {index + 1}/{len(df)}")
            
            # Extraer texto de la URL
            extracted_text = extract_text_from_url(url)
            
            # Formatear con prefijo
            formatted_text = f"Doc{index + 1:02d}: {extracted_text}"
            
            # Actualizar DataFrame (usar loc para evitar warnings)
            df.loc[index, 'Texto 1'] = formatted_text
            
            # Pausa para no sobrecargar los servidores
            time.sleep(2)
        
        # Guardar archivo actualizado
        logging.info(f"Guardando archivo actualizado: {output_file}")
        df.to_csv(output_file, index=False, encoding='utf-8')
        
        logging.info("Procesamiento completado exitosamente")
        return True
        
    except Exception as e:
        logging.error(f"Error procesando archivo: {str(e)}")
        return False

if __name__ == "__main__":
    input_file = "Evals/data/Dataset Lang 22b80a5aab318035886fe9953d822501_all.csv"
    output_file = "Evals/data/Dataset_processed_75words.csv"
    
    success = process_csv(input_file, output_file)
    
    if success:
        print(f"\n✅ Procesamiento completado!")
        print(f"📄 Archivo original: {input_file}")
        print(f"📄 Archivo actualizado: {output_file}")
        print(f"\n🔧 Mejoras implementadas:")
        print(f"   • Extracción correcta de texto de PDFs")
        print(f"   • Manejo mejorado de páginas web")
        print(f"   • Limpieza de texto más robusta")
        print(f"   • Detección automática de tipo de contenido")
    else:
        print(f"\n❌ Error durante el procesamiento. Revisa los logs para más detalles.")

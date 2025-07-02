import os
import pymongo
from dotenv import load_dotenv
import google.generativeai as genai
import logging
import sys
import json
import time
import requests
import io
import pypdf
from bs4 import BeautifulSoup
from bson import ObjectId
import re

# Configure UTF-8 encoding for stdout
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
elif hasattr(sys.stdout, 'buffer'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

# Configure logging with UTF-8 support
# Basic configuration, will be enhanced in main
logging.basicConfig(
    level=logging.INFO, 
    format='%(message)s', # Simplified format, details will be in the message
    handlers=[
        logging.StreamHandler(sys.stderr) # Use stderr for logs
    ]
)

# Ensure stderr also uses UTF-8
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Load environment variables from .env file
load_dotenv()

# MongoDB configuration
DB_URI = os.getenv("DB_URI")
DB_NAME = os.getenv("DB_NAME")

# Gemini API configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logging.error("GEMINI_API_KEY not found in .env file!")
    raise ValueError("GEMINI_API_KEY not found in .env file. Please set it.")
else:
    logging.info("GEMINI_API_KEY found in .env file")

# Set up the Gemini model
try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash')
    logging.info("Gemini model initialized successfully with gemini-2.5-flash")
except Exception as e:
    logging.exception(f"Error initializing Gemini model: {e}")
    model = None

def connect_to_mongodb():
    """Connects to MongoDB and returns the database object."""
    try:
        client = pymongo.MongoClient(DB_URI)
        db = client[DB_NAME]
        logging.info(f"Connected to MongoDB database: {DB_NAME}")
        return db
    except pymongo.errors.ConnectionFailure as e:
        logging.error(f"Could not connect to MongoDB: {e}")
        return None

def ask_gemini_marketing(prompt):
    """Asks Gemini to generate marketing content and returns the response."""
    if not model:
        logging.error("ERROR: El modelo de Gemini no está inicializado.")
        return None
    try:
        # The detailed prompt logging is now handled in the main function
        response = model.generate_content(prompt)
        logging.info("   [+] LLamada a la API de Gemini finalizada con éxito.")
        return response.text
    except Exception as e:
        logging.error(f"   [!] Error al consultar a Gemini: {e}")
        return None

def download_and_extract_text_from_pdf(pdf_url):
    """Downloads a PDF from a URL and extracts the text content."""
    try:
        logging.info(f"   -> Descargando y extrayendo texto del PDF: {pdf_url}")
        response = requests.get(pdf_url, stream=True, timeout=20)
        response.raise_for_status()
        pdf_file = io.BytesIO(response.content)
        reader = pypdf.PdfReader(pdf_file)
        text = "".join(page.extract_text() for page in reader.pages)
        if text.strip():
            logging.info("      +-- Éxito en extracción de texto de PDF.")
            return text
        else:
            logging.warning("      +-- PDF leído pero no se pudo extraer texto.")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"      +-- Error descargando PDF: {e}")
        return None
    except Exception as e:
        logging.exception(f"      +-- Error procesando PDF: {e}")
        return None

def scrape_text_from_html(html_url):
    """Scrapes clean text content from an HTML URL."""
    try:
        logging.info(f"   -> Haciendo web scraping de HTML: {html_url}")
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'}
        response = requests.get(html_url, timeout=20, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Eliminar elementos no deseados
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
        
        text = soup.get_text(separator=' ', strip=True)
        if text:
            logging.info("      +-- Éxito en web scraping.")
            return text
        else:
            logging.warning("      +-- HTML leído pero no se pudo extraer texto.")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"      +-- Error en la solicitud HTML: {e}")
        return None
    except Exception as e:
        logging.exception(f"      +-- Error en web scraping: {e}")
        return None

def get_user_tag_definitions(user_id, db_cache={}):
    """Retrieve tag definitions for a given user from MongoDB, using a simple in-memory cache."""
    logging.info(f"[TAG_DEF] Solicitando definiciones para userId: {user_id}")
    if user_id in db_cache:
        logging.info("[TAG_DEF] Resultado obtenido de caché")
        return db_cache[user_id]
    db = connect_to_mongodb()
    if db is None:
        logging.warning("[TAG_DEF] No se pudo conectar a MongoDB, devolviendo vacío")
        return {}
    try:
        user_doc = db['users'].find_one({"_id": ObjectId(user_id)}, {"etiquetas_personalizadas": 1})
        if user_doc is None:
            logging.warning("[TAG_DEF] No se encontró usuario con ese ID en la colección users")
            db_cache[user_id] = {}
            return {}
        definitions = user_doc.get('etiquetas_personalizadas', {})
        logging.info(f"[TAG_DEF] Definiciones recuperadas ({len(definitions)} keys)")
        db_cache[user_id] = definitions
        return definitions
    except Exception as e:
        logging.error(f"[TAG_DEF] Error al buscar definiciones de usuario: {e}")
        db_cache[user_id] = {}
        return {}

def _normalize_tag(tag):
    """Utility to normalize tag names for case-insensitive matching and trimming."""
    return re.sub(r"\s+", " ", tag.strip().lower()) if isinstance(tag, str) else tag

def build_marketing_prompt(documents, instructions, language, document_type, idioma='español'):
    """Builds the marketing prompt based on the provided documents and settings."""
    
    # Prepare document information
    documents_info = ""
    for i, doc in enumerate(documents, 1):
        
        # Información de etiquetas personalizadas
        custom_tags_info = "No se encontraron etiquetas personalizadas con impacto para este documento."
        if doc.get('etiquetas_personalizadas'):
            custom_tags_info = "Análisis de Impacto (según tus etiquetas personalizadas):\n"
            for tag in doc['etiquetas_personalizadas']:
                custom_tags_info += f"""- Etiqueta: {tag.get('nombre', 'N/A')}
  - Definición: {tag.get('definicion', tag.get('explicacion', 'N/A'))}
  - Nivel de Impacto: {tag.get('nivel_impacto', 'N/A')}
  - Explicación del Impacto: {tag.get('explicacion', 'N/A')}
"""

        # Extracto del texto completo
        full_text_excerpt = "No disponible."
        if doc.get('full_text'):
            lines = doc['full_text'].strip().splitlines()
            full_text_excerpt = "\n".join(lines[:2]) + ("..." if len(lines) > 2 else "")

        documents_info += f"""
-------------------------------------------------------------------
Documento {i}: {doc.get('short_name', 'Sin título')}
-------------------------------------------------------------------
- Metadatos Generales:
  - Fuente: {doc.get('collectionName', 'Fuente desconocida')}
  - Fecha: {doc.get('fecha', 'Fecha no disponible')}
  - Rango: {doc.get('rango', 'Rango no especificado')}
  - Resumen (metadata): {doc.get('resumen', 'Resumen no disponible')}
  - URL Original: {doc.get('url_pdf') or doc.get('url_html', 'No disponible')}

- Análisis de Impacto Personalizado:
{custom_tags_info}

- Texto Completo del Documento (Extracto para referencia):
{full_text_excerpt}
-------------------------------------------------------------------
"""

    # Language settings
    language_instruction = ""
    if language == "juridico":
        language_instruction = "Utiliza un lenguaje jurídico preciso y técnico, apropiado para profesionales del derecho."
    else:  # lego
        language_instruction = "Utiliza un lenguaje claro y accesible, evitando tecnicismos jurídicos complejos."

    # Document type settings
    document_structure = ""
    if document_type == "newsletter":
        document_structure = """
El contenido debe estructurarse como un newsletter con:
- Un título principal y general para todo el contenido, usando <h2>.
- A continuación, para cada documento analizado, DEBES crear una sección separada.
- Cada sección de documento DEBE empezar con un subtítulo propio en negrita (usando <b>) que resuma el tema de ese documento (ej: <b>Control Parlamentario y Rendición de Cuentas</b>).
- Después del análisis del documento, y antes de la siguiente sección, DEBES incluir la fuente en un párrafo separado.
- Párrafos concisos y fáciles de leer.
- Uso de listas con viñetas para destacar puntos clave.
- Un tono informativo pero engaging.
"""
    elif document_type == "whatsapp":
        document_structure = """
El contenido debe estructurarse como un mensaje corto de WhatsApp con:
- Un título principal breve usando <h2>.
- A continuación, para cada documento, una sección breve que comience con un subtítulo en negrita (<b>).
- Después de cada sección, incluir la "Fuente: {url_pdf del documento}".
- Mensaje muy directo y conciso (máximo 2-3 párrafos de 1-2 oraciones cada uno).
- Tono profesional pero accesible.
- Máximo 150 palabras total.
- Enfoque en la relevancia inmediata y práctica.
"""
    elif document_type == "linkedin":
        document_structure = """
El contenido debe estructurarse como un post de LinkedIn viral e informativo con:
- Un título principal y general para todo el post, usando <h2> con emojis relevantes.
- A continuación, para cada documento analizado, DEBES crear una sección separada.
- Cada sección de documento DEBE empezar con un subtítulo propio en negrita (usando <b>) que resuma el tema de ese documento (ej: <b>Nuevas Medidas de Transparencia Fiscal</b>).
- Después del análisis del documento, y antes de la siguiente sección, DEBES incluir la fuente en un párrafo separado.
- Párrafos cortos y directos (máximo 2-3 oraciones cada uno).
- Uso estratégico de emojis/iconos para mejorar la legibilidad (📊, ⚖️, 🔍, 💼, etc.).
- Tono profesional pero engaging, optimizado para viralidad.
- Hashtags relevantes al final si es apropiado.
- Máximo 300 palabras.
- Enfoque en insights valiosos y aplicabilidad práctica.
"""
    else:  # fallback to whatsapp
        document_structure = """
El contenido debe estructurarse como un mensaje corto de WhatsApp con:
- Un título principal breve usando <h2>.
- A continuación, para cada documento, una sección breve que comience con un subtítulo en negrita (<b>).
- Después de cada sección, incluir la "Fuente: {url_pdf del documento}".
- Mensaje muy directo y conciso (máximo 2-3 párrafos de 1-2 oraciones cada uno).
- Tono profesional pero accesible.
- Máximo 150 palabras total.
- Enfoque en la relevancia inmediata y práctica.
"""

    # Set word limit and structure based on document type
    if document_type == "whatsapp":
        word_limit = "150 palabras total"
        structure_rec = """   - Título principal con <h2> (incluir short_name y collection name)
   - Máximo 2-3 párrafos muy breves
   - Enfoque directo en la relevancia práctica"""
    elif document_type == "linkedin":
        word_limit = "300 palabras total"
        structure_rec = """   - Título principal con <h2> (incluir emojis relevantes)
   - Párrafos cortos y engaging
   - Uso estratégico de emojis en el contenido
   - Lista de puntos clave si es necesario
   - Enfoque en insights valiosos"""
    else:  # newsletter
        word_limit = "500 palabras total"
        structure_rec = """   - Título principal con <h2>
   - Introducción en 1-2 párrafos
   - Análisis de cada documento relevante
   - Conclusiones o puntos clave en lista"""

    # Build the complete prompt
    prompt = f"""Eres un experto en comunicación legal y marketing de contenidos. Tu tarea es generar contenido de alta calidad basándote en un análisis PROFUNDO de los siguientes documentos. Debes sintetizar la información del texto completo y el análisis de impacto, no solo repetir los metadatos. El objetivo es crear contenido personlizado, de impacto que sintetice la relevancia e implicaciones legales del documento analizado

**INSTRUCCIONES DEL USUARIO:**
{instructions}

**CONFIGURACIÓN DE LENGUAJE:**
{language_instruction}

**ESTRUCTURA DEL DOCUMENTO DE SALIDA:**
{document_structure}

**IDIOMA DE RESPUESTA:**
<idioma>Aunque las instrucciones del prompt son en español, es muy importante que formules toda tu respuesta en {idioma}</idioma>

**DOCUMENTOS A ANALIZAR (INFORMACIÓN DETALLADA):**
{documents_info}

**INSTRUCCIONES IMPORTANTES SOBRE FUENTES:**
- Cuando menciones o analices cada documento, DEBES incluir después del contenido del documento un párrafo con "Fuente: [URL del PDF]"
- Usa la URL exacta proporcionada en la información de cada documento (campo "URL del PDF")
- El formato debe ser: <p><b><i>Fuente:</i></b> <a href="[URL_EXACTA_DEL_DOCUMENTO]" target="_blank"><i>[URL_EXACTA_DEL_DOCUMENTO]</i></a></p>
- Si hay múltiples documentos, incluye la fuente correspondiente después de cada uno
- Los enlaces deben ser clickables y abrirse en una nueva pestaña

**FORMATO DE SALIDA OBLIGATORIO:**
Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{{
  "html_content": "contenido HTML aquí"
}}

**REGLAS PARA EL CONTENIDO HTML:**
1. **Etiquetas HTML permitidas:**
   - <h2> para el título principal (solo UNO)
   - <p> para párrafos (incluyendo las líneas de "Fuente:")
   - <ul> y <li> para listas con viñetas
   - <b> para texto en negrita (palabras clave importantes)
   - <i> para texto en cursiva (especialmente para "Fuente:" y enlaces)
   - <a> para enlaces clickables (con href y target="_blank")
   - <table>, <tr>, <th>, <td> para tablas si es necesario

2. **Estructura recomendada:**
{structure_rec}
   - Máximo {word_limit}
   - OBLIGATORIO: Incluir "Fuente: [URL]" después de cada documento mencionado

3. **NO uses:**
   - Markdown (*, _, #, etc.)
   - Otras etiquetas HTML no mencionadas
   - Saltos de línea innecesarios

**EJEMPLO DE RESPUESTA:**
{{
  "html_content": "<h2>Actualización Normativa Semanal</h2><p>Esta semana se han publicado <b>importantes cambios normativos</b> que afectan a diversos sectores.</p><p><b><i>Fuente:</i></b> <a href=\\"https://ejemplo.com/documento1.pdf\\" target=\\"_blank\\"><i>https://ejemplo.com/documento1.pdf</i></a></p><ul><li>Nueva regulación en materia fiscal.</li><li>Modificaciones en el ámbito laboral.</li></ul><p><b><i>Fuente:</i></b> <a href=\\"https://ejemplo.com/documento2.pdf\\" target=\\"_blank\\"><i>https://ejemplo.com/documento2.pdf</i></a></p><p>Estos cambios requieren <b>atención inmediata</b> por parte de las empresas afectadas.</p>"
}}

Genera el contenido siguiendo exactamente estas instrucciones."""

    return prompt

def main(documents_data, instructions, language, document_type, idioma='español'):
    """Main function to generate marketing content based on documents."""
    
    logging.info("\n" + "="*50)
    logging.info("  INICIANDO PROCESO DE ANÁLISIS Y GENERACIÓN")
    logging.info("="*50 + "\n")

    total_extraction_time = 0
    enriched_documents = []

    logging.info("-" * 50)
    logging.info(" PASO 1: EXTRACCIÓN DE TEXTO DE DOCUMENTOS")
    logging.info("-" * 50)

    for i, doc in enumerate(documents_data, 1):
        logging.info(f"\n[ PROCESANDO DOCUMENTO {i}/{len(documents_data)}: \"{doc.get('short_name', 'Sin título')}\" ]")
        logging.info(f"   >> RAW etiquetas_personalizadas: {type(doc.get('etiquetas_personalizadas'))} - {str(doc.get('etiquetas_personalizadas'))[:500]}")
        start_time = time.time()
        full_text = None
        source_used = "Ninguna"

        # --- Parse etiquetas_personalizadas structure and enrich with definitions ---
        parsed_tags = []
        if 'etiquetas_personalizadas' in doc and doc['etiquetas_personalizadas']:
            if isinstance(doc['etiquetas_personalizadas'], list):
                # Old format – already a list of dicts
                parsed_tags = doc['etiquetas_personalizadas']
            elif isinstance(doc['etiquetas_personalizadas'], dict):
                # New nested format {userId: { tagName: {explicacion, nivel_impacto} } }
                for uid, tag_obj in doc['etiquetas_personalizadas'].items():
                    logging.info(f"      >> Analizando etiquetas para userId: {uid}")
                    if not isinstance(tag_obj, dict):
                        logging.warning("      !! tag_obj no es un dict, se ignora")
                        continue
                    user_defs = get_user_tag_definitions(uid)
                    logging.info(f"      >> Definiciones recuperadas para userId {uid}: keys={list(user_defs.keys())[:10]}")
                    for tag_name, tag_info in tag_obj.items():
                        # Try to obtain definition (case-insensitive)
                        norm_tag = _normalize_tag(tag_name)
                        definicion = ''
                        if isinstance(user_defs, dict):
                            if tag_name in user_defs:
                                definicion = user_defs[tag_name]
                            else:
                                # case-insensitive lookup
                                for key, val in user_defs.items():
                                    if _normalize_tag(key) == norm_tag:
                                        definicion = val
                                        break
                        # Extract impacto / explicacion with fallbacks
                        if isinstance(tag_info, dict):
                            nivel_imp = tag_info.get('nivel_impacto', 'N/A')
                            explic = tag_info.get('explicacion', '')
                        elif isinstance(tag_info, str):
                            nivel_imp = 'N/A'
                            explic = tag_info
                        else:
                            nivel_imp = 'N/A'
                            explic = ''

                        logging.info(f"         -> Etiqueta encontrada: {tag_name} | Definición?: {'Sí' if definicion else 'No'} | Nivel: {nivel_imp} | Explicación: {explic[:60]}")

                        parsed_tags.append({
                            'nombre': tag_name,
                            'definicion': definicion,
                            'nivel_impacto': nivel_imp,
                            'explicacion': explic
                        })
        doc['etiquetas_personalizadas'] = parsed_tags  # standardise format for downstream

        # 1. Try PDF
        if doc.get('url_pdf'):
            pdf_text = download_and_extract_text_from_pdf(doc['url_pdf'])
            if pdf_text:
                full_text = pdf_text
                source_used = "PDF"

        # 2. Try HTML if PDF failed
        if not full_text and doc.get('url_html'):
            html_text = scrape_text_from_html(doc.get('url_html'))
            if html_text:
                full_text = html_text
                source_used = "HTML"
        
        # 3. Fallback to summary
        if not full_text:
            full_text = doc.get('resumen', '')
            source_used = "Resumen de metadatos (Fallback)"

        doc['full_text'] = full_text
        enriched_documents.append(doc)

        end_time = time.time()
        extraction_time = end_time - start_time
        total_extraction_time += extraction_time
        logging.info(f"   [+] Tiempo de extracción: {extraction_time:.2f} segundos. (Fuente: {source_used})")

    logging.info("\n" + "-"*50)
    logging.info(f" TIEMPO TOTAL DE EXTRACCIÓN: {total_extraction_time:.2f} segundos para {len(documents_data)} documentos")
    logging.info("-" * 50 + "\n")
    
    if not documents_data:
        logging.error("ERROR: No se proporcionaron documentos.")
        return {"success": False, "error": "No se proporcionaron documentos"}
    
    if not instructions.strip():
        logging.error("ERROR: No se proporcionaron instrucciones.")
        return {"success": False, "error": "No se proporcionaron instrucciones"}

    # Build the marketing prompt with enriched documents
    logging.info("="*50)
    logging.info(" PASO 2: CONSTRUCCIÓN DEL PROMPT PARA GEMINI")
    logging.info("="*50)
    
    # Log variables being sent to the API
    logging.info("\nVariables que se enviarán a la API para cada documento:")
    for i, doc in enumerate(enriched_documents, 1):
        logging.info(f"\n[ Documento {i}: \"{doc.get('short_name', 'N/A')}\" ]")
        
        # Log full text excerpt
        full_text_log = doc.get('full_text', '').strip().splitlines()
        logging.info(f"  - Texto Completo (2 primeras líneas): {' '.join(full_text_log[:2])}...")
        
        # Log custom tags
        if doc.get('etiquetas_personalizadas'):
            logging.info("  - Etiquetas de Impacto Personalizadas:")
            for tag in doc['etiquetas_personalizadas']:
                logging.info(f"    * Etiqueta: '{tag.get('nombre', 'N/A')}'")
                logging.info(f"      - Definición: {tag.get('definicion', tag.get('explicacion', 'N/A'))}")
                logging.info(f"      - Impacto: {tag.get('nivel_impacto', 'N/A')}")
                logging.info(f"      - Explicación: {tag.get('explicacion', 'N/A')}")
        else:
            logging.info("  - Etiquetas de Impacto Personalizadas: No se encontraron.")

    logging.info("\n[RESUMEN RAW DOCUMENTS INPUT] -> Primer documento recibido:\n" + json.dumps(documents_data[0], ensure_ascii=False)[:1000] if documents_data else "No documents_data")

    prompt = build_marketing_prompt(enriched_documents, instructions, language, document_type, idioma)
    
    logging.info("\n" + "="*50)
    logging.info(" PASO 3: LLAMADA A LA API DE GEMINI")
    logging.info("="*50 + "\n")

    api_start_time = time.time()
    gemini_response = ask_gemini_marketing(prompt)
    api_end_time = time.time()
    api_duration = api_end_time - api_start_time
    
    logging.info(f"\n   [+] Tiempo de respuesta de la API: {api_duration:.2f} segundos.")
    
    if gemini_response:
        try:
            # Clean the response (remove potential markdown fences)
            cleaned_response = gemini_response.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.startswith("```"):
                cleaned_response = cleaned_response[3:]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response[:-3]
            cleaned_response = cleaned_response.strip()

            logging.info(f"   [+] Respuesta de Gemini procesada (longitud: {len(cleaned_response)} caracteres).")

            # Parse JSON response
            response_data = json.loads(cleaned_response)
            html_content = response_data.get("html_content")

            if html_content:
                logging.info(f"   [+] Contenido HTML generado con éxito (longitud: {len(html_content)} caracteres).")
                logging.info("\n" + "="*50)
                logging.info("  PROCESO FINALIZADO CON ÉXITO")
                logging.info("="*50 + "\n")
                return {
                    "success": True,
                    "content": html_content
                }
            else:
                logging.error("   [!] ERROR: La clave 'html_content' no se encontró en la respuesta JSON de Gemini.")
                logging.error(f"      - Claves disponibles: {list(response_data.keys())}")
                return {
                    "success": False,
                    "error": "La respuesta no tiene el formato HTML esperado"
                }
                
        except json.JSONDecodeError as e:
            logging.error(f"   [!] ERROR: Fallo al decodificar la respuesta JSON de Gemini: {e}")
            logging.error(f"      - Respuesta en bruto de Gemini: {gemini_response}")
            return {
                "success": False,
                "error": "La respuesta del modelo no es un JSON válido"
            }
        except Exception as e:
            logging.exception(f"   [!] ERROR: Error inesperado al procesar la respuesta de Gemini: {e}")
            return {
                "success": False,
                "error": "Error inesperado al procesar la respuesta"
            }
    else:
        logging.error("   [!] ERROR: La API de Gemini no respondió o devolvió un error.")
        return {
            "success": False,
            "error": "El modelo de IA no respondió"
        }

if __name__ == "__main__":
    # This allows the script to be called directly for testing
    if len(sys.argv) > 1:
        # Parse command line arguments for testing
        try:
            test_data = json.loads(sys.argv[1])
            result = main(
                test_data.get('documents', []),
                test_data.get('instructions', ''),
                test_data.get('language', 'juridico'),
                test_data.get('documentType', 'whatsapp'),
                test_data.get('idioma', 'español')
            )
            # Print with UTF-8 encoding and ensure_ascii=False for Spanish characters
            print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            print(json.dumps(error_result, ensure_ascii=False, separators=(',', ':')))
    else:
        # Read from stdin when no arguments are provided (called from Node.js)
        try:
            # Read all input from stdin
            input_data = sys.stdin.read().strip()
            if input_data:
                test_data = json.loads(input_data)
                result = main(
                    test_data.get('documents', []),
                    test_data.get('instructions', ''),
                    test_data.get('language', 'juridico'),
                    test_data.get('documentType', 'whatsapp'),
                    test_data.get('idioma', 'español')
                )
                # Print with UTF-8 encoding and ensure_ascii=False for Spanish characters
                print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
            else:
                error_result = {"success": False, "error": "No input data provided"}
                print(json.dumps(error_result, ensure_ascii=False, separators=(',', ':')))
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            print(json.dumps(error_result, ensure_ascii=False, separators=(',', ':')))

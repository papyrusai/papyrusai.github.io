import os
import pymongo
from dotenv import load_dotenv
import google.generativeai as genai
import logging
import sys
import json

# Configure UTF-8 encoding for stdout
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
elif hasattr(sys.stdout, 'buffer'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

# Configure logging with UTF-8 support
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr)
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
    model = genai.GenerativeModel('gemini-2.0-flash-lite-preview-02-05')
    logging.info("Gemini model initialized successfully")
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
        logging.error("Gemini model is not initialized. Cannot ask Gemini.")
        return None
    try:
        logging.info(f"Sending marketing prompt to Gemini: {prompt[:200]}...")
        
        response = model.generate_content(prompt)
        logging.info("Gemini API call successful")

        return response.text
    except Exception as e:
        logging.exception(f"Error querying Gemini: {e}")
        return None

def build_marketing_prompt(documents, instructions, language, document_type):
    """Builds the marketing prompt based on the provided documents and settings."""
    
    # Prepare document information
    documents_info = ""
    for i, doc in enumerate(documents, 1):
        documents_info += f"""
Documento {i}:
- Título: {doc.get('short_name', 'Sin título')}
- Fuente: {doc.get('collectionName', 'Fuente desconocida')}
- Fecha: {doc.get('fecha', 'Fecha no disponible')}
- Rango: {doc.get('rango', 'Rango no especificado')}
- Resumen: {doc.get('resumen', 'Resumen no disponible')}
- Etiquetas: {', '.join(doc.get('etiquetas', [])) if doc.get('etiquetas') else 'Sin etiquetas'}

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
- Un título principal atractivo usando <h2>
- Secciones claramente diferenciadas para cada documento o tema
- Párrafos concisos y fáciles de leer
- Uso de listas con viñetas para destacar puntos clave
- Un tono informativo pero engaging
"""
    elif document_type == "whatsapp":
        document_structure = """
El contenido debe estructurarse como un mensaje corto de WhatsApp con:
- Un título principal breve usando <h2> con el short_name y collection name
- Máximo 2-3 párrafos muy concisos (1-2 oraciones cada uno)
- Mensaje directo al punto explicando por qué el documento es relevante
- Tono profesional pero accesible
- Máximo 150 palabras total
- Enfoque en la relevancia inmediata y práctica
"""
    elif document_type == "linkedin":
        document_structure = """
El contenido debe estructurarse como un post de LinkedIn viral e informativo con:
- Un título principal atractivo usando <h2> con emojis relevantes
- Párrafos cortos y directos (máximo 2-3 oraciones cada uno)
- Uso estratégico de emojis/iconos para mejorar la legibilidad (📊, ⚖️, 🔍, 💼, etc.)
- Tono profesional pero engaging, optimizado para viralidad
- Uso de listas con viñetas para destacar puntos clave
- Llamadas a la acción sutiles
- Hashtags relevantes al final si es apropiado
- Máximo 300 palabras
- Enfoque en insights valiosos y aplicabilidad práctica
"""
    else:  # fallback to whatsapp
        document_structure = """
El contenido debe estructurarse como un mensaje corto de WhatsApp con:
- Un título principal breve usando <h2> con el short_name y collection name
- Máximo 2-3 párrafos muy concisos (1-2 oraciones cada uno)
- Mensaje directo al punto explicando por qué el documento es relevante
- Tono profesional pero accesible
- Máximo 150 palabras total
- Enfoque en la relevancia inmediata y práctica
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
    prompt = f"""Eres un experto en comunicación legal y marketing de contenidos. Tu tarea es generar contenido de alta calidad basándote en los siguientes documentos normativos.

**INSTRUCCIONES DEL USUARIO:**
{instructions}

**CONFIGURACIÓN DE LENGUAJE:**
{language_instruction}

**ESTRUCTURA DEL DOCUMENTO:**
{document_structure}

**DOCUMENTOS A ANALIZAR:**
{documents_info}

**FORMATO DE SALIDA OBLIGATORIO:**
Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{{
  "html_content": "contenido HTML aquí"
}}

**REGLAS PARA EL CONTENIDO HTML:**
1. **Etiquetas HTML permitidas:**
   - <h2> para el título principal (solo UNO)
   - <p> para párrafos
   - <ul> y <li> para listas con viñetas
   - <b> para texto en negrita (palabras clave importantes)
   - <table>, <tr>, <th>, <td> para tablas si es necesario

2. **Estructura recomendada:**
{structure_rec}
   - Máximo {word_limit}

3. **NO uses:**
   - Markdown (*, _, #, etc.)
   - Otras etiquetas HTML no mencionadas
   - Saltos de línea innecesarios

**EJEMPLO DE RESPUESTA:**
{{
  "html_content": "<h2>Actualización Normativa Semanal</h2><p>Esta semana se han publicado <b>importantes cambios normativos</b> que afectan a diversos sectores.</p><ul><li>Nueva regulación en materia fiscal.</li><li>Modificaciones en el ámbito laboral.</li></ul><p>Estos cambios requieren <b>atención inmediata</b> por parte de las empresas afectadas.</p>"
}}

Genera el contenido siguiendo exactamente estas instrucciones."""

    return prompt

def main(documents_data, instructions, language, document_type):
    """Main function to generate marketing content based on documents."""
    logging.info(f"Starting marketing content generation with {len(documents_data)} documents")
    logging.info(f"Instructions: {instructions[:100]}...")
    logging.info(f"Language: {language}, Document type: {document_type}")
    
    if not documents_data:
        logging.error("No documents provided")
        return {"success": False, "error": "No se proporcionaron documentos"}
    
    if not instructions.strip():
        logging.error("No instructions provided")
        return {"success": False, "error": "No se proporcionaron instrucciones"}

    # Log document information for debugging
    for i, doc in enumerate(documents_data, 1):
        logging.info(f"Document {i}: {doc.get('short_name', 'No title')[:50]}...")

    # Build the marketing prompt
    prompt = build_marketing_prompt(documents_data, instructions, language, document_type)
    logging.info(f"Generated prompt length: {len(prompt)} characters")
    
    # Get response from Gemini
    gemini_response = ask_gemini_marketing(prompt)
    
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

            logging.info(f"Cleaned response length: {len(cleaned_response)} characters")

            # Parse JSON response
            response_data = json.loads(cleaned_response)
            html_content = response_data.get("html_content")

            if html_content:
                logging.info(f"Marketing content generated successfully, HTML length: {len(html_content)} characters")
                return {
                    "success": True,
                    "content": html_content
                }
            else:
                logging.error("Key 'html_content' not found in Gemini JSON output")
                logging.error(f"Available keys: {list(response_data.keys())}")
                return {
                    "success": False,
                    "error": "La respuesta no tiene el formato HTML esperado"
                }
                
        except json.JSONDecodeError as e:
            logging.error(f"Failed to decode JSON response from Gemini: {e}")
            logging.error(f"Raw Gemini response: {gemini_response}")
            logging.error(f"Cleaned response: {cleaned_response}")
            return {
                "success": False,
                "error": "La respuesta del modelo no es un JSON válido"
            }
        except Exception as e:
            logging.exception(f"Unexpected error processing Gemini response: {e}")
            return {
                "success": False,
                "error": "Error inesperado al procesar la respuesta"
            }
    else:
        logging.error("Gemini API did not respond")
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
                test_data.get('documentType', 'whatsapp')
            )
            # Print with UTF-8 encoding and ensure_ascii=False for Spanish characters
            print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            print(json.dumps(error_result, ensure_ascii=False, separators=(',', ':')))
    else:
        print("Usage: python marketing.py '<json_data>'")

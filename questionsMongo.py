import os
import pymongo
from dotenv import load_dotenv
import google.generativeai as genai
import logging
import sys
import requests
import io
import pypdf
import json

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables from .env file
load_dotenv()

# MongoDB configuration
DB_URI = os.getenv("DB_URI")
DB_NAME = os.getenv("DB_NAME")
DB_COLLECTION = os.getenv("DB_COLLECTION")

# Gemini API configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")  # Ensure this is set in your .env
if not GEMINI_API_KEY:
    logging.error("GEMINI_API_KEY not found in .env file!")  # Use logging.error
    raise ValueError("GEMINI_API_KEY not found in .env file.  Please set it.")
else:
    logging.info("GEMINI_API_KEY found in .env file")

# Set up the Gemini model
try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash-lite-preview-02-05')  # Specify the correct model here
    logging.info("Gemini model initialized successfully")  # Log initialization
except Exception as e:
    logging.exception(f"Error initializing Gemini model: {e}")  # Log the full exception
    model = None

def connect_to_mongodb():
    """Connects to MongoDB and returns the database and collection objects."""
    try:
        client = pymongo.MongoClient(DB_URI)
        db = client[DB_NAME]
        collection = db[DB_COLLECTION]
        logging.info(f"Connected to MongoDB database: {DB_NAME}, collection: {DB_COLLECTION}")
        return db, collection
    except pymongo.errors.ConnectionFailure as e:
        logging.error(f"Could not connect to MongoDB: {e}")
        return None, None

def get_pdf_url_from_mongodb(db, collection_name, id_value): #added db as param
    """Retrieves the PDF URL from the MongoDB document given the document ID ( _id field)."""
    try:
        collection = db[collection_name] #Added collecion
        document = collection.find_one({"_id": id_value}) # Find using _id
        if document and "url_pdf" in document:
            logging.info(f"Document with id '{id_value}' found.")
            return document["url_pdf"]
        else:
            logging.warning(f"Document with id '{id_value}' or url_pdf field not found.")
            return None
    except Exception as e:
        logging.exception(f"Error retrieving document from MongoDB: {e}")
        return None

def download_and_extract_text_from_pdf(pdf_url):
    """Downloads a PDF from a URL and extracts the text content."""
    try:
        logging.info(f"Downloading PDF from: {pdf_url}")
        response = requests.get(pdf_url, stream=True)
        response.raise_for_status()  # Raise an exception for bad status codes
        pdf_file = io.BytesIO(response.content)
        reader = pypdf.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        logging.info("Successfully extracted text from PDF.")
        return text
    except requests.exceptions.RequestException as e:
        logging.error(f"Error downloading PDF: {e}")
        return None
    except pypdf.errors.PdfReadError as e:
        logging.error(f"Error reading PDF: {e}")
        return None
    except Exception as e:
        logging.exception(f"Error processing PDF: {e}")
        return None

def ask_gemini(text, prompt):
    """Asks Gemini a question about the text and returns the response."""
    if not model:
        logging.error("Gemini model is not initialized. Cannot ask Gemini.")
        return None
    try:
        logging.info(f"Sending prompt to Gemini: {prompt[:100]}...")  # Log the first 100 chars of the prompt
        
        response = model.generate_content(
            f"{prompt}:\n\n{text}"
        )
        logging.info("Gemini API call successful")  # Log success

        return response.text
    except Exception as e:
        logging.exception(f"Error querying Gemini: {e}")
        return None

def main(document_id, user_prompt, collection_name): # Removed default value
    """Main function to connect, retrieve PDF URL, extract text, and ask Gemini."""
    logging.info(f"Starting main function with document_id: {document_id}")
    db, collection = connect_to_mongodb()
    if db is None or collection is None:
        logging.error("Failed to connect to MongoDB")
        return

    pdf_url = get_pdf_url_from_mongodb(db, collection_name, document_id) #Here is where we use user value
    if not pdf_url:
        logging.warning("No PDF URL found for document")
        return

    text = download_and_extract_text_from_pdf(pdf_url)
    if not text:
        logging.error("Failed to extract text from PDF")
        return

    system_prompt = """Eres un Asistente Legal de primer nivel, con profundo conocimiento en leyes y normativas. Tu tarea es analizar el documento PDF proporcionado y responder a la pregunta del usuario basándote *única y exclusivamente* en la información contenida en ese PDF.

**Instrucciones Críticas de Formato de Salida:**
1.  **OBLIGATORIO: Formato JSON Estricto:** Tu respuesta DEBE ser SIEMPRE un objeto JSON válido.
2.  **Esquema JSON Requerido:** El objeto JSON debe tener UNA SOLA CLAVE llamada `html_response`. El valor de esta clave DEBE ser un string conteniendo el fragmento de HTML bien formado.
3.  **Contenido del HTML (`html_response`):**
    *   El HTML debe seguir estas reglas: NO utilices NINGÚN OTRO FORMATO que no sea HTML para el valor de `html_response`. NO utilices Markdown dentro del string HTML.
    *   **Etiquetas HTML Permitidas y Uso (dentro del string `html_response`):**
        *   **Títulos Principales:** Usa UNA SOLA etiqueta `<h2>` para el título principal de tu respuesta. Ejemplo: `<h2>Análisis del Artículo 5</h2>`
        *   **Párrafos:** Envuelve cada párrafo de texto con etiquetas `<p>`. Ejemplo: `<p>El documento establece que...</p>`
        *   **Listas con Viñetas (Bullets):** Usa etiquetas `<ul>` para la lista y `<li>` para cada elemento. Ejemplo: `<ul><li>Primer punto.</li><li>Segundo punto.</li></ul>`
        *   **Texto en Negrita:** Usa etiquetas `<b>` para resaltar palabras o frases importantes. Ejemplo: `<p>Es <b>fundamental</b> considerar...</p>`
        *   **Tablas:** Para estructurar datos tabulares, puedes usar `<table>`, `<tr>`, `<th>` y `<td>`. Ejemplo: `<table><tr><th>Encabezado 1</th><th>Encabezado 2</th></tr><tr><td>Dato 1</td><td>Dato 2</td></tr></table>`
        *   **NO USES OTRAS ETIQUETAS HTML** (ej. no `<h3>`, `<a>`, `<span>`, `<div>`, etc.).
    *   **Prohibición de Markdown (dentro del string `html_response`):** NO uses sintaxis Markdown. No `*` o `_` para énfasis (usa `<b>`), no `#` para encabezados (usa `<h2>`), no `* ` para listas (usa `<ul><li>`), no `[texto](url)`.

**Contenido y Estilo de la Respuesta (para el HTML en `html_response`):**
4.  **Basado en el PDF:** No inventes información. Si la respuesta no está en el PDF, indícalo cortésmente (ej: `<p>El documento no proporciona información específica sobre este tema.</p>`).
5.  **Citas:** Cita referencias internas del PDF (artículos, secciones, etc.) cuando fundamentes tu respuesta.
6.  **Extensión:** Máximo aproximado de 300 palabras.
7.  **Estilo "Mike Ross":** Claro, analítico, preciso, lenguaje accesible pero demostrando conocimiento.
8.  **Resúmenes:** Si se pide un resumen, que sea preciso, ordenado y conciso.
9.  **Sensibilidad e Implicaciones:** Al evaluar el impacto de la ley en industrias, sectores o casos concretos, utiliza la información disponible en el PDF. Mantén un nivel mínimo de sensibilidad para inferir implicaciones, pero sin sesgos.
10. **Sin Opiniones Personales:** No ofrezcas opiniones personales ni especulaciones, realiza un análisis aséptico. Recuerda que tu respuesta debe estar respaldada por la información provista en el PDF. Cualquier tema no contemplado en el documento será declarado como "No disponible"

**Ejemplo de Respuesta JSON Esperada:**
```json
{
  "html_response": "<h2>Análisis de la Cláusula de Confidencialidad</h2><p>La cláusula de confidencialidad <b>(Sección 3.A)</b>, establece las obligaciones de las partes respecto a la información sensible compartida.</p><p>Los puntos clave incluyen:</p><ul><li>La definición de qué se considera <b>información confidencial</b>.</li><li>El período durante el cual las obligaciones de confidencialidad permanecen vigentes, que es de <b>cinco años</b> post-contrato.</li><li>Las excepciones permitidas para la divulgación de información.</li></ul><p>Es <b>crucial</b> que ambas partes comprendan y adhieran estrictamente a estas disposiciones para evitar incumplimientos.</p>"
}
```

**Recuerda: Tu salida debe ser únicamente el objeto JSON como el del ejemplo anterior, sin nada antes ni después. El string HTML dentro de `html_response` no debe contener saltos de línea innecesarios, solo el HTML puro.**
"""

    final_prompt = user_prompt + ". " + system_prompt

    gemini_response_json_str = ask_gemini(text, final_prompt)

    if gemini_response_json_str:
        try:
            # Strip potential markdown fences before parsing
            cleaned_json_str = gemini_response_json_str.strip()
            if cleaned_json_str.startswith("```json"):
                cleaned_json_str = cleaned_json_str[7:] # Remove ```json
            if cleaned_json_str.startswith("```"):
                 cleaned_json_str = cleaned_json_str[3:] # Remove ``` (if ```json wasn't caught)
            if cleaned_json_str.endswith("```"):
                cleaned_json_str = cleaned_json_str[:-3]
            cleaned_json_str = cleaned_json_str.strip() # clean any trailing/leading whitespaces after stripping

            gemini_data = json.loads(cleaned_json_str)
            html_output = gemini_data.get("html_response")

            if html_output:
                # Set stdout to use utf-8 encoding
                sys.stdout.reconfigure(encoding='utf-8')
                
                print(html_output)  # Print only the HTML content
                logging.info("Gemini HTML response printed to standard output")
            else:
                logging.error("Key 'html_response' not found in Gemini JSON output.")
                print("Error: La respuesta del análisis no tiene el formato HTML esperado.")
        except json.JSONDecodeError as e:
            logging.error(f"Failed to decode JSON response from Gemini: {e}")
            logging.error(f"Raw Gemini response: {gemini_response_json_str}") # Log the original raw response
            logging.error(f"Cleaned JSON string attempt: {cleaned_json_str}") # Log the string we tried to parse
            print("Error: La respuesta del análisis no es un JSON válido.")
        except Exception as e:
            logging.exception(f"An unexpected error occurred while processing Gemini response: {e}")
            print("Error: Ocurrió un error inesperado al procesar la respuesta del análisis.")
    else:
        print("Error: Gemini did not respond.")  # print error
        logging.error("Gemini API did not respond.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        document_id = sys.argv[1]
        user_prompt = sys.argv[2] if len(sys.argv) > 2 else "Realiza un resumen" # added get user prompt
        collection_name = sys.argv[3] if len(sys.argv) > 3 else "BOE"
        main(document_id,user_prompt, collection_name) # call main
    else:
        logging.warning("No document_id provided when running directly.")
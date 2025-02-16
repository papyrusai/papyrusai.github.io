import os
import pymongo
from dotenv import load_dotenv
import google.generativeai as genai
import logging
import sys
import requests  # For downloading the PDF
import io  # For handling the PDF in memory
import pypdf  # For extracting text from the PDF

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

def get_pdf_url_from_mongodb(collection, document_id="_id", id_value="BOE-A-2025-2144"):
    """Retrieves the PDF URL from the MongoDB document."""
    try:
        document = collection.find_one({document_id: id_value})
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
    try:
        logging.info(f"Sending prompt to Gemini: {prompt[:100]}...")  # Log the first 100 chars of the prompt
        response = model.generate_content(f"{prompt}:\n\n{text}")
        logging.info("Gemini API call successful")  # Log success

        return response.text
    except Exception as e:
        logging.exception(f"Error querying Gemini: {e}")
        return None

def main(document_id="BOE-A-2025-2144", user_prompt="Realiza un resumen"):  # Make document_id an argument
    """Main function to connect, retrieve PDF URL, extract text, and ask Gemini."""
    logging.info(f"Starting main function with document_id: {document_id}")
    db, collection = connect_to_mongodb()
    if db is None or collection is None:
        logging.error("Failed to connect to MongoDB")
        return

    pdf_url = get_pdf_url_from_mongodb(collection, document_id=document_id)
    if not pdf_url:
        logging.warning("No PDF URL found for document")
        return

    text = download_and_extract_text_from_pdf(pdf_url)
    if not text:
        logging.error("Failed to extract text from PDF")
        return

    system_prompt = """No alucines, toda información que contestes debe estar incluida en el documento. Por favor cita los artículos de referencia del documento relacionados con la cuestión jurídica solicitada. Por favor, formatea tu respuesta como un documento HTML sencillo, incluyendo:

        1.  Párrafos encerrados en etiquetas `<p>`.
        2.  Subtítulos de sección encerrados en etiquetas `<h2>`.
        3.  Listas de puntos importantes encerradas en etiquetas `<ul>` y `<li>`.
        4. Utiliza etiquetas `<b>` para resaltar palabras importantes.
         5. Extensón máxima 300 palabras
        """

    final_prompt = user_prompt + ". " + system_prompt

    gemini_response = ask_gemini(text, final_prompt)

    if gemini_response:
        print(gemini_response)  # Just print the HTML response
        logging.info("Gemini response printed to standard output")

    else:
        print("Error: Gemini did not respond.")  # print error
        logging.error("Gemini API did not respond.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        document_id = sys.argv[1]
        user_prompt = sys.argv[2] if len(sys.argv) > 2 else "Realiza un resumen" # added get user prompt
        main(document_id,user_prompt) # call main
    else:
        logging.warning("No document_id provided when running directly.")
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
import hashlib
import time  # Add timing

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
    model = genai.GenerativeModel('gemini-2.5-flash')  # Specify the correct model here
    logging.info("Gemini model initialized successfully with gemini-2.5-flash")
except Exception as e:
    logging.exception(f"Error initializing Gemini model: {e}")
    model = None

# Global reusable MongoDB client to avoid repeated SRV lookups
_mongo_client = None

# Performance timing
_timings = []

def _mark(step: str):
    _timings.append((step, time.perf_counter()))

def connect_to_mongodb():
    """Connects to MongoDB reusing a global client and returns the database object."""
    global _mongo_client
    try:
        if _mongo_client is None:
            # Use shorter timeouts to fail fast if DNS/connection issue
            _mongo_client = pymongo.MongoClient(
                DB_URI,
                serverSelectionTimeoutMS=10000,   # 10s for DNS & initial handshake
                connectTimeoutMS=10000,
                socketTimeoutMS=20000,
                retryWrites=False  # Avoid extra retries that add latency
            )
        db = _mongo_client[DB_NAME]
        logging.info(f"Connected (or reused connection) to MongoDB database: {DB_NAME}")
        return db
    except pymongo.errors.ConnectionFailure as e:
        logging.error(f"Could not connect to MongoDB: {e}")
        return None

def get_pdf_url_from_mongodb(db, collection_name, id_value): #added db as param
    """Retrieves the PDF URL from the MongoDB document given the document ID ( _id field)."""
    try:
        collection = db[collection_name] #Added collecion
        document = collection.find_one({"_id": id_value}) # Find using _id
        if document:
            logging.info(f"Document with id '{id_value}' found.")
            
            # Priority 1: Check for "contenido" field first
            if "contenido" in document and document["contenido"]:
                logging.info("Found 'contenido' field in document. Using direct text content.")
                return {
                    "type": "contenido",
                    "content": document["contenido"]
                }
            
            # Priority 2: Check for "url_pdf" field
            if "url_pdf" in document and document["url_pdf"]:
                logging.info("Found 'url_pdf' field in document. Using PDF URL.")
                return {
                    "type": "url_pdf",
                    "url": document["url_pdf"]
                }
            
            # Priority 3: Check for "url_html" field
            if "url_html" in document and document["url_html"]:
                logging.info("Found 'url_html' field in document. Using HTML URL.")
                return {
                    "type": "url_html",
                    "url": document["url_html"]
                }
            
            # If none of the content sources are available
            logging.warning(f"Document with id '{id_value}' found but no content sources available (contenido, url_pdf, url_html).")
            return None
        else:
            logging.warning(f"Document with id '{id_value}' not found.")
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
        print("PDF_ACCESS_ERROR")
        return None
    except pypdf.errors.PdfReadError as e:
        logging.error(f"Error reading PDF: {e}")
        print("PDF_ACCESS_ERROR")
        return None
    except Exception as e:
        logging.exception(f"Error processing PDF: {e}")
        print("PDF_ACCESS_ERROR")
        return None

def ask_gemini(text, prompt):
    """Asks Gemini a question about the text and returns the response."""
    if not model:
        logging.error("Gemini model is not initialized. Cannot ask Gemini.")
        return None
    try:
        content_hash = hashlib.md5(f"{prompt}:{text}".encode('utf-8')).hexdigest()
        logging.info(f"Processing content with hash: {content_hash}")
        logging.info(f"Sending prompt to Gemini: {prompt[:100]}...")

        # Use the most direct and stable configuration for determinism
        generation_config = genai.GenerationConfig(
            candidate_count=1,
            temperature=0.0,
            top_p=1.0,
            top_k=1
        )

        # Set safety settings to be less restrictive to reduce variability
        safety_settings = {
            'HARM_CATEGORY_HARASSMENT': 'BLOCK_ONLY_HIGH',
            'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_ONLY_HIGH',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_ONLY_HIGH',
            'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_ONLY_HIGH',
        }

        logging.info(f"Using generation config: {generation_config} and safety_settings: {safety_settings}")

        response = model.generate_content(
            f"{prompt}:\n\n{text}",
            generation_config=generation_config,
            safety_settings=safety_settings
        )
        
        logging.info("Gemini API call successful")
        if response.text:
            response_hash = hashlib.md5(response.text.encode('utf-8')).hexdigest()
            logging.info(f"Response received. Length: {len(response.text)}, Hash: {response_hash}")

        return response.text
    except Exception as e:
        logging.exception(f"Error querying Gemini: {e}")
        return None

def main(document_id, user_prompt, collection_name, html_content=None): # Added html_content parameter
    """Main function to connect, retrieve PDF URL, extract text, and ask Gemini."""
    _mark('script_start')
    logging.info(f"Starting main function with document_id: {document_id}")
    
    # Set stdout to use utf-8 encoding at the beginning to handle all outputs
    sys.stdout.reconfigure(encoding='utf-8')
    
    # If HTML content is provided directly, use it instead of fetching from MongoDB
    if html_content:
        logging.info("Using provided HTML content for analysis")
        text = html_content
    else:
        _mark('mongo_connect_start')
        db = connect_to_mongodb()
        _mark('mongo_connect_end')
        if db is None:
            logging.error("Failed to connect to MongoDB")
            return

        _mark('fetch_content_start')
        content_info = get_pdf_url_from_mongodb(db, collection_name, document_id)
        _mark('fetch_content_end')
        if not content_info:
            logging.warning("No content sources found for document")
            return

        # Handle different content types based on priority
        if content_info["type"] == "contenido":
            # Priority 1: Use direct text content from database
            logging.info("Using direct text content from 'contenido' field")
            text = content_info["content"]
        elif content_info["type"] == "url_pdf":
            # Priority 2: Download and extract text from PDF
            logging.info("Using PDF URL to extract text")
            _mark('download_pdf_start')
            text = download_and_extract_text_from_pdf(content_info["url"])
            _mark('download_pdf_end')
            if not text:
                logging.error("Failed to extract text from PDF")
                return
        elif content_info["type"] == "url_html":
            # Priority 3: For HTML URLs, we need to inform the caller to handle webscraping
            logging.info("HTML URL found - this should be handled by webscraping in the frontend")
            # For now, this case should not happen as the frontend handles HTML URLs
            # through the webscraping endpoint before calling this script
            logging.warning("HTML URL handling not implemented in this script")
            return
        else:
            logging.error(f"Unknown content type: {content_info['type']}")
            return

    _mark('gemini_call_start')
    response_text = ask_gemini(text, user_prompt)
    _mark('gemini_call_end')

    if response_text is not None:
        print(response_text)
    else:
        print("Error: Gemini did not respond.")

    # Final timing output
    _mark('script_end')
    if len(_timings) > 1:
        base = _timings[0][1]
        logging.info("\n=== PERFORMANCE TIMINGS (ms) ===")
        logging.info(f"{'Step':35} | Duration")
        logging.info("-"*50)
        for i in range(1, len(_timings)):
            step_name = _timings[i][0]
            duration_ms = (_timings[i][1] - _timings[i-1][1]) * 1000
            logging.info(f"{step_name:35} | {duration_ms:8.1f}")
        total_ms = (_timings[-1][1] - base) * 1000
        logging.info("-"*50)
        logging.info(f"{'TOTAL':35} | {total_ms:8.1f}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        document_id = sys.argv[1]
        user_prompt = sys.argv[2] if len(sys.argv) > 2 else "Realiza un resumen" # added get user prompt
        collection_name = sys.argv[3] if len(sys.argv) > 3 else "BOE"
        html_content = sys.argv[4] if len(sys.argv) > 4 else None # added html_content parameter
        main(document_id, user_prompt, collection_name, html_content) # call main with html_content
    else:
        logging.warning("No document_id provided when running directly.")
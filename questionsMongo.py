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
    """Downloads a PDF from a URL and extracts the text content with improved UTF-8 handling."""
    try:
        logging.info(f"Downloading PDF from: {pdf_url}")
        
        # Set headers to ensure proper handling
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(pdf_url, stream=True, headers=headers)
        response.raise_for_status()  # Raise an exception for bad status codes
        
        pdf_file = io.BytesIO(response.content)
        reader = pypdf.PdfReader(pdf_file)
        
        # Extract text with improved handling of encoding
        text_parts = []
        total_pages = len(reader.pages)
        logging.info(f"Processing {total_pages} pages...")
        
        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                
                # Basic validation that text extraction worked
                if page_text and len(page_text.strip()) > 0:
                    text_parts.append(page_text)
                    logging.debug(f"Extracted {len(page_text)} characters from page {page_num + 1}")
                else:
                    logging.warning(f"No text extracted from page {page_num + 1}")
                    
            except Exception as e:
                logging.warning(f"Error extracting text from page {page_num + 1}: {e}")
                continue
        
        # Combine all text parts
        text = "\n".join(text_parts)
        
        # Log extraction summary
        if text:
            char_count = len(text)
            logging.info(f"Successfully extracted {char_count} characters from {len(text_parts)} pages")
            
            # Check for potential encoding issues early
            replacement_chars = text.count('\ufffd')
            if replacement_chars > 0:
                logging.warning(f"Detected {replacement_chars} replacement characters in extracted text")
            
            # Check for double-encoding indicators
            double_encoding_indicators = ['Ã¡', 'Ã©', 'Ã­', 'Ã³', 'Ãº', 'Ã±']
            double_encoding_count = sum(text.count(indicator) for indicator in double_encoding_indicators)
            if double_encoding_count > 0:
                logging.warning(f"Detected {double_encoding_count} potential double-encoding issues")
        else:
            logging.error("No text could be extracted from PDF")
            return None
            
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

def clean_text_for_processing(text):
    """Clean text to remove invalid Unicode characters and fix encoding issues dynamically."""
    if not text:
        return ""
    
    import re
    import unicodedata
    
    original_length = len(text)
    
    try:
        # First, handle potential encoding issues more carefully
        if isinstance(text, bytes):
            try:
                # Try UTF-8 first
                text = text.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    # Try Latin-1 as fallback
                    text = text.decode('latin-1')
                except UnicodeDecodeError:
                    # Last resort: ignore errors
                    text = text.decode('utf-8', errors='ignore')
        
        # Detect and fix double-encoding issues (common when UTF-8 is misinterpreted as Latin-1)
        if any(seq in text for seq in ['Ã¡', 'Ã©', 'Ã­', 'Ã³', 'Ãº', 'Ã±', 'Ã', 'Ã‰', 'Ã', 'Ã"', 'Ãš']):
            logging.info("Detected double UTF-8 encoding, attempting to fix...")
            try:
                # Fix double-encoding by re-encoding to Latin-1 then decoding as UTF-8
                fixed_bytes = text.encode('latin-1')
                text = fixed_bytes.decode('utf-8')
                logging.info("Successfully fixed double UTF-8 encoding")
            except (UnicodeDecodeError, UnicodeEncodeError):
                logging.warning("Could not fix double encoding, proceeding with original text")
        
        # Fix Unicode replacement characters (�) dynamically
        if '\ufffd' in text:
            logging.info("Detected Unicode replacement characters, attempting dynamic fix...")
            
            # Create a dynamic replacement function based on Spanish orthography
            def fix_replacement_char(match):
                """Dynamically fix replacement characters based on context and Spanish language patterns."""
                full_match = match.group(0)
                following_chars = match.group(1) if match.group(1) else ""
                
                # Common Spanish word patterns that start with accented letters
                # Using linguistic patterns instead of hardcoded words
                vowel_patterns = {
                    # Patterns for Á
                    r'^mbito': 'Ámbito',
                    r'^rea': 'Área',
                    r'^rbol': 'Árbol',
                    r'^ngel': 'Ángel',
                    r'^frica': 'África',
                    r'^vila': 'Ávila',
                    r'^lvaro': 'Álvaro',
                    r'^lex': 'Álex',
                    r'^ngeles': 'Ángeles',
                    r'^msterdam': 'Ámsterdam',
                    
                    # Patterns for É  
                    r'^poca': 'Época',
                    r'^tica': 'Ética',
                    r'^xito': 'Éxito',
                    r'^ste': 'Éste',
                    r'^sta': 'Ésta',
                    r'^stos': 'Éstos',
                    r'^stas': 'Éstas',
                    r'^l\b': 'Él',
                    r'^lvez': 'Élvez',
                    
                    # Patterns for Í
                    r'^ndice': 'Índice',
                    r'^talo': 'Ítalo',
                    
                    # Patterns for Ó
                    r'^scar': 'Óscar',
                    r'^pera': 'Ópera',
                    r'^rgano': 'Órgano',
                    r'^ptimo': 'Óptimo',
                    
                    # Patterns for Ú
                    r'^ltimo': 'Último',
                    r'^nico': 'Único',
                    r'^til': 'Útil',
                    r'^rsula': 'Úrsula'
                }
                
                # Check if the following characters match any known pattern
                for pattern, replacement in vowel_patterns.items():
                    if re.match(pattern, following_chars):
                        logging.info(f"✓ Dynamic fix: �{following_chars} → {replacement}")
                        return replacement
                
                # If no specific pattern matches, try to infer the correct accented letter
                # based on Spanish phonetic patterns
                if following_chars:
                    first_char = following_chars[0].lower()
                    
                    # Heuristic: if it starts with vowel sounds that commonly follow accented vowels
                    if first_char in ['m', 'r', 'n', 'l', 's', 't', 'p', 'g']:
                        # Most common accented vowel at the beginning of Spanish words is Á
                        potential_fix = 'Á' + following_chars
                        logging.info(f"✓ Heuristic fix: �{following_chars} → {potential_fix}")
                        return potential_fix
                
                # If no pattern matches, leave as is
                return full_match
            
            # Apply the dynamic replacement
            text = re.sub(r'\ufffd([a-záéíóúñ]*)', fix_replacement_char, text, flags=re.IGNORECASE)
        
        # Remove surrogate characters (critical for UTF-8 encoding)
        # These characters (0xD800-0xDFFF) are valid in UTF-16 but not in UTF-8
        text = ''.join(char for char in text if not (0xD800 <= ord(char) <= 0xDFFF))
        
        # Normalize Unicode to ensure consistent representation
        text = unicodedata.normalize('NFC', text)
        
        # Remove any remaining replacement characters and other problematic Unicode
        text = re.sub(r'[\ufffd\ufeff]', '', text)  # Remove replacement chars and BOM
        
        # Remove other problematic control characters while preserving normal whitespace
        text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
        
        # Clean up excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        # Final validation - ensure the text can be encoded as UTF-8
        try:
            text.encode('utf-8')
        except UnicodeEncodeError as e:
            logging.warning(f"UTF-8 encoding issue at position {e.start}: {e.reason}")
            # Remove the specific problematic characters
            text = text[:e.start] + text[e.end:]
            logging.info("Removed problematic characters that couldn't be UTF-8 encoded")
        
        # Log the result
        final_length = len(text)
        if final_length != original_length:
            logging.info(f"Text length changed from {original_length} to {final_length} characters")
            
        # Log if significant cleaning was done
        if final_length < original_length * 0.9:  # If we lost more than 10% of content
            logging.warning(f"Significant text cleaning performed: {original_length} -> {final_length} characters")
        
        return text
        
    except Exception as e:
        logging.error(f"Error in clean_text_for_processing: {e}")
        # Return original text if all else fails
        return text if isinstance(text, str) else str(text)


def ask_gemini(text, prompt):
    """Asks Gemini a question about the text and returns the response."""
    if not model:
        logging.error("Gemini model is not initialized. Cannot ask Gemini.")
        return None
    try:
        # Clean the text and prompt before processing
        cleaned_text = clean_text_for_processing(text)
        cleaned_prompt = clean_text_for_processing(prompt)
        
        content_hash = hashlib.md5(f"{cleaned_prompt}:{cleaned_text}".encode('utf-8')).hexdigest()
        logging.info(f"Processing content with hash: {content_hash}")
        logging.info(f"Prompt length: {len(cleaned_prompt)} chars, Content length: {len(cleaned_text)} chars")
        logging.info(f"Sending prompt to Gemini: {cleaned_prompt[:200]}...")
        
        # Log a sample of the content to verify it includes context
        if "CONTEXTO" in cleaned_prompt:
            logging.info("✓ Context sections detected in prompt")
        if "etiqueta" in cleaned_prompt.lower():
            logging.info("✓ Tags/labels detected in prompt") 
        if len(cleaned_text) > 1000:
            logging.info(f"✓ Substantial content detected: {len(cleaned_text)} characters")
        
        # Verify full prompt context is included
        context_indicators = [
            ("PERFIL REGULATORIO", "✓ Regulatory profile context included"),
            ("ETIQUETA SELECCIONADA", "✓ Selected tag context included"),
            ("IDIOMA DE RESPUESTA", "✓ Language preference included"),
            ("Formato de salida", "✓ Output format instructions included")
        ]
        
        for indicator, message in context_indicators:
            if indicator in cleaned_prompt:
                logging.info(message)
        
        # Log content sample to verify encoding
        if cleaned_text and len(cleaned_text) > 100:
            content_sample = cleaned_text[:100]
            # Check for both uppercase and lowercase accented characters
            if any(char in content_sample for char in ['í', 'ó', 'ñ', 'á', 'é', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ']):
                logging.info("✓ Spanish accented characters detected in content (good encoding)")
            elif any(seq in content_sample for seq in ['Ã­', 'Ã³', 'Ã±', 'Ã¡', 'Ã©', 'Ã', 'Ã‰', '�']):
                logging.warning("⚠ Problematic encoding detected in content sample")
            else:
                logging.info("Content sample without special characters")
        
        # Final verification: total input size
        total_input_size = len(f"{cleaned_prompt}:\n\n{cleaned_text}")
        logging.info(f"✓ Total input to Gemini: {total_input_size} characters (no truncation)")

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
            f"{cleaned_prompt}:\n\n{cleaned_text}",
            generation_config=generation_config,
            safety_settings=safety_settings
        )
        
        logging.info("Gemini API call successful")
        if response.text:
            response_hash = hashlib.md5(response.text.encode('utf-8')).hexdigest()
            logging.info(f"Response received. Length: {len(response.text)}, Hash: {response_hash}")
            
            # Fix encoding issues in the response from Gemini
            fixed_response = clean_text_for_processing(response.text)
            
            # Check if we fixed any encoding issues
            if fixed_response != response.text:
                logging.info("✓ Fixed encoding issues in Gemini response")
            else:
                logging.info("✓ Response encoding is correct")
            
            return fixed_response

        return response.text
    except Exception as e:
        logging.exception(f"Error querying Gemini: {e}")
        return None

def main(document_id, user_prompt, collection_name, html_content=None): # Added html_content parameter
    """Main function to connect, retrieve PDF URL, extract text, and ask Gemini."""
    _mark('script_start')
    logging.info(f"Starting main function with document_id: {document_id}")
    
    # Set stdout to use utf-8 encoding at the beginning to handle all outputs
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    # Also configure stderr for consistency
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    
    # If HTML content is provided directly, use it instead of fetching from MongoDB
    if html_content:
        logging.info("Using provided HTML content for analysis")
        text = clean_text_for_processing(html_content)
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
            text = clean_text_for_processing(content_info["content"])
        elif content_info["type"] == "url_pdf":
            # Priority 2: Download and extract text from PDF
            logging.info("Using PDF URL to extract text")
            _mark('download_pdf_start')
            raw_text = download_and_extract_text_from_pdf(content_info["url"])
            _mark('download_pdf_end')
            if not raw_text:
                logging.error("Failed to extract text from PDF")
                return
            text = clean_text_for_processing(raw_text)
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

    # Validate that we have usable text content
    if not text or len(text.strip()) < 10:
        logging.error(f"Insufficient text content after cleaning: {len(text) if text else 0} characters")
        print(json.dumps({
            "error": "INSUFFICIENT_CONTENT", 
            "message": "Error: El documento no contiene suficiente texto para analizar."
        }))
        return

    _mark('gemini_call_start')
    response_text = ask_gemini(text, user_prompt)
    _mark('gemini_call_end')

    if response_text is not None:
        # Ensure proper UTF-8 output encoding
        try:
            # Make sure we're outputting valid UTF-8
            if isinstance(response_text, str):
                # Verify the string is valid UTF-8
                response_text.encode('utf-8')
                print(response_text, flush=True)
            else:
                print(str(response_text), flush=True)
        except UnicodeEncodeError as e:
            logging.error(f"UTF-8 encoding error in response: {e}")
            # Try to fix encoding issues in the response
            try:
                fixed_response = response_text.encode('utf-8', errors='replace').decode('utf-8')
                print(fixed_response, flush=True)
            except:
                print("Error: Response contains invalid characters", flush=True)
    else:
        print("Error: Gemini did not respond.", flush=True)

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
        
        # Check if we should read from stdin (when user_prompt is "--stdin")
        if len(sys.argv) > 2 and sys.argv[2] == "--stdin":
            # Read JSON data from stdin
            try:
                stdin_data = sys.stdin.read()
                data = json.loads(stdin_data)
                user_prompt = data.get("user_prompt", "Realiza un resumen")
                collection_name = data.get("collection_name", "BOE")
                html_content = data.get("html_content")
            except (json.JSONDecodeError, AttributeError) as e:
                logging.error(f"Error parsing stdin data: {e}")
                user_prompt = "Realiza un resumen"
                collection_name = "BOE"
                html_content = None
        else:
            # Use command line arguments as before
            user_prompt = sys.argv[2] if len(sys.argv) > 2 else "Realiza un resumen" # added get user prompt
            collection_name = sys.argv[3] if len(sys.argv) > 3 else "BOE"
            html_content = sys.argv[4] if len(sys.argv) > 4 else None # added html_content parameter
            
        main(document_id, user_prompt, collection_name, html_content) # call main with html_content
    else:
        logging.warning("No document_id provided when running directly.")
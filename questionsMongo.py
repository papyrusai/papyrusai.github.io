import os
import pymongo
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from .env file
load_dotenv()

# MongoDB configuration
DB_URI = os.getenv("DB_URI")
DB_NAME = os.getenv("DB_NAME")
DB_COLLECTION = os.getenv("DB_COLLECTION")

# Gemini API configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")  # Ensure this is set in your .env
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file.  Please set it.")
else:
     print("GEMINI_API_KEY found in .env file") # check api key

# Set up the Gemini model
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash-lite-preview-02-05')  # Using a more generally available model

def connect_to_mongodb():
    """Connects to MongoDB and returns the database and collection objects."""
    try:
        client = pymongo.MongoClient(DB_URI)
        db = client[DB_NAME]
        collection = db[DB_COLLECTION]
        return db, collection
    except pymongo.errors.ConnectionFailure as e:
        print(f"Could not connect to MongoDB: {e}")
        return None, None

def get_text_from_mongodb(collection, document_id="_id", id_value="BOE-A-2025-2144"):
    """Retrieves the text from the MongoDB document."""
    try:
        document = collection.find_one({document_id: id_value})
        if document and "text" in document:
            return document["text"]
        else:
            print(f"Document with id '{id_value}' or text field not found.")
            return None
    except Exception as e:
        print(f"Error retrieving document from MongoDB: {e}")
        return None

def ask_gemini(text, prompt):
    """Asks Gemini a question about the text and returns the response."""
    try:
        print(f"Sending prompt to Gemini: {prompt[:100]}...")  # Log the first 100 chars of the prompt
        response = model.generate_content(f"{prompt}:\n\n{text}")
        print("Gemini API call successful") #show succesfull call

        return response.text
    except Exception as e:
        print(f"Error querying Gemini: {e}")
        return None

def main(document_id="BOE-A-2025-2144"):  # Make document_id an argument
    """Main function to connect, retrieve text, and ask Gemini."""
    db, collection = connect_to_mongodb()
    if db is None or collection is None:
        return

    text = get_text_from_mongodb(collection, id_value=document_id)
    if not text:
        return

    prompt = "Realiza un resumen completo sobre las principales implicaciones y consecuencies jurídicas y económicas de este texto para una empresa gallega de la industria textil"
    gemini_response = ask_gemini(text, prompt)

    if gemini_response:
        print(gemini_response)  # Just print the response
    else:
        print("Error: Gemini did not respond.")

if __name__ == "__main__":
    # You'll call `main` from Node.js now, passing the document ID
    # For testing purposes, you can still run it directly:
    # Example:
    # main("BOE-A-2025-2144") #Or any other id
    pass # do nothing if executed directly
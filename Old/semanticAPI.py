from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from flask_cors import CORS  # Import Flask-CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "https://papyrusai-github-io.onrender.com/multistep.html"}})

# Load precomputed embeddings
industry_list = np.load('industry_list.npy', allow_pickle=True)
industry_embeddings = np.load('industry_embeddings.npy')

# Load model
model = SentenceTransformer('sentence-transformers/distiluse-base-multilingual-cased-v2') #more robust

@app.route('/', methods=['GET'])
def home():
    return "Flask is running!", 200


@app.route('/semantic-search', methods=['POST'])
def semantic_search():
    data = request.json
    query = data.get('query', '')

    if not query:
        return jsonify([])  # No query provided

    # Encode the query
    query_embedding = model.encode([query])

    # Compute cosine similarity
    similarities = cosine_similarity(query_embedding, industry_embeddings)

    # Get top 5 matches
    top_indices = np.argsort(similarities[0])[::-1][:5]
    results = [{"industry": industry_list[i], "score": float(similarities[0][i])} for i in top_indices]

    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)

from langchain_huggingface import HuggingFaceEmbeddings

# 1. Initialize the Hugging Face embedding model
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. Define your string
text = "This is a test string to embed."

# 3. Generate the embedding
vector = embeddings.embed_query(text)

# 4. Print the embedding (showing the first 5 dimensions and the total length)
print(f"Embedding dimensions: {len(vector)}")
print(f"Vector preview: {vector[:5]}")
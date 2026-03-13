from openai import OpenAI

# 1. Set custom base URL (e.g., local Ollama)
client = OpenAI(
    base_url="http://10.187.127.1:11434/v1",
    api_key="ollama" # Usually required but not checked
)

# 2. Call chat completions with streaming enabled
response = client.chat.completions.create(
    model="qwen3.5:4b", # Replace with your model
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "hi"}
    ],
    # 3. Disable thinking using extra_body for Ollama-compatible APIs
    extra_body={"think": True},
    # 4. Enable streaming
    stream=True 
)

print("Assistant: ", end="", flush=True)

# 5. Iterate over the stream and print chunks as they arrive
for chunk in response:
    # Check if the chunk contains content before trying to print it
    if chunk.choices[0].delta.content is not None:
        # Print without a newline and flush the buffer to see it immediately
        print(chunk.choices[0].delta.content, end="", flush=True)

# Print a final newline when the stream is completely finished
print()
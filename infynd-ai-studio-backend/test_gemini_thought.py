import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
import os

@tool
def dummy_tool(x: int) -> int:
    """A dummy tool."""
    return x + 1

async def test():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        api_key = "dummy"
    model = ChatGoogleGenerativeAI(model="gemini-2.5-pro", api_key=api_key)
    model_with_tools = model.bind_tools([dummy_tool])
    
    # Send a message to get a tool call
    from langchain_core.messages import HumanMessage
    res = await model_with_tools.ainvoke([HumanMessage(content="Call the dummy tool with x=5")])
    print("Tool Calls:", res.tool_calls)

if __name__ == "__main__":
    asyncio.run(test())

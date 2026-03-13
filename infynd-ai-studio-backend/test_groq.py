import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import StructuredTool

def dummy_func(query: str):
    """Searches the web for a query."""
    return f"Results for {query}"

tool = StructuredTool.from_function(
    func=dummy_func,
    name="mcp_15356dae_Web_Search",
    description="Search the web for a query."
)

async def main():
    api_key = os.environ.get("GROQ_API_KEY")
    model = ChatGroq(model="llama3-70b-8192", api_key=api_key)
    agent = create_react_agent(model, tools=[tool])
    
    try:
        res = await agent.ainvoke({"messages": [HumanMessage(content="Search the web for weather in Tokyo")]})
        print("Success!", res.keys())
    except Exception as e:
        print("Exception:", e)
        if hasattr(e, "failed_generation"):
            print("Failed Gen:", e.failed_generation)
        elif hasattr(e, "response") and e.response:
            try:
                print("Response:", e.response.json())
            except:
                print("Raw details:", getattr(e, "body", None))

if __name__ == "__main__":
    asyncio.run(main())

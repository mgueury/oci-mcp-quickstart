import asyncio
from typing import Optional
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from dotenv import load_dotenv

import oci
import os
import traceback

load_dotenv()  # load environment variables from .env

# OCI
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()

class MCPClient:
    def __init__(self):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()

    def llm_chat( self, query, chat_history, tools ):
        # OCI Signer
        region = os.getenv("TF_VAR_region")

        # #Tool definitions
        # tool1 = CohereTool()
        # tool1.name = "alarm_history"
        # tool1.description = "The tool will help you find information related to specific alarm history in Oracle Cloud within the specified time"
        # tool1.parameter_definitions = {
        #     "name": alarm_history_param
        # }        

        generative_ai_inference_client = oci.generative_ai_inference.GenerativeAiInferenceClient(
            config={}, 
            service_endpoint="https://inference.generativeai."+region+".oci.oraclecloud.com", 
            retry_strategy=oci.retry.NoneRetryStrategy(), 
            timeout=(10,240),
            signer=signer
        )
        chat_detail = oci.generative_ai_inference.models.ChatDetails()
        chat_request = oci.generative_ai_inference.models.CohereChatRequest()
        chat_request.message = query    
        chat_request.max_tokens = 4000
        chat_request.temperature = 1
        chat_request.chat_history = chat_history
        chat_request.frequency_penalty = 0
        chat_request.top_p = 0.75
        chat_request.top_k = 0
        chat_detail.serving_mode = oci.generative_ai_inference.models.OnDemandServingMode(
            model_id = os.getenv("TF_VAR_genai_cohere_model")
        )
        chat_detail.chat_request = chat_request
        chat_detail.compartment_id = os.getenv("TF_VAR_compartment_ocid")
     
        if tools:
            print( "tools:" + str(tools) )
            chat_tools = []
            for tool in tools:
                print( "tool:" + str(tool) )  
                params = {}
                if tool.get("input_schema"):
                    for key, value in tool["input_schema"]["properties"].items():
                        # Access key and value
                        print(f"Param: {key}: {value}")
                        params[key]= {
                            "description": key,
                            "type": value["type"],
                            "isRequired": False                            
                        }                        
                chat_tools.append( 
                    { 
                        "name": tool["name"], 
                        "description": tool["description"], 
                        "parameterDefinitions": params 
                    }
                )  
            print( "chat_tools:" + str(chat_tools) )
            chat_request.tools = chat_tools   

        print("-- chat_detail")
        print(vars(chat_detail))
        response = generative_ai_inference_client.chat(chat_detail)
        # Print result
        print("-- response")
        print(vars(response))
        return response.data.chat_response

    async def connect_to_server(self, server_script_path: str):
        """Connect to an MCP server
        
        Args:
            server_script_path: Path to the server script (.py or .js)
        """
        is_python = server_script_path.endswith('.py')
        is_js = server_script_path.endswith('.js')
        if not (is_python or is_js):
            raise ValueError("Server script must be a .py or .js file")
            
        command = "python" if is_python else "node"
        server_params = StdioServerParameters(
            command=command,
            args=[server_script_path],
            env=None
        )
        
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))
        
        await self.session.initialize()
        
        # List available tools
        response = await self.session.list_tools()
        tools = response.tools
        print("\nConnected to server with tools:", [tool.name for tool in tools])

    async def process_query(self, query: str) -> str:
        """Process a query using Claude and available tools"""
        response = await self.session.list_tools()
        available_tools = [{ 
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.inputSchema
        } for tool in response.tools]

        chat_history = [] 
        response = self.llm_chat(
            query = query,
            chat_history = chat_history,
            tools= available_tools
        )
        chat_history.append (
            {
                "role": "user",
                "content": query
            }
        )
        # Process response and handle tool calls
        final_text = []
        final_text.append(response.text)

        if response.toolsCalls:
            for tool_call in response.toolsCalls:
                tool_name = tool_call.name
                tool_args = tool_call.parameters
                
                # Execute tool call
                final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")
                result = await self.session.call_tool(tool_name, tool_args)

                # Continue conversation with tool results
                if hasattr(content, 'text') and content.text:
                    chat_history.append({
                      "role": "CHATBOT",
                      "content": content.text
                    })
                chat_history.append({
                    "role": "USER", 
                    "content": result.content
                })

                # Get next response from Claude
                response = self.llm_chat(
                    query=result.content, 
                    chat_history=chat_history,
                    tools=None
                )

                final_text.append(response.content[0].text)

        return "\n".join(final_text)

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")
        
        while True:
            try:
                query = input("\nQuery: ").strip()
                
                if query.lower() == 'quit':
                    break
                    
                response = await self.process_query(query)
                print("\n" + response)
                    
            except Exception as e:
                print(f"\nError: {str(e)}")
                print(traceback.format_exc())   
    
    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()

async def main():
    if len(sys.argv) < 2:
        print("Usage: python client.py <path_to_server_script>")
        sys.exit(1)
        
    client = MCPClient()
    try:
        await client.connect_to_server(sys.argv[1])
        await client.chat_loop()
    finally:
        await client.cleanup()

if __name__ == "__main__":
    import sys
    asyncio.run(main())





import { GenerativeAiInferenceClient, models, requests } from "oci-generativeaiinference";
import {
  InstancePrincipalsAuthenticationDetailsProviderBuilder,
  NoRetryConfigurationDetails
} from "oci-common";
import { env } from "process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";

const servingMode: models.OnDemandServingMode = {
    modelId: env.TF_VAR_genai_cohere_model,
    servingType: "ON_DEMAND",
};

class MCPClient {
  private mcp: Client;
  private llm: GenerativeAiInferenceClient = null;
  private transport: StdioClientTransport | null = null;
  private tools: Object[] = [];

  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async initLLM() {
    const provider = await new InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
    this.llm = new GenerativeAiInferenceClient({
        authenticationDetailsProvider: provider,
      }
    );
    this.llm.endpoint = "https://inference.generativeai."+env.TF_VAR_region+".oci.oraclecloud.com";
  }

  async connectToServer(serverScriptPath: string) {
    /**
     * Connect to an MCP server
     *
     * @param serverScriptPath - Path to the server script (.py or .js)
     */
    try {
      // Determine script type and appropriate command
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3.12"
        : process.execPath;

      // Initialize transport and connect to server
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);
      console.log("before ListTools"); 
      await new Promise(r => setTimeout(r, 2000));

      // List available tools
      const toolsResult = await this.mcp.listTools();

      console.log( "toolsResult", JSON.stringify(toolsResult) );      
      this.tools = toolsResult.tools.map((tool) => {
        console.log( "tool.inputSchema", JSON.stringify(tool.inputSchema) );  
        var tool_schema = tool.inputSchema.properties;
        console.log( "tool_schema", JSON.stringify(tool_schema) );  
        var params = {}
        Object.keys(tool_schema).forEach(function(key,index) {
            params[key] = {
              type: tool_schema[key].type,
              description: tool_schema[key].name,
              isRequired: false
            }
        });
        console.log( "tool.inputSchema", JSON.stringify(params) );      
        return {
          name: tool.name,
          description: tool.description,
          parameterDefinitions: params,
        };
      });
      console.log( "this.tools", JSON.stringify(this.tools) );  
      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name),
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query: string) {
    /**
     * Process a query using Claude and available tools
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    // Chat Details
    const chatRequest: requests.ChatRequest = {
        chatDetails: {
            compartmentId: env.TF_VAR_compartment_ocid,
            servingMode: servingMode,
            chatRequest: {
                message: query,
                apiFormat: "COHERE",
                maxTokens: 2000,
                temperature: 0,
                tools: this.tools,
            }
        },
        retryConfiguration: NoRetryConfigurationDetails
    };
    console.log( "chatRequest", JSON.stringify(chatRequest) );    
    const response = await this.llm.chat(chatRequest);
    const messages: Object[] = [
      {
        role: "user",
        content: query,
      },
    ];    

    // Process response and handle tool calls
    const finalText = [];

    finalText.push(response.text);
    if ( response.hasAttribute("toolCalls") ) {
      for (const toolCall of response.toolCalls) { 
        console.log(toolCall); 
        // Execute tool call
        const toolName = toolCall.name;
        const toolArgs = toolCall.parameters as { [x: string]: unknown } | undefined;
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`,
        );
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        finalText.push(`[Calling tool done]`);

        // Continue conversation with tool results
        messages.push({
          role: "user",
          content: result.content as string,
        });
      }
    }

    return finalText.join("\n");
  }

  async chatLoop() {
    /**
     * Run an interactive chat loop
     */
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        console.log("\n" + message);        
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } catch (e) {
      console.log("Error: ", e);
      console.log(e.stack);
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    /**
     * Clean up resources
     */
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node build/index.js <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.initLLM();
    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();

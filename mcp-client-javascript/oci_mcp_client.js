import { GenerativeAiInferenceClient, models, requests } from "oci-generativeaiinference";
import {
  InstancePrincipalsAuthenticationDetailsProviderBuilder,
  NoRetryConfigurationDetails
} from "oci-common";
import { env } from "process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline/promises";

const servingMode = {
  modelId: env.TF_VAR_genai_cohere_model,
  servingType: "ON_DEMAND",
};

class MCPClient {
  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    this.llm = null;
    this.transport = null;
    this.tools = [];
  }

  debug(s) {
    // console.log(s);
  }

  async initLLM() {
    const provider = await new InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
    this.llm = new GenerativeAiInferenceClient({
      authenticationDetailsProvider: provider,
    });
    this.llm.endpoint = "https://inference.generativeai." + env.TF_VAR_region + ".oci.oraclecloud.com";
  }

  async connectToServer(serverPath) {
    try {
      if (serverPath.startsWith('http')) {
        const url = new URL(serverPath);
        this.transport = new StreamableHTTPClientTransport(url);
        await this.mcp.connect(this.transport);
      } else {
        const isJs = serverPath.endsWith(".js");
        const isPy = serverPath.endsWith(".py");
        if (!isJs && !isPy) {
          throw new Error("Server script must be a .js or .py file");
        }
        const command = isPy
          ? process.platform === "win32"
            ? "python"
            : "python3.12"
          : process.execPath;

        this.transport = new StdioClientTransport({
          command,
          args: [serverPath],
        });
        await this.mcp.connect(this.transport);
      }
      this.debug("before ListTools");
      await new Promise(r => setTimeout(r, 2000));

      const toolsResult = await this.mcp.listTools();

      this.debug("toolsResult " + JSON.stringify(toolsResult));
      this.tools = toolsResult.tools.map((tool) => {
        this.debug("tool.inputSchema: " + JSON.stringify(tool.inputSchema));
        var tool_schema = tool.inputSchema.properties;
        this.debug("tool_schema: " + JSON.stringify(tool_schema));
        var params = {}
        Object.keys(tool_schema).forEach(function(key, index) {
          params[key] = {
            type: tool_schema[key].type,
            description: tool_schema[key].name,
            isRequired: false
          }
        });
        this.debug("tool.inputSchema " + JSON.stringify(params));
        return {
          name: tool.name,
          description: tool.description,
          parameterDefinitions: params,
        };
      });
      this.debug("this.tools: " + JSON.stringify(this.tools));
      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name),
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query) {
    const chatRequest = {
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
    this.debug("chatRequest: " + JSON.stringify(chatRequest));
    const response = await this.llm.chat(chatRequest);
    const chatResponse = response.chatResult.chatResponse;
    const messages = [
      {
        role: "user",
        content: query,
      },
    ];
    this.debug("chatResponse: " + JSON.stringify(chatResponse));

    const finalText = [];

    finalText.push(chatResponse.text);

    if (chatResponse.toolCalls) {
      for (const toolCall of chatResponse.toolCalls) {
        console.log(toolCall);
        const toolName = toolCall.name;
        const toolArgs = toolCall.parameters;
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`,
        );
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        this.debug("result: " + JSON.stringify(result));
        finalText.push(`[Calling tool done]`);
        finalText.push(result.content[0].text);
        this.debug("result: " + result.content[0].text);

        messages.push({
          role: "user",
          content: result.content[0].text,
        });
      }
    }

    return finalText.join("\n");
  }

  async chatLoop() {
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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 1. Create the MCP Server instance
const server = new McpServer({
    name: "SimpleCalculator",
    version: "1.0.0",
});

// 2. Register the 'add' tool
server.tool(
    "add", // The name the LLM will use to call the tool
    {
        // Define the input parameters and their types using Zod schema
        a: z.number().describe("The first number to add."),
        b: z.number().describe("The second number to add."),
    },
    async ({ a, b }) => {
        // 3. Tool execution logic (the actual 'add' method)
        const sum = a + b;

        // 4. Return the result in the standard MCP format
        return {
            content: [
                {
                    type: "text",
                    text: `The sum of ${a} and ${b} is ${sum}.`,
                },
            ],
            // You can also return structured data if desired
            structuredContent: { result: sum },
        };
    },
    // Optional metadata to help the LLM understand the tool
    {
        title: "Add Two Numbers",
        description: "A tool to calculate the sum of two integers or floats.",
    }
);

// 5. Connect the server to a transport (Stdio is for local execution)
const transport = new StdioServerTransport();

// 6. Start the server and wait for the LLM to connect
console.log("MCP Server 'SimpleCalculator' is running and listening on Stdio...");
await server.connect(transport);

console.log("MCP Server shutting down.");
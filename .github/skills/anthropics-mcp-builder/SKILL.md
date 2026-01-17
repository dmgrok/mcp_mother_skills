---
name: mcp-builder
version: 1.0.0
description: Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools.
---

# MCP Builder Skill

This skill provides comprehensive guidance on building MCP (Model Context Protocol) servers that enable language models to interact with external services through well-designed tools.

## When to use

Use this skill when:
- Building MCP servers to integrate external APIs or services
- Designing MCP server architecture in Python (FastMCP) or Node/TypeScript (MCP SDK)
- Creating tools for LLM integration
- Implementing resource subscriptions and progress notifications
- Designing robust error handling and logging

## Key concepts

### MCP Architecture
- **Tools**: Enable LLMs to perform actions or retrieve data
- **Resources**: Provide context that LLMs can reference
- **Sampling**: Allows MCP servers to request LLM completions
- **Prompts**: Pre-configured prompt templates for common tasks

### Best practices
- Design tools with clear, descriptive names and parameters
- Include proper error handling and validation
- Use streaming for long-running operations
- Implement caching for frequently accessed resources
- Document tool parameters and expected responses

## Implementation guides

### Python (FastMCP)
```python
from fastmcp.server import Server

mcp = Server("my-server")

@mcp.tool()
def get_weather(location: str) -> str:
    # Implementation here
    return "Weather data"
```

### Node/TypeScript (MCP SDK)
```typescript
const server = new Server({
  name: "my-server",
  version: "1.0.0"
});

server.tool("get_weather", 
  { location: { type: "string" } },
  async ({ location }) => ({
    content: [{ type: "text", text: "Weather data" }]
  })
);
```

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [FastMCP on GitHub](https://github.com/jlowin/fastmcp)
- [MCP SDK Examples](https://github.com/modelcontextprotocol/python-sdk/tree/main/examples)
- [Tool design patterns](https://modelcontextprotocol.io/docs/concepts/tools)

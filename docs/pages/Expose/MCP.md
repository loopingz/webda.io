# MCP

Use the Model Context Protocol to let AI assistants call your application's operations as tools and read model
instances as resources. `@webda/mcp` supports Streamable HTTP and stdio.

## Enable MCP

Install `@webda/mcp` and configure `Webda/McpService`. Select the operations and model resources to expose,
then choose HTTP for remote clients or stdio for a client that launches the application locally.

Follow the [module setup](../Modules/mcp/README.md) for configuration, authentication, allowed hosts,
and output limits. Remote HTTP deployments need the public hostname configured in `allowedHosts`.

## Connect an agent

[Connecting agents](../Modules/mcp/ConnectingAgents.md) walks through client setup.
Tools use operation IDs, such as `Post.Get`; model resources use Webda resource URIs.
Access depends on the caller's session and permissions.

/**
 * Dummy MCP HTTP server for testing runtime functionality
 * Run with: node test-mcp-server.mjs
 */

import http from 'http';

const PORT = process.env.PORT || 7100;

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      name: 'test-mcp-server',
      version: '1.0.0',
      description: 'Dummy MCP server for testing'
    }));
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[Test MCP Server] Running on http://127.0.0.1:${PORT}`);
  console.log(`[Test MCP Server] Health check: http://127.0.0.1:${PORT}/health`);
});

process.on('SIGTERM', () => {
  console.log('[Test MCP Server] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Test MCP Server] Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});

import { expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { callOperation } from '../../../src/core/client.js';
import { registerCuratedGroupPostTools } from '../../../src/tools/curated/groupPosts.js';

vi.mock('../../../src/core/client.js', () => ({ callOperation: vi.fn() }));
vi.mock('../../../src/core/spec.js', () => ({
  getSpecIndex: () =>
    Promise.resolve({
      operations: new Map([
        [
          'getGroupPosts',
          {
            parameters: [
              { in: 'query', name: 'offset' },
              { in: 'query', name: 'n' },
            ],
          },
        ],
      ]),
    }),
}));

it('rejects unknown group-post arguments and honors the declared item cap', async () => {
  const server = new McpServer({ name: 'test-server', version: '0' });
  const client = new Client({ name: 'test-client', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  registerCuratedGroupPostTools(server);
  vi.mocked(callOperation).mockResolvedValue({
    url: 'https://offline.invalid/posts',
    data: Array.from({ length: 50 }, (_, i) => ({ id: `post_${i}` })),
  });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const name = 'vrchat_group_posts_recent';
    const groupId = 'grp_00000000-0000-4000-8000-000000000001';
    const catalog = await client.listTools();
    expect(catalog.tools.find((tool) => tool.name === name)?.inputSchema.additionalProperties).toBe(
      false
    );

    const invalid = await client.callTool({ name, arguments: { groupId, limit: 30 } });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid.content)).toContain('limit');
    expect(callOperation).not.toHaveBeenCalled();

    const valid = await client.callTool({ name, arguments: { groupId, maxItems: 30 } });
    expect(valid.isError).not.toBe(true);
    expect(valid.structuredContent).toMatchObject({
      totalPosts: 30,
      page: { items: 30, pages: 1 },
    });
    expect(callOperation).toHaveBeenCalledTimes(1);
  } finally {
    await client.close();
    await server.close();
  }
});

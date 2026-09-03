import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { skills, type SkillName, requestLogService } from '../services/index.js';
import { a2aAuthMiddleware, type A2ARequest } from '../middleware/index.js';

const router = Router();

interface DataPart {
  kind: 'data';
  data: { skill: string; input?: unknown };
}

interface JsonRpcEnvelope {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: { message?: { parts?: DataPart[] } };
}

function isKnownSkill(name: string): name is SkillName {
  return name in skills;
}

/**
 * POST /a2a — JSON-RPC 2.0, method "message/send". The message's parts carry
 * a DataPart shaped { skill, input } — a real agent that has read the Agent
 * Card sends structured input for a named skill, not free text for this
 * gateway to interpret. See routes/agent-card.routes.ts for what's on offer.
 */
router.post('/a2a', a2aAuthMiddleware, async (req: A2ARequest, res: Response) => {
  const body = req.body as JsonRpcEnvelope;
  const rpcId = body?.id ?? null;

  const rpcError = (code: number, message: string) =>
    res.status(200).json({ jsonrpc: '2.0', id: rpcId, error: { code, message } });

  if (body?.jsonrpc !== '2.0' || body?.method !== 'message/send') {
    rpcError(-32601, 'Only jsonrpc 2.0 method "message/send" is supported');
    return;
  }

  const dataPart = body.params?.message?.parts?.find((p): p is DataPart => p.kind === 'data');
  const skillName = dataPart?.data?.skill;
  if (!skillName || !isKnownSkill(skillName)) {
    rpcError(-32602, `Unknown or missing skill. Available: ${Object.keys(skills).join(', ')}`);
    return;
  }

  const apiKey = req.apiKey!;
  const taskId = randomUUID();
  const logId = requestLogService.start(apiKey.id, apiKey.label, skillName, dataPart.data.input);

  try {
    const result = await (skills[skillName] as (input: any) => Promise<{ status: string; data?: unknown; error?: string }>)(
      dataPart.data.input ?? {}
    );

    const instanceId =
      result.data && typeof result.data === 'object' && 'instance' in (result.data as Record<string, unknown>)
        ? ((result.data as any).instance?.id as string | undefined)
        : undefined;

    requestLogService.finish(logId, result.status as any, result.data, result.error, instanceId);

    res.json({
      jsonrpc: '2.0',
      id: rpcId,
      result: {
        id: taskId,
        status: { state: result.status },
        artifacts: result.data !== undefined ? [{ parts: [{ kind: 'data', data: result.data }] }] : [],
        ...(result.error ? { error: result.error } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Skill execution failed';
    requestLogService.finish(logId, 'failed', undefined, message);
    res.json({
      jsonrpc: '2.0',
      id: rpcId,
      result: { id: taskId, status: { state: 'failed' }, error: message },
    });
  }
});

export { router as a2aRoutes };

import { codexClient, type CodexPage, type CodexModel } from './codexDaemon';
import type { HostRuntimeConnection } from 'react-native-whip-ssh';
import { chatEfforts, type ChatEffort, type ChatProvider } from '../lib/chatLaunch';

export interface ChatModelOption {
  id: string;
  label: string;
  efforts: ChatEffort[];
}

// Query the installed CLIs over their control protocols without sending a prompt.
// Only model metadata leaves the server; stderr, account and auth data are discarded.
const catalogProbe = String.raw`
import json, os, selectors, signal, subprocess, sys, tempfile, time
provider = sys.argv[1]
process = None
models = []
def clean(value, limit=200):
    return value if isinstance(value, str) and 0 < len(value) <= limit and not any(ord(c) < 32 or ord(c) == 127 for c in value) else None
def collect(values):
    if not isinstance(values, list):
        return
    for value in values[:100]:
        if not isinstance(value, dict) or value.get('hidden'):
            continue
        model = clean(value.get('model') if provider == 'codex' else value.get('value'))
        if not model:
            continue
        label = clean(value.get('displayName')) or model
        efforts = value.get('supportedReasoningEfforts', []) if provider == 'codex' else value.get('supportedEffortLevels', [])
        efforts = [e.get('reasoningEffort') if isinstance(e, dict) else e for e in efforts] if isinstance(efforts, list) else []
        models.append({'id': '' if provider == 'claude' and model == 'default' else model, 'label': label, 'efforts': [e for e in efforts if clean(e, 20)]})
try:
    with tempfile.TemporaryDirectory(prefix='whip-models-') as cwd:
        args = ['codex', 'app-server'] if provider == 'codex' else ['claude', '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}']
        env = os.environ.copy()
        env.pop('CLAUDECODE', None)
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True, cwd=cwd, env=env)
        def send(value):
            process.stdin.write((json.dumps(value) + '\n').encode())
            process.stdin.flush()
        if provider == 'codex':
            send({'id': 1, 'method': 'initialize', 'params': {'clientInfo': {'name': 'whip_chat', 'version': '1'}}})
        else:
            send({'type': 'control_request', 'request_id': 'whip-models', 'request': {'subtype': 'initialize', 'hooks': {}}})
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            buffer = b''
            deadline = time.monotonic() + 18
            done = False
            pages = 0
            while not done and time.monotonic() < deadline:
                if not selector.select(max(0, deadline - time.monotonic())):
                    break
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    break
                buffer += chunk
                if len(buffer) > 1048576:
                    break
                while b'\n' in buffer and not done:
                    raw, buffer = buffer.split(b'\n', 1)
                    try:
                        reply = json.loads(raw)
                    except ValueError:
                        continue
                    if not isinstance(reply, dict):
                        continue
                    if provider == 'codex':
                        if reply.get('id') == 1:
                            if 'error' in reply:
                                done = True
                                continue
                            send({'method': 'initialized'})
                            send({'id': 2, 'method': 'model/list', 'params': {'limit': 100, 'includeHidden': False}})
                        elif reply.get('id') == 2:
                            result = reply.get('result', {})
                            collect(result.get('data', []))
                            pages += 1
                            cursor = result.get('nextCursor')
                            if cursor and pages < 5:
                                send({'id': 2, 'method': 'model/list', 'params': {'limit': 100, 'includeHidden': False, 'cursor': cursor}})
                            else:
                                done = True
                    elif reply.get('type') == 'control_response' and reply.get('response', {}).get('request_id') == 'whip-models':
                        collect(reply['response'].get('response', {}).get('models', []))
                        done = True
except Exception:
    models = []
finally:
    if process:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=2)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
print('WHIP_MODELS:' + json.dumps(models))
`;

function quote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function catalogCommand(provider: ChatProvider): string {
  return '"${SHELL:-/bin/sh}" -lc ' + quote(`python3 -c ${quote(catalogProbe)} ${quote(provider)} 2>/dev/null`);
}

export function parseChatCatalog(output: string, provider: ChatProvider): ChatModelOption[] {
  const data = output.split('\n').find(line => line.startsWith('WHIP_MODELS:'))?.slice(12);
  if (!data) return [];
  try {
    const values: unknown = JSON.parse(data);
    if (!Array.isArray(values)) return [];
    const models = new Map<string, ChatModelOption>();
    for (const item of values as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const value = item as Record<string, unknown>;
      if (typeof value.id !== 'string' || value.id.length > 200 || typeof value.label !== 'string') continue;
      const efforts = Array.isArray(value.efforts) ? value.efforts as unknown[] : [];
      models.set(value.id, {
        id: value.id,
        label: value.label.slice(0, 200),
        efforts: chatEfforts[provider].filter(effort => effort === 'default' || efforts.includes(effort)),
      });
    }
    return [...models.values()];
  } catch {
    return [];
  }
}

export async function fetchChatCatalog(native: Pick<HostRuntimeConnection, 'execute'> & Partial<Pick<HostRuntimeConnection, 'codexCall'>>, provider: ChatProvider): Promise<ChatModelOption[]> {
  if (provider === 'codex' && native.codexCall) {
    const models: ChatModelOption[] = [];
    let cursor: string | undefined;
    do {
      const result = await codexClient(native as HostRuntimeConnection).rpc<CodexPage<CodexModel>>('model/list', {limit:100, ...(cursor ? {cursor} : {})});
      for (const item of result.data ?? []) if (!item.hidden) models.push({id:item.model,label:item.displayName || item.model,efforts:chatEfforts.codex.filter(e=>e==='default' || (item.supportedReasoningEfforts ?? []).some((v: {reasoningEffort:string})=>v.reasoningEffort===e))});
      cursor=result.nextCursor || undefined;
    } while (cursor);
    return models;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      native.execute(catalogCommand(provider)).then(output => parseChatCatalog(output, provider)),
      new Promise<ChatModelOption[]>(resolve => { timer = setTimeout(() => resolve([]), 25000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

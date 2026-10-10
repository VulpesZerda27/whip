import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogCommand, parseChatCatalog } from '../src/services/chatCatalog';

test.each(['codex', 'claude'] as const)('%s discovery uses control messages and returns only model metadata', provider => {
  const dir = mkdtempSync(join(tmpdir(), 'whip-catalog-test-'));
  try {
    const shell = join(dir, 'login-shell');
    writeFileSync(shell, '#!/bin/sh\nshift\nexec /bin/sh -c "$1"\n', { mode: 0o700 });
    writeFileSync(join(dir, provider), `#!/usr/bin/env python3
import sys,json
for line in sys.stdin:
 r=json.loads(line)
 if ${JSON.stringify(provider)} == 'codex':
  assert r['method'] in ['initialize','initialized','model/list']
  if r['method']=='initialize': result={'id':1,'result':{}}
  elif r['method']=='model/list':
   second=bool(r['params'].get('cursor'))
   result={'id':2,'result':{'data':[{'model':'second' if second else 'model-a','displayName':'Model A','supportedReasoningEfforts':[{'reasoningEffort':'high'}]}], 'nextCursor':None if second else 'page2','account':'SECRET'}}
  else: continue
 else:
  assert r['type']=='control_request' and r['request']['subtype']=='initialize'
  assert '--no-session-persistence' in sys.argv and '--strict-mcp-config' in sys.argv
  result={'type':'control_response','response':{'request_id':r['request_id'],'response':{'models':[{'value':'model-a','displayName':'Model A','supportedEffortLevels':['high']}], 'account':'SECRET'}}}
 print(json.dumps(result),flush=True)
`, { mode: 0o700 });
    const output = execFileSync('/bin/sh', ['-c', catalogCommand(provider)], {
      env: { ...process.env, SHELL: shell, PATH: `${dir}:/usr/bin:/bin` }, encoding: 'utf8', timeout: 5000,
    });
    expect(output).not.toContain('SECRET');
    expect(parseChatCatalog(output, provider)[0]).toEqual({ id: 'model-a', label: 'Model A', efforts: ['default', 'high'] });
    expect(parseChatCatalog(output, provider)).toHaveLength(provider === 'codex' ? 2 : 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('malformed and unavailable catalogs never add hardcoded model choices', () => {
  for (const output of ['unavailable', 'WHIP_MODELS:null', 'WHIP_MODELS:broken', 'WHIP_MODELS:[null,42,{}]']) {
    expect(parseChatCatalog(output, 'claude')).toEqual([]);
  }
  expect(parseChatCatalog('WHIP_MODELS:[{"id":"haiku","label":"Haiku","efforts":[]}]', 'claude')[0].efforts).toEqual(['default']);
});

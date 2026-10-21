const {test} = require('node:test');
const assert = require('node:assert/strict');
const braces = require(process.env.SECURITY_TEST_BRACES || 'braces');
const forge = require(process.env.SECURITY_TEST_FORGE || 'node-forge');

test('brace patterns and supplied ASTs reject excessive depth before recursive walking', () => {
  assert.deepEqual(braces.expand('src/{a,b}/{1..3}.ts'), [
    'src/a/1.ts', 'src/a/2.ts', 'src/a/3.ts',
    'src/b/1.ts', 'src/b/2.ts', 'src/b/3.ts',
  ]);
  const pattern = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
  for (const operation of ['parse', 'compile', 'expand', 'stringify']) {
    assert.throws(() => braces[operation](pattern), /nesting exceeds security limit/);
  }
  let ast = {type: 'text', value: 'x'};
  for (let depth = 0; depth < 4000; depth++) ast = {type: 'root', nodes: [ast]};
  for (const operation of ['compile', 'expand', 'stringify']) {
    assert.throws(() => braces[operation](ast), /nesting exceeds security limit/);
  }
});

test('RSA verification accepts normal digests but rejects extra nested algorithm elements', () => {
  const keys = forge.pki.rsa.generateKeyPair({bits: 2048, e: 65537});
  for (const algorithm of ['sha1', 'sha256', 'sha384', 'sha512']) {
    const md = forge.md[algorithm].create().update('local security regression fixture');
    assert.equal(keys.publicKey.verify(md.digest().getBytes(), keys.privateKey.sign(md)), true);
  }
  const a = forge.asn1;
  const item = (type, constructed, value) => a.create(a.Class.UNIVERSAL, type, constructed, value);
  const digest = forge.md.sha256.create().update('local fixture').digest().getBytes();
  for (const withNull of [false, true]) {
    const algorithm = [item(a.Type.OID, false, a.oidToDer(forge.pki.oids.sha256).getBytes())];
    if (withNull) algorithm.push(item(a.Type.NULL, false, ''));
    algorithm.push(item(a.Type.OCTETSTRING, false, 'unconsumed garbage'));
    const der = a.toDer(item(a.Type.SEQUENCE, true, [
      item(a.Type.SEQUENCE, true, algorithm), item(a.Type.OCTETSTRING, false, digest),
    ])).getBytes();
    const signature = keys.privateKey.sign(der, 'NONE');
    assert.throws(() => keys.publicKey.verify(digest, signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
  }
});

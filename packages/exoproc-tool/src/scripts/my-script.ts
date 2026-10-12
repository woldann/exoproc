/**
 * Remote Script: Inspect Player Class (EntityPlayerSP) via Java Reflection
 * This is an acceptance test — all assertions must pass before REFLECTION_TEST_PASS is printed.
 */

var failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures.push('FAIL: ' + message);
    print('FAIL: ' + message);
  } else {
    print('PASS: ' + message);
  }
}

try {
  // ── 1. Java.type() returns a class proxy ─────────────────────────────────
  const PlayerClass = (Java as any).type(
    'net.minecraft.client.entity.EntityPlayerSP',
  );

  print('=== MCP 919 Player Class ===');
  print('Class Type: ' + PlayerClass);

  assert(
    PlayerClass !== null && PlayerClass !== undefined,
    'Java.type() returns non-null proxy',
  );
  assert(
    String(PlayerClass).indexOf('EntityPlayerSP') !== -1,
    'toString includes class name',
  );

  // ── 2. .class property returns reflection proxy ──────────────────────────
  const cls = PlayerClass.class;
  assert(
    cls !== null && cls !== undefined,
    '.class property returns non-null proxy',
  );

  // ── 3. Class name methods ────────────────────────────────────────────────
  const canonicalName = cls.getCanonicalName();
  const name = cls.getName();
  const simpleName = cls.getSimpleName();

  print('Canonical Name: ' + canonicalName);
  print('Name:           ' + name);
  print('Simple Name:    ' + simpleName);

  assert(
    typeof canonicalName === 'string' && canonicalName.length > 0,
    'getCanonicalName() returns non-empty string',
  );
  assert(
    canonicalName.indexOf('EntityPlayerSP') !== -1,
    'getCanonicalName() contains EntityPlayerSP',
  );
  assert(
    typeof name === 'string' && name.length > 0,
    'getName() returns non-empty string',
  );
  assert(
    name === 'net.minecraft.client.entity.EntityPlayerSP',
    'getName() matches full requested name',
  );
  assert(simpleName === 'EntityPlayerSP', 'getSimpleName() === EntityPlayerSP');

  // ── 3b. Contextual requested name verification (bew vs EntityPlayerSP vs full)
  const byObf = (Java as any).type('bew');
  const byShort = (Java as any).type('EntityPlayerSP');
  assert(byObf.class.getName() === 'bew', 'bew requested getName() is bew');
  assert(
    byShort.class.getName() === 'EntityPlayerSP',
    'EntityPlayerSP requested getName() is EntityPlayerSP',
  );
  assert(
    byObf.class.getCanonicalName() ===
      'net.minecraft.client.entity.EntityPlayerSP',
    'byObf canonicalName is full name',
  );
  assert(
    byShort.class.getCanonicalName() ===
      'net.minecraft.client.entity.EntityPlayerSP',
    'byShort canonicalName is full name',
  );
  assert(
    byObf.class.equals(cls),
    'byObf.class.equals(cls) is true (same class)',
  );
  assert(
    byShort.class.equals(cls),
    'byShort.class.equals(cls) is true (same class)',
  );

  // ── 4. Superclass ─────────────────────────────────────────────────────────
  const superCls = cls.getSuperclass();
  print('Superclass: ' + (superCls ? superCls.getName() : 'null'));
  assert(
    superCls !== null && superCls !== undefined,
    'getSuperclass() returns non-null proxy',
  );

  // ── 5. getMethods() returns an array with getName() working ──────────────
  print('\n--- Methods ---');
  const methods = cls.getMethods();
  assert(Array.isArray(methods), 'getMethods() returns an Array');
  assert(methods.length > 0, 'getMethods() returns at least one method');

  var methodNameSeen = false;
  for (var i = 0; i < Math.min(methods.length, 20); i++) {
    const mname = methods[i].getName();
    assert(
      typeof mname === 'string' && mname.length > 0,
      'methods[' + i + '].getName() is a non-empty string',
    );
    print(mname);
    methodNameSeen = true;
    if (i === 0) break; // Only assert the first
  }
  assert(methodNameSeen, 'At least one method name was printed');

  // ── 6. getFields() returns an array with getName() working ───────────────
  print('\n--- Fields ---');
  const fields = cls.getFields();
  assert(Array.isArray(fields), 'getFields() returns an Array');
  assert(fields.length > 0, 'getFields() returns at least one field');

  var fieldNameSeen = false;
  for (var j = 0; j < Math.min(fields.length, 20); j++) {
    const fname = fields[j].getName();
    assert(
      typeof fname === 'string' && fname.length > 0,
      'fields[' + j + '].getName() is a non-empty string',
    );
    print(fname);
    fieldNameSeen = true;
    if (j === 0) break; // Only assert the first
  }
  assert(fieldNameSeen, 'At least one field name was printed');

  // ── 7. Final result ──────────────────────────────────────────────────────
  if (failures.length === 0) {
    print('\nREFLECTION_TEST_PASS');
  } else {
    print(
      '\nREFLECTION_TEST_FAIL: ' + failures.length + ' assertion(s) failed',
    );
    throw new Error('Acceptance test failed: ' + failures.join('; '));
  }
} catch (e) {
  print('Hata olustu: ' + e);
  throw e;
}

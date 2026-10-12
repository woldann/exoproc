/**
 * Inspects canonical schema database in Neptune
 * Reads TARGET_CLASS from global scope if provided
 * Outputs:
 * RESULT:DB_MATCH|<json>
 * or
 * RESULT:DB_LIST|<json>
 */

declare var TARGET_CLASS: string | undefined;

await (async () => {
  const target =
    typeof TARGET_CLASS !== 'undefined' ? String(TARGET_CLASS).trim() : '';
  const db = Java.mapper?.database;

  if (!db) {
    print('RESULT:DB_ERROR|No canonical database available on Java mapper');
    return;
  }

  // 1. If specific target class requested
  if (target) {
    let matchKey: string | null = null;
    let matchSchema: any = null;

    for (const [key, schema] of Object.entries(db as Record<string, any>)) {
      if (
        key.toLowerCase() === target.toLowerCase() ||
        schema?.canonicalClassName?.toLowerCase() === target.toLowerCase()
      ) {
        matchKey = key;
        matchSchema = schema;
        break;
      }
    }

    if (!matchSchema || !matchKey) {
      print('RESULT:DB_NOT_FOUND|' + target);
      return;
    }

    const res = {
      canonicalKey: matchKey,
      canonicalClassName: matchSchema.canonicalClassName || matchKey,
      superclass: matchSchema.superclass || 'Object',
      fields: Object.entries(matchSchema.fields || {}).map(([name, type]) => ({
        name,
        type: String(type),
      })),
      methods: Object.entries(matchSchema.methods || {}).map(
        ([name, m]: [string, any]) => ({
          name,
          params: m.params || [],
          returnType: m.returnType || 'void',
          isStatic: Boolean(m.isStatic),
        }),
      ),
    };

    print('RESULT:DB_MATCH|' + JSON.stringify(res));
    return;
  }

  // 2. Otherwise list all schemas in database
  const list = Object.entries(db as Record<string, any>).map(
    ([key, schema]) => ({
      canonicalKey: key,
      canonicalClassName: schema?.canonicalClassName || key,
      superclass: schema?.superclass || 'Object',
      fieldCount: Object.keys(schema?.fields || {}).length,
      methodCount: Object.keys(schema?.methods || {}).length,
    }),
  );

  print('RESULT:DB_LIST|' + JSON.stringify(list));
})();

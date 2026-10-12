/**
 * Inspects detected classes in Neptune's dynamic Class Pool
 * Reads TARGET_CLASS from global scope if provided
 * Outputs:
 * RESULT:POOL_MATCH|<json>
 * or
 * RESULT:POOL_LIST|<json>
 */

declare var TARGET_CLASS: string | undefined;

await (async () => {
  const target =
    typeof TARGET_CLASS !== 'undefined' ? String(TARGET_CLASS).trim() : '';
  const pool = Java.detector?.classPool;

  if (!pool) {
    print('RESULT:POOL_ERROR|No classPool available on Java detector');
    return;
  }

  // 1. If specific target class requested
  if (target) {
    let match: any = null;
    for (const [key, val] of pool.entries()) {
      if (!val) continue;
      if (
        key.toLowerCase() === target.toLowerCase() ||
        val.realClassName?.toLowerCase() === target.toLowerCase() ||
        val.canonicalKey?.toLowerCase() === target.toLowerCase() ||
        val.canonicalClassName?.toLowerCase() === target.toLowerCase() ||
        val.simpleName?.toLowerCase() === target.toLowerCase()
      ) {
        match = val;
        break;
      }
    }

    if (!match) {
      print('RESULT:POOL_NOT_FOUND|' + target);
      return;
    }

    const dbSuper = Java.mapper?.database?.[match.canonicalKey]?.superclass;
    const dbSuperObf = dbSuper
      ? Java.detector?.canonicalToObf?.get(dbSuper) || dbSuper
      : null;
    const superclassName = dbSuper
      ? `${dbSuperObf} (${dbSuper})`
      : typeof match.superclass === 'string'
        ? match.superclass
        : match.superclass?.realClassName ||
          match.superclass?.canonicalKey ||
          'Object';

    const res = {
      canonicalKey: match.canonicalKey,
      canonicalClassName: match.canonicalClassName,
      simpleName: match.simpleName,
      realClassName: match.realClassName,
      superclassName,
      fields: Object.entries(match.fields || {}).map(
        ([k, v]: [string, any]) => ({
          originalName: v.originalName || k,
          realName: v.realName,
          typeName: v.type?.typeName || 'unknown',
          isStatic: Boolean(v.isStatic),
        }),
      ),
      methods: Object.entries(match.methods || {}).map(
        ([k, v]: [string, any]) => ({
          originalName: v.originalName || k,
          realName: v.realName,
          returnType: v.returnType?.typeName || 'void',
          paramTypes: (v.paramTypes || []).map(
            (p: any) => p.typeName || 'unknown',
          ),
          isStatic: Boolean(v.isStatic),
        }),
      ),
    };

    print('RESULT:POOL_MATCH|' + JSON.stringify(res));
    return;
  }

  // 2. Otherwise list all unique classes in pool
  const unique = new Map<string, any>();
  for (const [key, val] of pool.entries()) {
    if (val && val.realClassName && !unique.has(val.realClassName)) {
      const dbSuper = Java.mapper?.database?.[val.canonicalKey]?.superclass;
      const dbSuperObf = dbSuper
        ? Java.detector?.canonicalToObf?.get(dbSuper) || dbSuper
        : null;
      const superclassName = dbSuper
        ? `${dbSuperObf} (${dbSuper})`
        : typeof val.superclass === 'string'
          ? val.superclass
          : val.superclass?.realClassName ||
            val.superclass?.canonicalKey ||
            'Object';

      unique.set(val.realClassName, {
        realClassName: val.realClassName,
        canonicalKey: val.canonicalKey || val.simpleName || key,
        canonicalClassName: val.canonicalClassName || '',
        simpleName: val.simpleName || val.canonicalKey || key,
        superclassName,
        fieldCount: Object.keys(val.fields || {}).length,
        methodCount: Object.keys(val.methods || {}).length,
      });
    }
  }

  const list = Array.from(unique.values());
  print('RESULT:POOL_LIST|' + JSON.stringify(list));
})();

/**
 * Remote Script: Export Mappings
 * Merges the canonical schema database template with live in-game reflection pool
 * Outputs: RESULT:MAPPINGS_EXPORT|<json>
 */

declare var TARGET_TEMPLATE_JSON: string | undefined;
declare var TARGET_PROFILE: string | undefined;

(() => {
  const profile =
    typeof TARGET_PROFILE !== 'undefined' && TARGET_PROFILE
      ? String(TARGET_PROFILE).trim()
      : '1.8.9';

  // 1. Resolve canonical database schema template
  let templateJson =
    typeof TARGET_TEMPLATE_JSON !== 'undefined' ? TARGET_TEMPLATE_JSON : '';
  let templateObj: any = null;

  if (templateJson) {
    try {
      templateObj = JSON.parse(templateJson);
    } catch (_e) {}
  }

  if (!templateObj || !templateObj.classes) {
    const db = Java.mapper?.database;
    if (db) {
      templateObj = { classes: db };
    }
  }

  if (!templateObj || !templateObj.classes) {
    templateObj = { classes: {} };
  }

  // 2. Resolve Reflection & Detection helpers
  const pool = Java.detector?.classPool;
  const canToObf = Java.detector?.canonicalToObf;
  const obfToCan = Java.detector?.obfToCanonical;
  const preMatched =
    (typeof mappings !== 'undefined' && mappings
      ? mappings.classes || mappings
      : null) ||
    Java.mapper?.mappings ||
    {};

  let cl: any = null;
  try {
    cl = java.lang.Thread.currentThread().getContextClassLoader();
  } catch (_e) {}

  const classesOut: Record<string, any> = {};
  let totalClasses = 0;
  let matchedClasses = 0;
  let totalFields = 0;
  let matchedFields = 0;
  let totalMethods = 0;
  let matchedMethods = 0;

  // 3. Process each class in database template
  const templateClasses = templateObj.classes || {};

  for (const [cKey, rawSpec] of Object.entries(templateClasses)) {
    totalClasses++;
    const spec = (rawSpec || {}) as any;
    const canonical = spec.canonical || spec.canonicalClassName || cKey;
    let superclass = spec.superclass || 'Object';

    // A. Resolve obfuscated class name and match from pool or preMatched
    let obf = spec.obf || spec.realClassName || cKey;
    if (obf === cKey && canToObf && canToObf.get(cKey)) {
      obf = canToObf.get(cKey);
    }
    const pMatch = pool
      ? pool.get(cKey) || pool.get(canonical) || (obf ? pool.get(obf) : null)
      : null;
    if (obf === cKey && pMatch?.realClassName) {
      obf = pMatch.realClassName;
    }
    if (obf === cKey && preMatched[cKey]?.obf) {
      obf = preMatched[cKey].obf;
    }

    // B. Check if class is matched
    let classMatched = false;
    if (
      pMatch ||
      (pool && (pool.has(cKey) || pool.has(obf) || pool.has(canonical)))
    ) {
      classMatched = true;
    } else if (obf && obf !== cKey) {
      classMatched = true;
    } else if (preMatched[cKey]) {
      classMatched = true;
    } else if (cl && obf) {
      try {
        const jClass = java.lang.Class.forName(obf, false, cl);
        if (jClass) classMatched = true;
      } catch (_e) {}
    }

    if (classMatched) {
      matchedClasses++;
    }

    // C. Inspect superclass
    if (pMatch?.superclassName) {
      superclass = pMatch.superclassName;
    } else if (pMatch?.superclass) {
      superclass =
        typeof pMatch.superclass === 'string'
          ? pMatch.superclass
          : pMatch.superclass.canonicalKey ||
            pMatch.superclass.realClassName ||
            'GuiScreen';
    }

    // D. In-memory reflected fields list (empty if pool is used)
    const liveFields: Array<{
      name: string;
      typeName: string;
      simpleTypeName: string;
      isStatic: boolean;
    }> = [];

    // E. Match fields
    const fieldsOut: Record<string, any> = {};
    const tFields = spec.fields || {};

    for (const [fName, fSpec] of Object.entries(tFields)) {
      totalFields++;
      const fType =
        typeof fSpec === 'string' ? fSpec : (fSpec as any).type || 'Object';
      let fObf =
        fSpec && typeof fSpec === 'object' && fSpec.obf ? fSpec.obf : fName;
      let fMatched = false;

      // Check preMatched
      if (fObf === fName && preMatched[cKey]?.fields?.[fName]) {
        const pmF = preMatched[cKey].fields[fName];
        fObf = typeof pmF === 'string' ? pmF : pmF.obf || pmF.realName || fName;
      }
      // Check pool
      if (fObf === fName && pMatch?.fields) {
        const pField = pMatch.fields[fName];
        if (typeof pField === 'string') {
          fObf = pField;
        } else if (pField && typeof pField === 'object' && pField.realName) {
          fObf = pField.realName;
        } else if (pMatch.fieldDetails?.[fName]?.realName) {
          fObf = pMatch.fieldDetails[fName].realName;
        }
      }

      // Verify against live fields
      if (liveFields.length > 0) {
        const found = liveFields.find((lf) => lf.name === fObf);
        if (found) {
          fMatched = true;
        } else if (fObf === fName) {
          // Try type match if exact obf wasn't pre-recorded
          const typeMatch = liveFields.find((lf) => {
            return (
              lf.simpleTypeName.toLowerCase() === fType.toLowerCase() ||
              lf.typeName.endsWith('.' + fType) ||
              (canToObf && lf.simpleTypeName === canToObf.get(fType))
            );
          });
          if (typeMatch) {
            fObf = typeMatch.name;
            fMatched = true;
          }
        }
      } else if (fObf !== fName) {
        fMatched = true;
      }

      if (fMatched) matchedFields++;

      fieldsOut[fName] = {
        type: fType,
        obf: fObf,
      };
    }

    // F. In-memory reflected methods list (empty if pool is used)
    const liveMethods: Array<{
      name: string;
      returnType: string;
      simpleReturnType: string;
      paramTypes: string[];
      isStatic: boolean;
    }> = [];

    // G. Match methods
    const methodsOut: Record<string, any> = {};
    const tMethods = spec.methods || {};

    for (const [mName, rawMSpec] of Object.entries(tMethods)) {
      totalMethods++;
      const mSpec = (rawMSpec || {}) as any;
      const mParams: string[] = mSpec.params || [];
      const mRet: string = mSpec.returnType || 'void';
      const mStatic: boolean = Boolean(mSpec.isStatic);
      let mObf =
        mSpec && typeof mSpec === 'object' && mSpec.obf ? mSpec.obf : mName;
      let mMatched = false;

      // Check preMatched
      if (mObf === mName && preMatched[cKey]?.methods?.[mName]) {
        const pmM = preMatched[cKey].methods[mName];
        mObf = typeof pmM === 'string' ? pmM : pmM.obf || pmM.realName || mName;
      }
      // Check pool
      if (mObf === mName && pMatch?.methods) {
        const pMethod = pMatch.methods[mName];
        if (typeof pMethod === 'string') {
          mObf = pMethod;
        } else if (pMethod && typeof pMethod === 'object' && pMethod.realName) {
          mObf = pMethod.realName;
        } else if (pMatch.methodDetails?.[mName]?.realName) {
          mObf = pMatch.methodDetails[mName].realName;
        }
      }

      // Verify against live methods
      if (liveMethods.length > 0) {
        const found = liveMethods.find((lm) => lm.name === mObf);
        if (found) {
          mMatched = true;
        } else if (mObf === mName) {
          // Signature matching: params count + static check
          const cand = liveMethods.find((lm) => {
            return (
              lm.isStatic === mStatic &&
              lm.paramTypes.length === mParams.length &&
              (mRet === 'void' ? lm.simpleReturnType === 'void' : true)
            );
          });
          if (cand) {
            mObf = cand.name;
            mMatched = true;
          }
        }
      } else if (mObf !== mName) {
        mMatched = true;
      }

      if (mMatched) matchedMethods++;

      methodsOut[mName] = {
        params: mParams,
        returnType: mRet,
        isStatic: mStatic,
        obf: mObf,
      };
    }

    classesOut[cKey] = {
      canonical,
      superclass,
      obf,
      fields: fieldsOut,
      methods: methodsOut,
    };
  }

  const result = {
    $schema: 'neptune-mappings-v1',
    version: profile,
    profile,
    generatedAt: new Date().toISOString(),
    environment: {
      classpath: (function () {
        try {
          var S =
            typeof Java !== 'undefined' && Java.type
              ? Java.type('java.lang.System')
              : typeof java !== 'undefined'
                ? java.lang.System
                : null;
          if (!S) return [];
          var sep = S.getProperty('path.separator') || ';';
          var cp = S.getProperty('java.class.path');
          return cp ? cp.split(sep).filter(Boolean) : [];
        } catch (e) {
          return [];
        }
      })(),
      javaVersion: (function () {
        try {
          var S =
            typeof Java !== 'undefined' && Java.type
              ? Java.type('java.lang.System')
              : typeof java !== 'undefined'
                ? java.lang.System
                : null;
          return S ? S.getProperty('java.version') || '' : '';
        } catch (e) {
          return '';
        }
      })(),
    },
    stats: {
      totalClasses,
      matchedClasses,
      unmatchedClasses: totalClasses - matchedClasses,
      totalFields,
      matchedFields,
      unmatchedFields: totalFields - matchedFields,
      totalMethods,
      matchedMethods,
      unmatchedMethods: totalMethods - matchedMethods,
    },
    classes: classesOut,
  };

  print('RESULT:MAPPINGS_EXPORT|' + JSON.stringify(result));
})();

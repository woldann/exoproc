/**
 * Remote Script: Inspect Java Runtime
 * Inspects Java version, vendor, VM properties, OS environment, classpath, and memory
 * Outputs:
 * RESULT:JAVA|<json>
 */

await (async () => {
  try {
    const S =
      typeof Java !== 'undefined' && Java.type
        ? Java.type('java.lang.System')
        : typeof java !== 'undefined'
          ? java.lang.System
          : null;
    if (!S) {
      print('RESULT:JAVA_ERROR|System class not accessible');
      return;
    }

    const version = S.getProperty('java.version') || '';
    const vendor = S.getProperty('java.vendor') || '';
    const home = S.getProperty('java.home') || '';
    const vmName = S.getProperty('java.vm.name') || '';
    const vmVersion = S.getProperty('java.vm.version') || '';
    const osName = S.getProperty('os.name') || '';
    const osArch = S.getProperty('os.arch') || '';
    const osVersion = S.getProperty('os.version') || '';

    const pathSep = S.getProperty('path.separator') || ';';
    const cpRaw = S.getProperty('java.class.path') || '';
    const classpath = cpRaw ? cpRaw.split(pathSep).filter(Boolean) : [];

    let totalMemoryMb: number | undefined;
    let freeMemoryMb: number | undefined;
    let maxMemoryMb: number | undefined;

    try {
      const RCls =
        typeof Java !== 'undefined' && Java.type
          ? Java.type('java.lang.Runtime')
          : typeof java !== 'undefined'
            ? java.lang.Runtime
            : null;
      if (RCls && typeof RCls.getRuntime === 'function') {
        const r = RCls.getRuntime();
        totalMemoryMb = Math.round(Number(r.totalMemory()) / (1024 * 1024));
        freeMemoryMb = Math.round(Number(r.freeMemory()) / (1024 * 1024));
        maxMemoryMb = Math.round(Number(r.maxMemory()) / (1024 * 1024));
      }
    } catch {}

    const result = {
      version,
      vendor,
      home,
      vmName,
      vmVersion,
      osName,
      osArch,
      osVersion,
      classpath,
      classpathCount: classpath.length,
      memory: {
        totalMb: totalMemoryMb,
        freeMb: freeMemoryMb,
        maxMb: maxMemoryMb,
        usedMb:
          totalMemoryMb !== undefined && freeMemoryMb !== undefined
            ? totalMemoryMb - freeMemoryMb
            : undefined,
      },
    };

    print('RESULT:JAVA|' + JSON.stringify(result));
  } catch (err) {
    print('RESULT:JAVA_ERROR|' + String(err));
  }
})();

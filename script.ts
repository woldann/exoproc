import { Java } from 'exoproc';

// 1. Read Java version from target JVM process
const System = Java.type('java.lang.System');
print(`[+] Java Version: ${System.getProperty('java.version')}`);

// 2. Try to access Nashorn (removed in Java 15+)
try {
  const Nashorn = Java.type('jdk.nashorn.api.scripting.NashornScriptEngine');
  print('[+] Nashorn engine ready');
} catch (err: any) {
  print(`[-] Error: ${err.message}`);
}

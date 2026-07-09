import { cmachinecode, type CMachineCode } from './cmachinecode.js';
import { resolveAddress } from './ffi.js';
import { Kernel32Impl } from './win/kernel32.js';

let _cached: CMachineCode | null = null;

/**
 * Compiles the named-pipe loop machineCode once per process lifetime and caches
 * the CMachineCode object.  Kernel32 function addresses are baked in at compile
 * time (they are identical in every process on a given boot).  The pipe name
 * address is NOT baked in — it is received as `arg0` (RCX in x64 ABI) so the
 * same CMachineCode can be reused across all NamedPipeCallableAccessor instances.
 *
 * Each instance injects it via `accessor.machineCode(sc)` which allocates remote
 * memory and writes the bytes — the CMachineCode itself is only compiled once.
 */
export function getNamedPipeMachineCode(): CMachineCode {
  if (_cached) return _cached;

  const createFileAAddr = Number(
    resolveAddress((Kernel32Impl as any).CreateFileA.ptr),
  );
  const readFileAddr = Number(
    resolveAddress((Kernel32Impl as any).ReadFile.ptr),
  );
  const writeFileAddr = Number(
    resolveAddress((Kernel32Impl as any).WriteFile.ptr),
  );
  const closeHandleAddr = Number(
    resolveAddress((Kernel32Impl as any).CloseHandle.ptr),
  );

  const cSource = `
    typedef void* HANDLE;
    typedef unsigned int DWORD;
    typedef unsigned long long QWORD;
    typedef int BOOL;

    typedef struct {
        QWORD targetFunc;
        DWORD argCount;
        DWORD padding;
        QWORD args[16];
    } CallRequest;

    typedef HANDLE (*CreateFileA_t)(const char*, DWORD, DWORD, void*, DWORD, DWORD, HANDLE);
    typedef BOOL   (*ReadFile_t)(HANDLE, void*, DWORD, DWORD*, void*);
    typedef BOOL   (*WriteFile_t)(HANDLE, const void*, DWORD, DWORD*, void*);
    typedef BOOL   (*CloseHandle_t)(HANDLE);

    CreateFileA_t pCreateFileA = (CreateFileA_t) ${createFileAAddr}ULL;
    ReadFile_t    pReadFile    = (ReadFile_t)    ${readFileAddr}ULL;
    WriteFile_t   pWriteFile   = (WriteFile_t)   ${writeFileAddr}ULL;
    CloseHandle_t pCloseHandle = (CloseHandle_t) ${closeHandleAddr}ULL;

    /* arg0 = pipe name address, passed via lpParameter from CreateRemoteThread */
    const char* pName = (const char*) arg0;

    HANDLE hPipe = pCreateFileA(pName, 0xC0000000, 0, 0, 3, 0, 0);
    if (!hPipe || (QWORD)hPipe == -1ULL) return 0;

    CallRequest req;
    QWORD res = 0;

    while (1) {
        DWORD totalRead = 0;
        int readError = 0;
        while (totalRead < sizeof(CallRequest)) {
            DWORD read = 0;
            BOOL ok = pReadFile(hPipe, ((char*)&req) + totalRead, sizeof(CallRequest) - totalRead, &read, 0);
            if (!ok || read == 0) { readError = 1; break; }
            totalRead += read;
        }
        if (readError) break;

        if (req.targetFunc == 0ULL) break;

        res = 0;
        switch (req.argCount) {
            case 0:  res = ((QWORD (*)())req.targetFunc)(); break;
            case 1:  res = ((QWORD (*)(QWORD))req.targetFunc)(req.args[0]); break;
            case 2:  res = ((QWORD (*)(QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1]); break;
            case 3:  res = ((QWORD (*)(QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2]); break;
            case 4:  res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3]); break;
            case 5:  res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4]); break;
            case 6:  res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5]); break;
            case 7:  res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6]); break;
            case 8:  res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7]); break;
            case 9:  res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8]); break;
            case 10: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8],req.args[9]); break;
            case 11: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8],req.args[9],req.args[10]); break;
            case 12: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8],req.args[9],req.args[10],req.args[11]); break;
            case 13: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8],req.args[9],req.args[10],req.args[11],req.args[12]); break;
            case 14: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8],req.args[9],req.args[10],req.args[11],req.args[12],req.args[13]); break;
            case 15: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],req.args[8],req.args[9],req.args[10],req.args[11],req.args[12],req.args[13],req.args[14]); break;
            case 16: res = ((QWORD (*)(QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD,QWORD))req.targetFunc)(
                req.args[0],req.args[1],req.args[2],req.args[3],req.args[4],req.args[5],req.args[6],req.args[7],
                req.args[8],req.args[9],req.args[10],req.args[11],req.args[12],req.args[13],req.args[14],req.args[15]
            ); break;
            default: break;
        }

        DWORD totalWritten = 0;
        int writeError = 0;
        while (totalWritten < sizeof(res)) {
            DWORD written = 0;
            BOOL ok = pWriteFile(hPipe, ((char*)&res) + totalWritten, sizeof(res) - totalWritten, &written, 0);
            if (!ok || written == 0) { writeError = 1; break; }
            totalWritten += written;
        }
        if (writeError) break;
    }
    pCloseHandle(hPipe);
    return 0;
  `;

  _cached = cmachinecode({ source: cSource, returns: 'int', args: ['u64'] });
  return _cached;
}

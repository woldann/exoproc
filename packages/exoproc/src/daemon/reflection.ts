export interface ReflectionClassInfo {
  id: number;
  name: string;
  simpleName: string;
  isInterface: boolean;
  isArray: boolean;
  isPrimitive: boolean;
  superclass: string | null;
  methods: Array<{
    id: number;
    name: string;
    returnType: string;
    params: string[];
    static: boolean;
    modifiers: number;
  }>;
  fields: Array<{
    id: number;
    name: string;
    type: string;
    static: boolean;
    modifiers: number;
  }>;
  constructors: Array<{
    id: number;
    params: string[];
    modifiers: number;
  }>;
}

export interface SerializedValue {
  success: boolean;
  isObject: boolean;
  value?: any;
  handle?: number;
  className?: string;
  toString?: string | (() => string);
  error?: string;
}

export class DaemonReflectionService {
  private nextId = 1;
  private nextHandle = 1;

  public readonly objectRegistry = new Map<number, any>();
  public readonly classRegistry = new Map<number, any>();
  public readonly classNameToId = new Map<string, number>();
  public readonly methodRegistry = new Map<number, any>();
  public readonly fieldRegistry = new Map<number, any>();
  public readonly ctorRegistry = new Map<number, any>();

  // Callbacks and event bus
  public readonly invocationQueue: Array<{
    id: number;
    callbackId: string;
    method: string;
    args: any[];
  }> = [];

  public readonly pendingCallbackReplies = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();

  public clear(): void {
    this.objectRegistry.clear();
    this.classRegistry.clear();
    this.classNameToId.clear();
    this.methodRegistry.clear();
    this.fieldRegistry.clear();
    this.ctorRegistry.clear();
    this.invocationQueue.length = 0;
    this.pendingCallbackReplies.clear();
  }

  public serializeValue(val: any): SerializedValue {
    if (val === null || val === undefined) {
      return { success: true, isObject: false, value: null };
    }

    if (
      typeof val === 'boolean' ||
      typeof val === 'number' ||
      typeof val === 'string'
    ) {
      return { success: true, isObject: false, value: val };
    }

    if (typeof val === 'bigint') {
      const handle = this.nextHandle++;
      this.objectRegistry.set(handle, {
        ptr: val,
        className: 'java.lang.Object',
      });
      return {
        success: true,
        isObject: true,
        handle,
        className: 'java.lang.Object',
        toString: `[Java Object @ 0x${val.toString(16)}]`,
      };
    }

    const handle = this.nextHandle++;
    const className =
      val.$className ||
      val.$class?.name ||
      (val.constructor ? val.constructor.name : 'java.lang.Object');
    this.objectRegistry.set(handle, val);
    return {
      success: true,
      isObject: true,
      handle,
      className,
      toString: String(val),
    };
  }

  public serializeObject(ptrOrObj: any, className: string): SerializedValue {
    if (ptrOrObj === null || ptrOrObj === undefined || ptrOrObj === 0n) {
      return { success: true, isObject: false, value: null };
    }
    const handle = this.nextHandle++;
    const stored =
      typeof ptrOrObj === 'bigint' ? { ptr: ptrOrObj, className } : ptrOrObj;
    this.objectRegistry.set(handle, stored);
    const toStringStr =
      typeof ptrOrObj === 'bigint'
        ? `[Java ${className} @ 0x${ptrOrObj.toString(16)}]`
        : String(ptrOrObj);
    return {
      success: true,
      isObject: true,
      handle,
      className,
      toString: toStringStr,
    };
  }

  public unwrapHandle(handleVal: any): any {
    if (handleVal === null || handleVal === undefined) return null;
    if (
      typeof handleVal === 'object' &&
      ('handle' in handleVal || '$handle' in handleVal)
    ) {
      const h = Number(handleVal.handle ?? handleVal.$handle);
      const found = this.objectRegistry.get(h);
      if (found) {
        return found.ptr ?? found.$ptr ?? found;
      }
    }
    if (typeof handleVal === 'number' && this.objectRegistry.has(handleVal)) {
      const found = this.objectRegistry.get(handleVal);
      return found.ptr ?? found.$ptr ?? found;
    }
    return handleVal;
  }

  public unwrapArgs(rawArgs: any[]): any[] {
    if (!Array.isArray(rawArgs)) return [];
    return rawArgs.map((arg) => {
      if (arg === null || arg === undefined) return null;
      if (typeof arg === 'object') {
        if ('handle' in arg || '$handle' in arg) {
          return this.unwrapHandle(arg);
        }
        if (Array.isArray(arg)) {
          return this.unwrapArgs(arg);
        }
      }
      return arg;
    });
  }

  public inspectClass(className: string, currentJava: any): any {
    if (!currentJava) {
      return {
        success: false,
        error: 'Daemon not attached to target Java runtime',
      };
    }

    try {
      let targetName = className;
      if (
        targetName === 'Exoproc' ||
        targetName === 'org.exoproc.njava.agent.NJavaAgent'
      ) {
        targetName = 'org.exoproc.njava.agent.utils.Exoproc';
      }

      const existingId = this.classNameToId.get(targetName);
      if (existingId !== undefined && this.classRegistry.has(existingId)) {
        const cached = this.classRegistry.get(existingId);
        if (cached && cached.info) return { success: true, ...cached.info };
      }

      let reflectedClass: any = null;

      // 1. Try finding via bridge getClassSync / findClassSync
      if (currentJava.bridge) {
        if (typeof currentJava.bridge.getClassSync === 'function') {
          try {
            reflectedClass = currentJava.bridge.getClassSync(targetName);
          } catch {}
        }
        if (
          !reflectedClass &&
          typeof currentJava.bridge.findClassSync === 'function'
        ) {
          try {
            reflectedClass = currentJava.bridge.findClassSync(targetName);
          } catch {}
        }
      }

      // 2. Try currentJava.findClass or currentJava.type
      if (!reflectedClass && typeof currentJava.type === 'function') {
        try {
          const proxy = currentJava.type(targetName);
          const rawSym = Object.getOwnPropertySymbols(proxy).find(
            (s) => s.description === 'njava.rawClass',
          );
          if (rawSym) reflectedClass = proxy[rawSym];
        } catch {}
      }

      if (!reflectedClass) {
        return { success: false, error: `Class not found: ${targetName}` };
      }

      const classId = this.nextId++;
      const simpleName =
        typeof reflectedClass.getSimpleName === 'function'
          ? reflectedClass.getSimpleName()
          : targetName.split('.').pop() || targetName;

      const isInterface = Boolean(
        reflectedClass.toString &&
        reflectedClass.toString().startsWith('interface '),
      );
      const isArray = targetName.startsWith('[');
      const isPrimitive = false;
      const superclass = reflectedClass.getSuperclassSync
        ? (reflectedClass.getSuperclassSync()?.name ?? null)
        : null;

      // Inspect methods
      const rawMethods: any[] = reflectedClass.getAllMethodsSync
        ? reflectedClass.getAllMethodsSync()
        : reflectedClass.getDeclaredMethodsSync
          ? reflectedClass.getDeclaredMethodsSync()
          : [];

      const methodsList: Array<any> = [];
      for (const m of rawMethods) {
        const mId = this.nextId++;
        this.methodRegistry.set(mId, m);
        methodsList.push({
          id: mId,
          name: m.name,
          returnType: m.returnType || m.type || 'void',
          params: Array.from(m.paramTypes || []),
          static: Boolean(m.isStatic),
          modifiers: m.isStatic ? 9 : 1,
        });
      }

      // Inspect fields
      const rawFields: any[] = reflectedClass.getDeclaredFieldsSync
        ? reflectedClass.getDeclaredFieldsSync()
        : [];

      const fieldsList: Array<any> = [];
      for (const f of rawFields) {
        const fId = this.nextId++;
        this.fieldRegistry.set(fId, f);
        fieldsList.push({
          id: fId,
          name: f.name,
          type: f.type || 'java.lang.Object',
          static: Boolean(f.isStatic),
          modifiers: f.isStatic ? 9 : 1,
        });
      }

      // Inspect constructors
      const rawCtors: any[] = reflectedClass.getDeclaredConstructorsSync
        ? reflectedClass.getDeclaredConstructorsSync()
        : [];

      const ctorsList: Array<any> = [];
      for (const c of rawCtors) {
        const cId = this.nextId++;
        this.ctorRegistry.set(cId, { ...c, reflectedClass });
        ctorsList.push({
          id: cId,
          params: Array.from(c.paramTypes || []),
          modifiers: 1,
        });
      }

      const info: ReflectionClassInfo = {
        id: classId,
        name: targetName,
        simpleName,
        isInterface,
        isArray,
        isPrimitive,
        superclass,
        methods: methodsList,
        fields: fieldsList,
        constructors: ctorsList,
      };

      this.classRegistry.set(classId, { reflectedClass, info });
      this.classNameToId.set(targetName, classId);

      return {
        success: true,
        classId,
        name: targetName,
        simpleName,
        isInterface,
        isArray,
        isPrimitive,
        superclass,
        methods: methodsList,
        fields: fieldsList,
        constructors: ctorsList,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public invokeMethod(req: any, currentJava: any): any {
    if (!currentJava) {
      return {
        success: false,
        error: 'Daemon not attached to target Java runtime',
      };
    }

    try {
      const methodId = req.methodId !== undefined ? Number(req.methodId) : null;
      const targetHandle =
        req.targetHandle !== undefined ? Number(req.targetHandle) : 0;
      const rawArgs = Array.isArray(req.args) ? req.args : [];

      let method = methodId !== null ? this.methodRegistry.get(methodId) : null;

      // Fallback: match by name and class if methodId not supplied
      if (!method && req.methodName) {
        let cls: any = null;
        if (req.classId !== undefined) {
          cls = this.classRegistry.get(Number(req.classId))?.reflectedClass;
        } else if (targetHandle !== 0) {
          const target = this.objectRegistry.get(targetHandle);
          if (target && target.$class) cls = target.$class;
        }

        if (cls && typeof cls.findMethodSync === 'function') {
          method = cls.findMethodSync(req.methodName);
        }
      }

      if (!method) {
        return {
          success: false,
          error: `Method not found for request: ${JSON.stringify(req)}`,
        };
      }

      // Resolve instance pointer
      let targetInstance: any = 0n;
      if (targetHandle !== 0) {
        const stored = this.objectRegistry.get(targetHandle);
        if (stored) {
          targetInstance = stored.ptr ?? stored.$ptr ?? stored;
        }
      }

      const convertedArgs = this.unwrapArgs(rawArgs);

      const returnType = method.returnType || method.type || 'void';
      const isVoid = returnType === 'void';
      const isPrimitive = [
        'int',
        'boolean',
        'double',
        'float',
        'long',
        'char',
        'byte',
        'short',
        'java.lang.String',
      ].includes(returnType);

      if (isVoid) {
        if (typeof method.invokeSync === 'function') {
          method.invokeSync(targetInstance, convertedArgs);
        } else if (typeof method.invoke === 'function') {
          method.invoke(targetInstance, convertedArgs);
        }
        return this.serializeValue(null);
      }

      if (isPrimitive) {
        let val: any = null;
        if (typeof method.invokeSync === 'function') {
          val = method.invokeSync(targetInstance, convertedArgs);
        } else if (typeof method.invoke === 'function') {
          val = method.invoke(targetInstance, convertedArgs);
        }
        return this.serializeValue(val);
      }

      // Object return: invoke raw pointer to keep handle in JVM
      let rawPtr: any = null;
      if (typeof method.invokeRawSync === 'function') {
        rawPtr = method.invokeRawSync(targetInstance, convertedArgs);
      } else if (typeof method.invokeSync === 'function') {
        rawPtr = method.invokeSync(targetInstance, convertedArgs);
      }

      if (rawPtr === 0n || rawPtr === null || rawPtr === undefined) {
        return this.serializeValue(null);
      }

      return this.serializeObject(rawPtr, returnType);
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public getField(req: any, currentJava: any): any {
    if (!currentJava) {
      return {
        success: false,
        error: 'Daemon not attached to target Java runtime',
      };
    }

    try {
      const fieldId = req.fieldId !== undefined ? Number(req.fieldId) : null;
      const targetHandle =
        req.targetHandle !== undefined ? Number(req.targetHandle) : 0;

      let field = fieldId !== null ? this.fieldRegistry.get(fieldId) : null;
      if (!field && req.fieldName && req.classId !== undefined) {
        const cls = this.classRegistry.get(Number(req.classId))?.reflectedClass;
        if (cls && typeof cls.findFieldSync === 'function') {
          field = cls.findFieldSync(req.fieldName);
        }
      }

      if (!field) {
        return {
          success: false,
          error: `Field not found for request: ${JSON.stringify(req)}`,
        };
      }

      let targetInstance: any = 0n;
      if (targetHandle !== 0) {
        const stored = this.objectRegistry.get(targetHandle);
        if (stored) {
          targetInstance = stored.ptr ?? stored.$ptr ?? stored;
        }
      }

      const fType = field.type || 'java.lang.Object';
      const isPrimitive = [
        'int',
        'boolean',
        'double',
        'float',
        'long',
        'char',
        'byte',
        'short',
        'java.lang.String',
      ].includes(fType);

      if (isPrimitive) {
        const val =
          typeof field.getSync === 'function'
            ? field.getSync(targetInstance)
            : field.get(targetInstance);
        return this.serializeValue(val);
      }

      let rawPtr: any = null;
      if (typeof field.getRawSync === 'function') {
        rawPtr = field.getRawSync(targetInstance);
      } else if (typeof field.getSync === 'function') {
        rawPtr = field.getSync(targetInstance);
      }

      if (rawPtr === 0n || rawPtr === null || rawPtr === undefined) {
        return this.serializeValue(null);
      }

      return this.serializeObject(rawPtr, fType);
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public setField(req: any, currentJava: any): any {
    if (!currentJava) {
      return {
        success: false,
        error: 'Daemon not attached to target Java runtime',
      };
    }

    try {
      const fieldId = req.fieldId !== undefined ? Number(req.fieldId) : null;
      const targetHandle =
        req.targetHandle !== undefined ? Number(req.targetHandle) : 0;
      const rawVal = req.value;

      let field = fieldId !== null ? this.fieldRegistry.get(fieldId) : null;
      if (!field && req.fieldName && req.classId !== undefined) {
        const cls = this.classRegistry.get(Number(req.classId))?.reflectedClass;
        if (cls && typeof cls.findFieldSync === 'function') {
          field = cls.findFieldSync(req.fieldName);
        }
      }

      if (!field) {
        return {
          success: false,
          error: `Field not found for request: ${JSON.stringify(req)}`,
        };
      }

      let targetInstance: any = 0n;
      if (targetHandle !== 0) {
        const stored = this.objectRegistry.get(targetHandle);
        if (stored) {
          targetInstance = stored.ptr ?? stored.$ptr ?? stored;
        }
      }

      const convertedVal = this.unwrapHandle(rawVal);
      if (typeof field.setSync === 'function') {
        field.setSync(convertedVal, targetInstance);
      } else if (typeof field.set === 'function') {
        field.set(convertedVal, targetInstance);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public constructInstance(req: any, currentJava: any): any {
    if (!currentJava) {
      return {
        success: false,
        error: 'Daemon not attached to target Java runtime',
      };
    }

    try {
      const ctorId = req.ctorId !== undefined ? Number(req.ctorId) : null;
      const classId = req.classId !== undefined ? Number(req.classId) : null;
      const rawArgs = Array.isArray(req.args) ? req.args : [];

      const ctorEntry = ctorId !== null ? this.ctorRegistry.get(ctorId) : null;
      let targetClass =
        classId !== null
          ? this.classRegistry.get(classId)?.reflectedClass
          : null;

      if (!targetClass && ctorEntry?.reflectedClass) {
        targetClass = ctorEntry.reflectedClass;
      }

      if (!targetClass) {
        return {
          success: false,
          error: `Class not found for constructor request: ${JSON.stringify(req)}`,
        };
      }

      const convertedArgs = this.unwrapArgs(rawArgs);

      if (typeof currentJava.type === 'function') {
        const ProxyCls = currentJava.type(targetClass.name);
        const instance = new ProxyCls(...convertedArgs);
        return this.serializeObject(instance, targetClass.name);
      }

      return {
        success: false,
        error: 'Constructor execution unsupported without Java context',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public getObjectClass(handle: number): any {
    const target = this.objectRegistry.get(Number(handle));
    if (!target) {
      return { success: false, error: `Object handle not found: ${handle}` };
    }

    const className =
      target.className ||
      target.$className ||
      (target.constructor ? target.constructor.name : 'java.lang.Object');
    const classId = this.classNameToId.get(className) ?? 0;
    return {
      success: true,
      classId,
      name: className,
    };
  }

  public getObjectString(handle: number): any {
    const target = this.objectRegistry.get(Number(handle));
    if (!target) {
      return { success: false, error: `Object handle not found: ${handle}` };
    }
    const val =
      typeof target.ptr === 'bigint'
        ? `[Java ${target.className || 'Object'} @ 0x${target.ptr.toString(16)}]`
        : String(target);
    return { success: true, value: val };
  }

  public releaseHandles(handles: number[]): any {
    if (Array.isArray(handles)) {
      for (const h of handles) {
        this.objectRegistry.delete(Number(h));
      }
    }
    return { success: true };
  }
}

export const reflectionService = new DaemonReflectionService();

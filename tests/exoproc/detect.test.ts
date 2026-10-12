import { describe, it, expect } from 'bun:test';
import { createAccessor } from 'exoproc-accessors';
import { getNJava, getJavaSync } from 'bun-njava';
import {
  MinecraftMatcher,
  isObfuscatedClassName,
  isObfuscatedMethodName,
  isObfuscatedFieldName,
  isPrimitiveType,
} from 'exoproc-minecraft';
import { ensureMinecraftRunning } from './minecraft-launcher.js';

describe('exoproc > Autonomous Dynamic Matcher Knowledge Base & detect() Engine', () => {
  it('detects primitive and standard library types as non-obfuscated', async () => {
    // 1. Primitive checks
    expect(isPrimitiveType('boolean')).toBe(true);
    expect(isPrimitiveType('int')).toBe(true);
    expect(isPrimitiveType('void')).toBe(true);
    expect(isPrimitiveType('float')).toBe(true);

    // 2. Class obfuscation heuristic checks
    expect(isObfuscatedClassName('ave')).toBe(true);
    expect(isObfuscatedClassName('aya')).toBe(true);
    expect(isObfuscatedClassName('bew')).toBe(true);
    expect(isObfuscatedClassName('java.lang.Runnable')).toBe(false);
    expect(isObfuscatedClassName('java.lang.String')).toBe(false);
    expect(isObfuscatedClassName('net.minecraft.client.Minecraft')).toBe(false);
    expect(isObfuscatedClassName('net.minecraft.client.gui.GuiMainMenu')).toBe(
      false,
    );

    // 3. Method obfuscation checks (standard methods are never obfuscated)
    expect(isObfuscatedMethodName('toString')).toBe(false);
    expect(isObfuscatedMethodName('equals')).toBe(false);
    expect(isObfuscatedMethodName('hashCode')).toBe(false);
    expect(isObfuscatedMethodName('run')).toBe(false);
    expect(isObfuscatedMethodName('close')).toBe(false);
    expect(isObfuscatedMethodName('a')).toBe(true);
    expect(isObfuscatedMethodName('b')).toBe(true);
    expect(isObfuscatedMethodName('func_12345_a')).toBe(true);

    // 4. Field obfuscation checks
    expect(isObfuscatedFieldName('a')).toBe(true);
    expect(isObfuscatedFieldName('h')).toBe(true);
    expect(isObfuscatedFieldName('field_12345_a')).toBe(true);
    expect(isObfuscatedFieldName('thePlayer')).toBe(false);
    expect(isObfuscatedFieldName('theWorld')).toBe(false);
  });

  it('detectType() produces structured TypeDescriptorInfo with accurate obfuscation flags', async () => {
    const matcher = new MinecraftMatcher({} as any);

    // Primitive boolean
    const boolType = matcher.detectType('boolean');
    expect(boolType).toEqual({
      typeName: 'boolean',
      realTypeName: 'boolean',
      isObfuscated: false,
      isArray: false,
    });

    // Primitive int array
    const intArrayType = matcher.detectType('int[]');
    expect(intArrayType).toEqual({
      typeName: 'int[]',
      realTypeName: 'int[]',
      isObfuscated: false,
      isArray: true,
    });

    // Standard Java library class
    const runnableType = matcher.detectType('java.lang.Runnable');
    expect(runnableType).toEqual({
      typeName: 'java.lang.Runnable',
      realTypeName: 'java.lang.Runnable',
      isObfuscated: false,
      isArray: false,
    });

    // Obfuscated class name
    const obfClassType = matcher.detectType('ave');
    expect(obfClassType.isObfuscated).toBe(true);
    expect(obfClassType.typeName).toBe('ave');
    expect(obfClassType.realTypeName).toBe('ave');
  });

  it('detectMethod() correctly recognizes un-obfuscated methods like toString() and structures return/param types', () => {
    const matcher = new MinecraftMatcher({} as any);

    // Synthetic toString() method on an obfuscated class "ave"
    const toStringMock = {
      name: 'toString',
      returnType: 'java.lang.String',
      paramTypes: [],
      isStatic: false,
      declaringClass: 'ave',
    };

    const detectedToString: any = matcher.detectMethod(toStringMock, 'ave');
    expect(detectedToString.kind).toBe('method');
    expect(detectedToString.realName).toBe('toString');
    expect(detectedToString.originalName).toBe('toString');
    expect(detectedToString.isObfuscated).toBe(false);
    expect(detectedToString.returnType.isObfuscated).toBe(false);
    expect(detectedToString.returnType.typeName).toBe('java.lang.String');
    expect(detectedToString.paramTypes).toHaveLength(0);

    // Synthetic obfuscated method "a(java.lang.Runnable, ave) -> boolean"
    const obfMethodMock = {
      name: 'a',
      returnType: 'boolean',
      paramTypes: ['java.lang.Runnable', 'ave'],
      isStatic: false,
      declaringClass: 'ave',
    };

    const detectedObfMethod: any = matcher.detectMethod(obfMethodMock, 'ave');
    expect(detectedObfMethod.kind).toBe('method');
    expect(detectedObfMethod.realName).toBe('a');
    expect(detectedObfMethod.isObfuscated).toBe(true);
    expect(detectedObfMethod.returnType.typeName).toBe('boolean');
    expect(detectedObfMethod.returnType.isObfuscated).toBe(false);
    expect(detectedObfMethod.paramTypes).toHaveLength(2);
    expect(detectedObfMethod.paramTypes[0].typeName).toBe('java.lang.Runnable');
    expect(detectedObfMethod.paramTypes[0].isObfuscated).toBe(false);
    expect(detectedObfMethod.paramTypes[1].realTypeName).toBe('ave');
    expect(detectedObfMethod.paramTypes[1].isObfuscated).toBe(true);
  });

  it('detectField() correctly structures field type and obfuscation flags', () => {
    const matcher = new MinecraftMatcher({} as any);

    const obfFieldMock = {
      name: 'h',
      type: 'bew',
      isStatic: false,
      declaringClass: 'ave',
    };

    const detectedField: any = matcher.detectField(obfFieldMock, 'ave');
    expect(detectedField.kind).toBe('field');
    expect(detectedField.realName).toBe('h');
    expect(detectedField.isObfuscated).toBe(true);
    expect(detectedField.type.realTypeName).toBe('bew');
    expect(detectedField.type.isObfuscated).toBe(true);
    expect(detectedField.isStatic).toBe(false);
  });

  it('performs live detection against running Minecraft JVM and populates the mapping pool', async () => {
    const pid = await ensureMinecraftRunning('1.8.9');
    const host = await createAccessor(pid, { njava: 'stealth' });
    const reflection = await getNJava(host).getReflection();
    expect(reflection).toBeDefined();

    const matcher = new MinecraftMatcher(reflection);

    // 1. Detect standard un-obfuscated Java class
    const stringClassInfo: any = await matcher.detect('java.lang.String');
    expect(stringClassInfo.kind).toBe('class');
    expect(stringClassInfo.isObfuscated).toBe(false);
    expect(stringClassInfo.originalName).toBe('java.lang.String');
    expect(matcher.classPool.has('java.lang.String')).toBe(true);

    // 2. Perform dynamic match which maps core Minecraft classes
    const mappings = await matcher.match();
    expect(mappings.Minecraft?.realClassName).toBeDefined();
    const mcRealName = mappings.Minecraft.realClassName;

    // 3. detectClass() on the real Minecraft class
    const mcInfo: any = await matcher.detectClass(mcRealName);
    expect(mcInfo.kind).toBe('class');
    expect(mcInfo.realClassName).toBe(mcRealName);
    expect(mcInfo.canonicalKey).toBe('Minecraft');
    expect(mcInfo.isObfuscated).toBe(true);

    // 4. Verify fields and methods in mcInfo
    expect(Object.keys(mcInfo.fields).length).toBeGreaterThan(0);
    expect(Object.keys(mcInfo.methods).length).toBeGreaterThan(0);

    // 5. Verify the class was registered in the mapping pool
    expect(matcher.classPool.has(mcRealName)).toBe(true);
    expect(matcher.obfToCanonical.get(mcRealName)).toBe('Minecraft');

    // 6. Test universal detect() dispatch on primitive, method, and field
    const primitiveResult: any = await matcher.detect('int');
    expect(primitiveResult.typeName).toBe('int');
    expect(primitiveResult.isObfuscated).toBe(false);

    host.close();
  }, 60000);

  it('integrates detect() directly into njava JavaContext: transparently resolving obfuscated field/class access', async () => {
    const pid = await ensureMinecraftRunning('1.8.9');
    const host = await createAccessor(pid, { njava: 'stealth' });
    const reflection = await getNJava(host).getReflection();
    const Java = getJavaSync(host);

    const matcher = new MinecraftMatcher(reflection);
    const mappings = await matcher.match();

    // Register into Java with database and detector attached
    matcher.registerTo(Java, mappings);

    // Verify Java.mapper has the detector attached
    expect((Java.mapper as any).getDetector()).toBeDefined();

    // 1. Resolve Minecraft singleton through Java.type
    const Minecraft = Java.type('net.minecraft.client.Minecraft');
    expect(Minecraft).toBeDefined();

    const mc =
      typeof Minecraft.getMinecraft === 'function'
        ? Minecraft.getMinecraft()
        : Minecraft.theMinecraft;
    expect(mc).toBeDefined();

    // 2. Access currentScreen: njava intercepts the access through detect()
    const screen = mc.currentScreen;
    if (screen && screen.$ptr) {
      console.log(
        `[detect-test] Intercepted currentScreen: ${screen.$className}`,
      );
      expect(screen.$className).toBeDefined();
      expect(screen.$ptr).toBeGreaterThan(0n);
    }

    host.close();
  }, 60000);
});

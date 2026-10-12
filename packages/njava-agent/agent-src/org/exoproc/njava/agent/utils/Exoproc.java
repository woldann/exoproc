package org.exoproc.njava.agent.utils;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import javax.script.Bindings;
import javax.script.ScriptEngine;
import javax.script.ScriptEngineManager;
import java.io.*;
import java.lang.instrument.Instrumentation;
import java.lang.management.ManagementFactory;
import java.lang.reflect.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Exoproc - Universal Consolidated In-Process Java Bridge, Reflection RPC Server, and Headless Inspector.
 *
 * Self-contained single class (zero inner classes, zero external dependencies).
 * Can be defined directly into target JVM memory (defineClass) without writing any JAR to disk,
 * or packaged into njava-agent.jar for standalone CLI inspection and -javaagent execution.
 */
public class Exoproc implements HttpHandler, Runnable, Callable<Object> {

    public static final int DEFAULT_PORT = 43378;

    private static volatile Exoproc instance = null;
    private static volatile HttpServer httpServer = null;
    private static volatile ClassLoader targetLoader = null;
    private static volatile Instrumentation instrumentation = null;
    private static volatile ScriptEngine scriptEngine = null;
    private static volatile String targetJarPath = null;
    private static volatile List<String> targetJarClasses = new ArrayList<String>();
    private static volatile boolean isStandalone = false;
    private static volatile int activePort = DEFAULT_PORT;

    // Reflection & Object Registries
    private final AtomicLong nextId = new AtomicLong(1);
    private final AtomicLong nextHandle = new AtomicLong(1);
    private final ConcurrentHashMap<Long, Class<?>> classRegistry = new ConcurrentHashMap<Long, Class<?>>();
    private final ConcurrentHashMap<String, Long> classNameToId = new ConcurrentHashMap<String, Long>();
    private final ConcurrentHashMap<Long, Method> methodRegistry = new ConcurrentHashMap<Long, Method>();
    private final ConcurrentHashMap<Long, Field> fieldRegistry = new ConcurrentHashMap<Long, Field>();
    private final ConcurrentHashMap<Long, Constructor<?>> ctorRegistry = new ConcurrentHashMap<Long, Constructor<?>>();
    private final ConcurrentHashMap<Long, Object> objectRegistry = new ConcurrentHashMap<Long, Object>();

    // SAM Callback Queues & Invocations
    private static final AtomicLong nextInvocationId = new AtomicLong(1);
    private static final ConcurrentHashMap<Long, Map<String, Object>> pendingInvocations =
        new ConcurrentHashMap<Long, Map<String, Object>>();
    private static final BlockingQueue<Map<String, Object>> invocationQueue =
        new LinkedBlockingQueue<Map<String, Object>>();
    private static volatile long defaultTimeoutSeconds = 30;

    // Fields for executor task execution (satisfies Runnable & Callable without inner classes)
    private Method execMethod = null;
    private Object execTarget = null;
    private Object[] execArgs = null;
    private CountDownLatch execLatch = null;
    private Object[] execBox = null;
    private Throwable[] execErr = null;

    public Exoproc() {}

    public Exoproc(Method m, Object target, Object[] args, CountDownLatch latch, Object[] box, Throwable[] err) {
        this.execMethod = m;
        this.execTarget = target;
        this.execArgs = args;
        this.execLatch = latch;
        this.execBox = box;
        this.execErr = err;
    }

    // =========================================================================
    // Entrypoints: JVM Startup, Dynamic Attach, URLClassLoader, In-Memory
    // =========================================================================

    public static void premain(String agentArgs, Instrumentation inst) {
        init(agentArgs, null, inst, DEFAULT_PORT);
    }

    public static void agentmain(String agentArgs, Instrumentation inst) {
        init(agentArgs, null, inst, DEFAULT_PORT);
    }

    public static void start() {
        start(DEFAULT_PORT);
    }

    public static void start(int port) {
        init(null, Thread.currentThread().getContextClassLoader(), null, port);
    }

    public static void start(int port, ClassLoader classLoader) {
        init(null, classLoader, null, port);
    }

    public static synchronized void init(String agentArgs, ClassLoader classLoader, Instrumentation inst, int defaultPort) {
        if (httpServer != null) {
            System.out.println("[Exoproc] Already running on port " + activePort);
            return;
        }

        int port = defaultPort;
        String sysPort = System.getProperty("tc.njava.port");
        if (sysPort == null) sysPort = System.getenv("NJAVA_PORT");
        if (sysPort != null && !sysPort.trim().isEmpty()) {
            try { port = Integer.parseInt(sysPort.trim()); } catch (Exception ignored) {}
        }

        if (agentArgs != null && !agentArgs.trim().isEmpty()) {
            for (String part : agentArgs.split("[,;]")) {
                String[] kv = part.split("=");
                if (kv.length == 2 && "port".equalsIgnoreCase(kv[0].trim())) {
                    try { port = Integer.parseInt(kv[1].trim()); } catch (Exception ignored) {}
                }
            }
        }

        activePort = port;
        targetLoader = classLoader != null ? classLoader : Thread.currentThread().getContextClassLoader();
        instrumentation = inst;
        instance = new Exoproc();

        Thread agentThread = new Thread(instance, "Exoproc-Bootstrap");
        agentThread.setDaemon(true);
        agentThread.start();
    }

    public static boolean isRunning() {
        return httpServer != null;
    }

    public static int getPort() {
        return activePort;
    }

    public static Exoproc getInstance() {
        return instance;
    }

    public static HttpServer getHttpServer() {
        return httpServer;
    }

    public static String getTargetJarPath() {
        return targetJarPath;
    }

    public static List<String> getTargetJarClasses() {
        return targetJarClasses;
    }

    public static boolean isStandalone() {
        return isStandalone;
    }

    // =========================================================================
    // Runnable & Callable implementation (Server bootstrap + Executor tasks)
    // =========================================================================

    @Override
    public void run() {
        if (execLatch != null) {
            try {
                if (execMethod != null) {
                    execBox[0] = execMethod.invoke(execTarget, execArgs);
                }
            } catch (InvocationTargetException ite) {
                execErr[0] = ite.getCause() != null ? ite.getCause() : ite;
            } catch (Throwable t) {
                execErr[0] = t;
            } finally {
                execLatch.countDown();
            }
            return;
        }

        try {
            System.out.println("[Exoproc] Initializing runtime environment on port " + activePort + "...");
            initScriptEngine(targetLoader);

            HttpServer server = HttpServer.create(new InetSocketAddress(activePort), 0);
            server.setExecutor(Executors.newCachedThreadPool());
            server.createContext("/", this);
            server.start();

            httpServer = server;
            System.out.println("[Exoproc] Successfully initialized on port " + activePort);
        } catch (Exception e) {
            System.err.println("[Exoproc] Failed to start agent HTTP server: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public Object call() throws Exception {
        run();
        if (execErr != null && execErr[0] != null) {
            throw (execErr[0] instanceof Exception) ? (Exception) execErr[0] : new RuntimeException(execErr[0]);
        }
        return execBox != null ? execBox[0] : null;
    }

    // =========================================================================
    // Central HTTP Request Handler (All routes in one place, zero inner classes)
    // =========================================================================

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        if ("/status".equals(path)) {
            long uptime = ManagementFactory.getRuntimeMXBean().getUptime();
            String jarEscaped = targetJarPath != null ? targetJarPath.replace("\\", "\\\\").replace("\"", "\\\"") : "";
            sendJsonResponse(exchange, 200, "{\"alive\":true,\"port\":" + activePort + ",\"uptime\":" + uptime + ",\"isStandalone\":" + isStandalone + ",\"targetJar\":\"" + jarEscaped + "\",\"classCount\":" + targetJarClasses.size() + "}");
            return;
        }

        if ("/classes".equals(path)) {
            List<String> list = targetJarClasses;
            StringBuilder sb = new StringBuilder();
            sb.append("{\"count\":").append(list.size()).append(",\"classes\":[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append('"').append(list.get(i)).append('"');
            }
            sb.append("]}");
            sendJsonResponse(exchange, 200, sb.toString());
            return;
        }

        if ("/shutdown".equals(path)) {
            sendJsonResponse(exchange, 200, "{\"success\":true}");
            stop();
            return;
        }

        if (!"POST".equalsIgnoreCase(method)) {
            sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
            return;
        }

        String body = readRequestBody(exchange).trim();
        Object parsed = parseJson(body);
        @SuppressWarnings("unchecked")
        Map<String, Object> req = (parsed instanceof Map) ? (Map<String, Object>) parsed : new HashMap<String, Object>();

        if ("/eval".equals(path)) {
            String code = "";
            if (req.containsKey("code")) {
                Object c = req.get("code");
                if (c != null) code = c.toString();
            } else if (!body.startsWith("{")) {
                code = body;
            }
            Map<String, Object> evalRes = evaluateScript(code);
            sendJsonResponse(exchange, 200, stringifyJson(evalRes));
            return;
        }

        if ("/reflection/class".equals(path)) {
            String className = (String) req.get("name");
            if (className == null && !body.startsWith("{")) className = body;
            if (className == null) {
                sendJsonResponse(exchange, 400, "{\"success\":false,\"error\":\"Missing 'name' parameter\"}");
                return;
            }
            Map<String, Object> res = inspectClass(className);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/invoke".equals(path)) {
            Map<String, Object> res = invokeMethod(req);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/field/get".equals(path)) {
            Map<String, Object> res = getField(req);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/field/set".equals(path)) {
            Map<String, Object> res = setField(req);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/construct".equals(path)) {
            Map<String, Object> res = constructInstance(req);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/object/class".equals(path)) {
            long handle = req.get("handle") != null ? ((Number) req.get("handle")).longValue() : 0L;
            Map<String, Object> res = getObjectClass(handle);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/object/string".equals(path)) {
            long handle = req.get("handle") != null ? ((Number) req.get("handle")).longValue() : 0L;
            Map<String, Object> res = getObjectString(handle);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/reflection/release".equals(path)) {
            List<?> handles = (List<?>) req.get("handles");
            Map<String, Object> res = releaseHandles(handles);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/callback/poll".equals(path)) {
            long timeoutMs = req.get("timeoutMs") != null ? ((Number) req.get("timeoutMs")).longValue() : 1000L;
            Map<String, Object> evt = null;
            try { evt = invocationQueue.poll(timeoutMs, TimeUnit.MILLISECONDS); } catch (Exception ignored) {}
            Map<String, Object> res = new LinkedHashMap<String, Object>();
            res.put("success", true);
            res.put("event", evt);
            sendJsonResponse(exchange, 200, stringifyJson(res));
            return;
        }

        if ("/callback/reply".equals(path)) {
            long eventId = req.get("eventId") != null ? ((Number) req.get("eventId")).longValue() : 0L;
            Object val = req.get("value");
            completeCallback(eventId, val, null);
            sendJsonResponse(exchange, 200, "{\"success\":true}");
            return;
        }

        sendJsonResponse(exchange, 404, "{\"error\":\"Not Found\",\"path\":\"" + path + "\"}");
    }

    // =========================================================================
    // Reflection Inspection & Remote Invocation
    // =========================================================================

    public Class<?> resolveClass(String name) throws ClassNotFoundException {
        if (name == null || name.isEmpty()) throw new ClassNotFoundException("Empty class name");
        if ("int".equals(name)) return int.class;
        if ("long".equals(name)) return long.class;
        if ("boolean".equals(name)) return boolean.class;
        if ("byte".equals(name)) return byte.class;
        if ("short".equals(name)) return short.class;
        if ("char".equals(name)) return char.class;
        if ("float".equals(name)) return float.class;
        if ("double".equals(name)) return double.class;
        if ("void".equals(name)) return void.class;
        if ("Exoproc".equals(name) || "org.exoproc.njava.agent.utils.Exoproc".equals(name) || "org.exoproc.njava.agent.NJavaAgent".equals(name)) {
            return Exoproc.class;
        }

        try {
            return Class.forName(name, false, targetLoader != null ? targetLoader : Exoproc.class.getClassLoader());
        } catch (ClassNotFoundException e) {
            ClassLoader ctx = Thread.currentThread().getContextClassLoader();
            if (ctx != null && ctx != targetLoader) {
                try { return Class.forName(name, false, ctx); } catch (ClassNotFoundException ignored) {}
            }
            return Class.forName(name);
        }
    }

    public synchronized long getOrCreateClassId(Class<?> cls) {
        Long existing = classNameToId.get(cls.getName());
        if (existing != null) return existing;
        long id = nextId.getAndIncrement();
        classRegistry.put(id, cls);
        classNameToId.put(cls.getName(), id);
        return id;
    }

    public Map<String, Object> inspectClass(String className) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        try {
            Class<?> cls = resolveClass(className);
            long classId = getOrCreateClassId(cls);

            res.put("success", true);
            res.put("classId", classId);
            res.put("name", cls.getName());
            res.put("simpleName", cls.getSimpleName());
            res.put("isInterface", cls.isInterface());
            res.put("isArray", cls.isArray());
            res.put("isPrimitive", cls.isPrimitive());
            res.put("superclass", cls.getSuperclass() != null ? cls.getSuperclass().getName() : null);

            List<Map<String, Object>> methodsList = new ArrayList<Map<String, Object>>();
            Set<String> seenSigs = new HashSet<String>();
            List<Method> allMethods = new ArrayList<Method>();
            Class<?> cur = cls;
            while (cur != null) {
                for (Method m : cur.getDeclaredMethods()) {
                    if (!allMethods.contains(m)) allMethods.add(m);
                }
                cur = cur.getSuperclass();
            }
            for (Method m : cls.getMethods()) {
                if (!allMethods.contains(m)) allMethods.add(m);
            }

            for (Method m : allMethods) {
                try { m.setAccessible(true); } catch (Throwable ignored) {}
                List<String> paramTypes = new ArrayList<String>();
                for (Class<?> p : m.getParameterTypes()) paramTypes.add(p.getName());

                StringBuilder sigSb = new StringBuilder(m.getName()).append('(');
                for (int i = 0; i < paramTypes.size(); i++) {
                    if (i > 0) sigSb.append(',');
                    sigSb.append(paramTypes.get(i));
                }
                sigSb.append("):").append(m.getReturnType().getName());
                String sig = sigSb.toString();

                if (seenSigs.contains(sig)) continue;
                seenSigs.add(sig);

                long mId = nextId.getAndIncrement();
                methodRegistry.put(mId, m);

                Map<String, Object> mInfo = new LinkedHashMap<String, Object>();
                mInfo.put("id", mId);
                mInfo.put("name", m.getName());
                mInfo.put("returnType", m.getReturnType().getName());
                mInfo.put("params", paramTypes);
                mInfo.put("static", Modifier.isStatic(m.getModifiers()));
                mInfo.put("modifiers", m.getModifiers());
                methodsList.add(mInfo);
            }
            res.put("methods", methodsList);

            List<Map<String, Object>> fieldsList = new ArrayList<Map<String, Object>>();
            List<Field> allFields = new ArrayList<Field>();
            allFields.addAll(Arrays.asList(cls.getDeclaredFields()));
            for (Field f : cls.getFields()) {
                if (!allFields.contains(f)) allFields.add(f);
            }

            for (Field f : allFields) {
                try { f.setAccessible(true); } catch (Throwable ignored) {}
                long fId = nextId.getAndIncrement();
                fieldRegistry.put(fId, f);

                Map<String, Object> fInfo = new LinkedHashMap<String, Object>();
                fInfo.put("id", fId);
                fInfo.put("name", f.getName());
                fInfo.put("type", f.getType().getName());
                fInfo.put("static", Modifier.isStatic(f.getModifiers()));
                fInfo.put("modifiers", f.getModifiers());
                fieldsList.add(fInfo);
            }
            res.put("fields", fieldsList);

            List<Map<String, Object>> ctorsList = new ArrayList<Map<String, Object>>();
            for (Constructor<?> c : cls.getDeclaredConstructors()) {
                try { c.setAccessible(true); } catch (Throwable ignored) {}
                long cId = nextId.getAndIncrement();
                ctorRegistry.put(cId, c);

                List<String> paramTypes = new ArrayList<String>();
                for (Class<?> p : c.getParameterTypes()) paramTypes.add(p.getName());

                Map<String, Object> cInfo = new LinkedHashMap<String, Object>();
                cInfo.put("id", cId);
                cInfo.put("params", paramTypes);
                cInfo.put("modifiers", c.getModifiers());
                ctorsList.add(cInfo);
            }
            res.put("constructors", ctorsList);

            return res;
        } catch (Throwable t) {
            res.put("success", false);
            res.put("error", t.getMessage() != null ? t.getMessage() : t.toString());
            return res;
        }
    }

    public Map<String, Object> invokeMethod(Map<String, Object> req) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        try {
            Long methodId = req.get("methodId") != null ? ((Number) req.get("methodId")).longValue() : null;
            Long targetHandle = req.get("targetHandle") != null ? ((Number) req.get("targetHandle")).longValue() : 0L;
            List<?> rawArgs = req.get("args") instanceof List ? (List<?>) req.get("args") : Collections.emptyList();

            Object executor = null;
            Long executorMethodId = null;
            if (req.get("executor") instanceof Map) {
                Map<?, ?> ex = (Map<?, ?>) req.get("executor");
                if (ex.get("handle") instanceof Number) {
                    executor = objectRegistry.get(((Number) ex.get("handle")).longValue());
                }
                if (ex.get("methodId") instanceof Number) {
                    executorMethodId = ((Number) ex.get("methodId")).longValue();
                }
            }

            Method method = null;
            if (methodId != null) {
                method = methodRegistry.get(methodId);
                if (method != null && !isMethodCompatible(method, rawArgs)) {
                    Class<?> declCls = method.getDeclaringClass();
                    String mName = method.getName();
                    for (Method cand : declCls.getMethods()) {
                        if (cand.getName().equals(mName) && isMethodCompatible(cand, rawArgs)) {
                            method = cand;
                            break;
                        }
                    }
                }
            }

            if (method == null) {
                String methodName = (String) req.get("methodName");
                Long classId = req.get("classId") != null ? ((Number) req.get("classId")).longValue() : null;
                Class<?> cls = classId != null ? classRegistry.get(classId) : null;
                if (cls == null && targetHandle != 0L) {
                    Object target = objectRegistry.get(targetHandle);
                    if (target != null) cls = target.getClass();
                }

                if (cls != null && methodName != null) {
                    for (Method m : cls.getMethods()) {
                        if (m.getName().equals(methodName) && isMethodCompatible(m, rawArgs)) {
                            method = m;
                            break;
                        }
                    }
                    if (method == null) {
                        for (Method m : cls.getDeclaredMethods()) {
                            if (m.getName().equals(methodName) && isMethodCompatible(m, rawArgs)) {
                                method = m;
                                break;
                            }
                        }
                    }
                }
            }

            if (method == null) {
                res.put("success", false);
                res.put("error", "Method not found: " + req);
                return res;
            }

            method.setAccessible(true);
            Object target = targetHandle != 0L ? objectRegistry.get(targetHandle) : null;
            Object[] args = convertArgs(method.getParameterTypes(), rawArgs);

            Object result;
            if (executor != null) {
                result = invokeOnExecutor(executor, executorMethodId, method, target, args);
            } else {
                result = method.invoke(target, args);
            }

            return serializeValue(result);
        } catch (InvocationTargetException ite) {
            Throwable cause = ite.getCause() != null ? ite.getCause() : ite;
            res.put("success", false);
            res.put("error", cause.getMessage() != null ? cause.getMessage() : cause.toString());
            return res;
        } catch (Throwable t) {
            res.put("success", false);
            res.put("error", t.getMessage() != null ? t.getMessage() : t.toString());
            return res;
        }
    }

    public Map<String, Object> getField(Map<String, Object> req) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        try {
            Long fieldId = req.get("fieldId") != null ? ((Number) req.get("fieldId")).longValue() : null;
            Long targetHandle = req.get("targetHandle") != null ? ((Number) req.get("targetHandle")).longValue() : 0L;
            String fieldName = (String) req.get("fieldName");

            Field field = fieldId != null ? fieldRegistry.get(fieldId) : null;
            if (field == null) {
                Long classId = req.get("classId") != null ? ((Number) req.get("classId")).longValue() : null;
                Class<?> cls = classId != null ? classRegistry.get(classId) : null;
                if (cls == null && targetHandle != 0L) {
                    Object target = objectRegistry.get(targetHandle);
                    if (target != null) cls = target.getClass();
                }

                if (cls != null && fieldName != null) {
                    try {
                        field = cls.getField(fieldName);
                    } catch (NoSuchFieldException e) {
                        field = cls.getDeclaredField(fieldName);
                    }
                }
            }

            if (field == null) {
                res.put("success", false);
                res.put("error", "Field not found: " + req);
                return res;
            }

            field.setAccessible(true);
            Object target = targetHandle != 0L ? objectRegistry.get(targetHandle) : null;
            Object val = field.get(target);
            return serializeValue(val);
        } catch (Throwable t) {
            res.put("success", false);
            res.put("error", t.getMessage() != null ? t.getMessage() : t.toString());
            return res;
        }
    }

    public Map<String, Object> setField(Map<String, Object> req) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        try {
            Long fieldId = req.get("fieldId") != null ? ((Number) req.get("fieldId")).longValue() : null;
            Long targetHandle = req.get("targetHandle") != null ? ((Number) req.get("targetHandle")).longValue() : 0L;
            String fieldName = (String) req.get("fieldName");
            Object rawValue = req.get("value");

            Field field = fieldId != null ? fieldRegistry.get(fieldId) : null;
            if (field == null) {
                Long classId = req.get("classId") != null ? ((Number) req.get("classId")).longValue() : null;
                Class<?> cls = classId != null ? classRegistry.get(classId) : null;
                if (cls == null && targetHandle != 0L) {
                    Object target = objectRegistry.get(targetHandle);
                    if (target != null) cls = target.getClass();
                }

                if (cls != null && fieldName != null) {
                    try {
                        field = cls.getField(fieldName);
                    } catch (NoSuchFieldException e) {
                        field = cls.getDeclaredField(fieldName);
                    }
                }
            }

            if (field == null) {
                res.put("success", false);
                res.put("error", "Field not found: " + req);
                return res;
            }

            field.setAccessible(true);
            Object target = targetHandle != 0L ? objectRegistry.get(targetHandle) : null;
            Object convertedVal = convertArg(field.getType(), rawValue);
            field.set(target, convertedVal);

            res.put("success", true);
            return res;
        } catch (Throwable t) {
            res.put("success", false);
            res.put("error", t.getMessage() != null ? t.getMessage() : t.toString());
            return res;
        }
    }

    public Map<String, Object> constructInstance(Map<String, Object> req) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        try {
            Long ctorId = req.get("ctorId") != null ? ((Number) req.get("ctorId")).longValue() : null;
            Long classId = req.get("classId") != null ? ((Number) req.get("classId")).longValue() : null;
            List<?> rawArgs = req.get("args") instanceof List ? (List<?>) req.get("args") : Collections.emptyList();

            Constructor<?> ctor = ctorId != null ? ctorRegistry.get(ctorId) : null;
            if (ctor == null && classId != null) {
                Class<?> cls = classRegistry.get(classId);
                if (cls != null) {
                    for (Constructor<?> c : cls.getDeclaredConstructors()) {
                        if (c.getParameterTypes().length == rawArgs.size()) {
                            ctor = c;
                            break;
                        }
                    }
                }
            }

            if (ctor == null) {
                res.put("success", false);
                res.put("error", "Constructor not found: " + req);
                return res;
            }

            ctor.setAccessible(true);
            Object[] args = convertArgs(ctor.getParameterTypes(), rawArgs);
            Object obj = ctor.newInstance(args);
            return serializeValue(obj);
        } catch (Throwable t) {
            res.put("success", false);
            res.put("error", t.getMessage() != null ? t.getMessage() : t.toString());
            return res;
        }
    }

    public Map<String, Object> getObjectClass(long targetHandle) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        Object target = objectRegistry.get(targetHandle);
        if (target == null) {
            res.put("success", false);
            res.put("error", "Object handle not found: " + targetHandle);
            return res;
        }
        Class<?> cls = target.getClass();
        long classId = getOrCreateClassId(cls);
        res.put("success", true);
        res.put("classId", classId);
        res.put("name", cls.getName());
        return res;
    }

    public Map<String, Object> getObjectString(long targetHandle) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        Object target = objectRegistry.get(targetHandle);
        if (target == null) {
            res.put("success", false);
            res.put("error", "Object handle not found: " + targetHandle);
            return res;
        }
        res.put("success", true);
        res.put("value", String.valueOf(target));
        return res;
    }

    public Map<String, Object> releaseHandles(List<?> handles) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        if (handles != null) {
            for (Object h : handles) {
                if (h instanceof Number) {
                    objectRegistry.remove(((Number) h).longValue());
                }
            }
        }
        res.put("success", true);
        return res;
    }

    private Map<String, Object> serializeValue(Object val) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        res.put("success", true);

        if (val == null) {
            res.put("isObject", false);
            res.put("value", null);
            return res;
        }

        if (val instanceof Boolean || val instanceof Number || val instanceof Character) {
            res.put("isObject", false);
            res.put("value", val);
            return res;
        }

        if (val instanceof String) {
            res.put("isObject", false);
            res.put("value", val);
            return res;
        }

        long handle = nextHandle.getAndIncrement();
        objectRegistry.put(handle, val);
        res.put("isObject", true);
        res.put("handle", handle);
        res.put("className", val.getClass().getName());
        res.put("toString", String.valueOf(val));
        return res;
    }

    private boolean isMethodCompatible(Method m, List<?> rawArgs) {
        Class<?>[] paramTypes = m.getParameterTypes();
        if (paramTypes.length != rawArgs.size()) return false;
        for (int i = 0; i < paramTypes.length; i++) {
            Object raw = rawArgs.get(i);
            if (raw == null) {
                if (paramTypes[i].isPrimitive()) return false;
                continue;
            }
            if (raw instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) raw;
                if (map.containsKey("handle") || map.containsKey("$handle")) {
                    Object hVal = map.containsKey("handle") ? map.get("handle") : map.get("$handle");
                    if (hVal instanceof Number) {
                        Object obj = objectRegistry.get(((Number) hVal).longValue());
                        if (obj != null && !paramTypes[i].isAssignableFrom(obj.getClass())) {
                            return false;
                        }
                        continue;
                    }
                }
            }
            if (raw instanceof Number) {
                if (!isNumericType(paramTypes[i])) return false;
                continue;
            }
            if (raw instanceof Boolean) {
                if (paramTypes[i] != boolean.class && paramTypes[i] != Boolean.class) return false;
                continue;
            }
            if (raw instanceof String) {
                if (paramTypes[i] == byte[].class) continue;
                if (paramTypes[i] != String.class && paramTypes[i] != CharSequence.class && paramTypes[i] != Object.class) return false;
                continue;
            }
            if (!paramTypes[i].isInstance(raw)) return false;
        }
        return true;
    }

    private boolean isNumericType(Class<?> c) {
        return c == int.class || c == Integer.class ||
               c == long.class || c == Long.class ||
               c == float.class || c == Float.class ||
               c == double.class || c == Double.class ||
               c == byte.class || c == Byte.class ||
               c == short.class || c == Short.class;
    }

    private Object[] convertArgs(Class<?>[] paramTypes, List<?> rawArgs) {
        Object[] args = new Object[paramTypes.length];
        for (int i = 0; i < paramTypes.length; i++) {
            Object raw = i < rawArgs.size() ? rawArgs.get(i) : null;
            args[i] = convertArg(paramTypes[i], raw);
        }
        return args;
    }

    private Object convertArg(Class<?> targetType, Object raw) {
        if (raw == null) return null;

        if (raw instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) raw;
            if (map.containsKey("handle") || map.containsKey("$handle")) {
                Object hVal = map.containsKey("handle") ? map.get("handle") : map.get("$handle");
                if (hVal instanceof Number) {
                    return objectRegistry.get(((Number) hVal).longValue());
                }
            }
        }

        if (targetType == int.class || targetType == Integer.class) return ((Number) raw).intValue();
        if (targetType == long.class || targetType == Long.class) {
            return (raw instanceof Number) ? ((Number) raw).longValue() : Long.parseLong(raw.toString());
        }
        if (targetType == float.class || targetType == Float.class) return ((Number) raw).floatValue();
        if (targetType == double.class || targetType == Double.class) return ((Number) raw).doubleValue();
        if (targetType == boolean.class || targetType == Boolean.class) return Boolean.valueOf(raw.toString());
        if (targetType == byte.class || targetType == Byte.class) return ((Number) raw).byteValue();
        if (targetType == short.class || targetType == Short.class) return ((Number) raw).shortValue();
        if (targetType == char.class || targetType == Character.class) return raw.toString().charAt(0);
        if (targetType == String.class) return raw.toString();

        if (targetType == byte[].class && raw instanceof String) {
            try {
                return (byte[]) Class.forName("javax.xml.bind.DatatypeConverter")
                    .getMethod("parseBase64Binary", String.class)
                    .invoke(null, raw.toString());
            } catch (Exception ignored) {}
        }

        if (targetType.isInstance(raw)) return raw;

        if (targetType.isArray() && raw instanceof List) {
            List<?> list = (List<?>) raw;
            Class<?> comp = targetType.getComponentType();
            Object arr = Array.newInstance(comp, list.size());
            for (int i = 0; i < list.size(); i++) {
                Array.set(arr, i, convertArg(comp, list.get(i)));
            }
            return arr;
        }

        return raw;
    }

    private Object invokeOnExecutor(Object executor, Long executorMethodId, Method method, Object target, Object[] args) throws Exception {
        Method submit = executorMethodId != null ? methodRegistry.get(executorMethodId) : null;
        if (submit == null) {
            Method runnableCand = null;
            for (Method m : executor.getClass().getMethods()) {
                if (m.getParameterTypes().length != 1 || Modifier.isStatic(m.getModifiers())) continue;
                Class<?> pt = m.getParameterTypes()[0];
                if (pt == Callable.class) {
                    submit = m;
                    break;
                }
                if (pt == Runnable.class && runnableCand == null) {
                    runnableCand = m;
                }
            }
            if (submit == null) submit = runnableCand;
        }

        if (submit == null) {
            throw new IllegalArgumentException("Executor " + executor.getClass().getName() + " has no Runnable or Callable submit method");
        }
        submit.setAccessible(true);

        Object[] box = new Object[1];
        Throwable[] err = new Throwable[1];
        CountDownLatch latch = new CountDownLatch(1);

        Exoproc task = new Exoproc(method, target, args, latch, box, err);
        submit.invoke(executor, task);

        if (!latch.await(10, TimeUnit.SECONDS)) {
            throw new TimeoutException("Executor task timed out after 10s");
        }
        if (err[0] != null) {
            throw (err[0] instanceof Exception) ? (Exception) err[0] : new RuntimeException(err[0]);
        }
        return box[0];
    }

    // =========================================================================
    // JavaScript / Nashorn Script Runtime
    // =========================================================================

    private static void initScriptEngine(ClassLoader loader) {
        System.setProperty("nashorn.args", "--language=es6");
        ScriptEngine eng = null;
        try {
            Class<?> fc = Class.forName("jdk.nashorn.api.scripting.NashornScriptEngineFactory");
            Object factory = fc.getDeclaredConstructor().newInstance();
            Method m = fc.getMethod("getScriptEngine", String[].class, ClassLoader.class);
            eng = (ScriptEngine) m.invoke(factory, (Object) new String[]{"--language=es6"}, loader);
        } catch (Throwable ignored) {}

        if (eng == null) {
            try {
                Class<?> fc = Class.forName("org.openjdk.nashorn.api.scripting.NashornScriptEngineFactory");
                Object factory = fc.getDeclaredConstructor().newInstance();
                Method m = fc.getMethod("getScriptEngine", String[].class, ClassLoader.class);
                eng = (ScriptEngine) m.invoke(factory, (Object) new String[]{"--language=es6"}, loader);
            } catch (Throwable ignored) {}
        }

        if (eng == null) {
            ScriptEngineManager manager = loader != null ? new ScriptEngineManager(loader) : new ScriptEngineManager();
            eng = manager.getEngineByName("nashorn");
            if (eng == null) eng = manager.getEngineByName("javascript");
            if (eng == null) eng = manager.getEngineByExtension("js");
        }

        scriptEngine = eng;
    }

    public Map<String, Object> evaluateScript(String code) {
        Map<String, Object> res = new LinkedHashMap<String, Object>();
        long start = System.currentTimeMillis();
        List<String> logs = new ArrayList<String>();

        if (scriptEngine == null) {
            res.put("success", false);
            res.put("error", "No JavaScript engine available in JVM");
            res.put("logs", logs);
            res.put("executionTimeMs", 0);
            return res;
        }

        try {
            Bindings b = scriptEngine.createBindings();
            b.put("classLoader", targetLoader);
            b.put("loader", targetLoader);
            b.put("instrumentation", instrumentation);
            b.put("inst", instrumentation);
            b.put("Exoproc", Exoproc.class);
            b.put("exoproc", this);

            String body = code.trim();
            if (!body.contains("return ") && !body.contains("return\n") && !body.startsWith("function") && !body.contains(";") && !body.contains("\n")) {
                body = "return (" + body + ");";
            }

            String wrapped = "(function() { " + body + " })()";
            Object evalRes = scriptEngine.eval(wrapped, b);

            res.put("success", true);
            res.put("result", evalRes != null ? evalRes.toString() : null);
            res.put("logs", logs);
            res.put("error", null);
            res.put("executionTimeMs", System.currentTimeMillis() - start);
            return res;
        } catch (Throwable t) {
            res.put("success", false);
            res.put("result", null);
            res.put("logs", logs);
            res.put("error", t.getMessage() != null ? t.getMessage() : t.toString());
            res.put("executionTimeMs", System.currentTimeMillis() - start);
            return res;
        }
    }

    // =========================================================================
    // Universal SAM Callback Dispatcher (Zero-IPC bridge & dynamic SAM hooks)
    // =========================================================================

    public static Object dispatchCallback(String callbackId, String methodName, Object[] args) {
        long id = nextInvocationId.getAndIncrement();
        CountDownLatch latch = new CountDownLatch(1);
        Object[] resultBox = new Object[1];
        Throwable[] errorBox = new Throwable[1];

        Map<String, Object> inv = new LinkedHashMap<String, Object>();
        inv.put("id", id);
        inv.put("callbackId", callbackId);
        inv.put("method", methodName);
        inv.put("args", args != null ? Arrays.asList(args) : Collections.emptyList());
        inv.put("latch", latch);
        inv.put("resultBox", resultBox);
        inv.put("errorBox", errorBox);

        pendingInvocations.put(id, inv);
        invocationQueue.offer(inv);

        try {
            boolean completed = latch.await(defaultTimeoutSeconds, TimeUnit.SECONDS);
            if (!completed) {
                pendingInvocations.remove(id);
                throw new RuntimeException("Callback timeout (" + defaultTimeoutSeconds + "s) for callbackId: " + callbackId + "#" + methodName);
            }
        } catch (InterruptedException e) {
            pendingInvocations.remove(id);
            Thread.currentThread().interrupt();
            throw new RuntimeException("Callback interrupted for callbackId: " + callbackId + "#" + methodName, e);
        } finally {
            pendingInvocations.remove(id);
        }

        if (errorBox[0] != null) {
            if (errorBox[0] instanceof RuntimeException) throw (RuntimeException) errorBox[0];
            throw new RuntimeException("Callback failed: " + errorBox[0].getMessage(), errorBox[0]);
        }
        return resultBox[0];
    }

    public static Object dispatchCallback(String callbackId, String methodName) {
        return dispatchCallback(callbackId, methodName, new Object[0]);
    }

    public static boolean completeCallback(long id, Object result, Throwable error) {
        Map<String, Object> inv = pendingInvocations.remove(id);
        if (inv != null) {
            Object[] resultBox = (Object[]) inv.get("resultBox");
            Throwable[] errorBox = (Throwable[]) inv.get("errorBox");
            CountDownLatch latch = (CountDownLatch) inv.get("latch");
            if (resultBox != null) resultBox[0] = result;
            if (errorBox != null) errorBox[0] = error;
            if (latch != null) latch.countDown();
            return true;
        }
        return false;
    }

    // =========================================================================
    // Universal Host & Process Properties (Exoproc API)
    // =========================================================================

    public static boolean isAttached() {
        return true;
    }

    public static long getPid() {
        try {
            String jvmName = ManagementFactory.getRuntimeMXBean().getName();
            int atIdx = jvmName.indexOf('@');
            if (atIdx > 0) return Long.parseLong(jvmName.substring(0, atIdx));
        } catch (Throwable ignored) {}
        return 0;
    }

    public static String getTargetName() {
        if (targetJarPath != null) return new File(targetJarPath).getName();
        String cmd = System.getProperty("sun.java.command", "");
        int sp = cmd.indexOf(' ');
        String main = sp > 0 ? cmd.substring(0, sp) : cmd;
        return main.isEmpty() ? "javaw.exe" : main;
    }

    public static ClassLoader getClassLoader() {
        if (targetLoader != null) return targetLoader;
        ClassLoader cl = Exoproc.class.getClassLoader();
        if (cl != null) return cl;
        cl = Thread.currentThread().getContextClassLoader();
        if (cl != null) return cl;
        return ClassLoader.getSystemClassLoader();
    }

    public static Class<?> defineClass(String name, byte[] bytecode) {
        return defineClass(name, bytecode, getClassLoader());
    }

    public static Class<?> defineClass(String name, byte[] bytecode, ClassLoader loader) {
        ClassLoader cl = loader != null ? loader : getClassLoader();
        try {
            Method m = ClassLoader.class.getDeclaredMethod("defineClass", String.class, byte[].class, int.class, int.class);
            m.setAccessible(true);
            return (Class<?>) m.invoke(cl, name, bytecode, 0, bytecode.length);
        } catch (Throwable t) {
            try {
                Field f = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe");
                f.setAccessible(true);
                Object unsafe = f.get(null);
                Method def = unsafe.getClass().getMethod(
                    "defineClass", String.class, byte[].class, int.class, int.class, ClassLoader.class, java.security.ProtectionDomain.class
                );
                return (Class<?>) def.invoke(unsafe, name, bytecode, 0, bytecode.length, cl, null);
            } catch (Throwable t2) {
                throw new RuntimeException("Failed to defineClass " + name + ": " + t.getMessage(), t);
            }
        }
    }

    public static Object newInstance(String className) {
        return newInstance(className, null);
    }

    public static Object newInstance(String className, ClassLoader loader) {
        try {
            Class<?> cls = Class.forName(className, true, loader != null ? loader : getClassLoader());
            return cls.getDeclaredConstructor().newInstance();
        } catch (Throwable t) {
            throw new RuntimeException("Failed to instantiate " + className + ": " + t.getMessage(), t);
        }
    }

    public static void shutdown() {
        System.out.println("[Exoproc] Shutdown requested.");
        if (httpServer != null) {
            try { httpServer.stop(0); } catch (Exception ignored) {}
            httpServer = null;
        }
        if (isStandalone) {
            System.exit(0);
        }
    }

    public static void stop() {
        shutdown();
    }

    // =========================================================================
    // Dynamic In-Process Attach & CLI Main
    // =========================================================================

    public static boolean attach(String pid, int port) {
        try {
            File jarFile = null;
            try {
                jarFile = new File(Exoproc.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            } catch (Exception ignored) {}

            if (jarFile == null || !jarFile.isFile()) {
                System.err.println("❌ Could not locate agent jar to attach.");
                return false;
            }

            Class<?> vmClass = null;
            try {
                vmClass = Class.forName("com.sun.tools.attach.VirtualMachine");
            } catch (ClassNotFoundException e) {
                File toolsJar = new File(System.getProperty("java.home"), "../lib/tools.jar");
                if (!toolsJar.exists()) toolsJar = new File(System.getProperty("java.home"), "lib/tools.jar");
                if (toolsJar.exists()) {
                    URLClassLoader loader = new URLClassLoader(new URL[]{toolsJar.toURI().toURL()}, Exoproc.class.getClassLoader());
                    vmClass = Class.forName("com.sun.tools.attach.VirtualMachine", true, loader);
                } else {
                    throw e;
                }
            }

            Method attachMethod = vmClass.getMethod("attach", String.class);
            Object vm = attachMethod.invoke(null, pid);
            Method loadAgentMethod = vmClass.getMethod("loadAgent", String.class, String.class);
            loadAgentMethod.invoke(vm, jarFile.getAbsolutePath(), "port=" + port);
            Method detachMethod = vmClass.getMethod("detach");
            detachMethod.invoke(vm);

            System.out.println("✅ Successfully attached agent to JVM PID " + pid + " on port " + port);
            return true;
        } catch (Exception e) {
            System.err.println("❌ Failed to attach agent: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }

    public static void main(String[] args) {
        int port = DEFAULT_PORT;
        String jarArg = null;
        String libsArg = null;

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if ("--attach".equalsIgnoreCase(arg) && i + 1 < args.length) {
                boolean ok = attach(args[++i].trim(), port);
                System.exit(ok ? 0 : 1);
            } else if (("--port".equalsIgnoreCase(arg) || "-p".equalsIgnoreCase(arg)) && i + 1 < args.length) {
                try { port = Integer.parseInt(args[++i].trim()); } catch (Exception ignored) {}
            } else if (("--jar".equalsIgnoreCase(arg) || "--inspect".equalsIgnoreCase(arg)) && i + 1 < args.length) {
                jarArg = args[++i].trim();
            } else if (("--libs".equalsIgnoreCase(arg) || "--libraries".equalsIgnoreCase(arg)) && i + 1 < args.length) {
                libsArg = args[++i].trim();
            }
        }

        isStandalone = true;
        ClassLoader targetCl = null;

        if (jarArg != null) {
            File jarFile = new File(jarArg);
            if (!jarFile.exists() || !jarFile.isFile()) {
                System.err.println("❌ Target JAR not found: " + jarArg);
                System.exit(1);
            }

            targetJarPath = jarFile.getAbsolutePath();
            List<String> discoveredClasses = new ArrayList<String>();
            List<URL> urlList = new ArrayList<URL>();

            try {
                JarFile jf = new JarFile(jarFile);
                Enumeration<JarEntry> entries = jf.entries();
                while (entries.hasMoreElements()) {
                    JarEntry entry = entries.nextElement();
                    String name = entry.getName();
                    if (name.endsWith(".class") && !name.startsWith("META-INF/")) {
                        discoveredClasses.add(name.substring(0, name.length() - 6).replace('/', '.'));
                    }
                }
                jf.close();
                targetJarClasses = Collections.unmodifiableList(discoveredClasses);
                urlList.add(jarFile.toURI().toURL());

                File libsDir = libsArg != null ? new File(libsArg) : null;
                if (libsDir == null) {
                    File cur = jarFile.getParentFile();
                    while (cur != null) {
                        File siblingLibs = new File(cur, "libraries");
                        if (siblingLibs.isDirectory()) { libsDir = siblingLibs; break; }
                        cur = cur.getParentFile();
                    }
                }

                if (libsDir != null && libsDir.isDirectory()) {
                    collectJarsRecursively(libsDir, urlList);
                }

                URL[] urls = urlList.toArray(new URL[0]);
                targetCl = new URLClassLoader(urls, Exoproc.class.getClassLoader());
                Thread.currentThread().setContextClassLoader(targetCl);
                System.out.println("📦 Target JAR loaded: " + jarFile.getName() + " (" + discoveredClasses.size() + " classes)");
            } catch (Exception e) {
                System.err.println("❌ Failed to inspect target JAR: " + e.getMessage());
                System.exit(1);
            }
        } else {
            targetCl = Exoproc.class.getClassLoader();
            Thread.currentThread().setContextClassLoader(targetCl);
        }

        init(null, targetCl, null, port);
        try { Thread.sleep(Long.MAX_VALUE); } catch (InterruptedException ignored) {}
    }

    private static void collectJarsRecursively(File dir, List<URL> urls) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) collectJarsRecursively(f, urls);
            else if (f.isFile() && f.getName().toLowerCase().endsWith(".jar")) {
                try { urls.add(f.toURI().toURL()); } catch (Exception ignored) {}
            }
        }
    }

    // =========================================================================
    // Minimal Zero-Dependency JSON Parser & Serializer
    // =========================================================================

    public static Object parseJson(String json) {
        if (json == null || json.trim().isEmpty()) return Collections.emptyMap();
        return parseJsonVal(json.trim(), new int[]{0});
    }

    private static void skipWs(String s, int[] pos) {
        while (pos[0] < s.length()) {
            char c = s.charAt(pos[0]);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') pos[0]++;
            else break;
        }
    }

    private static Object parseJsonVal(String s, int[] pos) {
        skipWs(s, pos);
        if (pos[0] >= s.length()) return null;
        char c = s.charAt(pos[0]);
        if (c == '{') return parseJsonObj(s, pos);
        if (c == '[') return parseJsonArr(s, pos);
        if (c == '"') return parseJsonStr(s, pos);
        if (c == 't' || c == 'f') {
            boolean b = s.startsWith("true", pos[0]);
            pos[0] += b ? 4 : 5;
            return b;
        }
        if (c == 'n') {
            pos[0] += 4;
            return null;
        }
        return parseJsonNum(s, pos);
    }

    private static Map<String, Object> parseJsonObj(String s, int[] pos) {
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        pos[0]++;
        skipWs(s, pos);
        if (pos[0] < s.length() && s.charAt(pos[0]) == '}') {
            pos[0]++;
            return map;
        }
        while (pos[0] < s.length()) {
            skipWs(s, pos);
            String key = parseJsonStr(s, pos);
            skipWs(s, pos);
            if (pos[0] < s.length() && s.charAt(pos[0]) == ':') pos[0]++;
            skipWs(s, pos);
            Object val = parseJsonVal(s, pos);
            map.put(key, val);
            skipWs(s, pos);
            if (pos[0] < s.length() && s.charAt(pos[0]) == ',') {
                pos[0]++;
            } else if (pos[0] < s.length() && s.charAt(pos[0]) == '}') {
                pos[0]++;
                break;
            }
        }
        return map;
    }

    private static List<Object> parseJsonArr(String s, int[] pos) {
        List<Object> list = new ArrayList<Object>();
        pos[0]++;
        skipWs(s, pos);
        if (pos[0] < s.length() && s.charAt(pos[0]) == ']') {
            pos[0]++;
            return list;
        }
        while (pos[0] < s.length()) {
            skipWs(s, pos);
            Object val = parseJsonVal(s, pos);
            list.add(val);
            skipWs(s, pos);
            if (pos[0] < s.length() && s.charAt(pos[0]) == ',') {
                pos[0]++;
            } else if (pos[0] < s.length() && s.charAt(pos[0]) == ']') {
                pos[0]++;
                break;
            }
        }
        return list;
    }

    private static String parseJsonStr(String s, int[] pos) {
        pos[0]++;
        StringBuilder sb = new StringBuilder();
        while (pos[0] < s.length()) {
            char c = s.charAt(pos[0]++);
            if (c == '"') break;
            if (c == '\\' && pos[0] < s.length()) {
                char esc = s.charAt(pos[0]++);
                if (esc == '"' || esc == '\\' || esc == '/') sb.append(esc);
                else if (esc == 'b') sb.append('\b');
                else if (esc == 'f') sb.append('\f');
                else if (esc == 'n') sb.append('\n');
                else if (esc == 'r') sb.append('\r');
                else if (esc == 't') sb.append('\t');
                else if (esc == 'u' && pos[0] + 4 <= s.length()) {
                    sb.append((char) Integer.parseInt(s.substring(pos[0], pos[0] + 4), 16));
                    pos[0] += 4;
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static Number parseJsonNum(String s, int[] pos) {
        int start = pos[0];
        boolean isFloat = false;
        while (pos[0] < s.length()) {
            char c = s.charAt(pos[0]);
            if ((c >= '0' && c <= '9') || c == '-' || c == '+') {
                pos[0]++;
            } else if (c == '.' || c == 'e' || c == 'E') {
                isFloat = true;
                pos[0]++;
            } else {
                break;
            }
        }
        String numStr = s.substring(start, pos[0]);
        if (isFloat) return Double.parseDouble(numStr);
        long l = Long.parseLong(numStr);
        if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return (int) l;
        return l;
    }

    public static String stringifyJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        serializeJson(obj, sb);
        return sb.toString();
    }

    private static void serializeJson(Object obj, StringBuilder sb) {
        if (obj == null) {
            sb.append("null");
        } else if (obj instanceof Boolean || obj instanceof Number) {
            sb.append(obj);
        } else if (obj instanceof CharSequence || obj instanceof Character) {
            sb.append('"').append(escapeJson(obj.toString())).append('"');
        } else if (obj instanceof Map) {
            sb.append('{');
            Map<?, ?> map = (Map<?, ?>) obj;
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append('"').append(escapeJson(String.valueOf(entry.getKey()))).append("\":");
                serializeJson(entry.getValue(), sb);
            }
            sb.append('}');
        } else if (obj instanceof Collection) {
            sb.append('[');
            Collection<?> col = (Collection<?>) obj;
            boolean first = true;
            for (Object item : col) {
                if (!first) sb.append(',');
                first = false;
                serializeJson(item, sb);
            }
            sb.append(']');
        } else if (obj.getClass().isArray()) {
            sb.append('[');
            int len = Array.getLength(obj);
            for (int i = 0; i < len; i++) {
                if (i > 0) sb.append(',');
                serializeJson(Array.get(obj, i), sb);
            }
            sb.append(']');
        } else {
            sb.append('"').append(escapeJson(obj.toString())).append('"');
        }
    }

    public static String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"') sb.append("\\\"");
            else if (c == '\\') sb.append("\\\\");
            else if (c == '\b') sb.append("\\b");
            else if (c == '\f') sb.append("\\f");
            else if (c == '\n') sb.append("\\n");
            else if (c == '\r') sb.append("\\r");
            else if (c == '\t') sb.append("\\t");
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.toString();
    }

    // =========================================================================
    // HTTP Request & Response Utilities
    // =========================================================================

    public static String readRequestBody(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) {
            baos.write(buf, 0, n);
        }
        return new String(baos.toByteArray(), StandardCharsets.UTF_8);
    }

    public static void sendJsonResponse(HttpExchange exchange, int statusCode, String jsonResponse) throws IOException {
        byte[] bytes = jsonResponse.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        OutputStream os = exchange.getResponseBody();
        os.write(bytes);
        os.close();
    }
}

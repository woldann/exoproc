package org.exoproc.njava.agent;

import org.exoproc.njava.agent.utils.Exoproc;
import java.lang.instrument.Instrumentation;

/**
 * NJavaAgent - Delegating entrypoint for org.exoproc.njava.agent.utils.Exoproc.
 * Preserves backward compatibility for JVM -javaagent flags and legacy reflection calls.
 */
public class NJavaAgent extends Exoproc {

    public static void premain(String agentArgs, Instrumentation inst) {
        Exoproc.premain(agentArgs, inst);
    }

    public static void agentmain(String agentArgs, Instrumentation inst) {
        Exoproc.agentmain(agentArgs, inst);
    }

    public static void main(String[] args) {
        Exoproc.main(args);
    }

    public static void start() {
        Exoproc.start();
    }

    public static void start(int port) {
        Exoproc.start(port);
    }

    public static void start(int port, ClassLoader classLoader) {
        Exoproc.start(port, classLoader);
    }

    public static void stop() {
        Exoproc.stop();
    }
}

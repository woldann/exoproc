/**
 * Global type definitions for Neptune Daemon evaluation context
 * These are available in daemon eval() execution
 */

/** Java interop - access to Java classes and objects */
declare namespace Java {
  function type(className: string): any;
  function to(obj: any, type: string): any;
}

declare var Java: typeof Java;

/** Current Minecraft instance */
declare var mc: any;

/** Current Minecraft game settings */
declare var settings: any;

/** Current screen being displayed (GuiScreen) */
declare var currentScreen: any;

/** Print to daemon output (returns via RESULT: prefix) */
declare function print(...args: any[]): void;

/** Current Minecraft class (useful for reflection) */
declare var minecraftClass: any;

/** Button list from current screen (if available) */
declare var buttonList: any[];

/** Field name mappings from Neptune's obfuscation mapping */
declare var mappings: Record<string, string>;

import { describe, it, expect } from 'bun:test';
import {
  loadNavigationDatabase,
  guiNavigator,
  detectScreenByButtons,
} from '../../packages/exoproc-tool/src/gui-navigator.js';
import { GuiCrawler } from '../../packages/exoproc-tool/src/gui-crawler.js';
import { exportMappings } from '../../packages/exoproc-tool/src/api.js';

describe('GuiCrawler & Navigation Graph', () => {
  it('should load gui-navigation.json and have all menus', () => {
    const db = loadNavigationDatabase();
    expect(db).toBeDefined();
    expect(db.screens).toBeDefined();
    expect(db.screens.InGame).toBeDefined();
    expect(db.screens.GuiOptions).toBeDefined();
    expect(db.screens.GuiVideoSettings).toBeDefined();
    expect(db.screens.GuiScreenOptionsSounds).toBeDefined();
    expect(db.screens.GuiControls).toBeDefined();
    expect(db.screens.GuiCustomizeSkin).toBeDefined();
  });

  it('should calculate reachable menu screens from InGame', () => {
    const crawler = new GuiCrawler();
    const reachable = crawler.getReachableScreens('InGame');
    expect(reachable.length).toBeGreaterThan(10);
    expect(reachable).toContain('GuiIngameMenu');
    expect(reachable).toContain('GuiOptions');
    expect(reachable).toContain('GuiVideoSettings');
    expect(reachable).toContain('GuiScreenOptionsSounds');
    expect(reachable).toContain('GuiControls');
    expect(reachable).toContain('GuiLanguage');
    expect(reachable).toContain('GuiCustomizeSkin');
    expect(reachable).toContain('GuiInventory');
  });

  it('should find path from InGame to GuiScreenOptionsSounds and back', () => {
    const forwardPath = guiNavigator.findPath(
      'InGame',
      'GuiScreenOptionsSounds',
    );
    expect(forwardPath).not.toBeNull();
    expect(forwardPath!.length).toBe(3);
    expect(forwardPath![0].to).toBe('GuiIngameMenu');
    expect(forwardPath![1].to).toBe('GuiOptions');
    expect(forwardPath![2].to).toBe('GuiScreenOptionsSounds');

    const returnPath = guiNavigator.findPath(
      'GuiScreenOptionsSounds',
      'InGame',
    );
    expect(returnPath).not.toBeNull();
    expect(returnPath!.length).toBe(3);
    expect(returnPath![0].to).toBe('GuiOptions');
    expect(returnPath![1].to).toBe('GuiIngameMenu');
    expect(returnPath![2].to).toBe('InGame');
  });

  it('should find path between sibling submenus (VideoSettings -> Controls)', () => {
    const path = guiNavigator.findPath('GuiVideoSettings', 'GuiControls');
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    expect(path![0].to).toBe('GuiOptions');
    expect(path![1].to).toBe('GuiControls');
  });

  it('should detect screens by button fingerprints', () => {
    const soundButtons = [
      { id: 200, text: 'Done' },
      { id: 100, text: 'Master Volume: 100%' },
      { id: 101, text: 'Music: OFF' },
    ];
    const detected = detectScreenByButtons(soundButtons);
    expect(detected).toBe('GuiScreenOptionsSounds');

    const optionsButtons = [
      { id: 106, text: 'Music & Sounds...' },
      { id: 101, text: 'Video Settings...' },
      { id: 100, text: 'Controls...' },
      { id: 200, text: 'Done' },
    ];
    const detectedOptions = detectScreenByButtons(optionsButtons);
    expect(detectedOptions).toBe('GuiOptions');
  });

  it('should export baseline mappings with all classes', async () => {
    const res = await exportMappings('1.8.9', { crawlGuis: false });
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.stats.matchedClasses).toBeGreaterThanOrEqual(42);
    expect(res.data.classes.GuiVideoSettings).toBeDefined();
    expect(res.data.classes.GuiScreenOptionsSounds).toBeDefined();
    expect(res.data.classes.GuiControls).toBeDefined();
    expect(res.data.classes.GuiCustomizeSkin).toBeDefined();
  });
});

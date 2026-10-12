/**
 * Standalone Remote Script: In-Engine OpenGL Screenshot Capture
 * Captures the Minecraft framebuffer directly via OpenGL (glReadPixels)
 * on the Minecraft render thread, encodes to PNG in-memory, and returns Base64.
 *
 * Output:
 * RESULT:SCREENSHOT|{"success":true,"width":854,"height":480,"size":36511,"base64":"..."}
 */

import { getMinecraft } from './gui-utils';

function executeCapture(): string {
  try {
    const Display = Java.type('org.lwjgl.opengl.Display');
    const GL11 = Java.type('org.lwjgl.opengl.GL11');
    const GL12 = Java.type('org.lwjgl.opengl.GL12');
    const ByteBuffer = Java.type('java.nio.ByteBuffer');
    const ByteOrder = Java.type('java.nio.ByteOrder');
    const Integer = Java.type('java.lang.Integer');
    const ArrayClass = Java.type('java.lang.reflect.Array');
    const BufferedImage = Java.type('java.awt.image.BufferedImage');
    const ByteArrayOutputStream = Java.type('java.io.ByteArrayOutputStream');
    const ImageIO = Java.type('javax.imageio.ImageIO');
    const Base64 = Java.type('java.util.Base64');

    const w = Display.getWidth();
    const h = Display.getHeight();
    if (w <= 0 || h <= 0) {
      return JSON.stringify({
        success: false,
        error: 'Display width or height is invalid: ' + w + 'x' + h,
      });
    }

    const mc = getMinecraft();
    if (!mc) {
      return JSON.stringify({
        success: false,
        error: 'Could not resolve Minecraft client instance',
      });
    }

    const byteBuf = ByteBuffer.allocateDirect(w * h * 4).order(
      ByteOrder.nativeOrder(),
    );
    const intBuf = byteBuf.asIntBuffer();

    // Execute glReadPixels on the Minecraft render thread
    GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT, 1);
    GL11.glPixelStorei(GL11.GL_UNPACK_ALIGNMENT, 1);
    GL11.glReadPixels(
      0,
      0,
      w,
      h,
      GL12.GL_BGRA,
      GL12.GL_UNSIGNED_INT_8_8_8_8_REV,
      intBuf,
    );

    // Bulk transfer into int array in one invocation
    const pixels = ArrayClass.newInstance(Integer.TYPE, w * h);
    intBuf.get(pixels);

    // Populate source BufferedImage in one invocation
    const srcImg = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
    srcImg.setRGB(0, 0, w, h, pixels, 0, w);

    // OpenGL coordinates are inverted vertically (0,0 is bottom-left); flip with Graphics2D
    const flipped = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
    const g = flipped.createGraphics();
    g.drawImage(srcImg, 0, 0, w, h, 0, h, w, 0, null);
    g.dispose();

    // Encode to PNG and convert to Base64 in Java
    const baos = new ByteArrayOutputStream();
    ImageIO.write(flipped, 'png', baos);
    const bytes = baos.toByteArray();
    const b64 = Base64.getEncoder().encodeToString(bytes);

    return JSON.stringify({
      success: true,
      width: w,
      height: h,
      size: bytes.length,
      base64: b64,
    });
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: String(err?.message || err),
    });
  }
}

print('RESULT:SCREENSHOT|' + executeCapture());

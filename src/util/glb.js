import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Load a .glb. Some hosts (the published artifact) won't serve .glb files, so each model also
// ships as a base64 script next to it (`model.glb.js`) and we fall back to that.
export async function loadGLB(url) {
  try {
    return await loader.loadAsync(url);
  } catch {
    const { default: b64 } = await import(new URL(`${url}.js`, document.baseURI).href);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return loader.parseAsync(bytes.buffer, '');
  }
}

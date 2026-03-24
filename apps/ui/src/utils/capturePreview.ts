export async function captureCurrentPreview(): Promise<string | null> {
  const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
  if (canvas) {
    try {
      return canvas.toDataURL('image/png');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[capturePreview] Failed to capture 3D canvas:', error);
      }
    }
  }

  const svgElement = document.querySelector('[data-preview-svg] svg') as SVGSVGElement | null;
  if (svgElement) {
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const nextCanvas = document.createElement('canvas');
          nextCanvas.width = img.naturalWidth || 800;
          nextCanvas.height = img.naturalHeight || 600;
          const ctx = nextCanvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get 2d context'));
            return;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(nextCanvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load SVG image'));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      return dataUrl;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[capturePreview] Failed to capture SVG preview:', error);
      }
    }
  }

  return null;
}

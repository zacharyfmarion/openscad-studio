import { useState } from 'react';
import { TbPhoto } from 'react-icons/tb';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/captions.css';

export interface ChatImageItem {
  /** Small preview URL used for the thumbnail (256px) */
  src: string;
  /** Full-resolution data URL used for the lightbox (up to 1600px). Falls back to src. */
  fullSrc?: string;
  /** Pixel dimensions of the full-resolution image, used as hints for YARL */
  width?: number;
  height?: number;
  filename?: string;
}

// Thumbnail dimensions — sized to match the composer attachment thumbnails
const THUMB_W = 96;
const THUMB_H = 72;

interface ChatImageProps {
  src: string;
  fullSrc?: string;
  width?: number;
  height?: number;
  alt: string;
  filename?: string;
  /** When part of a grid, pass all slides + this image's index for carousel */
  slides?: ChatImageItem[];
  slideIndex?: number;
}

export function ChatImage({
  src,
  fullSrc,
  width,
  height,
  alt,
  filename,
  slides,
  slideIndex = 0,
}: ChatImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Use full-res src for lightbox if available; pass real dimensions so YARL
  // fills the viewport correctly rather than rendering at thumbnail size.
  const lightboxSlides = (slides ?? [{ src, fullSrc, width, height, filename }]).map((img) => ({
    src: img.fullSrc ?? img.src,
    title: img.filename,
    width: img.width ?? 1600,
    height: img.height ?? 1600,
  }));

  if (error) {
    return (
      <div
        style={{
          width: THUMB_W,
          height: THUMB_H,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          borderRadius: 6,
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-tertiary)',
          border: '1px solid var(--border-secondary)',
          fontSize: 10,
        }}
      >
        <TbPhoto size={16} />
        <span>Unavailable</span>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail */}
      <div
        style={{
          width: THUMB_W,
          height: THUMB_H,
          flexShrink: 0,
          position: 'relative',
          borderRadius: 6,
          overflow: 'hidden',
          cursor: 'zoom-in',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          backgroundColor: 'var(--bg-tertiary)',
        }}
        onClick={() => setLightboxOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {/* Hover overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.28)',
            opacity: isHovered && loaded ? 1 : 0,
            transition: 'opacity 120ms ease',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Always mounted — YARL controls visibility via `open` */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxSlides}
        index={slideIndex}
        plugins={[Zoom, Captions]}
        animation={{ swipe: 150, fade: 120 }}
        styles={{ container: { backgroundColor: 'rgba(0, 0, 0, 0.92)' } }}
        zoom={{ maxZoomPixelRatio: 4 }}
        captions={{ descriptionTextAlign: 'center' }}
      />
    </>
  );
}

interface ChatImageGridProps {
  images: ChatImageItem[];
  className?: string;
}

export function ChatImageGrid({ images, className = '' }: ChatImageGridProps) {
  const valid = images.filter((img) => Boolean(img.src));
  if (valid.length === 0) return null;

  return (
    <div className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {valid.map((image, index) => (
        <ChatImage
          key={`${image.src}-${index}`}
          src={image.src}
          fullSrc={image.fullSrc}
          width={image.width}
          height={image.height}
          alt={image.filename ?? `Image ${index + 1}`}
          filename={image.filename}
          slides={valid}
          slideIndex={index}
        />
      ))}
    </div>
  );
}

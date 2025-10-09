interface PreviewProps {
  src: string;
  isRendering: boolean;
  error?: string;
}

export function Preview({ src, isRendering, error }: PreviewProps) {
  return (
    <div className="h-full bg-gray-900 flex items-center justify-center relative">
      {error ? (
        <div className="text-red-400 px-4 py-2 bg-red-900/20 rounded border border-red-800">
          <p className="font-semibold">Render Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : isRendering ? (
        <div className="text-gray-400">
          <div className="animate-spin h-8 w-8 border-4 border-gray-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
          <p>Rendering...</p>
        </div>
      ) : src ? (
        <img
          src={src}
          alt="OpenSCAD Preview"
          className="max-w-full max-h-full object-contain"
          key={src} // Force re-render when src changes
        />
      ) : (
        <p className="text-gray-500">No preview available</p>
      )}
    </div>
  );
}

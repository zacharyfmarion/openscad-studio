import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Check if API key exists when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkApiKey();
    }
  }, [isOpen]);

  const checkApiKey = async () => {
    try {
      const exists = await invoke<boolean>('has_api_key');
      setHasKey(exists);
      if (exists) {
        // Load masked key for display
        setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
      } else {
        setApiKey('');
      }
    } catch (err) {
      console.error('Failed to check API key:', err);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim() || apiKey.startsWith('•')) {
      setError('Please enter a valid API key');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await invoke('store_api_key', { key: apiKey });
      setSuccessMessage('API key saved successfully!');
      setHasKey(true);
      setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
      setShowKey(false);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(`Failed to save API key: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    const confirmed = confirm('Are you sure you want to remove your API key?');
    if (!confirmed) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await invoke('clear_api_key');
      setSuccessMessage('API key cleared successfully');
      setHasKey(false);
      setApiKey('');
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(`Failed to clear API key: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeKey = () => {
    setApiKey('');
    setShowKey(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">AI Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Anthropic API Key
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Your API key is stored securely in your system keychain and never leaves your device.
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 pr-20 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                disabled={isLoading || (hasKey && apiKey.startsWith('•'))}
              />
              {apiKey && !apiKey.startsWith('•') && (
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs px-2 py-1"
                >
                  {showKey ? '🙈 Hide' : '👁️ Show'}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-900/30 border border-green-700 text-green-300 px-3 py-2 rounded text-sm">
              {successMessage}
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p className="mb-1">
              Don't have an API key?{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Get one from Anthropic
              </a>
            </p>
            <p>
              Your API key is required for the AI Copilot features to work.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-750 border-t border-gray-700 rounded-b-lg">
          <div>
            {hasKey && apiKey.startsWith('•') && (
              <button
                onClick={handleChangeKey}
                disabled={isLoading}
                className="text-sm text-blue-400 hover:text-blue-300 disabled:text-gray-600 transition-colors"
              >
                Change Key
              </button>
            )}
            {hasKey && (
              <button
                onClick={handleClear}
                disabled={isLoading}
                className="text-sm text-red-400 hover:text-red-300 disabled:text-gray-600 transition-colors ml-4"
              >
                Remove Key
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 rounded text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || !apiKey.trim() || apiKey.startsWith('•')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

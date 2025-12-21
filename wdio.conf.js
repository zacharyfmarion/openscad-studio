const path = require('path');
const { spawn } = require('child_process');

// Path to the built Tauri app binary
const tauriAppPath = path.join(__dirname, 'apps/ui/src-tauri/target/debug/openscad-studio');

let tauriDriver;

exports.config = {
  specs: ['./tests/e2e/**/*.spec.js'],
  exclude: [],
  maxInstances: 1,

  capabilities: [{
    'tauri:options': {
      application: tauriAppPath,
    },
  }],

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  reporters: ['spec'],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // Use tauri-driver on port 4444
  hostname: '127.0.0.1',
  port: 4444,

  // Hook to start tauri-driver before tests
  onPrepare: async function () {
    console.log('Starting tauri-driver...');

    // tauri-driver is installed in ~/.cargo/bin
    const driverPath = path.join(process.env.HOME, '.cargo/bin/tauri-driver');

    tauriDriver = spawn(driverPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    tauriDriver.stdout.on('data', (data) => {
      console.log(`[tauri-driver] ${data.toString().trim()}`);
    });

    tauriDriver.stderr.on('data', (data) => {
      console.error(`[tauri-driver] ${data.toString().trim()}`);
    });

    tauriDriver.on('error', (err) => {
      console.error('Failed to start tauri-driver:', err);
    });

    // Wait for driver to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('tauri-driver should be ready');
  },

  onComplete: async function () {
    console.log('Stopping tauri-driver...');
    if (tauriDriver) {
      tauriDriver.kill('SIGTERM');
    }
  },
};

import { app, BrowserWindow, ipcMain } from 'electron';
import { WebSocketServer, WebSocket } from 'ws';
import { exec } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let wss: WebSocketServer;
const PORT = 3500;

interface ScannerDevice {
  id: string;
  name: string;
}

// Logger with timestamps
const logger = {
  info: (...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO]`, ...args);
  },
  error: (...args: any[]) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR]`, ...args);
  }
};

// Check if scanning tools are available
const checkScanningTools = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('powershell "Get-WmiObject -List | Where-Object {$_.Name -eq \'Win32_PnPEntity\'}"', (error) => {
        if (error) {
          logger.error('Windows WMI not available:', error);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } else {
      exec('which scanimage', (error) => {
        if (error) {
          logger.error('SANE scanimage not found. Please install SANE:');
          logger.error('Ubuntu/Debian: sudo apt-get install sane');
          logger.error('macOS: brew install sane-backends');
          resolve(false);
          return;
        }
        resolve(true);
      });
    }
  });
};

// Get list of scanners
const getScanners = async (): Promise<ScannerDevice[]> => {
  const toolsAvailable = await checkScanningTools();
  if (!toolsAvailable) {
    logger.error('Required scanning tools not available');
    return [];
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Windows: Use PowerShell to get WIA devices
      const command = `powershell "Get-WmiObject Win32_PnPEntity | Where-Object{$_.Caption -match 'scanner'} | Select-Object Caption,DeviceID | ConvertTo-Json"`;
      exec(command, (error, stdout) => {
        if (error) {
          logger.error('Error getting Windows scanners:', error);
          resolve([]);
          return;
        }
        try {
          const devices = JSON.parse(stdout.trim() || '[]');
          const scanners = Array.isArray(devices) ? devices : [devices];
          resolve(scanners.map((device: any) => ({
            id: device.DeviceID,
            name: device.Caption
          })));
        } catch (e) {
          logger.error('Error parsing scanner list:', e);
          resolve([]);
        }
      });
    } else {
      // macOS/Linux: Use SANE
      exec('scanimage -L', (error, stdout) => {
        if (error) {
          logger.error('Error getting SANE scanners:', error);
          resolve([{
            id: 'demo-scanner',
            name: 'Demo Scanner (No physical scanner found)'
          }]);
          return;
        }
        try {
          const output = stdout.trim();
          if (!output || output.includes('No scanners were identified')) {
            logger.info('No physical scanners found, using demo scanner');
            resolve([{
              id: 'demo-scanner',
              name: 'Demo Scanner (No physical scanner found)'
            }]);
            return;
          }

          const devices = output
            .split('\n')
            .filter((line: string) => line.trim().length > 0)
            .map((line: string) => {
              const match = line.match(/'([^']+)'/);
              return {
                id: match?.[1] || line,
                name: line.split('`')[0].trim()
              };
            });
          resolve(devices);
        } catch (e) {
          logger.error('Error parsing SANE scanner list:', e);
          resolve([{
            id: 'demo-scanner',
            name: 'Demo Scanner (No physical scanner found)'
          }]);
        }
      });
    }
  });
};

// Create a demo scan image
const createDemoScan = async (): Promise<string> => {
  const outputPath = path.join(os.tmpdir(), `demo-scan-${Date.now()}.jpg`);
  logger.info('Creating demo scan:', outputPath);

  // Create a simple image with text using system tools
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      // On macOS, use sips to create an image
      const command = `sips -s format jpeg ${path.join(__dirname, '../src/demo-scan.jpg')} --out ${outputPath}`;
      exec(command, (error) => {
        if (error) {
          logger.error('Error creating demo scan:', error);
          reject(error);
          return;
        }
        resolve(outputPath);
      });
    } else {
      // For other platforms, copy the demo image
      fs.copyFile(path.join(__dirname, '../src/demo-scan.jpg'), outputPath, (error) => {
        if (error) {
          logger.error('Error copying demo scan:', error);
          reject(error);
          return;
        }
        resolve(outputPath);
      });
    }
  });
};

// Perform scan operation
const performScan = async (deviceId: string): Promise<{ path: string; success: boolean }> => {
  // Handle demo scanner
  if (deviceId === 'demo-scanner') {
    try {
      const demoPath = await createDemoScan();
      return { path: demoPath, success: true };
    } catch (error) {
      logger.error('Error creating demo scan:', error);
      throw new Error('Failed to create demo scan');
    }
  }

  const outputPath = path.join(os.tmpdir(), `scan-${Date.now()}.jpg`);
  logger.info('Starting scan to:', outputPath);

  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      // Windows scanning
      const command = `powershell "
        try {
          $deviceManager = New-Object -ComObject WIA.DeviceManager;
          $device = $deviceManager.DeviceInfos | Where-Object { $_.DeviceID -eq '${deviceId}' } | ForEach-Object { $_.Connect() };
          $scanner = $device.Items[1];
          $image = $scanner.Transfer();
          $image.SaveFile('${outputPath}');
          exit 0;
        } catch {
          Write-Error $_.Exception.Message;
          exit 1;
        }
      "`;

      exec(command, (error) => {
        if (error) {
          logger.error('Windows scan error:', error);
          reject(error);
          return;
        }
        resolve({ path: outputPath, success: true });
      });
    } else {
      // Unix-like systems scanning
      const command = `scanimage -d "${deviceId}" --format=jpeg --output-file="${outputPath}"`;
      exec(command, (error) => {
        if (error) {
          logger.error('SANE scan error:', error);
          reject(error);
          return;
        }
        resolve({ path: outputPath, success: true });
      });
    }
  });
};

// Create main window
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.openDevTools();
};

// Handle WebSocket messages
const handleWebSocketConnection = (ws: WebSocket) => {
  logger.info('Client connected');

  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message);
      logger.info('Received message:', data);

      switch (data.type) {
        case 'get-scanners':
          const scanners = await getScanners();
          logger.info('Available scanners:', scanners);
          ws.send(JSON.stringify({
            type: 'scanners-list',
            data: scanners
          }));
          break;

        case 'start-scan':
          try {
            const scanResult = await performScan(data.deviceId);
            logger.info('Scan completed:', scanResult);

            // Verify the scanned file exists
            try {
              await fs.promises.access(scanResult.path);
              logger.info('Scanned file verified:', scanResult.path);
              ws.send(JSON.stringify({
                type: 'scan-complete',
                data: scanResult
              }));
            } catch (fileError) {
              logger.error('Scanned file not found:', fileError);
              throw new Error('Failed to save scanned image');
            }
          } catch (error) {
            logger.error('Scan failed:', error);
            ws.send(JSON.stringify({
              type: 'scan-error',
              error: error instanceof Error ? error.message : 'Scan failed'
            }));
          }
          break;

        default:
          logger.error('Unknown message type:', data.type);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Unknown message type'
          }));
      }
    } catch (error) {
      logger.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    logger.info('Client disconnected');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
};

// Initialize WebSocket server
const initWebSocket = () => {
  wss = new WebSocketServer({ port: PORT });
  logger.info(`WebSocket server running on ws://localhost:${PORT}`);

  wss.on('connection', handleWebSocketConnection);
  wss.on('error', (error) => {
    logger.error('WebSocket server error:', error);
  });
};

app.whenReady().then(() => {
  createWindow();
  initWebSocket();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (wss) {
    wss.close();
  }
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});
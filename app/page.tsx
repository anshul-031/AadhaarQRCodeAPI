/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, Upload, Camera, Search, ScanLine } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Webcam from 'react-webcam';
import { extractQrFromImage, extractQrFromVideo } from '@/lib/qr-scanner';
import { AadhaarData } from '@/lib/aadhaar-processor';

interface ScannerDevice {
  id: string;
  name: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AadhaarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | undefined>(undefined);
  const [scannerList, setScannerList] = useState<ScannerDevice[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [wsError, setWsError] = useState<string | null>(null);
  const [userName, setUserName] = useState('Adani');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      console.log('Connecting to scanner service...');
      const ws = new WebSocket('ws://localhost:3500');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to scanner service');
        setWsError(null);
        // Request scanner list on connection
        ws.send(JSON.stringify({ type: 'get-scanners' }));
      };

      ws.onmessage = async (event) => {
        const startTime = performance.now();
        try {
          const message = JSON.parse(event.data);
          const parseTime = performance.now();
          console.log(`[Timing] WebSocket message parsed in ${(parseTime - startTime).toFixed(2)}ms`);
          console.log('Received WebSocket message:', message);

          switch (message.type) {
            case 'scanners-list':
              console.log('Received scanners list:', message.data);
              setScannerList(message.data);
              break;

            case 'scan-complete':
              console.log('\n=== Scan Process Started ===');
              console.log(`[Timing] Scan completed at ${new Date().toISOString()}`);
              
              // Get userName from scan request or state
              const scanUserName = message.data.userName || userName;
              console.log('Validating userName for scan:', {
                fromMessage: message.data.userName,
                fromState: userName,
                using: scanUserName,
                trimmed: scanUserName.trim(),
                isEmpty: !scanUserName.trim()
              });
              
              if (!scanUserName.trim()) {
                console.error('Username validation failed in scan-complete');
                setError('Please enter your name first');
                setLoading(false);
                return;
              }
              
              if (message.data.success && message.data.base64) {
                try {
                  console.log('[Step 1] Image Reception');
                  console.log('Valid base64 image received from scanner');
                  console.log('Base64 image length:', message.data.base64.length);
                  console.log('Base64 prefix:', message.data.base64.substring(0, 20) + '...');
                  
                  // Add data:image/jpeg;base64, prefix if not present
                  const base64Data = message.data.base64.startsWith('data:image')
                    ? message.data.base64
                    : `data:image/jpeg;base64,${message.data.base64}`;
                  
                  const imageProcessingStart = performance.now();
                  console.log(`[Timing] Image reception took ${(imageProcessingStart - startTime).toFixed(2)}ms`);
                  console.log('\n[Step 2] Starting QR extraction process...');
                  console.log('Current userName:', userName);
                  
                  // Extract QR data from scanned image
                  await handleProcessedData({
                    input: base64Data,
                    providedUserName: scanUserName
                  });
                } catch (err) {
                  console.error('Error processing scanned image:', err);
                  setError('Error processing scanned image: ' + (err instanceof Error ? err.message : String(err)));
                }
              } else {
                console.error('Scan complete but invalid data:', message.data);
                setError('Failed to receive scanned image data');
              }
              break;

            case 'scan-error':
              setError(message.error || 'Scanner error occurred');
              break;

            case 'error':
              setError(message.error || 'An error occurred');
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsError('Failed to connect to scanner service');
        setLoading(false);
        setError(null);
        setResult(null);
        setScannedImage(null);  // Reset image when connection fails
      };

      ws.onclose = () => {
        console.log('Scanner service connection closed');
        setWsError('Connection to scanner service lost');
        // Reset all states when connection is lost
        setLoading(false);
        setError(null);
        setResult(null);
        setScannedImage(null);
        setSelectedScanner('');
        // Try to reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Handle processed data
  const handleProcessedData = async ({
    input,
    providedUserName
  }: {
    input: string,
    providedUserName?: string
  }) => {
    const startTime = performance.now();
    console.log('\n=== Processing Pipeline Started ===');
    console.log(`[Timing] Started at ${new Date().toISOString()}`);
    console.log('Input type:', typeof input);
    console.log('Input length:', input.length);

    // Validate userName first
    console.log('Validating userName:', {
      userName,
      length: userName.length,
      trimmedLength: userName.trim().length,
      isEmpty: !userName.trim()
    });

    if (!userName.trim()) {
      console.log('Username validation failed - empty name');
      setError('Please enter your name first');
      setLoading(false);
      return;
    }

    console.log('Username validation passed:', userName);

    setLoading(true);
    setError(null);
    setResult(null);
    setScannedImage(null);

    // Store the scanned image first
    setScannedImage(input);

    try {
      // Phase 1: QR Extraction
      console.log('\n[Phase 1] QR Code Extraction');
      const qrExtractionStart = performance.now();
      console.log('Calling extractQrFromImage...');
      const qrData = await extractQrFromImage(input);
      const qrExtractionEnd = performance.now();
      const qrExtractionTime = (qrExtractionEnd - qrExtractionStart).toFixed(2);
      console.log(`[Timing] QR extraction completed in ${qrExtractionTime}ms`);
      
      if (!qrData) {
        console.error('QR extraction returned null');
        throw new Error('Failed to extract data from QR code. Please ensure the image contains a valid Aadhaar QR code and try again.');
      }

      console.log('QR data extracted successfully');
      console.log('QR data length:', qrData.length);

      // Phase 2: Aadhaar Data Parsing
      console.log('\n[Phase 2] Aadhaar Data Parsing');
      const aadhaarParsingStart = performance.now();
      console.log('Preparing API request...');

      const requestBody = JSON.stringify({
        qrData,
        userName
      });
      
      console.log('Making API call to /api/aadhaar...');
      const response = await fetch('/api/aadhaar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      console.log('API response status:', response.status);
      console.log('Parsing API response...');
      const data = await response.json();
      const aadhaarParsingEnd = performance.now();
      const aadhaarParsingTime = (aadhaarParsingEnd - aadhaarParsingStart).toFixed(2);
      console.log(`[Timing] Aadhaar parsing completed in ${aadhaarParsingTime}ms`);

      if (!response.ok) {
        console.error('API error:', data);
        console.error('Response status:', response.status);
        console.error('Error details:', data.error || 'No error details provided');
        throw new Error(data.error || 'Failed to process QR data');
      }

      // Calculate total processing time
      const endTime = performance.now();
      const totalTime = (endTime - startTime).toFixed(2);

      console.log('\n=== Processing Complete ===');
      console.log('Processing times:');
      console.log(`- QR Extraction: ${qrExtractionTime}ms`);
      console.log(`- Aadhaar Parsing: ${aadhaarParsingTime}ms`);
      console.log(`- Total Time: ${totalTime}ms`);
      console.log('Setting result with parsed data');
      
      setResult(data.data);
    } catch (err) {
      console.error('Error in handleProcessedData:', err);
      console.error('Error type:', err?.constructor?.name);
      console.error('Full error details:', JSON.stringify(err, null, 2));

      if (err instanceof Error) {
        console.error('Error stack:', err.stack);
        setError(err.message);
      } else {
        console.error('Non-Error object thrown:', err);
        setError('An unexpected error occurred while processing the QR code. Please try again.');
      }
    } finally {
      console.log('handleProcessedData completed, loading state cleared');
      setLoading(false);
    }
  };

  // Handle scan button click
  const handleStartScan = () => {
    // Clean and validate userName first
    const cleanUserName = userName.trim();
    console.log('Starting scan:', {
      userName: cleanUserName,
      isValid: !!cleanUserName,
      storedName: localStorage.getItem('userName')
    });

    if (!cleanUserName) {
      setError('Please enter your name first');
      return;
    }

    if (!wsRef.current || !selectedScanner) {
      setError('Scanner not connected');
      return;
    }

    // Persist valid userName
    localStorage.setItem('userName', cleanUserName);
    setUserName(cleanUserName); // Ensure state is clean

    setLoading(true);
    setError(null);
    setResult(null);
    setScannedImage(null); // Reset scanned image when starting new scan

    console.log('Sending scan request with userName:', cleanUserName);
    wsRef.current.send(JSON.stringify({
      type: 'start-scan',
      deviceId: selectedScanner,
      userName: cleanUserName,  // Include username in the request
      timestamp: new Date().toISOString()
    }));
  };

  useEffect(() => {
    // Get available cameras when component mounts
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);

        // For mobile devices, try to select the back camera
        const backCamera = videoDevices.find(device => 
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environment')
        );

        if (backCamera) {
          setSelectedCamera(backCamera.deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error('Error accessing cameras:', err);
        setError('Failed to access camera devices');
      }
    };

    getCameras();
  }, []);

  // Effect to handle userName state persistence
  useEffect(() => {
    const savedUserName = localStorage.getItem('userName');
    if (savedUserName) {
      console.log('Restoring saved userName:', savedUserName);
      setUserName(savedUserName);
    }
  }, []);

  // Effect to save userName changes
  useEffect(() => {
    if (userName.trim()) {
      console.log('Saving userName:', userName);
      localStorage.setItem('userName', userName);
    }
  }, [userName]);

  const handleManualInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('Please enter your name first');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setScannedImage(null);  // Reset when starting new input

    const form = e.target as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    const qrData = input.value;

    if (!qrData) {
      setError('Please enter QR data');
      setLoading(false);
      return;
    }

    await handleProcessedData({ input: qrData });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userName.trim()) {
      setError('Please enter your name first');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setScannedImage(null); // Reset scanned image when starting new file upload

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        await handleProcessedData({ input: base64Data });
      };

      reader.onerror = () => {
        setError('Failed to read file');
        setLoading(false);
        setScannedImage(null); // Clear image on error
      };

      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
      setScannedImage(null); // Clear image on any error
    }
  };

  const captureImage = async () => {
    if (!userName.trim()) {
      setError('Please enter your name first');
      return;
    }

    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      setError('Failed to capture image');
      setScannedImage(null);  // Clear any previous image
      return;
    }

    try {
      await handleProcessedData(imageSrc);
      setShowCamera(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process captured image');
      setScannedImage(null);  // Clear image on error
    }
  };

  const videoConstraints = {
    width: 1280,
    height: 720,
    deviceId: selectedCamera,
    facingMode: selectedCamera ? undefined : 'environment'
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <QrCode className="mx-auto h-12 w-12 text-gray-400" />
          <h1 className="mt-3 text-3xl font-bold text-gray-900">
            Aadhaar QR Code Reader
          </h1>
          <p className="mt-2 text-gray-600">
            Scan QR code using camera, scanner, upload an image, or enter data manually
          </p>
        </div>

        <Card className="p-6 bg-white shadow-lg rounded-lg">
          {/* Name Input Field */}
          <div className="mb-6">
            <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
              Enter Your Name *
            </label>
            <div>
              <Input
                id="userName"
                type="text"
                value={userName}
                onChange={(e) => {
                  const value = e.target.value;
                  const cleanValue = value.trim();
                  console.log('Name Input Change:', {
                    raw: value,
                    cleaned: cleanValue,
                    length: cleanValue.length
                  });
                  setUserName(cleanValue);
                  if (cleanValue) {
                    setError(null);
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  const cleanValue = value.trim();
                  console.log('Name Input Blur:', {
                    raw: value,
                    cleaned: cleanValue,
                    previousName: userName,
                    hasChanged: cleanValue !== userName
                  });
                  if (cleanValue !== userName) {
                    setUserName(cleanValue);
                    localStorage.setItem('userName', cleanValue);
                  }
                }}
                placeholder="Enter your name"
                className="w-full"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Name entered: {userName || 'No name entered'}
              </p>
            </div>
          </div>

          <Tabs defaultValue="camera" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="camera">Camera</TabsTrigger>
              <TabsTrigger value="scan">Scan</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="space-y-4">
              <div className="flex flex-col space-y-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Select Scanner</label>
                  <select 
                    className="w-full p-2 border rounded-md"
                    value={selectedScanner}
                    onChange={(e) => setSelectedScanner(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Choose a scanner...</option>
                    {scannerList.map((scanner) => (
                      <option key={scanner.id} value={scanner.id}>
                        {scanner.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!selectedScanner && (
                  <div className="text-sm text-gray-600">
                    No scanners found. Make sure the Aadhaar Scanner Service is running and your scanner is connected.
                  </div>
                )}
                <div className="flex justify-between space-x-4">
                  <Button
                    onClick={() => {
                      console.log('Refreshing scanner list...');
                      // Reset all states when refreshing scanners
                      setLoading(false);
                      setError(null);
                      setResult(null);
                      setScannedImage(null);
                      setSelectedScanner('');
                      wsRef.current?.send(JSON.stringify({ type: 'get-scanners' }));
                    }}
                    variant="outline"
                    className="flex-1"
                    disabled={loading}
                  >
                    <ScanLine className="mr-2 h-4 w-4" />
                    Refresh Scanners
                  </Button>
                  <Button
                    onClick={handleStartScan}
                    className="flex-1"
                    disabled={loading || !selectedScanner || !userName.trim()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <ScanLine className="mr-2 h-4 w-4" />
                        Start Scan
                      </>
                    )}
                  </Button>
                </div>
                {wsError && (
                  <div className="p-4 bg-red-50 text-red-700 rounded-md text-sm">
                    {wsError}
                    <div className="mt-2">
                      Make sure the Aadhaar Scanner Service is running on your computer.
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="camera" className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {!showCamera ? (
                  <Button
                    onClick={() => {
                      if (!userName.trim()) {
                        setError('Please enter your name first');
                        return;
                      }
                      setShowCamera(true);
                    }}
                    className="w-full"
                    disabled={!userName.trim()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Start Camera
                  </Button>
                ) : (
                  <div className="space-y-4 w-full">
                    <div className="relative rounded-lg overflow-hidden">
                      <Webcam
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        className="w-full"
                        videoConstraints={videoConstraints}
                      />
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        onClick={captureImage}
                        className="flex-1"
                        disabled={loading}
                      >
                        Capture & Scan
                      </Button>
                      <Button
                        onClick={() => setShowCamera(false)}
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-4">
              <div 
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-gray-400 transition-colors ${!userName.trim() ? 'border-gray-200 opacity-50' : 'border-gray-300'}`}
                onClick={() => {
                  if (!userName.trim()) {
                    setError('Please enter your name first');
                    return;
                  }
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={loading || !userName.trim()}
                />
              </div>
            </TabsContent>

            <TabsContent value="manual">
              <form onSubmit={handleManualInput} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    placeholder="Enter QR code data (base64 or hexadecimal format)"
                    className="w-full"
                    required
                    disabled={!userName.trim()}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !userName.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Parse QR Data'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Display scanned image */}
          {scannedImage && (
            <div className="mt-6 space-y-2">
              <h3 className="text-lg font-semibold text-gray-700">Scanned Document</h3>
              <div className="relative rounded-lg overflow-hidden border border-gray-200">
                <img
                  src={scannedImage}
                  alt="Scanned document"
                  className="w-full max-h-[400px] object-contain"
                />
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-4 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Processing...</span>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Parsed Information
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {/* Photo */}
                {result.photo && (
                  <div className="flex flex-col items-center">
                    <p className="text-sm text-gray-500 mb-2">Photo</p>
                    <div className="flex justify-center">
                      <img
                        src={`data:image/jpeg;base64,${result.photo}`}
                        alt="Aadhaar Photo"
                        className="max-w-[200px] rounded-lg shadow-md"
                      />
                    </div>
                  </div>
                )}

                {/* Issued Date & Time */}
                {(result.issued_date || result.issued_time) && (
                  <div className="grid grid-cols-2 gap-4">
                    {result.issued_date && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-500">Issued Date</p>
                        <p className="font-medium">{result.issued_date}</p>
                      </div>
                    )}
                    {result.issued_time && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-500">Issued Time</p>
                        <p className="font-medium">{result.issued_time}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Name */}
                {result.name && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium">{result.name}</p>
                  </div>
                )}

                {/* Gender */}
                {result.gender && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Gender</p>
                    <p className="font-medium">{result.gender}</p>
                  </div>
                )}

                {/* Date of Birth */}
                {result.dob && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Date of Birth</p>
                    <p className="font-medium">{result.dob}</p>
                  </div>
                )}

                {/* Mobile Number */}
                {result.mobile_number && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Mobile Number</p>
                    <p className="font-medium">{result.mobile_number}</p>
                  </div>
                )}

                {/* Aadhaar Number (UID) */}
                {result.uid && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Aadhaar Number</p>
                    <p className="font-medium">{result.uid}</p>
                  </div>
                )}

                {/* Address */}
                {result.address && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium">{result.address}</p>
                  </div>
                )}
              </div>

              {/* Background Check Results */}
              <Card className="mt-8 p-6 space-y-6">
                <div className="flex items-center space-x-2">
                  <Search className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Background Check Results</h2>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Court/Authority</TableHead>
                        <TableHead>Since</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { court: "All High Courts", status: "No Case found", year: "2000" },
                        { court: "Civil Courts - Junior Civil Court, Senior Civil Court, District Court", status: "No Case found", year: "2000" },
                        { court: "Criminal Courts - Magistrate courts and Session courts", status: "No Case found", year: "2000" },
                        { court: "Supreme Court", status: "No Case found", year: "1947" },
                        { court: "Consumer Courts", status: "No Case found", year: "2000" },
                        { court: "CEGAT/CESTAT", status: "No Case found", year: "2000" },
                        { court: "Debt Recovery Tribunal(DRT)", status: "No Case found", year: "2000" },
                        { court: "Debt Recovery Appellate Tribunal(DRAT)", status: "No Case found", year: "2000" },
                        { court: "Income Tax Appellate Tribunal (ITAT)", status: "No Case found", year: "2000" },
                        { court: "National Company Law Tribunal(NCLT)", status: "No Case found", year: "2000" },
                        { court: "Securities Apellate Tribunal(SAT)", status: "No Case found", year: "2000" },
                        { court: "National Green Tribunal(NGT)", status: "No Case found", year: "2000" },
                        { court: "NCLAT", status: "No Case found", year: "2000" },
                        { court: "Appellate Tribunal for Foreign Exchange - APTE", status: "No Case found", year: "2000" },
                        { court: "Others", status: "No Case found", year: "2000" }
                      ].map((record, index) => (
                        <TableRow key={index}>
                          <TableCell>{record.court}</TableCell>
                          <TableCell>{record.year}</TableCell>
                          <TableCell>{record.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
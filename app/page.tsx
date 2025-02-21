"use client";

import { useState, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, Upload, Camera } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Webcam from 'react-webcam';

interface AadhaarData {
  uid: string;
  name: string;
  gender: string;
  yob: string;
  co: string;
  vtc: string;
  po: string;
  dist: string;
  state: string;
  pc: string;
  photo?: string | null;
}

export default function Home() {
  const [qrData, setQrData] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AadhaarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/aadhaar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qrData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse QR data');
      }

      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || 'Failed to parse QR data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        
        const response = await fetch('/api/aadhaar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ qrData: base64Data }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to parse QR code');
        }

        if (data.success && data.data) {
          setResult(data.data);
        } else {
          setError(data.error || 'Failed to parse QR code');
        }
        setLoading(false);
      };

      reader.onerror = () => {
        setError('Failed to read file');
        setLoading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const captureImage = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      setError('Failed to capture image');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/aadhaar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qrData: imageSrc }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse QR code');
      }

      if (data.success && data.data) {
        setResult(data.data);
        setShowCamera(false);
      } else {
        setError(data.error || 'Failed to parse QR code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
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
            Scan QR code using camera, upload an image, or enter data manually
          </p>
        </div>

        <Card className="p-6 bg-white shadow-lg rounded-lg">
          <Tabs defaultValue="camera" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="camera">Camera</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="camera" className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {!showCamera ? (
                  <Button
                    onClick={() => setShowCamera(true)}
                    className="w-full"
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
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-gray-400 transition-colors"
                   onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
              </div>
            </TabsContent>

            <TabsContent value="manual">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    value={qrData}
                    onChange={(e) => setQrData(e.target.value)}
                    placeholder="Enter QR code data (base64 or hexadecimal format)"
                    className="w-full"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !qrData}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.photo && (
                  <div className="md:col-span-2">
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
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Aadhaar Number</p>
                  <p className="font-medium">{result.uid}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{result.name}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Gender</p>
                  <p className="font-medium">{result.gender}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Year of Birth</p>
                  <p className="font-medium">{result.yob}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Care of</p>
                  <p className="font-medium">{result.co}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Village/Town/City</p>
                  <p className="font-medium">{result.vtc}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Post Office</p>
                  <p className="font-medium">{result.po}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">District</p>
                  <p className="font-medium">{result.dist}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">State</p>
                  <p className="font-medium">{result.state}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Pincode</p>
                  <p className="font-medium">{result.pc}</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
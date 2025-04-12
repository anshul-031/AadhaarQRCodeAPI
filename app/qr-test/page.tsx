"use client";

import { useState, useEffect } from 'react';
import { extractQrFromImage } from '@/lib/qr-scanner'; // Direct import for raw QR extraction

// Define a more specific type for Aadhaar data if possible, or use 'any' for now
interface AadhaarData {
    uid?: string;
    name?: string;
    gender?: string;
    dob?: string;
    yob?: string;
    address?: string;
    photo?: string; // Base64 encoded image
    // Add other fields as needed based on API response
    [key: string]: any; // Allow other properties
}

interface TestResult {
    imagePath: string;
    status: 'Pending' | 'Running' | 'Success' | 'Failure';
    time: number | null; // Total time including QR read + API call
    qrReadTime: number | null; // Time for QR reading only
    apiCallTime: number | null; // Time for API call only
    rawData: string | null; // Raw QR data string
    parsedData: AadhaarData | null; // Parsed Aadhaar data from API
    error: string | null;
}

// Helper function to format keys for display
function formatDisplayKey(key: string): string {
    // Simple conversion: replace underscores with spaces, capitalize words
    return key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}


export default function QrTestPage() {
    const [results, setResults] = useState<TestResult[]>([]);
    const [imagePaths, setImagePaths] = useState<string[]>([]);
    const [isLoadingPaths, setIsLoadingPaths] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [overallSummary, setOverallSummary] = useState<string>('');

    // Fetch image paths on mount
    useEffect(() => {
        async function fetchImagePaths() {
            setIsLoadingPaths(true);
            try {
                const response = await fetch('/api/list-qr-images');
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setImagePaths(data.imagePaths || []);
                setFetchError(null);
            } catch (error) {
                console.error("Failed to fetch image paths:", error);
                setFetchError(error instanceof Error ? error.message : String(error));
                setImagePaths([]);
            } finally {
                setIsLoadingPaths(false);
            }
        }
        fetchImagePaths();
    }, []);

    // Initialize results state when imagePaths are loaded
    useEffect(() => {
        if (imagePaths.length > 0) {
            setResults(imagePaths.map(path => ({
                imagePath: path,
                status: 'Pending',
                time: null,
                qrReadTime: null,
                apiCallTime: null,
                rawData: null,
                parsedData: null,
                error: null
            })));
            setOverallSummary('');
        } else if (!isLoadingPaths && !fetchError) {
            setResults([]);
            setOverallSummary('No images found in /public/sample_Inputs.');
        } else if (fetchError) {
             setResults([]);
             setOverallSummary(`Error loading images: ${fetchError}`);
        }
    }, [imagePaths, isLoadingPaths, fetchError]);

    function loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(`Failed to load image: ${src}`);
            img.src = src;
        });
    }

    function imageToBase64(img: HTMLImageElement): string {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");
        ctx.drawImage(img, 0, 0);
        const format = img.src.toLowerCase().endsWith('.jpg') || img.src.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
        return canvas.toDataURL(format);
    }

    async function runTest(index: number) {
        const imagePath = results[index]?.imagePath;
        if (!imagePath) {
            setResults(prev => prev.map((r, i) => i === index ? { ...r, status: 'Failure', error: 'Internal error: Image path not found' } : r));
            return;
        }

        setResults(prev => prev.map((r, i) => i === index ? { ...r, status: 'Running', error: null, rawData: null, parsedData: null, time: null, qrReadTime: null, apiCallTime: null } : r));

        let qrReadStartTime: number | null = null, qrReadEndTime: number | null = null;
        let apiCallStartTime: number | null = null, apiCallEndTime: number | null = null;
        let rawQrData: string | null = null;
        let finalParsedData: AadhaarData | null = null;
        let finalError: string | null = null;

        try {
            // Step 1: Load image and extract raw QR data
            const img = await loadImage(imagePath);
            const base64Data = imageToBase64(img);

            qrReadStartTime = performance.now();
            rawQrData = await extractQrFromImage(base64Data); // Get raw QR string
            qrReadEndTime = performance.now();

            if (!rawQrData) {
                throw new Error("QR code not found or could not be decoded by frontend scanner.");
            }

            // Step 2: Call the backend API with the raw QR data
            apiCallStartTime = performance.now();
            const response = await fetch('/api/aadhaar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    qrData: rawQrData,
                    userName: `qr-test-user-${index}` // Simple unique user for logging
                }),
            });
            apiCallEndTime = performance.now();

            const resultJson = await response.json();

            if (!response.ok) {
                throw new Error(resultJson.error || `API error: ${response.status}`);
            }

            if (!resultJson.success) {
                 throw new Error(resultJson.error || 'API call failed (success: false)');
            }

            finalParsedData = resultJson.data; // Store the parsed data object

        } catch (err) {
            console.error(`Error processing ${imagePath}:`, err);
            // Ensure end times are set if an error occurred mid-process
            if (qrReadStartTime && !qrReadEndTime) qrReadEndTime = performance.now();
            if (apiCallStartTime && !apiCallEndTime) apiCallEndTime = performance.now();
            finalError = err instanceof Error ? err.message : String(err);
        }

        // Calculate durations
        const qrReadDuration = qrReadEndTime && qrReadStartTime ? qrReadEndTime - qrReadStartTime : null;
        const apiCallDuration = apiCallEndTime && apiCallStartTime ? apiCallEndTime - apiCallStartTime : null;
        const totalDuration = (qrReadDuration ?? 0) + (apiCallDuration ?? 0);

        // Update final result for this image
        setResults(prev => prev.map((r, i) => {
            if (i === index) {
                return {
                    ...r,
                    status: finalParsedData ? 'Success' : 'Failure',
                    time: totalDuration > 0 ? totalDuration : null,
                    qrReadTime: qrReadDuration,
                    apiCallTime: apiCallDuration,
                    rawData: rawQrData, // Store raw data for reference
                    parsedData: finalParsedData, // Store parsed data
                    error: finalError
                };
            }
            return r;
        }));
    }

    async function runAllTests() {
        setIsRunning(true);
        setOverallSummary('Running tests...');
        setResults(prev => prev.map(r => ({ ...r, status: 'Pending', time: null, qrReadTime: null, apiCallTime: null, rawData: null, parsedData: null, error: null })));

        for (let i = 0; i < results.length; i++) {
            await runTest(i);
        }

        // Calculate summary using the final state
        setResults(finalResults => {
            let successCount = 0;
            let totalQrTime = 0;
            let totalApiTime = 0;
            let validQrTimes = 0;
            let validApiTimes = 0;

            finalResults.forEach(result => {
                if (result.status === 'Success') {
                    successCount++;
                }
                if (result.qrReadTime !== null) {
                    totalQrTime += result.qrReadTime;
                    validQrTimes++;
                }
                 if (result.apiCallTime !== null) {
                    totalApiTime += result.apiCallTime;
                    validApiTimes++;
                }
            });

            const totalTests = results.length;
            const accuracy = totalTests > 0 ? ((successCount / totalTests) * 100).toFixed(1) : '0.0';
            const avgQrTime = validQrTimes > 0 ? (totalQrTime / validQrTimes).toFixed(2) : 'N/A';
            const avgApiTime = validApiTimes > 0 ? (totalApiTime / validApiTimes).toFixed(2) : 'N/A';

            setOverallSummary(`Overall Results: ${successCount}/${totalTests} successful (${accuracy}%). Avg QR Read Time: ${avgQrTime} ms. Avg API Call Time: ${avgApiTime} ms.`);
            return finalResults;
        });

        setIsRunning(false);
    }

    // Keys to exclude from the dynamic details list
    const keysToExclude = ['photo', 'raw_data', 'raw_fields', 'date_field_index'];

    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px' }}>
            <h1>Aadhaar QR Backend Test</h1>
            <p>Testing the <code>/api/aadhaar</code> endpoint using images from <code>/public/sample_Inputs/</code>.</p>
            {isLoadingPaths && <p>Loading image list...</p>}
            {fetchError && <p style={{ color: 'red' }}>Error loading image list: {fetchError}</p>}
            {!isLoadingPaths && !fetchError && imagePaths.length === 0 && <p>No QR images found in /public/sample_Inputs.</p>}
            {!isLoadingPaths && !fetchError && imagePaths.length > 0 && (
                 <button onClick={runAllTests} disabled={isRunning || isLoadingPaths || !!fetchError}>
                     {isRunning ? 'Running...' : `Run Tests (${imagePaths.length} images)`}
                 </button>
            )}
            <div style={{ marginTop: '20px', fontWeight: 'bold' }}>{overallSummary}</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px', tableLayout: 'fixed' }}>
                <thead>
                    <tr>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2', width: '15%' }}>Image</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2', width: '10%' }}>Status</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2', width: '15%' }}>Time (QR/API ms)</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2', width: '15%' }}>Photo</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2', width: '45%' }}>Details / Error</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((result, index) => (
                        <tr key={index}>
                            <td style={{ border: '1px solid #ddd', padding: '8px', wordWrap: 'break-word' }}>{result.imagePath.split('/').pop()}</td>
                            <td style={{
                                border: '1px solid #ddd',
                                padding: '8px',
                                color: result.status === 'Success' ? 'green' : result.status === 'Failure' ? 'red' : 'inherit'
                            }}>
                                {result.status}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                {result.qrReadTime !== null ? result.qrReadTime.toFixed(1) : '-'} / {result.apiCallTime !== null ? result.apiCallTime.toFixed(1) : '-'}
                            </td>
                             <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>
                                {result.status === 'Success' && result.parsedData?.photo ? (
                                    <img
                                        src={`data:image/jpeg;base64,${result.parsedData.photo}`}
                                        alt="Aadhaar Photo"
                                        style={{ maxWidth: '60px', maxHeight: '60px', objectFit: 'contain' }}
                                    />
                                ) : '-'}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '8px', wordWrap: 'break-word', fontSize: '0.9em', verticalAlign: 'top' }}>
                                {result.status === 'Success' && result.parsedData
                                    ? (
                                        <div>
                                            {Object.entries(result.parsedData)
                                                // Use non-null assertion operator (!) here
                                                .filter(([key]) => !keysToExclude.includes(key) && result.parsedData![key]) 
                                                .map(([key, value]) => (
                                                    <div key={key} style={{ marginBottom: '2px' }}>
                                                        <strong>{formatDisplayKey(key)}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                    </div>
                                                ))}
                                        </div>
                                      )
                                    : result.error || (result.status === 'Running' ? 'Processing...' : '-')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
"use client";

import { useState, useEffect } from 'react';
import { extractQrFromImage } from '@/lib/qr-scanner'; // Direct import

interface TestResult {
    imagePath: string;
    status: 'Pending' | 'Running' | 'Success' | 'Failure';
    time: number | null;
    data: string | null;
    error: string | null;
}

export default function QrTestPage() {
    const [results, setResults] = useState<TestResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [overallSummary, setOverallSummary] = useState<string>('');

    const imagePaths = [
        // Ensure sample_Inputs is inside the /public directory
        '/sample_Inputs/qr_1.png',
        '/sample_Inputs/qr_2.png',
        '/sample_Inputs/qr_3.png',
        '/sample_Inputs/qr_5.png',
        '/sample_Inputs/qr_6.png',
        '/sample_Inputs/qr_9.png',
        '/sample_Inputs/qr_10.png',
        '/sample_Inputs/qr_11.png',
        '/sample_Inputs/qr_12.png',
        '/sample_Inputs/qr_13.png',
        '/sample_Inputs/qr_18.png',
        '/sample_Inputs/qr_19.png',
        '/sample_Inputs/qr_21.png',
        '/sample_Inputs/qr_22.png',
        '/sample_Inputs/qr_26.png',
        '/sample_Inputs/qr_27.png',
        '/sample_Inputs/qr_28.jpg',
        '/sample_Inputs/qr_29.jpg',
        '/sample_Inputs/qr_30.jpg',
        '/sample_Inputs/qr_31.jpg',
        '/sample_Inputs/qr_32.jpg',
        '/sample_Inputs/qr_33.jpg'
    ];

    // Initialize results state
    useEffect(() => {
        setResults(imagePaths.map(path => ({
            imagePath: path,
            status: 'Pending',
            time: null,
            data: null,
            error: null
        })));
    }, []); // Run only once on mount

    function loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(`Failed to load image: ${src} - Check if path is correct and served from /public.`);
            img.src = src; // Path relative to the public dir root
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
        const imagePath = imagePaths[index];
        
        // Update status to Running
        setResults(prev => prev.map((r, i) => i === index ? { ...r, status: 'Running' } : r));

        let startTime: number | null = null, endTime: number | null = null, duration: number | null = null;
        let resultData: string | null = null;
        let error: string | null = null;

        try {
            const img = await loadImage(imagePath);
            const base64Data = imageToBase64(img);

            startTime = performance.now();
            resultData = await extractQrFromImage(base64Data); // Direct function call
            endTime = performance.now();
            duration = endTime - startTime;

        } catch (err) {
            console.error(`Error processing ${imagePath}:`, err);
            endTime = performance.now(); 
            duration = startTime ? endTime - startTime : 0; 
            error = err instanceof Error ? err.message : String(err);
        }

        // Update final result for this image
        setResults(prev => prev.map((r, i) => {
            if (i === index) {
                return {
                    ...r,
                    status: resultData ? 'Success' : 'Failure',
                    time: duration,
                    data: resultData,
                    error: error
                };
            }
            return r;
        }));
    }

    async function runAllTests() {
        setIsRunning(true);
        setOverallSummary('Running tests...');
        
        // Reset statuses before running
        setResults(prev => prev.map(r => ({ ...r, status: 'Pending', time: null, data: null, error: null })));

        // Run tests sequentially to avoid overwhelming the browser
        for (let i = 0; i < imagePaths.length; i++) {
            await runTest(i);
        }

        // Calculate summary after all tests are done (using the final state)
        setResults(finalResults => {
            let successCount = 0;
            let totalTime = 0;
            let validTimes = 0;

            finalResults.forEach(result => {
                if (result.status === 'Success') {
                    successCount++;
                }
                if (result.time !== null) {
                    totalTime += result.time;
                    validTimes++;
                }
            });

            const accuracy = ((successCount / imagePaths.length) * 100).toFixed(1);
            const avgTime = validTimes > 0 ? (totalTime / validTimes).toFixed(2) : 'N/A';

            setOverallSummary(`Overall Results: ${successCount}/${imagePaths.length} successful (${accuracy}%). Average time: ${avgTime} ms.`);
            return finalResults; // Return unchanged state for this setter
        });

        setIsRunning(false);
    }

    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px' }}>
            <h1>QR Code Extraction Test</h1>
            <p>Testing the <code>extractQrFromImage</code> function from <code>@/lib/qr-scanner</code> against images in <code>/public/sample_Inputs/</code>.</p>
            <button onClick={runAllTests} disabled={isRunning}>
                {isRunning ? 'Running...' : 'Run Tests'}
            </button>
            <div style={{ marginTop: '20px', fontWeight: 'bold' }}>{overallSummary}</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px' }}>
                <thead>
                    <tr>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>Image</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>Status</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>Time (ms)</th>
                        <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left', backgroundColor: '#f2f2f2' }}>Data Preview / Error</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((result, index) => (
                        <tr key={index}>
                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>{result.imagePath.split('/').pop()}</td>
                            <td style={{ 
                                border: '1px solid #ddd', 
                                padding: '8px', 
                                color: result.status === 'Success' ? 'green' : result.status === 'Failure' ? 'red' : 'inherit' 
                            }}>
                                {result.status}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                {result.time !== null ? result.time.toFixed(2) : '-'}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '8px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {result.status === 'Success' && result.data 
                                    ? (result.data.substring(0, 100) + (result.data.length > 100 ? '...' : '')) 
                                    : result.error || '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
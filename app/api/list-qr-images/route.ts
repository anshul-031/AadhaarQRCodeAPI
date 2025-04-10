import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const imageDirectory = path.join(process.cwd(), 'public', 'sample_Inputs');
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']; // Add more if needed

    try {
        const files = await fs.promises.readdir(imageDirectory);
        const imageFiles = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return imageExtensions.includes(ext);
            })
            .map(file => `/sample_Inputs/${file}`); // Return path relative to /public

        return NextResponse.json({ imagePaths: imageFiles });
    } catch (error) {
        console.error('Error reading image directory:', error);
        // Check if the error is because the directory doesn't exist
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return NextResponse.json({ error: `Directory not found: ${imageDirectory}` }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to list images' }, { status: 500 });
    }
}